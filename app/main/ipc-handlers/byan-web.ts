// byan-web.ts — IPC handlers that bridge the renderer to the byan_web REST API.
//
// Pattern: one handler per byanWeb.* channel, each delegating to byan-api-client.
// No fetch logic here — keep handlers thin so they are trivially testable.
//
// Chat stream pattern:
//   Renderer calls chatStreamStart → main opens SSE fetch and forwards chunks
//   via webContents.send('byan:chat:chunk', payload). The renderer listens via
//   byanEvents.on('byan:chat:chunk', ...). Abort via chatStreamAbort(streamId).

import { randomUUID } from 'crypto';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  ByanApiListOpts,
  CreateConversationOpts,
  SendMessageOpts,
} from '../../shared/ipc-contract';
import { wrap } from './_error';
import { IpcError } from './_error';
import {
  fetchMe,
  fetchProjects,
  fetchProject,
  fetchMemory,
  fetchKnowledge,
  fetchCustomAgents,
  fetchSessions,
  fetchChatConversations,
  createChatConversation,
  deleteChatConversation,
  fetchChatMessages,
  getChatStreamUrl,
  getAuthToken,
} from '../byan-api-client';
import { secureStore } from '../secure-store';
import { AUTH_MODE_KEY, AUTH_TOKEN_KEY } from './auth';
import {
  localMe,
  localProjects,
  localProject,
  localMemory,
  localKnowledge,
  localAgents,
  localSessions,
} from '../local-data';

// Active AbortControllers keyed by streamId — allows the renderer to cancel in-flight SSE.
const activeStreams = new Map<string, AbortController>();

// N1 : in local mode every read comes from disk, never the cloud, never a token.
// This is the single decision point that flips the data source under all pages.
//
// When NO mode is persisted yet, default to LOCAL unless a cloud token exists.
// WHY : a desktop-native, local-first app must not fire AUTH_REQUIRED on every
// page for a user who has not logged into the cloud. Before the secure-store
// runtime fallback landed, `set('auth.mode','local')` failed on a locked Linux
// keyring, so the mode never persisted and the app silently fell back to cloud
// and errored everywhere. A persisted cloud token still forces cloud (an actual
// cloud user is not hijacked to local) ; an explicit cloud/custom stays cloud.
export async function isLocalMode(): Promise<boolean> {
  try {
    const mode = await secureStore.get(AUTH_MODE_KEY);
    if (mode === 'local') return true;
    if (mode === 'cloud' || mode === 'custom') return false;
    // Mode not set : local unless a cloud token is present.
    const token = await secureStore.get(AUTH_TOKEN_KEY);
    return !token;
  } catch {
    return false;
  }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.byanWeb.me, wrap(async () => (await isLocalMode()) ? localMe() : fetchMe()));

  ipcMain.handle(IPC_CHANNELS.byanWeb.projectsList, wrap(async () => (await isLocalMode()) ? localProjects() : fetchProjects()));

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.projectsGet,
    wrap(async (_evt, id: string) => (await isLocalMode()) ? localProject(id) : fetchProject(id))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.memoryList,
    wrap(async (_evt, opts?: ByanApiListOpts) => (await isLocalMode()) ? localMemory(opts ?? {}) : fetchMemory(opts ?? {}))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.knowledgeList,
    wrap(async (_evt, opts?: ByanApiListOpts) => (await isLocalMode()) ? localKnowledge(opts ?? {}) : fetchKnowledge(opts ?? {}))
  );

  ipcMain.handle(IPC_CHANNELS.byanWeb.customAgentsList, wrap(async () => (await isLocalMode()) ? localAgents() : fetchCustomAgents()));

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.sessionsList,
    wrap(async (_evt, opts?: Pick<ByanApiListOpts, 'projectId' | 'limit'>) => (await isLocalMode()) ? localSessions(opts ?? {}) : fetchSessions(opts ?? {}))
  );

  // ---------- Chat ----------
  // Local mode has no cloud conversations — return empty so nothing asks for a
  // token. Real local chat is the local claude session (N3), not this list.

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatConversationsList,
    wrap(async () => (await isLocalMode()) ? [] : fetchChatConversations())
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatConversationsCreate,
    wrap((_evt, opts: CreateConversationOpts) => createChatConversation(opts))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatConversationsDelete,
    wrap((_evt, id: string) => deleteChatConversation(id))
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatMessagesList,
    wrap(async (_evt, conversationId: string, opts?: { limit?: number }) =>
      (await isLocalMode()) ? [] : fetchChatMessages(conversationId, opts ?? {})
    )
  );

  // ---------- SSE stream ----------

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatStreamStart,
    async (evt: IpcMainInvokeEvent, conversationId: string, message: string, opts?: SendMessageOpts) => {
      const streamId = randomUUID();
      const controller = new AbortController();
      activeStreams.set(streamId, controller);

      // Open the SSE stream in the background — we return the streamId immediately
      // so the renderer can start listening on byan:chat:chunk.
      void openSseStream(evt, streamId, controller, conversationId, message, opts ?? {});

      return { streamId };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.byanWeb.chatStreamAbort,
    async (_evt, streamId: string) => {
      const ctrl = activeStreams.get(streamId);
      if (ctrl) {
        ctrl.abort();
        activeStreams.delete(streamId);
      }
    }
  );
}

// Opens an SSE fetch toward the byan_web backend and forwards chunks to the renderer.
// WHY a separate function: keeps the handler above readable and makes the SSE logic
// independently testable (no ipcMain.handle wrapper needed in tests).
async function openSseStream(
  evt: IpcMainInvokeEvent,
  streamId: string,
  controller: AbortController,
  conversationId: string,
  message: string,
  opts: SendMessageOpts
): Promise<void> {
  const send = (payload: Record<string, unknown>) => {
    // Guard: the webContents may have been destroyed if the window closed mid-stream.
    if (!evt.sender.isDestroyed()) {
      evt.sender.send('byan:chat:chunk', payload);
    }
  };

  let token: string;
  let url: string;
  try {
    token = await getAuthToken();
    url = await getChatStreamUrl(conversationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ streamId, type: 'error', error: msg });
    activeStreams.delete(streamId);
    return;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: message,
        cli_provider: opts.cli_provider,
        scope: opts.scope,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      activeStreams.delete(streamId);
      return;
    }
    send({ streamId, type: 'error', error: `Network error: ${err instanceof Error ? err.message : String(err)}` });
    activeStreams.delete(streamId);
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    send({ streamId, type: 'error', error: body.error ?? `HTTP ${res.status}` });
    activeStreams.delete(streamId);
    return;
  }

  // Stream the response body line by line.
  const reader = res.body?.getReader();
  if (!reader) {
    send({ streamId, type: 'error', error: 'Empty response body from SSE endpoint' });
    activeStreams.delete(streamId);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Map backend event types to our IPC payload shape.
        switch (data.type) {
          case 'chunk':
            send({ streamId, type: 'chunk', delta: data.delta as string });
            break;
          case 'end':
            send({
              streamId,
              type: 'end',
              messageId: data.message_id as string,
              credentialSource: (data.credential_source as string) ?? null,
            });
            break;
          case 'error':
            send({ streamId, type: 'error', error: data.error as string });
            break;
          default:
            // Unknown type from backend — ignore silently.
            break;
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string }).name !== 'AbortError') {
      send({ streamId, type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    activeStreams.delete(streamId);
  }
}

// Exported for unit tests — allows injecting a mock IpcMainInvokeEvent.
export { openSseStream };

// Exported so IpcError is importable in tests without re-requiring _error.
export { IpcError };
