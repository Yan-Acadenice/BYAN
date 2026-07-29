// LocalChatView (F2) — the chat surface shown when the app runs in LOCAL mode.
//
// It talks to the `claude` CLI on this PC through useLocalChat (main-process ws
// bridge), NOT to byan_web. The cloud chat UI (conversation list, byan_web
// history) does not apply locally, so this is a focused single-session view:
// start / resume-in-memory a session, send, watch the stream. Session
// persistence + resume across restarts is F3.
//
// LAYOUT — the two temporalities (handoff lot 1.2, option B1).
// Six chips used to sit on one line, all clickable, with nothing to tell what was
// already TRUE from what would apply NEXT. They are split:
//   TOP  — the identity of the session that is running, in READING. Folder,
//          engine, model, agent, id, and how long it has been open. No settings.
//   FOOT — the settings, next to the input, because that is where the next
//          message starts. Effort applies from the next MESSAGE; folder, engine
//          and model apply from the next START.
//   BETWEEN — an amber divergence line whenever a chosen setting is not the one
//          the live conversation is running, with a way to restart now.

import React, { useEffect, useRef, useState } from 'react';
import { Send, X, Plus, Loader2, MessageSquare, Cpu, History, Check, Folder, Gauge, Bot, AlertTriangle, RotateCcw } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import { useLocalChat } from '../../hooks/useLocalChat';
import { useSlashPalette } from '../../hooks/useSlashPalette';
import SlashCommandMenu from './SlashCommandMenu';
import UsagePanel from './panels/UsagePanel';
import McpPanel from './panels/McpPanel';
import ConsequenceDialog from './ConsequenceDialog';
import { divergenceLines, folderLabel, openForLabel, pluralS } from './session-facts';
import { trailingIgnoredMessage, unknownCommandMessage } from './command-copy';
import { parseSlashInput } from '../../lib/slash-commands';
import { resolveClaudeAgent, suggestClaudeAgents } from '../../../shared/agent-slugs';
import type { LocalChatActivity } from '../../../shared/tool-activity';
import {
  MODEL_PRESETS,
  effortAppliesAt,
  effortsFor,
  isValidEffortFor,
  isValidModelFor,
  type EngineId,
  type ReasoningEffort,
} from '../../../shared/engine-options';

// The engine a NEW local session runs on. 'claude' is the long-lived stream
// process; 'codex' runs one process per turn (resume-chained). Selecting an
// engine applies to the NEXT session started — a live session keeps its own.
type LocalEngine = EngineId;

// Model choices are stored PER ENGINE: the two model spaces are disjoint, so one
// shared slot would hand codex a claude alias the moment the user switched.
type ModelByEngine = Partial<Record<LocalEngine, string>>;

// A short-lived line above the input. Used for everything the user must be told
// but that is not part of the conversation: an unknown command, a setting
// applied, a setting refused. Silence would read as a broken command.
interface Notice {
  tone: 'info' | 'warn';
  text: string;
}

// What the LIVE session was started with. The provider publishes only sessionId
// and sessionCwd, so the engine / model / agent a running session was SPAWNED
// with have to be remembered here — otherwise the identity bar would describe
// the current SELECTION, which is exactly the confusion lot 1.2 exists to end.
interface LiveSession {
  sessionId: string;
  engine: LocalEngine;
  model: string | null;
  agent: string | null;
  openedAt: number;
}

// Module scope on purpose. A mode switch (local -> cloud -> local) UNMOUNTS this
// view while LocalChatProvider, mounted above the router, keeps the session
// alive. Component state would die with the unmount and the identity bar would
// go blank on a session that is still running. It is only ever read back when the
// session id still MATCHES, so a stale snapshot can never label another session,
// and an armed start always overwrites it.
let rememberedLive: LiveSession | null = null;

// What replaced the bare spinner. The spinner said "something is happening";
// this says WHAT is happening and for how long. During a BYAN agent activation
// (measured: 20s+ of tool calls before the first word) the difference is between
// an app that looks frozen and one that is visibly working.
function ActivityLine({ activity, thinkingTokens, elapsedS }: {
  activity: LocalChatActivity | null;
  thinkingTokens: number;
  elapsedS: number;
}) {
  const parts: string[] = [];
  if (activity) {
    parts.push(activity.phase === 'end' ? `${activity.name} terminé` : activity.name);
    if (activity.detail) parts.push(activity.detail);
  } else if (thinkingTokens > 0) {
    parts.push(`réflexion (${thinkingTokens} jetons)`);
  }
  return (
    <span className="flex items-center gap-xs text-xs text-content-secondary" data-testid="local-activity">
      <Loader2 size={14} className="animate-spin shrink-0" />
      {/* The elapsed counter is shown on its own when nothing else is known: a
          number that moves is the minimum honest signal that the turn is alive.
          It sat below the readability floor, which is the wrong tier for a
          measured value — content-muted is for a dash, not for a number. */}
      <span className="truncate">
        {parts.length > 0 ? parts.join(' — ') : 'en cours'}
      </span>
      <span className="shrink-0 text-content-tertiary font-mono-code">{elapsedS}s</span>
    </span>
  );
}

