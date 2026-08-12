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
import { IPC_CHANNELS, LocalChatStartOpts, LocalChatMessage, LocalChatSessionSummary, LocalChatHistoryMessage, LocalChatTurnOpts, DispatchPlanRequest, DispatchPlan } from '../../shared/ipc-contract';
import { effortsFor, isValidEffortFor, isValidModelFor } from '../../shared/engine-options';
import { IpcError, wrap } from './_error';
import { localSessions, resolveProjectRoot } from '../local-data';
import { secureStore } from '../secure-store';
import { resolveExecutable, spawnEnv } from '../resolve-bin';
import { availableClaudeAgents } from '../claude-agents';
import { loadRoster, declaredModelForSlug } from '../roster';
import { buildDispatchPlan } from '../../shared/dispatch/plan';
import { isModelTier } from '../../shared/workmanship';
import type { Engine, EngineId, EngineSession, SpawnFn } from '../engines/types';
import { isEngineId } from '../engines/types';
import { ClaudeEngine } from '../engines/claude-engine';
import { CodexEngine, type ReadMcpFn } from '../engines/codex-engine';
import { SessionHistoryStore } from '../session-history-store';
import {
  appendMessage,
  closeRecord,
  completeTurn,
  createRecord,
  failTurn,
  type SessionHistoryRecord,
} from '../../shared/session-history';

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
  // Le magasin d'historique sur disque. Injecte dans les tests (dossier
  // temporaire) ; par defaut il ecrit dans le projet de la session.
  historyStore?: SessionHistoryStore;
  // L'horloge, pour que les tests puissent poser des dates stables. Par defaut
  // l'heure reelle en ISO.
  now?: () => string;
}

// Cap on concurrent local CLI processes — a runaway renderer looping start()
// must not spawn unbounded subprocesses (local resource exhaustion).
const MAX_SESSIONS = 8;

interface SessionEntry {
  engine: EngineId;
  session: EngineSession;
  // L'enregistrement d'historique de CETTE session, tenu a jour en memoire et
  // reecrit sur disque a chaque evenement notable. Le garder ici plutot que de
  // relire le fichier a chaque trame evite une lecture par bloc de flux.
  record: SessionHistoryRecord;
  // Le texte de la reponse en cours d'ecriture, accumule depuis les blocs. Le
  // pont est le seul endroit qui les voit tous ; sans cette accumulation
  // l'historique aurait les questions et pas les reponses.
  streamed: string;
  // Debut du tour en cours et nombre d'etapes d'outil observees, remis a zero a
  // chaque envoi.
  turnStartedAt: string | null;
  turnSteps: number;
}

export class LocalChatBridge {
  private readonly broadcast: (msg: LocalChatMessage) => void;
  private readonly defaultCwd: () => (string | undefined) | Promise<string | undefined>;
  private readonly engines: Record<EngineId, Engine>;
  private readonly sessions = new Map<string, SessionEntry>();
  // Nomme historyStore et pas history : la classe porte deja une METHODE
  // history(sessionId) (le canal IPC du meme nom), et un champ homonyme la
  // masque — TS2300, puis TS2349 « expression non appelable » sur
  // this.history(...). Deux choses differentes ne partagent pas un nom.
  private readonly historyStore: SessionHistoryStore;
  private readonly now: () => string;
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
    this.historyStore = deps.historyStore ?? new SessionHistoryStore(() => resolveProjectRoot());
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  // Ecrit l'enregistrement courant d'une session. Regroupe ici pour que chaque
  // transition soit « je replie, j'ecris » et pas « je replie » d'un cote et
  // « j'oublie d'ecrire » de l'autre.
  private persist(entry: SessionEntry, next: SessionHistoryRecord): void {
    entry.record = next;
    this.historyStore.write(next);
  }

