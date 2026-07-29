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
import type {
  EngineId,
  LocalChatActivity,
  LocalChatMessage,
  LocalChatStartOpts,
  LocalChatSessionSummary,
  LocalChatTurnOpts,
  LocalChatUsage,
} from '../../shared/ipc-contract';

export type LocalChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LocalMsg {
  id: string;
  role: LocalChatRole;
  content: string;
}

// The numeric metrics a total folds. Listed by hand rather than derived from a
// sample object so a metric added to LocalChatUsage and forgotten here shows up
// as a missing column, not as a silently dropped number.
const USAGE_METRICS = [
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'costUsd',
  'durationMs',
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

// HOW each metric aggregates across the turns of one session. Not every reported
// number is a per-turn delta, and treating them alike produces a wrong total.
//
// MEASURED against the real claude CLI (three turns in one session, 2026-07-27):
//   total_cost_usd : 0.2319165 -> 0.261986 -> 0.28187   (monotonic: SESSION TOTAL)
//   duration_ms    : 4150      -> 2739     -> 2985      (not monotonic: PER TURN)
// So the cost field already IS the running total. Summing it reported 0.776 USD
// for a session that had cost 0.282 — nearly treble, presented as a measurement.
// codex spawns one process per turn and each turn.completed reports only that
// turn, so its counters are genuine deltas and do sum.
//
// 'latest' keeps the most recent reported value; 'sum' adds deltas.
const USAGE_AGGREGATION: Record<UsageMetric, 'sum' | 'latest'> = {
  inputTokens: 'sum',
  cachedInputTokens: 'sum',
  cacheWriteInputTokens: 'sum',
  outputTokens: 'sum',
  reasoningOutputTokens: 'sum',
  costUsd: 'latest',
  durationMs: 'sum',
};

// One engine's running sum. Every metric is optional for the same reason it is
// optional on the wire: absent means "never reported", which the UI owes the user
// as a dash. A 0 here would be indistinguishable from a measured zero.
export type LocalChatUsageTotal = {
  engine: EngineId;
  // Completed turns folded into this row — a row of nothing but dashes still
  // has to be able to say how many turns produced it.
  turns: number;
  // The model of the most recent turn on this engine.
  model?: string | null;
} & { [K in UsageMetric]?: number };

export type LocalChatUsageTotals = Partial<Record<EngineId, LocalChatUsageTotal>>;

// How many per-turn records are retained. A long session must not grow this
// array (nor the panel that renders it) without bound. The TOTALS are folded
// separately and keep accumulating past the cap, so trimming the list loses the
// per-turn breakdown of old turns, never the session's arithmetic.
const USAGE_TURNS_CAP = 50;

// Fold one reported turn into the running per-engine totals.
//
// Three rules carry the honesty of the whole feature. Engines are folded
// SEPARATELY: claude reports dollars and codex reports tokens, so one shared
// bucket would either blend incompatible units or drop half the data. An absent
// metric stays absent: treating `undefined` as 0 to make the arithmetic work
// would manufacture a measurement out of a silence. And each metric obeys
// USAGE_AGGREGATION — a field that already carries the session total is REPLACED,
// not added, because adding running totals is how you treble a real number.
function foldUsage(prev: LocalChatUsageTotals, usage: LocalChatUsage): LocalChatUsageTotals {
  const before = prev[usage.engine];
  const next: LocalChatUsageTotal = { engine: usage.engine, turns: (before?.turns ?? 0) + 1 };
  const model = typeof usage.model === 'string' ? usage.model : before?.model;
  if (model !== undefined) next.model = model;
  for (const key of USAGE_METRICS) {
    const reported = usage[key];
    const carried = before?.[key];
    if (typeof reported !== 'number') {
      // Nothing reported this turn — keep whatever earlier turns established.
      if (carried !== undefined) next[key] = carried;
      continue;
    }
    next[key] = USAGE_AGGREGATION[key] === 'latest' ? reported : (carried ?? 0) + reported;
  }
  return { ...prev, [usage.engine]: next };
}

// Why an object and not a bare boolean: the next thing to carry across a restart
// (a pinned scope, a draft) belongs here rather than in a second positional flag.
export interface NewSessionKeep {
  keepTranscript?: boolean;
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
  // Per-turn usage exactly as the engines reported it, oldest first, capped at
  // USAGE_TURNS_CAP. Empty until a turn completes carrying a usage payload.
  usageTurns: LocalChatUsage[];
  // The same numbers folded per engine. Separate from usageTurns so the cap on
  // the list never truncates the session's arithmetic.
  usageTotals: LocalChatUsageTotals;
  // The directory the live session actually runs in, as main resolved it. Null
  // when no session is open.
  sessionCwd: string | null;
  // The engine's current step (tool call, command, search). Null between turns.
  activity: LocalChatActivity | null;
  // Reasoning tokens claude reports during the turn. 0 between turns.
  thinkingTokens: number;
  // Epoch ms the live turn started, for the elapsed counter. Null between turns.
  turnStartedAt: number | null;
  // Start a fresh local session. Drops the displayed thread unless
  // `keepTranscript` is set — which the engine switch needs: losing the exchange
  // to change engine was the reported defect, and the transcript belongs to the
  // reader, not to the process that produced it.
  //
  // What CANNOT be carried is the model-side context: the new engine opens a
  // fresh thread and has not read a word of the previous one. The caller must say
  // so; keeping the text on screen without that sentence would be a lie by layout.
  newSession: (opts?: LocalChatStartOpts, keep?: NewSessionKeep) => Promise<void>;
  // Resume a session : reopens claude in the session's project dir (cwd).
  resume: (recordId: string, cwd?: string) => Promise<void>;
  // Re-read the persisted session list.
  refreshSessions: () => Promise<void>;
  // Send a user message ; starts a session on the fly (with startOpts) if none exists.
  // turnOpts carries per-turn overrides (reasoning effort). It is read on EVERY
  // turn, so changing the effort applies from the next message on — no restart.
  send: (text: string, startOpts?: LocalChatStartOpts, turnOpts?: LocalChatTurnOpts) => Promise<void>;
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
  const [usageTurns, setUsageTurns] = useState<LocalChatUsage[]>([]);
  const [usageTotals, setUsageTotals] = useState<LocalChatUsageTotals>({});
  // The folder main ACTUALLY resolved. Without it the header would keep inviting
  // the user to pick a directory while a session is already working in one.
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  // What the engine is doing right now. Both engines already emitted this and it
  // was dropped, which is why a 20-60s turn showed a bare spinner and read as an
  // app doing nothing.
  const [activity, setActivity] = useState<LocalChatActivity | null>(null);
  const [thinkingTokens, setThinkingTokens] = useState(0);
  // When the live turn began, so the interface can show elapsed time. A silent
  // stretch with a counter running is legible; the same stretch without one is
  // indistinguishable from a hang.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);

  // The event listener closes over a ref, not state, so it always filters on the
  // current session without re-subscribing on every session change.
  const sessionRef = useRef<string | null>(null);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  // Streamed text is accumulated SYNCHRONOUSLY in a ref (not an effect-synced
  // one) so a chunk followed immediately by complete in the same tick still
  // commits the full text. `streamText` state only mirrors it for rendering.
  const accRef = useRef('');

  // The in-flight session start, if any. A turn sent while a session is opening
  // used to race it: the message went to the OUTGOING session, then the incoming
  // one reset the transcript and stopped that process — the message vanished with
  // no error. send() now waits on this instead of reading a stale session id.
  const startingRef = useRef<Promise<void> | null>(null);

  // Wraps a start so both newSession and resume publish their promise, and clear
  // it only if a newer start has not already replaced it.
  const trackStart = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const p = run();
    const tracked = p.then(() => undefined, () => undefined);
    startingRef.current = tracked;
    void tracked.then(() => {
      if (startingRef.current === tracked) startingRef.current = null;
    });
    return p;
  }, []);

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
          setActivity(null);
          setThinkingTokens(0);
          setTurnStartedAt(null);
          // A turn without a usage payload adds nothing: the engine measured
          // nothing, and inventing a zero row would claim it measured zero. The
          // local const is what carries the narrowed type into the closures
          // below — a property narrowing does not survive a function boundary.
          const usage = m.usage;
          if (usage) {
            setUsageTurns((prev) => [...prev, usage].slice(-USAGE_TURNS_CAP));
            setUsageTotals((prev) => foldUsage(prev, usage));
          }
          break;
        }
        case 'error':
          accRef.current = '';
          setMessages((prev) => [...prev, { id: makeId('e'), role: 'system', content: `Erreur: ${m.error}` }]);
          setStreaming(false);
          setStreamText('');
          setError(m.error);
          setActivity(null);
          setThinkingTokens(0);
          setTurnStartedAt(null);
          break;
        case 'stopped':
          accRef.current = '';
          setStreaming(false);
          setStreamText('');
          setActivity(null);
          setThinkingTokens(0);
          setTurnStartedAt(null);
          break;
        case 'tool':
          // A frame with no recognisable activity is still evidence of work, so
          // the previous label is kept rather than blanked.
          if (m.activity) setActivity(m.activity);
          break;
        case 'thinking':
          // Monotonic per turn: claude reports a running estimate, and a count
          // that went backwards would look like a bug in the counter.
          if (typeof m.tokens === 'number') setThinkingTokens((prev) => Math.max(prev, m.tokens ?? 0));
          break;
        // 'started' is handled by newSession's resolve.
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
      // The bill goes with the thread: on a shared machine, leaving the previous
      // user's cost and token counts on screen would attribute their spend to
      // whoever logs in next.
      setUsageTurns([]);
      setUsageTotals({});
      setSessionCwd(null);
      setActivity(null);
      setThinkingTokens(0);
      setTurnStartedAt(null);
    });
  }, []);

  const newSession = useCallback(async (opts?: LocalChatStartOpts, keep?: NewSessionKeep) => {
    const keepTranscript = keep?.keepTranscript === true;
    setStarting(true);
    setError(null);
    const prev = sessionRef.current;
    try {
      const { sessionId: id, cwd } = await trackStart(() => window.byanApi.localChat.start(opts));
      setSessionCwd(cwd ?? null);
      // Repoint the frame filter SYNCHRONOUSLY : the effect that syncs sessionRef
      // only runs after commit, so a late frame from the old session could
      // otherwise pass the filter and bleed into the fresh thread.
      sessionRef.current = id;
      setSessionId(id);
      if (!keepTranscript) setMessages([]);
      accRef.current = '';
      setStreamText('');
      setStreaming(false);
      // Usage stays SESSION-scoped even when the transcript is carried over: the
      // bill belongs to the process that ran the turns, and adding a codex total
      // onto a claude one would cross two units.
      setUsageTurns([]);
      setUsageTotals({});
      setActivity(null);
      setThinkingTokens(0);
      setTurnStartedAt(null);
      // Stop the outgoing session so its claude child is not orphaned (the main
      // bridge caps at 8 concurrent and then refuses to start).
      if (prev && prev !== id) { try { void window.byanApi.localChat.stop(prev); } catch { /* best effort */ } }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer la session locale.');
    } finally {
      setStarting(false);
    }
  }, [trackStart]);

  // startOpts (F4) : when a session is created on the fly, bind it to a cwd/agent.
  const send = useCallback(async (text: string, startOpts?: LocalChatStartOpts, turnOpts?: LocalChatTurnOpts) => {
    const content = text.trim();
    if (!content || streaming) return;

    // A session may be opening right now (the /agent and /byan commands start one
    // without awaiting). Waiting here is what keeps the message: it then lands on
    // the session that is actually alive, instead of on the one about to be
    // stopped. The session id MUST be read after this await, not before.
    if (startingRef.current) {
      try { await startingRef.current; } catch { /* the start's own error path reports it */ }
    }

    // Create a session on the fly if the user sends before starting one.
    let id = sessionRef.current;
    if (!id) {
      setStarting(true);
      setError(null);
      try {
        const started = await window.byanApi.localChat.start(startOpts);
        id = started.sessionId;
        setSessionCwd(started.cwd ?? null);
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
    // Redundant today with the clears on complete/error/stopped — mutation
    // testing confirms removing THIS one alone breaks nothing. It stays as the
    // guard for a future frame path that ends a turn without going through one
    // of those three, which would otherwise label a new turn with old work.
    setActivity(null);
    setThinkingTokens(0);
    setTurnStartedAt(Date.now());
    accRef.current = '';
    setStreamText('');
    try {
      await window.byanApi.localChat.send(id, content, turnOpts);
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
    // Cleared here rather than after the awaits because the outgoing session is
    // abandoned from this point on BOTH paths — a failed reattach must not leave
    // its numbers standing next to an empty thread.
    setUsageTurns([]);
    setUsageTotals({});
    try {
      // Seed the thread with any stored history so the user sees prior turns.
      const history = (await window.byanApi.localChat.history?.(recordId)) ?? [];
      setMessages(history.map((h, i) => ({ id: `h-${i}`, role: toRole(h.role), content: h.content })));
      const { sessionId: id, cwd: resolvedCwd } = await trackStart(() => window.byanApi.localChat.start(cwd ? { cwd } : undefined));
      setSessionCwd(resolvedCwd ?? null);
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
      setSessionCwd(null);
      setError(err instanceof Error ? err.message : 'Impossible de reprendre la session locale.');
    } finally {
      setStarting(false);
    }
  }, [trackStart]);

  return {
    sessionId, messages, streaming, streamText, starting, error, sessions,
    usageTurns, usageTotals, sessionCwd, activity, thinkingTokens, turnStartedAt,
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
