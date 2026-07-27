// Local chat bridge — NATIVE local CLI chat, no web server in the middle.
//
// The bridge is engine-agnostic: it owns the session map, the concurrency cap,
// the quit sweep and the renderer broadcast. Each CLI lives in an engine under
// main/engines/ :
//   - claude : one long-lived process per session, turns over stdin
//              (stream-json). The byan MCP server comes from the project dir's
//              .mcp.json, read natively by claude.
//   - codex  : one process per turn (`codex exec --json`), chained by
//              `codex exec resume <thread_id>`. The MCP channel is mapped from
//              the SAME .mcp.json onto -c overrides (engines/codex-config.ts).
//
// The renderer only ever names an ENGINE ('claude' | 'codex'), never a binary:
// a renderer-supplied path reaching spawn would be a spawn-any-binary surface.

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS, LocalChatStartOpts, LocalChatMessage, LocalChatSessionSummary, LocalChatHistoryMessage, LocalChatTurnOpts } from '../../shared/ipc-contract';
import { REASONING_EFFORTS, engineSupportsEffort, isValidEffort, isValidModelFor } from '../../shared/engine-options';
import { IpcError, wrap } from './_error';
import { localSessions, resolveProjectRoot } from '../local-data';
import { secureStore } from '../secure-store';
import { resolveExecutable, spawnEnv } from '../resolve-bin';
import { availableClaudeAgents } from '../claude-agents';
import type { Engine, EngineId, EngineSession, SpawnFn } from '../engines/types';
import { isEngineId } from '../engines/types';
import { ClaudeEngine } from '../engines/claude-engine';
import { CodexEngine, type ReadMcpFn } from '../engines/codex-engine';

export type { SpawnFn } from '../engines/types';

// The project dir chosen at onboarding (persisted by the renderer via the store).
// Fallback for the default cwd when the registry has no entry yet.
async function onboardingRoot(): Promise<string | undefined> {
  try {
    const v = await secureStore.get('onboarding.projectRoot');
    return v || undefined;
  } catch {
    return undefined;
  }
}

export interface LocalChatDeps {
  // Spawner (default: child_process.spawn). Injected in tests.
  spawnFn?: SpawnFn;
  // Push a normalized message to the renderer. Default: broadcast to all windows.
  broadcast?: (msg: LocalChatMessage) => void;
  // Default cwd when a start() omits one : first local project (registry), then
  // the onboarding project dir. May be sync (tests) or async.
  defaultCwd?: () => (string | undefined) | Promise<string | undefined>;
  // Resolve the absolute path of a CLI binary (GUI-launch PATH fix). Default:
  // resolve-bin.resolveExecutable. Returns null when nowhere -> engines fall
  // back to the bare name. Injected in tests.
  resolveBin?: (name: string) => string | null;
  // Env for spawned children (PATH augmented so the CLI + its MCP node child
  // resolve). Default: resolve-bin.spawnEnv.
  spawnEnv?: () => NodeJS.ProcessEnv;
  // .mcp.json reader handed to the codex engine. Injected in tests.
  readMcp?: ReadMcpFn;
}

// Cap on concurrent local CLI processes — a runaway renderer looping start()
// must not spawn unbounded subprocesses (local resource exhaustion).
const MAX_SESSIONS = 8;

interface SessionEntry {
  engine: EngineId;
  session: EngineSession;
}

export class LocalChatBridge {
  private readonly broadcast: (msg: LocalChatMessage) => void;
  private readonly defaultCwd: () => (string | undefined) | Promise<string | undefined>;
  private readonly engines: Record<EngineId, Engine>;
  private readonly sessions = new Map<string, SessionEntry>();
  // Set true by stopAll() at app quit so a late start() cannot spawn a session
  // that would escape the reaping sweep and orphan.
  private _quitting = false;

  constructor(deps: LocalChatDeps = {}) {
    this.broadcast = deps.broadcast ?? defaultBroadcast;
    // Default: the first registered local project, else the onboarding project dir.
    this.defaultCwd = deps.defaultCwd ?? (async () => resolveProjectRoot() ?? (await onboardingRoot()));
    const engineDeps = {
      spawnFn: deps.spawnFn ?? (spawn as unknown as SpawnFn),
      resolveBin: deps.resolveBin ?? resolveExecutable,
      spawnEnv: deps.spawnEnv ?? spawnEnv,
    };
    this.engines = {
      claude: new ClaudeEngine(engineDeps),
      codex: new CodexEngine(engineDeps, deps.readMcp),
    };
  }