export default function LocalChatView() {
  const {
    messages, streaming, streamText, starting, error, sessionId, sessions,
    usageTurns, usageTotals, sessionCwd, activity, thinkingTokens, turnStartedAt,
    newSession, resume, refreshSessions, send, stop,
  } = useLocalChat();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // F4 : the project directory (cwd) a new local session runs in. Defaults to the
  // folder chosen at onboarding ; the folder button lets the user pick another.
  const [cwd, setCwd] = useState<string | null>(null);
  // Ticks once a second while a turn runs, so the elapsed counter actually moves.
  // A frozen number would be worse than none: it would suggest a frozen turn.
  const [elapsedS, setElapsedS] = useState(0);
  useEffect(() => {
    if (turnStartedAt === null) { setElapsedS(0); return; }
    const tick = () => setElapsedS(Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [turnStartedAt]);
  const [engine, setEngine] = useState<LocalEngine>('claude');
  // TRI-state, and the third state carries its weight: `null` means detection has
  // not answered yet. `false` would be a claim ("codex is not installed") the app
  // has not measured, and it would flash that claim on every mount.
  const [codexDetected, setCodexDetected] = useState<boolean | null>(null);
  const [modelByEngine, setModelByEngine] = useState<ModelByEngine>({});
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Agent slugs the claude CLI will actually honour here. Loaded from disk
  // because an unknown slug is accepted and silently dropped by the CLI, so a
  // choice has to be checked before it is sent, not after it failed to apply.
  const [claudeAgents, setClaudeAgents] = useState<string[]>([]);
  // The identity of the running session (see LiveSession above).
  const [liveState, setLiveState] = useState<LiveSession | null>(null);
  const pendingStartRef = useRef<Omit<LiveSession, 'sessionId' | 'openedAt'> | null>(null);
  const [uptimeS, setUptimeS] = useState(0);
  // How many messages of the thread /clear has hidden (see the '/clear' arm).
  const [hiddenCount, setHiddenCount] = useState(0);
  // A pending act whose consequence has been stated and not yet answered.
  const [pendingRestart, setPendingRestart] = useState<{ trailing: string; reason: 'new' | 'diverge' } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const effortRef = useRef<HTMLDivElement>(null);
  const usageRef = useRef<HTMLDivElement>(null);

  // The palette owns the input value: it has to see every keystroke to filter.
  const palette = useSlashPalette({ engine });
  const input = palette.input;
  const setInput = palette.setInput;

  const model = modelByEngine[engine] ?? null;
  const codexAvailable = codexDetected === true;

  // The live identity. Component state first; the module memo is the fallback
  // that survives the unmount a mode switch causes. Both are gated on the id, so
  // neither can describe a session that is no longer the one running.
  const live: LiveSession | null =
    liveState && liveState.sessionId === sessionId
      ? liveState
      : (sessionId && rememberedLive && rememberedLive.sessionId === sessionId ? rememberedLive : null);

  // Turn count for the header badge, taken from the TOTALS rather than from
  // usageTurns.length: that list is capped at 50, so a 55-turn session would
  // have shown "Usage (50)" beside a panel correctly reporting 55.
  const measuredTurns = Object.values(usageTotals).reduce((n, t) => n + (t?.turns ?? 0), 0);

  // Load the resumable session list + the default project dir once on mount.
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  // Detect codex on this PC, then restore the persisted engine choice — a
  // saved 'codex' only applies when the binary is actually there.
  useEffect(() => {
    void (async () => {
      // undefined = the probe did not answer. Distinct from `false`, which is a
      // measured absence; the difference decides whether the app is allowed to
      // print "codex is not installed".
      let detected: boolean | undefined;
      try {
        const clis = await window.byanApi.cli?.detect?.();
        detected = Boolean(clis?.codex);
      } catch { /* detection failed — stays unknown, not absent */ }
      setCodexDetected(detected ?? null);
      try {
        const saved = await window.byanApi.store?.get?.<string>('chat.localEngine');
        if (saved === 'codex' && detected === true) setEngine('codex');
      } catch { /* keep the claude default */ }
      // Restore the model / effort / agent choices. Each is re-validated against
      // the SHARED guards rather than trusted: a stored value can predate a
      // rename, and the bridge would reject it at spawn time with an error the
      // user could not connect to a setting they made days ago.
      try {
        const storedModels = await window.byanApi.store?.get?.<ModelByEngine>('chat.localModel');
        if (storedModels && typeof storedModels === 'object') {
          const kept: ModelByEngine = {};
          for (const e of ['claude', 'codex'] as const) {
            const v = storedModels[e];
            if (typeof v === 'string' && isValidModelFor(e, v)) kept[e] = v;
          }
          setModelByEngine(kept);
        }
      } catch { /* no stored model — the CLI default applies */ }
      try {
        const storedEffort = await window.byanApi.store?.get?.<string>('chat.localEffort');
        if (isValidEffortFor(engine, storedEffort)) setEffort(storedEffort);
      } catch { /* no stored effort */ }
      try {
        const storedAgent = await window.byanApi.store?.get?.<string>('chat.localAgent');
        if (storedAgent) setAgent(storedAgent);
      } catch { /* no stored agent */ }
    })();
  }, []);

  // Record WHAT the session about to open is being opened with. Called one line
  // before every start, never after: reading the selections once the start has
  // landed would report the state at landing time, and those two differ exactly
  // when the user changed a setting while the session was opening.
  const armSnapshot = (snapshot: Omit<LiveSession, 'sessionId' | 'openedAt'>) => {
    pendingStartRef.current = snapshot;
  };

  // Commit the armed snapshot once the start has landed.
  //
  // The trigger is `starting` going false, NOT the session id changing: an id is
  // the wrong edge to watch because a start that lands on the same id (a resume,
  // or any future id reuse) would leave the previous snapshot describing the new
  // session. Every start path flips `starting`, so consuming the armed value here
  // fires exactly once per start.
  //
  // With NOTHING armed the effect deliberately does nothing: that is the remount
  // case (a mode switch came back), where the module memo already holds the truth
  // for this id and inventing a snapshot from the current selection would relabel
  // a running session with settings it never had.
  useEffect(() => {
    if (starting) return;
    if (!sessionId) return;
    const armed = pendingStartRef.current;
    if (!armed) return;
    pendingStartRef.current = null;
    const snapshot: LiveSession = { sessionId, ...armed, openedAt: Date.now() };
    rememberedLive = snapshot;
    setLiveState(snapshot);
  }, [sessionId, starting]);

  // Uptime advances coarsely (see openForLabel): a 1s tick on an identity line
  // would re-render the whole view every second for a number nobody reads to the
  // second, and the turn already has its own precise counter.
  useEffect(() => {
    if (!live) { setUptimeS(0); return; }
    const openedAt = live.openedAt;
    const tick = () => setUptimeS(Math.max(0, Math.floor((Date.now() - openedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 10_000);
    return () => clearInterval(timer);
  }, [live?.sessionId, live?.openedAt]);

  // A session change (new, resume, logout) rebuilds the thread from scratch, so
  // the /clear watermark drops with it — otherwise it would hide the head of the
  // NEW thread.
  useEffect(() => { setHiddenCount(0); }, [sessionId]);

  // Clamped rather than trusted: any path that SHORTENS the thread would
  // otherwise leave a watermark past its end.
  const hidden = Math.min(hiddenCount, messages.length);
  const shownMessages = hidden > 0 ? messages.slice(hidden) : messages;

  // The settings that are chosen but not in force. Requires a live session:
  // with nothing running there is nothing for a choice to diverge FROM.
  const divergences = live
    ? divergenceLines(
      { engine: live.engine, model: live.model, agent: live.agent, folder: sessionCwd },
      { engine, model, agent, folder: cwd },
    )
    : [];

  // Start options shared by send / new session : project dir, engine, model,
  // effort, agent. The bridge re-validates and drops what an engine cannot use.
  const startOpts = () => ({
    cli: engine,
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
    ...(agent ? { agent } : {}),
  });

  // Per-turn overrides, read on EVERY send so an effort change applies at once.
  const turnOpts = () => (engine === 'codex' && effort ? { reasoningEffort: effort } : undefined);

  // Reported together, and it is one defect: "un chat avec codex ca marche pas,
  // et en plus on perd la session". pickEngine only set a label, so the next
  // message still went to the running claude session — the switch looked inert.
  // Getting codex meant clicking "Nouvelle session", which threw the exchange away.
  //
  // So the switch ACTS: it opens a session on the chosen engine straight away, and
  // carries the transcript so nothing readable is lost. What it cannot carry is the
  // model-side context — the new engine opens a fresh thread and has not read a
  // word of the previous one — so it says that instead of letting the kept text
  // imply otherwise.
  const pickEngine = (next: LocalEngine) => {
    if (next === engine) return;
    setEngine(next);
    try { void window.byanApi.store?.set?.('chat.localEngine', next); } catch { /* non-blocking */ }

    // Nothing on screen and no live session: the first session will simply open on
    // the right engine. Restarting here would be a spawn nobody asked for.
    const hasThread = messages.length > 0 || streaming || sessionId !== null;
    if (!hasThread) {
      setNotice({ tone: 'info', text: `Moteur ${next}. La prochaine session partira dessus.` });
      return;
    }

    const nextModel = modelByEngine[next] ?? null;
    const nextEffort = isValidEffortFor(next, effort) ? effort : null;
    const opts = {
      cli: next,
      ...(cwd ? { cwd } : {}),
      ...(nextModel ? { model: nextModel } : {}),
      ...(nextEffort ? { effort: nextEffort } : {}),
      ...(next === 'claude' && agent ? { agent } : {}),
    };
    void newSession(opts, { keepTranscript: true }).then(() => void refreshSessions());
    setNotice({
      tone: 'warn',
      text: `Session ${next} ouverte. L'échange reste affiché, mais ${next} ne reprend pas le contexte précédent : il repart de zéro.`,
    });
  };

  const pickModel = (next: string | null) => {
    setModelOpen(false);
    const merged: ModelByEngine = { ...modelByEngine };
    if (next) merged[engine] = next; else delete merged[engine];
    setModelByEngine(merged);
    try { void window.byanApi.store?.set?.('chat.localModel', merged); } catch { /* non-blocking */ }
    setNotice({ tone: 'info', text: next ? `Modèle ${next} pour la prochaine session ${engine}.` : `Modèle par défaut de ${engine} restauré.` });
  };

  const pickEffort = (next: ReasoningEffort | null) => {
    setEffortOpen(false);
    setEffort(next);
    try { void window.byanApi.store?.set?.('chat.localEffort', next ?? ''); } catch { /* non-blocking */ }
    // WHEN it lands differs per engine and the sentence has to say which: codex
    // takes the effort per turn, claude takes it at spawn. Announcing "dès le
    // prochain message" on claude would promise a change the running process
    // cannot make.
    const when = effortAppliesAt(engine) === 'next-turn'
      ? 'dès le prochain message'
      : 'à la prochaine session';
    setNotice({
      tone: 'info',
      text: next
        ? `Effort ${next} ${when}.`
        : `Effort par défaut du CLI restauré ${when}.`,
    });
  };
  useEffect(() => {
    void (async () => {
      try {
        // D-03 : a "Lancer une session" click on a project stashes its folder here.
        // It wins over the onboarding default, and is cleared once consumed so a
        // later plain visit to Chat falls back to the onboarding project.
        const pending = await window.byanApi.store?.get?.<string>('chat.pendingCwd');
        if (pending) {
          setCwd(pending);
          try { await window.byanApi.store?.set?.('chat.pendingCwd', ''); } catch { /* non-blocking */ }
          return;
        }
        const root = await window.byanApi.store?.get?.<string>('onboarding.projectRoot');
        if (root) setCwd(root);
      } catch { /* no stored root — cwd stays null (server default) */ }
    })();
  }, []);

  // Reload the agent list whenever the project dir changes: agents are declared
  // per project (.claude/agents), so the valid set moves with the folder.
  useEffect(() => {
    void (async () => {
      try {
        const list = await window.byanApi.localChat.agents?.(cwd ?? undefined);
        setClaudeAgents(Array.isArray(list) ? list : []);
      } catch { setClaudeAgents([]); }
    })();
  }, [cwd]);

  // Close a footer menu on an outside click. One effect per menu, same rule.
  useEffect(() => {
    if (!sessionsOpen && !modelOpen && !effortOpen && !usageOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sessionsOpen && sessionsRef.current && !sessionsRef.current.contains(target)) setSessionsOpen(false);
      if (modelOpen && modelRef.current && !modelRef.current.contains(target)) setModelOpen(false);
      if (effortOpen && effortRef.current && !effortRef.current.contains(target)) setEffortOpen(false);
      if (usageOpen && usageRef.current && !usageRef.current.contains(target)) setUsageOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // mcpOpen is absent on purpose: McpPanel is a full modal with its own
    // backdrop and Escape handling, not a dropdown.
  }, [sessionsOpen, modelOpen, effortOpen, usageOpen]);

  // Switching to an engine without an effort concept closes a stale menu; the
  // chip itself leaves the DOM, so an open dropdown would otherwise orphan.
  useEffect(() => {
    setEffortOpen(false);
  }, [engine]);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText]);

  // Only claude takes an agent: codex exec has no equivalent flag, its personas
  // live in .codex/prompts and are not selectable from that mode.
  const engineSupportsAgent = (e: LocalEngine) => e === 'claude';

  // Text typed AFTER a session-opening command. Reported bug: "/byan salut mon
  // reuf" applied the agent and DISCARDED the words, so the message reached
  // nothing and left no trace. send() waits on the in-flight start, so calling it
  // right after applyAgent/startNewSession lands the turn on the new session.
  //
  // It deliberately does NOT arm a snapshot: it is always called immediately
  // after a path that already armed one, and re-arming from state here would read
  // the PREVIOUS value of `agent` (setAgent has not committed in the same tick)
  // and mislabel the session it is about to join.
  const sendTrailing = (text: string) => {
    const content = text.trim();
    if (!content) return;
    void send(content, startOpts(), turnOpts()).then(() => void refreshSessions());
  };

  // Open a fresh session, then say what it cost. The consequence is stated
  // BEFORE by requestNewSession; this is the second half of rule 3 — observe it
  // AFTER, naming the session that was closed and the fact that its thread does
  // not come back (main's history() returns an empty list by design: a native
  // session's context lives inside the CLI, not in a file on disk).
  const startNewSession = (trailing: string) => {
    const closedId = sessionId;
    const closedTurns = messages.length;
    armSnapshot({ engine, model, agent });
    void newSession(startOpts()).then(() => void refreshSessions());
    setNotice({
      tone: 'info',
      text: closedId
        ? `Nouvelle session. La précédente (${closedId.slice(0, 8)}, ${closedTurns} message${pluralS(closedTurns)}) est arrêtée et son fil n'est plus consultable.`
        : 'Nouvelle session locale.',
    });
    sendTrailing(trailing);
  };

  // State the consequence before acting — but only when there IS one. With no
  // session open and an empty thread nothing is stopped and nothing is lost, and
  // a dialog over an empty screen is the ceremony that teaches people to click
  // through dialogs.
  const requestNewSession = (trailing: string, reason: 'new' | 'diverge') => {
    if (!sessionId && messages.length === 0) {
      startNewSession(trailing);
      return;
    }
    setPendingRestart({ trailing, reason });
  };

  // Set the agent AND open a session with it, because --agent is a SPAWN-TIME
  // flag: setting it while a session runs changes nothing until the next start.
  // The previous version only left a "for the next session" notice, so a user who
  // had just clicked "Nouvelle session" then typed /byan saw no effect and no
  // reason — the order mattered and nothing said so. Applying it here costs the
  // visible transcript, which the notice states rather than hides.
  const applyAgent = (slug: string | null) => {
    const hadThread = messages.length > 0 || streaming;
    setAgent(slug);
    try { void window.byanApi.store?.set?.('chat.localAgent', slug ?? ''); } catch { /* non-blocking */ }
    const opts = { cli: engine, ...(cwd ? { cwd } : {}), ...(model ? { model } : {}), ...(slug ? { agent: slug } : {}) };
    armSnapshot({ engine, model, agent: slug });
    void newSession(opts).then(() => void refreshSessions());
    setNotice({
      tone: 'info',
      // The previous thread is only mentioned when there WAS one: announcing its
      // closure on an empty chat described an event that did not happen.
      text: [
        slug ? `Nouvelle session avec l'agent ${slug}.` : 'Nouvelle session sans agent.',
        hadThread ? 'Le fil précédent est fermé.' : '',
      ].filter(Boolean).join(' '),
    });
  };

  // A command that opens a panel cannot carry a message. Saying so beats eating
  // the words: the user learns why nothing was sent. Same sentence on the cloud
  // surface — see components/chat/command-copy.ts.
  const notePanelArg = (cmd: string, arg: string) => {
    if (!arg.trim()) return;
    setNotice({ tone: 'warn', text: trailingIgnoredMessage(cmd, arg) });
  };

  // Run a slash command. Returns nothing: every arm either acts or explains
  // itself through `notice` — a command must never be a silent no-op.
  const runCommand = (cmd: string, arg: string) => {
    switch (cmd) {
      case '/model': {
        if (!arg) { setModelOpen(true); return; }
        if (!isValidModelFor(engine, arg)) {
          setNotice({ tone: 'warn', text: `"${arg}" n'est pas un modele valide pour ${engine}.` });
          return;
        }
        pickModel(arg);
        return;
      }
      case '/effort': {
        // Both engines take one; the accepted values differ per engine.
        if (!arg) { setEffortOpen(true); return; }
        if (!isValidEffortFor(engine, arg)) {
          setNotice({ tone: 'warn', text: `Effort inconnu pour ${engine}: "${arg}". Valeurs: ${effortsFor(engine).join(', ')}.` });
          return;
        }
        pickEffort(arg);
        return;
      }
      case '/engine': {
        const next = arg.toLowerCase();
        if (next !== 'claude' && next !== 'codex') {
          setNotice({ tone: 'warn', text: 'Usage: /engine claude|codex.' });
          return;
        }
        // The corollary of rule 1: the codex button is ABSENT when the binary is
        // absent, but the typed command still ANSWERS. Absence governs what the
        // app proposes ; explanation governs what it receives. The two branches
        // differ because "measured absent" and "not measured" are not the same
        // sentence.
        if (next === 'codex' && codexDetected === false) {
          setNotice({ tone: 'warn', text: 'codex est introuvable sur ce PC — installe-le, puis relance l\'application pour que le moteur soit proposé.' });
          return;
        }
        if (next === 'codex' && codexDetected === null) {
          setNotice({ tone: 'warn', text: 'Impossible de vérifier la présence de codex sur ce PC : la détection n\'a pas répondu.' });
          return;
        }
        pickEngine(next);
        setNotice({ tone: 'info', text: `Moteur ${next} pour la prochaine session.` });
        return;
      }
      case '/agent': {
        // An agent slug is a filename, so it holds no space: the first word is the
        // agent and everything after it is a message to send, same as /byan.
        const [firstWord, ...restWords] = arg.trim().split(/\s+/);
        const wanted = firstWord ?? '';
        const trailing = restWords.join(' ');
        if (!wanted) {
          const shown = claudeAgents.slice(0, 8).join(', ');
          setNotice({
            tone: 'info',
            text: claudeAgents.length
              ? `Agents disponibles ici : ${shown}${claudeAgents.length > 8 ? ', ...' : ''}. Usage : /agent <nom>, ou /agent aucun pour revenir au défaut.`
              : "Aucun agent declare pour ce projet (.claude/agents/ est vide ou absent).",
          });
          return;
        }
        if (wanted.toLowerCase() === 'aucun' || wanted.toLowerCase() === 'none') {
          applyAgent(null);
          sendTrailing(trailing);
          return;
        }
        if (!engineSupportsAgent(engine)) {
          setNotice({ tone: 'warn', text: "codex ne permet pas de choisir un agent depuis ce mode — bascule sur claude avec /engine claude." });
          return;
        }
        // Resolve BEFORE sending: the CLI accepts an unknown slug and silently
        // ignores it, so an unchecked name looks applied and changes nothing.
        const resolved = resolveClaudeAgent(wanted, claudeAgents);
        if (!resolved) {
          const near = suggestClaudeAgents(wanted, claudeAgents);
          setNotice({
            tone: 'warn',
            text: near.length
              ? `Agent "${wanted}" introuvable. Tu voulais dire : ${near.join(', ')} ?`
              : `Agent "${wanted}" introuvable pour ce projet.`,
          });
          return;
        }
        applyAgent(resolved);
        sendTrailing(trailing);
        return;
      }
      case '/byan': {
        // "Parle a BYAN" is an intent, not a setting: resolve the declared slug
        // (bmad-byan here) rather than assume a name, then open the session.
        if (!engineSupportsAgent(engine)) {
          setNotice({ tone: 'warn', text: "codex ne permet pas de choisir un agent — bascule sur claude avec /engine claude." });
          return;
        }
        const byan = resolveClaudeAgent('byan', claudeAgents);
        if (!byan) {
          setNotice({ tone: 'warn', text: "Aucun agent BYAN declare dans .claude/agents/ pour ce projet." });
          return;
        }
        applyAgent(byan);
        sendTrailing(arg);
        return;
      }
      case '/new':
        requestNewSession(arg, 'new');
        return;
      case '/clear': {
        // DECIDED: the BEHAVIOUR was fixed, not the label.
        //
        // The catalogue says "Effacer la conversation affichée" and the code
        // called onNewSession() — which starts a NEW session, stops the running
        // one and drops its context. Two ways out existed. Rewriting the label to
        // match the code would have left the app with two names for one act
        // (/new already owns "start over") and NO way to simply clear the screen.
        // So /clear now does exactly what its label promises: it hides the
        // displayed thread. The session keeps running, with all of its context —
        // and the notice says so, because a screen that empties without a word
        // would read as a thread that was destroyed.
        const wasShown = messages.length - hidden;
        if (wasShown === 0) {
          setNotice({ tone: 'info', text: 'Rien à effacer : l\'affichage est déjà vide.' });
          sendTrailing(arg);
          return;
        }
        setHiddenCount(messages.length);
        setNotice({
          tone: 'info',
          text: sessionId
            ? `Affichage vidé : ${wasShown} message${pluralS(wasShown)} masqué${pluralS(wasShown)}. La session ${sessionId.slice(0, 8)} continue avec tout son contexte — /new pour repartir de zéro.`
            : `Affichage vidé : ${wasShown} message${pluralS(wasShown)} masqué${pluralS(wasShown)}.`,
        });
        sendTrailing(arg);
        return;
      }
      case '/usage':
        setUsageOpen(true);
        notePanelArg(cmd, arg);
        return;
      case '/mcp':
        setMcpOpen(true);
        notePanelArg(cmd, arg);
        return;
      case '/help':
        setNotice({ tone: 'info', text: 'Tape "/" pour voir la liste des commandes disponibles.' });
        notePanelArg(cmd, arg);
        return;
      default:
        // A command declared in the catalogue but not handled here would be a
        // silent hole; say so instead of ignoring the keystroke.
        setNotice({ tone: 'warn', text: `Commande non implementee: ${cmd}.` });
    }
  };

  const submit = () => {
    const raw = input;
    if (!raw.trim() || streaming) return;
    setNotice(null);

    const parsed = parseSlashInput(raw);
    if (parsed.kind === 'command') {
      setInput('');
      runCommand(parsed.cmd, parsed.arg);
      return;
    }
    if (parsed.kind === 'unknown') {
      // NEVER forwarded to the engine: a typo must be corrected, not answered.
      setNotice({ tone: 'warn', text: unknownCommandMessage(parsed.cmd) });
      return;
    }

    // Arm only when this send is the thing that will OPEN a session. A send into
    // a live session must not leave a snapshot lying around for the next start,
    // and a start already in flight already armed its own.
    if (!sessionId && !pendingStartRef.current) armSnapshot({ engine, model, agent });
    // Bind an on-the-fly session to the selected project dir + engine (F4).
    void send(raw, startOpts(), turnOpts()).then(() => void refreshSessions());
    setInput('');
  };

  // Pick a project directory for the next new session (F4). Recording it in the
  // registry makes an EXISTING project the user points at persist : it then shows
  // up in Projects and becomes the default cwd for future sessions (fix terrain).
  const onPickFolder = async () => {
    try {
      const picked = await window.byanApi.fs?.openProjectDialog?.();
      if (!picked) return;
      setCwd(picked);
      const name = picked.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || picked;
      try { await window.byanApi.projectsLocal?.record?.({ name, path: picked }); } catch { /* non-blocking */ }
    } catch { /* dialog unavailable — keep current cwd */ }
  };

  const onResume = (id: string, dir?: string | null) => {
    setSessionsOpen(false);
    // resume() passes only the folder, so main applies its own default engine
    // ('claude') and no model / agent. Snapshotting the CURRENT selection here
    // would claim the resumed session runs on codex when it does not — and the
    // divergence line exists precisely to say that out loud instead.
    armSnapshot({ engine: 'claude', model: null, agent: null });
    void resume(id, dir ?? undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // The palette gets first refusal. It returns false when its menu is closed,
    // which is what keeps plain Enter-to-submit working.
    if (palette.handleKeyDown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // The named consequences of closing the live session. Concrete on purpose:
  // which folder, what stops, what is lost, what is carried over.
  const restartFacts = () => {
    const engineName = live?.engine ?? engine;
    const turns = messages.length;
    return [
      {
        label: 'Dossier',
        value: sessionCwd ?? 'non résolu — le moteur choisira le dossier au démarrage',
      },
      {
        label: 'Ce qui s\'arrête',
        value: sessionId
          ? `la session ${sessionId.slice(0, 8)} et le processus ${engineName} qui la tient`
          : `le processus ${engineName} en cours d'ouverture`,
      },
      {
        label: 'Ce qui est perdu',
        value: `le fil affiché (${turns} message${pluralS(turns)}) et la consommation mesurée de cette session. Un fil local n'est pas réenregistré sur le disque : il ne se reprend pas.`,
      },
      {
        label: 'Ce qui est gardé',
        value: `tes réglages : dossier ${cwd ? folderLabel(cwd) : 'par défaut'}, moteur ${engine}, modèle ${model ?? 'par défaut du CLI'}${agent ? `, agent ${agent}` : ''}.`,
      },
    ];
  };

  // ONE control, placed in whichever group matches its temporality. claude takes
  // --effort at SPAWN, so a change there waits for the next session; codex takes it
  // per turn. Rendering it twice would duplicate forty lines of markup and let the
  // two copies drift; rendering it in the wrong group would promise the wrong
  // moment.
  //
  // Accessibility, and this is the reported complaint: the controls were 11px text
  // with 4px of vertical padding — about 19px tall, under the 24x24 CSS px that
  // WCAG 2.5.8 asks of a pointer target. They now carry 12px text, a 24px minimum
  // height, a visible focus ring, and a label that NAMES the setting instead of
  // showing only its value ("Effort : moyen", not "moyen"): a lone value cannot be
  // identified by someone who did not open the menu.
  const effortControl = (
    <div className="flex items-center gap-xs">
      <div ref={effortRef} className="relative">
        <button
          type="button"
          data-testid="local-effort-chip"
          onClick={() => setEffortOpen((o) => !o)}
          title={engine === 'claude'
            ? "Effort de raisonnement — appliqué à la prochaine session claude"
            : "Effort de raisonnement — appliqué dès le prochain message codex"}
          aria-haspopup="menu"
          aria-expanded={effortOpen}
          aria-label={`Effort de raisonnement, actuellement ${effort ?? 'défaut du CLI'}`}
          className="flex items-center gap-xs min-h-[24px] px-sm py-1 rounded-full text-xs text-content-body hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-action transition-colors"
        >
          <Gauge size={13} aria-hidden="true" />
          <span className="text-content-tertiary">Effort</span>
          <span className="font-mono-code">{effort ?? 'auto'}</span>
        </button>
        {effortOpen && (
          <div role="menu" aria-label="Niveau d'effort" className="absolute bottom-full left-0 mb-1 w-48 bg-surface-raised border border-edge-strong rounded-xl shadow-glass py-1 z-50">
            <button
              type="button"
              role="menuitem"
              data-testid="local-effort-auto"
              onClick={() => pickEffort(null)}
              className="w-full text-left px-md py-1.5 min-h-[24px] text-xs text-content-body hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-action"
            >
              Défaut du CLI
            </button>
            {effortsFor(engine).map((level) => (
              <button
                key={level}
                type="button"
                role="menuitem"
                data-testid={`local-effort-${level}`}
                onClick={() => pickEffort(level)}
                aria-current={effort === level ? 'true' : undefined}
                className="w-full text-left px-md py-1.5 min-h-[24px] text-xs text-content-body hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-action flex items-center justify-between"
              >
                {level}
                {effort === level && <Check size={12} className="text-accent-action" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-full" data-testid="local-chat-view">
      {/* Full MCP management surface, opened by /mcp. A modal rather than a
          dropdown because it carries the page's own CRUD; it owns its backdrop
          and Escape handling. */}
      <McpPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />

      {/* Closing the live session is the ACT-X of this screen: its consequence is
          invisible until it has happened. Stated before, observed after. */}
      <ConsequenceDialog
        open={pendingRestart !== null}
        testId="local-restart-dialog"
        title={pendingRestart?.reason === 'diverge'
          ? 'Redémarrer applique tes réglages et ferme la session en cours'
          : 'Ouvrir une nouvelle session ferme celle-ci'}
        facts={restartFacts()}
        cancel={{
          label: 'Garder cette session',
          onClick: () => setPendingRestart(null),
        }}
        danger={{
          label: pendingRestart?.reason === 'diverge' ? 'Redémarrer maintenant' : 'Fermer et ouvrir une nouvelle session',
          onClick: () => {
            const act = pendingRestart;
            setPendingRestart(null);
            if (act) startNewSession(act.trailing);
          },
        }}
      />

      {/* ---------------- TOP : the session identity, IN READING ----------------
          Nothing here is a control. What is running is a fact the user reads;
          what will run is a choice the user makes, and that lives at the foot.
          This whole view is on the ROLE tokens (theme-commutable): the two bars
          because the rework rebuilt them, and the bubbles because a hardcoded dark
          ground reads as a dark bubble on a white page now that the light theme
          exists. */}
      <div className="shrink-0 flex items-center justify-between px-lg py-sm border-b border-edge-subtle gap-sm">
        <div className="flex items-center gap-sm min-w-0 flex-wrap" data-testid="local-identity">
          {sessionId ? (
            <>
              <span
                data-testid="local-identity-cwd"
                title={sessionCwd ?? undefined}
                className="flex items-center gap-xs text-[11px] text-content-secondary"
              >
                <Folder size={12} />
                {sessionCwd ? folderLabel(sessionCwd) : 'dossier non résolu'}
              </span>
              <span data-testid="local-identity-engine" className="flex items-center gap-xs text-[11px] text-content-secondary">
                <Cpu size={12} />
                {live ? live.engine : 'moteur inconnu'}
              </span>
              <span data-testid="local-identity-model" className="flex items-center gap-xs text-[11px] text-content-secondary">
                <Bot size={12} />
                {/* Three distinct states, and the third is not a fallback for the
                    other two: a named model, the CLI's own default (named as
                    such), or a session this view did not open and cannot describe. */}
                {live ? (live.model ?? 'modèle par défaut du CLI') : 'modèle inconnu'}
              </span>
              {live?.agent && (
                <span data-testid="local-agent-chip" className="font-mono-code text-[10px] text-content-tertiary">
                  agent {live.agent}
                </span>
              )}
              {/* content-tertiary, not content-muted: an id and a duration are
                  informative, and muted sits below the readability floor. */}
              <span data-testid="local-session-id" className="font-mono-code text-[10px] text-content-tertiary">
                session {sessionId.slice(0, 8)}
              </span>
              <span data-testid="local-identity-uptime" className="text-[10px] text-content-tertiary">
                {live ? openForLabel(uptimeS) : 'durée d\'ouverture inconnue'}
              </span>
            </>
          ) : (
            <span data-testid="local-identity-none" className="text-[11px] text-content-tertiary">
              {starting
                ? 'Session en cours d\'ouverture.'
                : 'Aucune session ouverte — le premier message en ouvre une.'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-xs">
          {/* The wrapper is ALWAYS mounted: `relative` is what the panel
              positions itself against, and /usage must be able to open the panel
              even before any turn reported usage. Only the BADGE waits for a
              real measurement, so the header carries no premature "0 token"
              placeholder — the panel has its own empty state for that case.
              An earlier version nested the panel inside the badge's condition,
              which made /usage a silent no-op until a turn had completed. */}
          <div ref={usageRef} className="relative">
            {measuredTurns > 0 && (
              <button
                type="button"
                data-testid="local-usage-toggle"
                onClick={() => setUsageOpen((o) => !o)}
                className="flex items-center gap-xs btn-ghost text-xs"
                title="Consommation de la session"
                aria-haspopup="dialog"
                aria-expanded={usageOpen}
              >
                <Gauge size={12} />
                Usage ({measuredTurns})
              </button>
            )}
            {usageOpen && (
              <UsagePanel turns={usageTurns} totals={usageTotals} onClose={() => setUsageOpen(false)} />
            )}
          </div>
          {/* Resume an existing session */}
          <div ref={sessionsRef} className="relative">
            <button
              type="button"
              data-testid="local-sessions-toggle"
              onClick={() => { setSessionsOpen((o) => !o); void refreshSessions(); }}
              className="flex items-center gap-xs btn-ghost text-xs"
              title="Reprendre une session"
              aria-haspopup="menu"
              aria-expanded={sessionsOpen}
            >
              <History size={12} />
              Sessions{sessions.length ? ` (${sessions.length})` : ''}
            </button>
            {/* The menu below is opaque, deliberately: it carries DATA (session
                ids and message excerpts), and a measured value behind
                translucency is the one thing the material rule forbids. */}
            {sessionsOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-surface-raised border border-edge-strong rounded-xl shadow-glass py-1 z-50"
              >
                {sessions.length === 0 ? (
                  <p className="px-md py-sm text-xs text-content-tertiary">Aucune session enregistrée.</p>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      data-testid={`local-session-${s.id}`}
                      onClick={() => onResume(s.id, s.cwd)}
                      className="w-full text-left px-md py-sm hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-code text-[10px] text-content-tertiary">{s.id.slice(0, 14)}</span>
                        {s.id === sessionId && <Check size={11} className="text-accent-action" />}
                      </div>
                      <p className="text-xs text-content-body truncate">{s.lastMessage || '(vide)'}</p>
                      <p className="text-[10px] text-content-tertiary">{s.messageCount} msg{s.resumable ? ' · reprenable' : ''}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="local-new-session"
            onClick={() => requestNewSession('', 'new')}
            disabled={starting}
            className="flex items-center gap-xs btn-secondary text-xs disabled:opacity-50"
            title="Nouvelle session locale"
          >
            {starting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Nouvelle session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-lg py-lg space-y-md">
        {shownMessages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {/* content-muted is BELOW the readability floor, which is right for a
                decorative glyph and wrong for every sentence under it — those all
                sit at the floor or above. */}
            <MessageSquare size={32} className="text-content-muted mb-sm" />
            <p className="text-sm text-content-secondary">Chat local avec {engine} sur ce PC.</p>
            {/* An opening session is the one state where the void was misleading:
                a message typed here IS kept and sent once the session is up, so
                the interface says so instead of looking inert. */}
            {starting ? (
              <p className="text-xs text-content-secondary mt-xs flex items-center gap-xs" data-testid="local-starting">
                <Loader2 size={12} className="animate-spin" />
                Ouverture de la session — ce que tu écris sera envoyé dès qu'elle répond.
              </p>
            ) : hidden > 0 ? (
              // Not the same void: the thread is alive, it is only hidden.
              <p className="text-xs text-content-tertiary mt-xs" data-testid="local-cleared">
                Affichage vidé. La session continue avec tout son contexte.
              </p>
            ) : (
              <p className="text-xs text-content-tertiary mt-xs">
                {sessionId
                  ? 'Session ouverte, aucun message pour le moment. Écris quelque chose.'
                  : 'Envoie un message — une session démarre toute seule.'}
              </p>
            )}
          </div>
        ) : (
          <>
            {shownMessages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* A bubble carries TEXT, so it stays opaque in both themes — and
                    its colours come from the commutable layer. The user bubble was
                    white on a teal fill (2.0:1 at the brand value) and the
                    assistant bubble was a hardcoded dark ground, which reads as a
                    dark bubble on a white page once the light theme is on. */}
                <div
                  className={[
                    'max-w-[80%] rounded-2xl px-sm py-sm text-sm',
                    m.role === 'user'
                      ? 'bg-accent-action text-on-accent'
                      : m.role === 'system'
                      ? 'bg-wash-danger border border-edge-danger text-on-wash-danger'
                      : 'bg-surface-hover border border-edge-subtle text-content-body',
                  ].join(' ')}
                >
                  <MessageMarkdown content={m.content} />
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-sm py-sm text-sm bg-surface-hover border border-edge-subtle text-content-body">
                  {streamText
                    ? <MessageMarkdown content={streamText} />
                    : <ActivityLine activity={activity} thinkingTokens={thinkingTokens} elapsedS={elapsedS} />}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {error && !streaming && (
        <div role="alert" className="shrink-0 px-lg py-xs text-xs text-on-wash-danger bg-wash-danger border-t border-edge-danger">
          {error}
        </div>
      )}

      {/* The observation channel of rule 3: everything the user must be told that
          is not part of the conversation lands here. Amber for a refusal or a
          setting still waiting (the accent of change), neutral for something that
          just happened. Opaque, because these are sentences to read. */}
      {notice && (
        <div
          role="status"
          data-testid="local-notice"
          className={[
            'shrink-0 px-lg py-xs text-xs border-t',
            notice.tone === 'warn'
              ? 'text-on-wash-change bg-wash-change border-edge-change'
              : 'text-content-body bg-surface-hover border-edge-subtle',
          ].join(' ')}
        >
          {notice.text}
        </div>
      )}

      {/* ---------------- FOOT : what applies NEXT ----------------
          NOT glass, on purpose. THEMES-ET-MATIERE 3.4 limit 2: glass only means
          something when something passes BEHIND it, and these bars are flex
          siblings of the message list, so nothing does. Making it real needs the
          tuck of 3.5 (the list scrolling under the bar, exactly one bubble
          crossing each edge), whose depth has to be judged on the running window
          — not guessed here. Until then a blur would be one more tint pretending
          to be a material. */}
      <div className="shrink-0 border-t border-edge-subtle">
        {/* The divergence line. Amber is the accent of change and of waiting, and
            this is exactly that: a setting that is chosen and still waiting to
            take effect. It names both sides so the user does not have to compare
            two bars themselves. The wash + on-wash pair carries it into the light
            theme, where a 10% alpha on a literal hex has no answer. */}
        {divergences.length > 0 && (
          <div
            role="status"
            data-testid="local-divergence"
            className="flex items-start gap-sm px-lg py-sm bg-wash-change border-b border-edge-change"
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-on-wash-change" />
            <div className="flex-1 min-w-0 space-y-0.5">
              {divergences.map((line) => (
                <p key={line} className="text-xs text-on-wash-change">{line}</p>
              ))}
            </div>
            <button
              type="button"
              data-testid="local-divergence-restart"
              onClick={() => requestNewSession('', 'diverge')}
              className="shrink-0 flex items-center gap-xs btn-secondary text-xs"
              title="Fermer la session en cours et en ouvrir une avec les réglages choisis"
            >
              <RotateCcw size={11} />
              Redémarrer maintenant
            </button>
          </div>
        )}

        {/* The settings themselves, grouped by WHEN they land. Two labels, two
            groups — that separation is the whole point of the lot. */}
        <div className="flex items-center gap-md flex-wrap px-lg pt-sm" data-testid="local-next-settings">
          {/* codex takes the effort per TURN, so there it belongs to the next
              message. On claude it is a spawn flag and moves to the group below. */}
          {effortAppliesAt(engine) === 'next-turn' && (
            <div className="flex items-center gap-xs">
              <span className="text-[10px] uppercase tracking-wider text-content-tertiary">Prochain message</span>
              {effortControl}
            </div>
          )}

          <div className="flex items-center gap-sm">
            <span className="text-[10px] uppercase tracking-wider text-content-tertiary">Prochain démarrage</span>
            {effortAppliesAt(engine) === 'next-session' && effortControl}

            {/* Project directory the next session runs in (F4) — click to change. */}
            <button
              type="button"
              data-testid="local-cwd"
              onClick={() => void onPickFolder()}
              title={cwd
                ? `${cwd} — dossier de la prochaine session`
                : 'Aucun dossier choisi : le moteur prendra son dossier par défaut. Clique pour en choisir un.'}
              className="flex items-center gap-xs text-[11px] text-content-secondary hover:text-content-strong transition-colors"
            >
              <Folder size={12} />
              {cwd ? folderLabel(cwd) : 'dossier par défaut'}
            </button>

            {/* Engine picker — offered only when there IS a choice. When codex is
                measured absent the control leaves the DOM (handoff rule 1: a
                greyed control promises a capability and takes it back) and the
                REASON takes its place, so the absence is findable rather than
                mysterious. While detection has not answered, neither is shown:
                an unmeasured absence is not an absence. */}
            {codexAvailable ? (
              <div
                role="group"
                aria-label="Moteur local"
                className="flex items-center rounded-lg border border-edge-strong overflow-hidden"
              >
                {/* The selected engine is the ACTIVE state of a selection, which is
                    the one thing the action colour is for — both sides use it, so
                    the choice reads as a choice and not as two different roles. */}
                <button
                  type="button"
                  data-testid="local-engine-claude"
                  onClick={() => pickEngine('claude')}
                  aria-pressed={engine === 'claude'}
                  className={[
                    'flex items-center gap-xs px-sm py-1 min-h-[24px] text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-action',
                    engine === 'claude'
                      ? 'bg-wash-action text-on-wash-action'
                      : 'text-content-secondary hover:text-content-strong hover:bg-surface-hover',
                  ].join(' ')}
                  title="Chat local via claude"
                >
                  <Cpu size={12} aria-hidden="true" />
                  Claude
                </button>
                <button
                  type="button"
                  data-testid="local-engine-codex"
                  onClick={() => pickEngine('codex')}
                  aria-pressed={engine === 'codex'}
                  className={[
                    'flex items-center gap-xs px-sm py-1 min-h-[24px] text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-action',
                    engine === 'codex'
                      ? 'bg-wash-action text-on-wash-action'
                      : 'text-content-secondary hover:text-content-strong hover:bg-surface-hover',
                  ].join(' ')}
                  title="Chat local via codex"
                >
                  <Cpu size={12} aria-hidden="true" />
                  Codex
                </button>
              </div>
            ) : codexDetected === false ? (
              <span
                data-testid="local-engine-solo"
                className="flex items-center gap-xs text-[11px] text-content-tertiary"
                title="Un seul moteur est installé sur ce PC, il n'y a donc pas de choix à faire. Installe codex et relance l'application pour que le moteur apparaisse."
              >
                <Cpu size={12} />
                moteur claude — codex n'est pas installé sur ce PC
              </span>
            ) : null}

            {/* Model chip — both engines. Applies to the NEXT session, like the
                engine switch: claude fixes the model at spawn. */}
            <div ref={modelRef} className="relative">
              <button
                type="button"
                data-testid="local-model-chip"
                onClick={() => setModelOpen((o) => !o)}
                title={`Modèle de la prochaine session ${engine}`}
                aria-haspopup="menu"
                aria-expanded={modelOpen}
                className="flex items-center gap-xs text-[11px] text-content-secondary hover:text-content-strong transition-colors"
              >
                <Bot size={12} />
                {model ?? 'modele auto'}
              </button>
              {modelOpen && (
                <div role="menu" className="absolute bottom-full left-0 mb-1 w-56 bg-surface-raised border border-edge-strong rounded-xl shadow-glass py-1 z-50">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="local-model-auto"
                    onClick={() => pickModel(null)}
                    className="w-full text-left px-md py-xs text-xs text-content-body hover:bg-surface-hover"
                  >
                    Defaut du CLI
                  </button>
                  {MODEL_PRESETS[engine].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      role="menuitem"
                      data-testid={`local-model-${preset.value}`}
                      onClick={() => pickModel(preset.value)}
                      className="w-full text-left px-md py-xs text-xs text-content-body hover:bg-surface-hover flex items-center justify-between"
                    >
                      {preset.label}
                      {model === preset.value && <Check size={11} className="text-accent-action" />}
                    </button>
                  ))}
                  <p className="px-md pt-xs text-[10px] text-content-tertiary border-t border-edge-subtle mt-1">
                    Autre modele : /model &lt;nom&gt;
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input — `relative` anchors the slash palette, which positions itself
            against the nearest positioned ancestor. */}
        <div className="px-lg pt-xs pb-sm relative">
          <SlashCommandMenu
            commands={palette.commands}
            highlightedIndex={palette.highlightedIndex}
            onSelect={palette.select}
            onHighlight={palette.setHighlightedIndex}
          />
          <div className="flex items-end gap-sm">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={streaming ? `${engine} répond...` : 'Message ou / pour une commande (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)'}
              disabled={streaming}
              rows={1}
              data-testid="local-chat-input"
              className={[
                'flex-1 bg-surface-hover border border-edge-strong rounded-lg px-sm py-sm text-sm text-content-body',
                'focus:outline-none focus:border-accent-action transition-colors resize-none',
                'placeholder:text-content-tertiary disabled:opacity-50',
              ].join(' ')}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            {/* ACT-S, the stop action: danger as a wash, not as a fill. A filled
                red button is the loudest thing on the screen and interrupting a
                turn is routine, not an emergency. */}
            {streaming ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="shrink-0 p-sm bg-wash-danger border border-edge-danger text-on-wash-danger rounded-lg hover:brightness-110 transition-all"
                title="Stop"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="button"
                data-testid="local-chat-send"
                onClick={submit}
                disabled={!input.trim()}
                // Teal with DARK ink: white on teal is 2.0:1 and fails in both
                // themes. This is the rule that inverts in dark (handoff 4.4).
                className="shrink-0 p-sm bg-accent-action text-on-accent rounded-lg hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Envoyer"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