  // Spawn a local CLI session in the project directory. cwd must be an existing
  // absolute dir (trust boundary : same guard as N2/F5).
  async start(opts?: LocalChatStartOpts): Promise<{ sessionId: string; cwd: string }> {
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
    // BOTH engines take an effort, and the accepted VALUES differ: claude rejects
    // 'none' and 'minimal'. Validating per engine is what stops a value the user
    // chose from being silently ignored — claude warns and falls back to its
    // default rather than failing, so an unchecked value is a dropped setting.
    const effort = opts?.effort ?? null;
    if (effort !== null && !isValidEffortFor(cli, effort)) {
      // Caught here rather than at the CLI: on codex an invalid value fails at
      // the API with HTTP 400 and burns a whole turn (measured).
      throw new IpcError('INVALID_ARGUMENT', `Niveau d'effort invalide pour ${cli}: ${String(opts?.effort)}. Valeurs: ${effortsFor(cli).join(', ')}.`);
    }

    const sessionId = randomUUID();
    const startedAt = this.now();
    const record = createRecord({
      id: sessionId,
      engine: cli,
      model,
      effort,
      agent: opts?.agent ?? null,
      cwd,
      at: startedAt,
    });
    // Une session de plus arrive : c'est le moment de verifier que le dossier
    // n'en garde pas trop. Elaguer a la lecture ferait payer le menage a
    // l'ouverture de la page.
    this.historyStore.prune(undefined, cwd);

    const session = this.engines[cli].start({
      sessionId,
      cwd,
      // L'agent part vers les DEUX moteurs. claude le charge nativement
      // (--agent) ; codex n'a pas de drapeau equivalent (mesure du jour,
      // codex-cli 0.146.0 : aucun --agent dans `codex exec --help`), son
      // adaptateur met donc la definition en tete du tour. Voir
      // shared/engine-options.ts -> agentSupport.
      // are not selectable from exec mode, so the option does not cross over.
      agent: opts?.agent ?? null,
      model,
      effort,
      // Chaque trame passe par ici AVANT d'aller au renderer : c'est le seul
      // point du programme qui les voit toutes, pour les deux moteurs. L'ecriture
      // est faite en premier pour qu'une exception d'affichage ne fasse pas
      // perdre la mesure.
      emit: (msg) => {
        this.record(sessionId, msg);
        this.broadcast(msg);
      },
      onClose: () => {
        const entry = this.sessions.get(sessionId);
        if (entry) this.persist(entry, closeRecord(entry.record, this.now()));
        this.sessions.delete(sessionId);
      },
    });
    this.sessions.set(sessionId, {
      engine: cli,
      session,
      record,
      streamed: '',
      turnStartedAt: null,
      turnSteps: 0,
    });
    this.historyStore.write(record);
    // The frame echoes what was ACTUALLY applied, not what was asked: a claude
    // session reports effort null even if the renderer sent one, so the UI
    // reflects reality instead of its own request.
    this.broadcast({ type: 'started', sessionId, cli, model, effort, cwd });
    return { sessionId, cwd };
  }

  // Traduit une trame moteur en avancement de l'enregistrement d'historique.
  //
  // Ce qui est mesure et ce qui ne l'est pas : le texte de la reponse vient des
  // blocs accumules (avec repli sur le `result` quand aucun bloc n'est arrive) ;
  // le cout et les jetons viennent du champ `usage` du moteur, TEL QUEL. Rien
  // n'est deduit ni comble : un tour sans `usage` est enregistre avec un cout
  // 'none', pas avec un zero.
  private record(sessionId: string, msg: LocalChatMessage): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    const at = this.now();

