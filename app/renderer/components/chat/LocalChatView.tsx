// LocalChatView (F2) — the chat surface shown when the app runs in LOCAL mode.
//
// It talks to the `claude` CLI on this PC through useLocalChat (main-process ws
// bridge), NOT to byan_web. The cloud chat UI (conversation list, byan_web
// history) does not apply locally, so this is a focused single-session view:
// start / resume-in-memory a session, send, watch the stream. Session
// persistence + resume across restarts is F3.

import React, { useEffect, useRef, useState } from 'react';
import { Send, X, Plus, Loader2, MessageSquare, Cpu, History, Check, Folder, Gauge, Bot } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import { useLocalChat } from '../../hooks/useLocalChat';
import { useSlashPalette } from '../../hooks/useSlashPalette';
import SlashCommandMenu from './SlashCommandMenu';
import UsagePanel from './panels/UsagePanel';
import McpPanel from './panels/McpPanel';
import { parseSlashInput } from '../../lib/slash-commands';
import { resolveClaudeAgent, suggestClaudeAgents } from '../../../shared/agent-slugs';
import {
  MODEL_PRESETS,
  REASONING_EFFORTS,
  engineSupportsEffort,
  isValidEffort,
  isValidModelFor,
  type EngineId,
  type ReasoningEffort,
} from '../../../shared/engine-options';

