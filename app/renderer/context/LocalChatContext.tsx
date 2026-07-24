// LocalChatContext — app-level home for the local `claude` chat state.
//
// WHY a context, not a plain hook in the page : the manual router in App renders
// ONE page at a time, so navigating away UNMOUNTS the Chat page (and its
// LocalChatView). If the chat state lived in the component it would be thrown
// away on every navigation — the thread, the sessionId, the live stream. The
// live claude process itself lives in the MAIN process and survives navigation ;
// only the renderer forgot it. Mounting this provider ONCE in App() (above the
// router) keeps the thread + the byan:chat-local:message subscription alive for
// the app's lifetime, so leaving Chat and coming back preserves the session.
//
// The stateful body below is the former useLocalChat hook, verbatim — moved here
// so it runs once in the provider instead of once per Chat mount.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { LocalChatMessage, LocalChatStartOpts, LocalChatSessionSummary } from '../../shared/ipc-contract';

export type LocalChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LocalMsg {
  id: string;
  role: LocalChatRole;
  content: string;
}

export interface UseLocalChat {
  sessionId: string | null;
  messages: LocalMsg[];
  streaming: boolean;
  streamText: string;
  starting: boolean;
  error: string | null;
  // Persisted sessions available to resume (most recent first).
  sessions: LocalChatSessionSummary[];
  // Start a fresh local session (drops the current thread).
  newSession: (opts?: LocalChatStartOpts) => Promise<void>;
  // Resume a session : reopens claude in the session's project dir (cwd).
  resume: (recordId: string, cwd?: string) => Promise<void>;
  // Re-read the persisted session list.
  refreshSessions: () => Promise<void>;
  // Send a user message ; starts a session on the fly (with startOpts) if none exists.
  send: (text: string, startOpts?: LocalChatStartOpts) => Promise<void>;
  // Ask the local CLI to stop the current turn.
  stop: () => Promise<void>;
}

// Coerce a stored message role onto the display union (unknown -> assistant).
function toRole(role: string): LocalChatRole {
  return role === 'user' || role === 'system' || role === 'tool' ? role : 'assistant';
}

let _idCounter = 0;
function makeId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