    switch (msg.type) {
      case 'chunk':
        entry.streamed += msg.delta;
        break;

      case 'tool':
        entry.turnSteps += 1;
        break;

      case 'complete': {
        const resultText = typeof msg.result === 'string' ? msg.result : '';
        const text = entry.streamed || resultText;
        let next = entry.record;
        if (text) next = appendMessage(next, 'assistant', text, at);
        next = completeTurn(next, {
          usage: msg.usage,
          startedAt: entry.turnStartedAt ?? at,
          endedAt: at,
          steps: entry.turnSteps,
        });
        entry.streamed = '';
        entry.turnStartedAt = null;
        entry.turnSteps = 0;
        this.persist(entry, next);
        break;
      }

      case 'error': {
        // Une erreur reste dans la transcription : sans elle, une session qui a
        // echoue se relit comme une session vide, ce qui est le contraire de
        // l'information utile.
        let next = appendMessage(entry.record, 'system', `Erreur: ${msg.error}`, at);
        next = failTurn(next, {
          error: msg.error,
          startedAt: entry.turnStartedAt ?? at,
          endedAt: at,
          steps: entry.turnSteps,
        });
        entry.streamed = '';
        entry.turnStartedAt = null;
        entry.turnSteps = 0;
        this.persist(entry, next);
        break;
      }

      case 'stopped':
        // Un tour interrompu n'a pas produit de mesure : on jette l'accumulateur
        // et on ne pose pas de tour. Le tour a eu lieu mais on ne sait rien de ce
        // qu'il a coute, et un tour a 0 dirait le contraire.
        entry.streamed = '';
        entry.turnStartedAt = null;
        entry.turnSteps = 0;
        break;

      default:
        break;
    }
  }

  async send(sessionId: string, message: string, turnOpts?: LocalChatTurnOpts): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new IpcError('NOT_FOUND', 'Session locale absente ou fermée.');
    const turnEffort = turnOpts?.reasoningEffort;
    if (turnEffort !== undefined && turnEffort !== null && !isValidEffortFor(entry.engine, turnEffort)) {
      throw new IpcError('INVALID_ARGUMENT', `Niveau d'effort invalide pour ${entry.engine}: ${String(turnEffort)}. Valeurs: ${effortsFor(entry.engine).join(', ')}.`);
    }
    // claude's --effort is a SPAWN flag: it belongs to the process, so a per-turn
    // change cannot reach a running claude. Forwarding it would be a control that
    // reports success and changes nothing. codex takes it per turn.
    const forwarded = entry.engine === 'codex' ? turnOpts : undefined;
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

  // Le plan de dispatch pour un message. Le calcul lui-meme est PUR et vit dans
  // shared/dispatch/plan.ts ; ce que cette methode apporte, c'est le DISQUE —
  // le roster du projet et les agents que le CLI honore vraiment — auxquels le
  // renderer n'a pas acces.
  //
  // DEUX PASSES, ET C'EST VOULU. Le modele que le plan doit respecter comme
  // plancher est celui declare par l'agent RETENU (front-matter `model:`), et on
  // ne sait quel agent est retenu qu'une fois le plan calcule. On calcule donc
  // une premiere fois pour connaitre l'agent, on lit son modele declare, puis on
  // recalcule avec ce plancher. Le calcul est pur et sans entree/sortie : la
  // seconde passe ne coute rien de plus qu'un appel de fonction.
  async plan(input: DispatchPlanRequest): Promise<DispatchPlan> {
    const root = input.cwd || (await this.defaultCwd()) || null;
    const roster = loadRoster(root);
    const availableSlugs = availableClaudeAgents(root);
    const base = { message: input.message, state: input.state, roster, availableSlugs };

    const premier = buildDispatchPlan(base);
    const slug = premier.agent.value;
    if (slug === null) return premier;

    const declare = declaredModelForSlug(slug, root);
    // Un agent peut declarer un modele que l'echelle ne connait pas (un nom
    // complet, une future gamme). On ne s'en sert comme plancher que s'il tombe
    // sur un barreau connu — sinon le plancher n'aurait pas de rang comparable.
    if (!isModelTier(declare)) return premier;

    return buildDispatchPlan({ ...base, agentFloorModel: declare });
  }

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.localChat.start, wrap((_evt, opts?: LocalChatStartOpts) => this.start(opts)));
    ipcMain.handle(IPC_CHANNELS.localChat.send, wrap((_evt, sessionId: string, message: string, turnOpts?: LocalChatTurnOpts) => this.send(sessionId, message, turnOpts)));
    ipcMain.handle(IPC_CHANNELS.localChat.stop, wrap((_evt, sessionId: string) => this.stop(sessionId)));
    ipcMain.handle(IPC_CHANNELS.localChat.list, wrap(() => this.list()));
    ipcMain.handle(IPC_CHANNELS.localChat.agents, wrap((_evt, cwd?: string) => this.agents(cwd)));
    ipcMain.handle(IPC_CHANNELS.localChat.history, wrap((_evt, sessionId: string) => this.history(sessionId)));
    ipcMain.handle(IPC_CHANNELS.localChat.plan, wrap((_evt, input: DispatchPlanRequest) => this.plan(input)));
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