// Short display for a directory path (last segment, or the whole thing if short).
function folderLabel(dir: string): string {
  const parts = dir.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

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

export default function LocalChatView() {
  const {
    messages, streaming, streamText, starting, error, sessionId, sessions,
    usageTurns, usageTotals, sessionCwd,
    newSession, resume, refreshSessions, send, stop,
  } = useLocalChat();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // F4 : the project directory (cwd) a new local session runs in. Defaults to the
  // folder chosen at onboarding ; the folder button lets the user pick another.
  const [cwd, setCwd] = useState<string | null>(null);
  // What the folder chip shows. `cwd` is the user's explicit pick; `sessionCwd` is
  // the directory main fell back to when there was none. Showing only `cwd` made
  // the chip read "Choisir un dossier" while the live session was already working
  // in a folder the user could not see.
  const shownCwd = cwd ?? sessionCwd;
  const [engine, setEngine] = useState<LocalEngine>('claude');
  const [codexAvailable, setCodexAvailable] = useState(false);
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
      let detected = false;
      try {
        const clis = await window.byanApi.cli?.detect?.();
        detected = Boolean(clis?.codex);
      } catch { /* detection failed — treat as absent */ }
      setCodexAvailable(detected);
      try {
        const saved = await window.byanApi.store?.get?.<string>('chat.localEngine');
        if (saved === 'codex' && detected) setEngine('codex');
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
        if (isValidEffort(storedEffort)) setEffort(storedEffort);
      } catch { /* no stored effort */ }
      try {
        const storedAgent = await window.byanApi.store?.get?.<string>('chat.localAgent');
        if (storedAgent) setAgent(storedAgent);
      } catch { /* no stored agent */ }
    })();
  }, []);

  const pickEngine = (next: LocalEngine) => {
    setEngine(next);
    try { void window.byanApi.store?.set?.('chat.localEngine', next); } catch { /* non-blocking */ }
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
    // Effort rides on every turn, so it lands on the NEXT message — no restart.
    setNotice({ tone: 'info', text: next ? `Effort ${next} dès le prochain message.` : 'Effort par défaut restauré.' });
  };

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
  const turnOpts = () => (engineSupportsEffort(engine) && effort ? { reasoningEffort: effort } : undefined);
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

  // Close a header menu on an outside click. One effect per menu, same rule.
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
    // backdrop and Escape handling, not a header dropdown.
  }, [sessionsOpen, modelOpen, effortOpen, usageOpen]);

  // Switching to an engine without an effort concept closes a stale menu; the
  // chip itself leaves the DOM, so an open dropdown would otherwise orphan.
  useEffect(() => {
    if (!engineSupportsEffort(engine)) setEffortOpen(false);
  }, [engine]);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText]);

  // Plain function like the other handlers here: startOpts() reads the current
  // selections at call time, so there is nothing to memoize.
  const onNewSession = () => {
    void newSession(startOpts()).then(() => void refreshSessions());
  };

  // Only claude takes an agent: codex exec has no equivalent flag, its personas
  // live in .codex/prompts and are not selectable from that mode.
  const engineSupportsAgent = (e: LocalEngine) => e === 'claude';

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
        // The command is only offered for codex, but a user can still type it.
        if (!engineSupportsEffort(engine)) {
          setNotice({ tone: 'warn', text: `${engine} n'expose aucun reglage d'effort — ce reglage n'existe que pour codex.` });
          return;
        }
        if (!arg) { setEffortOpen(true); return; }
        if (!isValidEffort(arg)) {
          setNotice({ tone: 'warn', text: `Effort inconnu: "${arg}". Valeurs: ${REASONING_EFFORTS.join(', ')}.` });
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
        if (next === 'codex' && !codexAvailable) {
          setNotice({ tone: 'warn', text: 'codex est introuvable sur ce PC.' });
          return;
        }
        pickEngine(next);
        setNotice({ tone: 'info', text: `Moteur ${next} pour la prochaine session.` });
        return;
      }
      case '/agent': {
        const wanted = arg.trim();
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
        return;
      }
      case '/new':
        onNewSession();
        return;
      case '/clear':
        // A fresh session IS the local "clear": the transcript belongs to the
        // session, and there is nothing else to erase.
        onNewSession();
        setNotice({ tone: 'info', text: 'Nouvelle session locale.' });
        return;
      case '/usage':
        setUsageOpen(true);
        return;
      case '/mcp':
        setMcpOpen(true);
        return;
      case '/help':
        setNotice({ tone: 'info', text: 'Tape "/" pour voir la liste des commandes disponibles.' });
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
      setNotice({ tone: 'warn', text: `Commande inconnue: ${parsed.cmd}. Tape "/" pour voir la liste.` });
      return;
    }

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

  return (
    <div className="flex flex-col h-full" data-testid="local-chat-view">
      {/* Full MCP management surface, opened by /mcp. A modal rather than a
          header dropdown because it carries the page's own CRUD; it owns its
          backdrop and Escape handling. */}
      <McpPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
      {/* Header — mode badge + New session */}
      <div className="shrink-0 flex items-center justify-between px-lg py-sm border-b border-ink-800">
        <div className="flex items-center gap-sm">
          {/* Engine switch — applies to the NEXT session started. */}
          <div
            role="group"
            aria-label="Moteur local"
            className="flex items-center rounded-lg border border-ink-700 overflow-hidden"
          >
            <button
              type="button"
              data-testid="local-engine-claude"
              onClick={() => pickEngine('claude')}
              className={[
                'flex items-center gap-xs px-sm py-1 text-[11px] transition-colors',
                engine === 'claude' ? 'bg-byan-900/50 text-byan-300' : 'text-ink-400 hover:text-ink-200',
              ].join(' ')}
              title="Chat local via claude"
            >
              <Cpu size={11} />
              Claude
            </button>
            <button
              type="button"
              data-testid="local-engine-codex"
              onClick={() => pickEngine('codex')}
              disabled={!codexAvailable}
              className={[
                'flex items-center gap-xs px-sm py-1 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                engine === 'codex' ? 'bg-emerald-900/50 text-emerald-300' : 'text-ink-400 hover:text-ink-200',
              ].join(' ')}
              title={codexAvailable ? 'Chat local via codex' : 'codex introuvable sur ce PC'}
            >
              <Cpu size={11} />
              Codex
            </button>
          </div>
          {/* Project directory the next session runs in (F4) — click to change. */}
          <button
            type="button"
            data-testid="local-cwd"
            onClick={() => void onPickFolder()}
            title={shownCwd
              ? (cwd ? shownCwd : `${shownCwd} (dossier retenu par défaut — clique pour en choisir un autre)`)
              : 'Choisir un dossier de projet'}
            className="flex items-center gap-xs text-[11px] text-ink-400 hover:text-ink-200 transition-colors"
          >
            <Folder size={12} />
            {shownCwd ? folderLabel(shownCwd) : 'Choisir un dossier'}
          </button>
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
              className="flex items-center gap-xs text-[11px] text-ink-400 hover:text-ink-200 transition-colors"
            >
              <Bot size={12} />
              {model ?? 'modele auto'}
            </button>
            {modelOpen && (
              <div role="menu" className="absolute top-full left-0 mt-1 w-56 bg-ink-900 border border-ink-700 rounded shadow-lg py-1 z-50">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="local-model-auto"
                  onClick={() => pickModel(null)}
                  className="w-full text-left px-md py-xs text-xs text-ink-300 hover:bg-ink-800"
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
                    className="w-full text-left px-md py-xs text-xs text-ink-300 hover:bg-ink-800 flex items-center justify-between"
                  >
                    {preset.label}
                    {model === preset.value && <Check size={11} className="text-acadenice-teal" />}
                  </button>
                ))}
                <p className="px-md pt-xs text-[10px] text-ink-600 border-t border-ink-800 mt-1">
                  Autre modele : /model &lt;nom&gt;
                </p>
              </div>
            )}
          </div>

          {/* Effort chip — ABSENT from the DOM on claude, not merely disabled:
              claude exposes no reasoning-effort flag, so showing a greyed
              control would advertise a setting that does not exist. */}
          {engineSupportsEffort(engine) && (
            <div ref={effortRef} className="relative">
              <button
                type="button"
                data-testid="local-effort-chip"
                onClick={() => setEffortOpen((o) => !o)}
                title="Effort de raisonnement (codex) — appliqué au prochain message"
                aria-haspopup="menu"
                aria-expanded={effortOpen}
                className="flex items-center gap-xs text-[11px] text-ink-400 hover:text-ink-200 transition-colors"
              >
                <Gauge size={12} />
                {effort ?? 'effort auto'}
              </button>
              {effortOpen && (
                <div role="menu" className="absolute top-full left-0 mt-1 w-44 bg-ink-900 border border-ink-700 rounded shadow-lg py-1 z-50">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="local-effort-auto"
                    onClick={() => pickEffort(null)}
                    className="w-full text-left px-md py-xs text-xs text-ink-300 hover:bg-ink-800"
                  >
                    Defaut du CLI
                  </button>
                  {REASONING_EFFORTS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitem"
                      data-testid={`local-effort-${level}`}
                      onClick={() => pickEffort(level)}
                      className="w-full text-left px-md py-xs text-xs text-ink-300 hover:bg-ink-800 flex items-center justify-between"
                    >
                      {level}
                      {effort === level && <Check size={11} className="text-acadenice-teal" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {agent && (
            <span data-testid="local-agent-chip" className="font-mono-code text-[10px] text-ink-500">agent {agent}</span>
          )}
          {sessionId && (
            <span className="font-mono-code text-[10px] text-ink-500">session {sessionId.slice(0, 8)}</span>
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
            {sessionsOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-ink-900 border border-ink-700 rounded shadow-lg py-1 z-50"
              >
                {sessions.length === 0 ? (
                  <p className="px-md py-sm text-xs text-ink-500">Aucune session enregistrée.</p>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      data-testid={`local-session-${s.id}`}
                      onClick={() => onResume(s.id, s.cwd)}
                      className="w-full text-left px-md py-sm hover:bg-ink-800 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-code text-[10px] text-ink-400">{s.id.slice(0, 14)}</span>
                        {s.id === sessionId && <Check size={11} className="text-acadenice-teal" />}
                      </div>
                      <p className="text-xs text-ink-300 truncate">{s.lastMessage || '(vide)'}</p>
                      <p className="text-[10px] text-ink-600">{s.messageCount} msg{s.resumable ? ' · reprenable' : ''}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="local-new-session"
            onClick={onNewSession}
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
        {messages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={32} className="text-ink-700 mb-sm" />
            <p className="text-sm text-ink-500">Chat local avec {engine} sur ce PC.</p>
            <p className="text-xs text-ink-600 mt-xs">
              {sessionId
                ? 'Session ouverte, aucun message pour le moment. Écris quelque chose.'
                : 'Envoie un message — une session démarre toute seule.'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[80%] rounded-xl px-sm py-sm text-sm',
                    m.role === 'user'
                      ? 'bg-byan-700 text-white'
                      : m.role === 'system'
                      ? 'bg-red-900/40 border border-red-800 text-red-200'
                      : 'bg-ink-800 text-ink-200',
                  ].join(' ')}
                >
                  <MessageMarkdown content={m.content} />
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl px-sm py-sm text-sm bg-ink-800 text-ink-200">
                  {streamText ? <MessageMarkdown content={streamText} /> : <Loader2 size={14} className="animate-spin text-ink-400" />}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {error && !streaming && (
        <div role="alert" className="shrink-0 px-lg py-xs text-xs text-red-300 bg-red-900/30 border-t border-red-800">
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          data-testid="local-notice"
          className={[
            'shrink-0 px-lg py-xs text-xs border-t',
            notice.tone === 'warn'
              ? 'text-amber-300 bg-amber-900/20 border-amber-800/60'
              : 'text-ink-300 bg-ink-800/60 border-ink-700',
          ].join(' ')}
        >
          {notice.text}
        </div>
      )}

      {/* Input — `relative` anchors the slash palette, which positions itself
          against the nearest positioned ancestor. */}
      <div className="shrink-0 px-lg py-sm border-t border-ink-800 relative">
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
              'flex-1 bg-ink-800 border border-ink-700 rounded-xl px-sm py-sm text-sm text-ink-200',
              'focus:outline-none focus:border-byan-500 transition-colors resize-none',
              'placeholder-ink-600 disabled:opacity-50',
            ].join(' ')}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="shrink-0 p-sm bg-red-700 hover:bg-red-600 rounded-xl text-white transition-colors"
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
              className="shrink-0 p-sm bg-byan-700 hover:bg-byan-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
              title="Envoyer"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