  // Spawn a local CLI session in the project directory. cwd must be an existing
  // absolute dir (trust boundary : same guard as N2/F5).
  async start(opts?: LocalChatStartOpts): Promise<{ sessionId: string }> {
    if (this._quitting) {
      throw new IpcError('INVALID_ARGUMENT', 'Application en cours de fermeture.');
    }
    const cli: EngineId = opts?.cli ?? 'claude';
    if (!isEngineId(cli)) {
      // The value names an ADAPTER, never a binary — reject anything else.
      throw new IpcError('INVALID_ARGUMENT', `Moteur inconnu: ${String(opts?.cli)}. Moteurs disponibles: claude, codex.`);
    }
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new IpcError('INVALID_ARGUMENT', `Trop de sessions locales ouvertes (max ${MAX_SESSIONS}). Ferme-en une.`);
    }
    const cwd = opts?.cwd || (await this.defaultCwd()) || '';
    if (!cwd || !path.isAbsolute(cwd)) {
      throw new IpcError('INVALID_ARGUMENT', 'Session locale : aucun dossier de projet valide (choisis-en un).');
    }
    try {
      if (!fs.statSync(cwd).isDirectory()) throw new IpcError('INVALID_ARGUMENT', 'Le dossier de projet est introuvable.');
    } catch (err) {
      if (err instanceof IpcError) throw err;
      throw new IpcError('INVALID_ARGUMENT', 'Le dossier de projet est introuvable.');
    }
    // Re-check the quit flag AND the cap after the async gap above: a quit (or
    // a burst of concurrent starts) while defaultCwd was resolving must not
    // spawn an orphan past the sweep / the cap.
    if (this._quitting) {
      throw new IpcError('INVALID_ARGUMENT', 'Application en cours de fermeture.');
    }
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new IpcError('INVALID_ARGUMENT', `Trop de sessions locales ouvertes (max ${MAX_SESSIONS}). Ferme-en une.`);
    }

    // The bridge is the TRUST BOUNDARY for model + effort: the adapters push
    // these straight into argv without re-checking, so anything that fails here
    // must never reach a spawn.
    const model = opts?.model ?? null;
    if (model !== null && !isValidModelFor(cli, model)) {
      throw new IpcError('INVALID_ARGUMENT', `Modele invalide pour ${cli}: ${String(model)}.`);
    }
    // Effort is CODEX-ONLY. A claude start carrying one is not an error (a UI
    // that forgets to hide the control must not break) — it is silently
    // dropped, the mirror of the agent gate just below.
    const effort = engineSupportsEffort(cli) ? (opts?.effort ?? null) : null;
    if (effort !== null && !isValidEffort(effort)) {
      // Caught here rather than at the CLI: an invalid value fails at the API
      // with HTTP 400 and burns a whole turn (measured).
      throw new IpcError('INVALID_ARGUMENT', `Niveau d'effort invalide: ${String(opts?.effort)}. Valeurs: ${REASONING_EFFORTS.join(', ')}.`);
    }

    const sessionId = randomUUID();
    const session = this.engines[cli].start({
      sessionId,
      cwd,
      // --agent is a claude concept; codex personas live in .codex/prompts and
      // are not selectable from exec mode, so the option does not cross over.
      agent: cli === 'claude' ? opts?.agent : null,
      model,
      effort,
      emit: (msg) => this.broadcast(msg),
      onClose: () => { this.sessions.delete(sessionId); },
    });
    this.sessions.set(sessionId, { engine: cli, session });
    // The frame echoes what was ACTUALLY applied, not what was asked: a claude
    // session reports effort null even if the renderer sent one, so the UI
    // reflects reality instead of its own request.
    this.broadcast({ type: 'started', sessionId, cli, model, effort });
    return { sessionId };
  }

  async send(sessionId: string, message: string, turnOpts?: LocalChatTurnOpts): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new IpcError('NOT_FOUND', 'Session locale absente ou fermée.');
    const turnEffort = turnOpts?.reasoningEffort;
    if (turnEffort !== undefined && turnEffort !== null && !isValidEffort(turnEffort)) {
      throw new IpcError('INVALID_ARGUMENT', `Niveau d'effort invalide: ${String(turnEffort)}. Valeurs: ${REASONING_EFFORTS.join(', ')}.`);
    }
    // A per-turn effort on an engine without the concept is dropped, not
    // forwarded — same rule as the session-level gate.
    const forwarded = engineSupportsEffort(entry.engine) ? turnOpts : undefined;
    await entry.session.send(message, forwarded);
  }

  async stop(sessionId: string): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const entry = this.sessions.get(sessionId);
    if (!entry) return; // nothing to stop — no-op
    entry.session.stop();
    this.broadcast({ type: 'stopped', sessionId });
  }

  // Kill EVERY live session — called at app quit. A spawned CLI child does NOT
  // die with the parent on Linux, so without this every launch+chat leaves an
  // orphan (+ its MCP node child) running, and they pile up and slow the
  // machine. At quit we cannot wait out a grace period (app.exit is imminent).
  stopAll(): void {
    this._quitting = true;
    for (const [sessionId, entry] of this.sessions) {
      entry.session.kill();
      this.sessions.delete(sessionId);
    }
  }

  // Persisted local sessions come from disk (N1 local-data), not a cloud/server.
  async list(): Promise<LocalChatSessionSummary[]> {
    return localSessions({ limit: 50 }).map((s) => ({
      id: s.id,
      cli: 'claude',
      agent: s.agent_slug,
      cwd: typeof s.project_id === 'string' ? s.project_id : null,
      resumable: false,
      created: s.created_at,
      updated: s.updated_at,
      messageCount: 0,
      lastMessage: null,
    }));
  }

  // Agent slugs the claude CLI will honour for this project. Exposed because an
  // unknown slug is accepted and silently dropped by the CLI, so the choice has
  // to be validated before it is offered, not after it failed to apply.
  async agents(cwd?: string): Promise<string[]> {
    const root = cwd || (await this.defaultCwd()) || null;
    return availableClaudeAgents(root);
  }

  // Native sessions are live processes ; there is no separate on-disk transcript
  // to seed from yet, so history is empty (each CLI owns its own context).
  async history(_sessionId: string): Promise<LocalChatHistoryMessage[]> {
    return [];
  }

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.localChat.start, wrap((_evt, opts?: LocalChatStartOpts) => this.start(opts)));
    ipcMain.handle(IPC_CHANNELS.localChat.send, wrap((_evt, sessionId: string, message: string, turnOpts?: LocalChatTurnOpts) => this.send(sessionId, message, turnOpts)));
    ipcMain.handle(IPC_CHANNELS.localChat.stop, wrap((_evt, sessionId: string) => this.stop(sessionId)));
    ipcMain.handle(IPC_CHANNELS.localChat.list, wrap(() => this.list()));
    ipcMain.handle(IPC_CHANNELS.localChat.agents, wrap((_evt, cwd?: string) => this.agents(cwd)));
    ipcMain.handle(IPC_CHANNELS.localChat.history, wrap((_evt, sessionId: string) => this.history(sessionId)));
  }
}

// Default broadcast: push to every open window. Guards destroyed webContents.
function defaultBroadcast(msg: LocalChatMessage): void {
  const wins = BrowserWindow?.getAllWindows?.() ?? [];
  for (const win of wins) {
    if (!win.webContents.isDestroyed()) win.webContents.send('byan:chat-local:message', msg);
  }
}

// ---- module-level singleton wiring ----

let _bridge: LocalChatBridge | null = null;

// Build the singleton bridge at boot. The native bridge needs no local server
// (it spawns the CLI directly in the project dir) — the old signature took a
// LocalServer it silently discarded.
export function initLocalChat(): void {
  _bridge = new LocalChatBridge();
}

// Test seam: inject a fully-built bridge (fake spawn / broadcast).
export function _setBridgeForTests(bridge: LocalChatBridge | null): void {
  _bridge = bridge;
}

export function register(ipcMain: IpcMain): void {
  if (!_bridge) _bridge = new LocalChatBridge();
  _bridge.register(ipcMain);
}

// Kill every live local CLI session — called from main's before-quit so no
// orphan (+ MCP child) survives the app. No-op when no bridge/sessions.
export function stopAllLocalChat(): void {
  _bridge?.stopAll();
}