// The stateful engine — one instance, owned by the provider.
function useLocalChatState(): UseLocalChat {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LocalChatSessionSummary[]>([]);

  // The event listener closes over a ref, not state, so it always filters on the
  // current session without re-subscribing on every session change.
  const sessionRef = useRef<string | null>(null);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  // Streamed text is accumulated SYNCHRONOUSLY in a ref (not an effect-synced
  // one) so a chunk followed immediately by complete in the same tick still
  // commits the full text. `streamText` state only mirrors it for rendering.
  const accRef = useRef('');

  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    return window.byanEvents.on('byan:chat-local:message', (payload: unknown) => {
      const m = payload as LocalChatMessage;
      // Frames tagged with another session are ignored — including errors, so a
      // second session's failure never disturbs this view. Session-less errors
      // (a start that failed before any id) carry sessionId null and DO surface.
      // The mismatch drops the frame EVEN when no session is active: after the
      // logout wipe (sessionRef null) a late flush from the just-stopped
      // session used to leak the previous user's reply into the next login.
      if ('sessionId' in m && m.sessionId && m.sessionId !== sessionRef.current) {
        return;
      }

      switch (m.type) {
        case 'chunk':
          accRef.current += m.delta;
          setStreamText(accRef.current);
          break;
        case 'complete': {
          // Prefer the streamed text ; fall back to the result payload when no
          // chunk arrived (a message-level result with an empty accumulator).
          const resultText = typeof m.result === 'string' ? m.result : '';
          const finalText = accRef.current || resultText;
          accRef.current = '';
          setMessages((prev) =>
            finalText
              ? [...prev, { id: makeId('a'), role: 'assistant', content: finalText }]
              : prev
          );
          setStreaming(false);
          setStreamText('');
          setError(null);
          break;
        }
        case 'error':
          accRef.current = '';
          setMessages((prev) => [...prev, { id: makeId('e'), role: 'system', content: `Erreur: ${m.error}` }]);
          setStreaming(false);
          setStreamText('');
          setError(m.error);
          break;
        case 'stopped':
          accRef.current = '';
          setStreaming(false);
          setStreamText('');
          break;
        // 'started' is handled by newSession's resolve ; 'tool' is not surfaced yet.
        default:
          break;
      }
    });
  }, []);

  // The provider lives ABOVE the router, so a logout does NOT unmount it (before
  // the lift, navigating away unmounted the view and discarded the thread). On a
  // shared machine that would leak the previous user's thread + sessionId to the
  // next login, and leave their claude child process alive and reusable. Clear
  // everything and stop the live session when auth flips to logged-out.
  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    return window.byanEvents.on('byan:auth:changed', (payload: unknown) => {
      const { reason } = (payload as { reason?: string }) ?? {};
      if (reason !== 'logout') return;
      const id = sessionRef.current;
      if (id) { try { void window.byanApi.localChat.stop(id); } catch { /* best effort */ } }
      sessionRef.current = null;
      accRef.current = '';
      setSessionId(null);
      setMessages([]);
      setStreamText('');
      setStreaming(false);
      setError(null);
      setSessions([]);
    });
  }, []);

  const newSession = useCallback(async (opts?: LocalChatStartOpts) => {
    setStarting(true);
    setError(null);
    const prev = sessionRef.current;
    try {
      const { sessionId: id } = await window.byanApi.localChat.start(opts);
      // Repoint the frame filter SYNCHRONOUSLY : the effect that syncs sessionRef
      // only runs after commit, so a late frame from the old session could
      // otherwise pass the filter and bleed into the fresh thread.
      sessionRef.current = id;
      setSessionId(id);
      setMessages([]);
      accRef.current = '';
      setStreamText('');
      setStreaming(false);
      // Stop the outgoing session so its claude child is not orphaned (the main
      // bridge caps at 8 concurrent and then refuses to start).
      if (prev && prev !== id) { try { void window.byanApi.localChat.stop(prev); } catch { /* best effort */ } }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer la session locale.');
    } finally {
      setStarting(false);
    }
  }, []);

  // startOpts (F4) : when a session is created on the fly, bind it to a cwd/agent.
  const send = useCallback(async (text: string, startOpts?: LocalChatStartOpts) => {
    const content = text.trim();
    if (!content || streaming) return;

    // Create a session on the fly if the user sends before starting one.
    let id = sessionRef.current;
    if (!id) {
      setStarting(true);
      setError(null);
      try {
        const started = await window.byanApi.localChat.start(startOpts);
        id = started.sessionId;
        sessionRef.current = id; // sync so response frames are filtered on the right id
        setSessionId(id);
        setMessages([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de démarrer la session locale.');
        setStarting(false);
        return;
      }
      setStarting(false);
    }

    setMessages((prev) => [...prev, { id: makeId('u'), role: 'user', content }]);
    setError(null); // a new turn clears the previous turn's error banner
    setStreaming(true);
    accRef.current = '';
    setStreamText('');
    try {
      await window.byanApi.localChat.send(id, content);
    } catch (err) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: makeId('e'), role: 'system', content: `Erreur: ${err instanceof Error ? err.message : 'envoi impossible'}` },
      ]);
    }
  }, [streaming]);

  const stop = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    try {
      await window.byanApi.localChat.stop(id);
    } catch {
      // Best effort — the stopped event (or a failure) settles the UI.
    }
    setStreaming(false);
    setStreamText('');
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = (await window.byanApi.localChat.list?.()) ?? [];
      setSessions(list);
    } catch {
      setSessions([]);
    }
  }, []);

  // cwd = the session's project dir (from its list summary). Native "reprendre"
  // reopens claude in that dir (right project + right .mcp.json), fresh — true
  // context reattach is a follow-up (needs claude's own session uuid persisted).
  const resume = useCallback(async (recordId: string, cwd?: string) => {
    setStarting(true);
    setError(null);
    const prev = sessionRef.current;
    // Unbind the frame filter NOW: during the awaits below, frames from the
    // still-live outgoing session used to pass the filter and pollute the
    // freshly seeded thread. With the filter unbound they are dropped.
    sessionRef.current = null;
    try {
      // Seed the thread with any stored history so the user sees prior turns.
      const history = (await window.byanApi.localChat.history?.(recordId)) ?? [];
      setMessages(history.map((h, i) => ({ id: `h-${i}`, role: toRole(h.role), content: h.content })));
      const { sessionId: id } = await window.byanApi.localChat.start(cwd ? { cwd } : undefined);
      sessionRef.current = id; // sync (see newSession) — filter stale frames immediately
      setSessionId(id);
      accRef.current = '';
      setStreamText('');
      setStreaming(false);
      // Stop the outgoing session's claude child (avoid orphan + the 8-cap).
      if (prev && prev !== id) { try { void window.byanApi.localChat.stop(prev); } catch { /* best effort */ } }
    } catch (err) {
      // Reattach failed — drop the just-seeded history so the view does not show
      // an orphan thread that never reconnected.
      setMessages([]);
      setSessionId(null);
      setError(err instanceof Error ? err.message : 'Impossible de reprendre la session locale.');
    } finally {
      setStarting(false);
    }
  }, []);

  return {
    sessionId, messages, streaming, streamText, starting, error, sessions,
    newSession, resume, refreshSessions, send, stop,
  };
}

const LocalChatContext = createContext<UseLocalChat | null>(null);

// Mounted ONCE in App() above the router — this is what makes the session
// survive navigation. Everything below the provider shares the one instance.
export function LocalChatProvider({ children }: { children: React.ReactNode }) {
  const value = useLocalChatState();
  return <LocalChatContext.Provider value={value}>{children}</LocalChatContext.Provider>;
}

// Consumer hook — reads the shared state. Throws if used outside the provider so
// a missing mount is a loud bug, not a silent fresh-state-per-mount regression.
export function useLocalChat(): UseLocalChat {
  const ctx = useContext(LocalChatContext);
  if (ctx === null) {
    throw new Error('useLocalChat must be used within a <LocalChatProvider> (mounted in App()).');
  }
  return ctx;
}
