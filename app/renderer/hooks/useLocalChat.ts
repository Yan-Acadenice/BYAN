// useLocalChat (F2) — renderer-side state for a local `claude` chat session.
//
// It wraps the main-process ws bridge exposed as window.byanApi.localChat: start
// a session (server-assigned id), send messages, and accumulate streamed output
// arriving on the byan:chat-local:message event. Deltas land in `streamText`
// while streaming; on complete the accumulated text becomes an assistant message.
// This is the local counterpart of the cloud chat state living in Chat.tsx —
// isolated here so the cloud path stays untouched and this stays unit-testable.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalChatMessage, LocalChatStartOpts } from '../../shared/ipc-contract';

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
  // Start a fresh local session (drops the current thread).
  newSession: (opts?: LocalChatStartOpts) => Promise<void>;
  // Send a user message ; starts a session on the fly if none exists.
  send: (text: string) => Promise<void>;
  // Ask the local CLI to stop the current turn.
  stop: () => Promise<void>;
}

let _idCounter = 0;
function makeId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

export function useLocalChat(): UseLocalChat {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if ('sessionId' in m && m.sessionId && sessionRef.current && m.sessionId !== sessionRef.current) {
        return;
      }

      switch (m.type) {
        case 'chunk':
          accRef.current += m.delta;
          setStreamText(accRef.current);
          break;
        case 'complete': {
          const finalText = accRef.current;
          accRef.current = '';
          setMessages((prev) =>
            finalText
              ? [...prev, { id: makeId('a'), role: 'assistant', content: finalText }]
              : prev
          );
          setStreaming(false);
          setStreamText('');
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

  const newSession = useCallback(async (opts?: LocalChatStartOpts) => {
    setStarting(true);
    setError(null);
    try {
      const { sessionId: id } = await window.byanApi.localChat.start(opts);
      setSessionId(id);
      setMessages([]);
      accRef.current = '';
      setStreamText('');
      setStreaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer la session locale.');
    } finally {
      setStarting(false);
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    // Create a session on the fly if the user sends before starting one.
    let id = sessionRef.current;
    if (!id) {
      setStarting(true);
      setError(null);
      try {
        const started = await window.byanApi.localChat.start();
        id = started.sessionId;
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

  return { sessionId, messages, streaming, streamText, starting, error, newSession, send, stop };
}
