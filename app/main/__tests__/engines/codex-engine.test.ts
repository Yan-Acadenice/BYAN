// CodexEngine tests — the codex adapter in isolation (no bridge, no real
// binary). The bridge-level behaviours (per-turn spawn, resume chaining, JSONL
// mapping, stop semantics) are already covered by
// __tests__/ipc-handlers/local-chat-codex.test.ts and are NOT repeated here.
//
// What this file pins is the model/effort/usage seam, which the bridge cannot
// reach yet (it does not forward model/effort/turnOpts — that is F6):
//   - `-m` on a FRESH turn only, deliberately absent from resume;
//   - `-c model_reasoning_effort=` on BOTH fresh and resume, overridable per turn;
//   - codex's snake_case usage payload folded onto the camelCase IPC contract,
//     with costUsd null because codex reports no price at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { CodexEngine } from '../../engines/codex-engine';
import type { EngineStartOpts, SpawnFn } from '../../engines/types';
import type { LocalChatMessage } from '../../../shared/ipc-contract';
import { buildActivityTimeline, type LocalChatActivity } from '../../../shared/tool-activity';

// Minimal fake ChildProcess (same shape as the bridge-level codex tests).
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    writable: true,
    written: [] as string[],
    ended: false,
    write(s: string) { this.written.push(s); return true; },
    end() { this.ended = true; },
  };
  killed = false;
  kill(_sig?: string) { this.killed = true; return true; }
  emitLine(obj: unknown) { this.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n')); }
}

// The adapter only hands this path to spawn (the bridge owns cwd validation), so
// a built path keeps the test valid on win32 too.
const CWD = path.join(os.tmpdir(), 'byan-codex-engine');

function startEngine(opts: Partial<EngineStartOpts> = {}) {
  const emitted: LocalChatMessage[] = [];
  const procs: FakeProc[] = [];
  const spawnFn = vi.fn((() => {
    const p = new FakeProc();
    procs.push(p);
    return p;
  }) as unknown as SpawnFn);
  const engine = new CodexEngine(
    { spawnFn, resolveBin: () => null, spawnEnv: () => ({ PATH: '/fake/bin' }) },
    async () => [], // no .mcp.json noise in these argv assertions
    // La definition d'agent est injectee : le test la fournit plutot que de lire
    // le disque, pour porter sur le CONTRAT et pas sur les fichiers du projet.
    (slug) => (opts.agent === undefined ? null : `---\nname: ${slug}\n---\n\nTu es ${slug}. Zero emoji.`)
  );
  const session = engine.start({
    sessionId: 'sess-1',
    cwd: CWD,
    emit: (m) => emitted.push(m),
    onClose: vi.fn(),
    ...opts,
  });
  const argsOf = (call: number): string[] => spawnFn.mock.calls[call][1] as string[];
  return { session, procs, spawnFn, emitted, argsOf };
}

// The activity lines the interface would receive, in order.
function activities(emitted: LocalChatMessage[]): LocalChatActivity[] {
  return emitted
    .filter((m): m is Extract<LocalChatMessage, { type: 'tool' }> => m.type === 'tool')
    .map((m) => m.activity)
    .filter((a): a is LocalChatActivity => Boolean(a));
}

// Verbatim from the 2026-07-31 probe against codex-cli 0.146: the two halves of
// one command carry the SAME item id, and codex restarts that numbering on every
// turn — which is exactly why the engine namespaces it.
function itemStarted(id = 'item_1') {
  return {
    type: 'item.started',
    item: { id, type: 'command_execution', command: '/usr/bin/zsh -lc ls', aggregated_output: '', exit_code: null, status: 'in_progress' },
  };
}

function itemCompleted(id = 'item_1', exit_code = 0) {
  return {
    type: 'item.completed',
    item: { id, type: 'command_execution', command: '/usr/bin/zsh -lc ls', aggregated_output: 'total 4\n', exit_code, status: 'completed' },
  };
}

// Value that follows a flag, e.g. valueAfter(args, '-m').
function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// Drive the first turn to its terminal frame so the next send() resumes.
async function firstTurnDone(procs: FakeProc[], threadId = 'thread-42'): Promise<void> {
  procs[0].emitLine({ type: 'thread.started', thread_id: threadId });
  procs[0].emitLine({ type: 'turn.completed' });
  procs[0].emit('exit', 0, null);
}

describe('CodexEngine argv — model and effort on a FRESH turn', () => {
  it('passes -m <model> and the effort -c pair', async () => {
    const { session, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('salut');
    const args = argsOf(0);
    expect(args).toContain('-m');
    expect(valueAfter(args, '-m')).toBe('gpt-5.6-sol');
    const i = args.indexOf('model_reasoning_effort=high');
    expect(i).toBeGreaterThan(0);
    expect(args[i - 1]).toBe('-c'); // the value must travel WITH its flag
    expect(args[args.length - 1]).toBe('-'); // prompt still over stdin
  });

  it('passes neither when the session names no model and no effort', async () => {
    const { session, argsOf } = startEngine();
    await session.send('salut');
    const args = argsOf(0);
    expect(args).not.toContain('-m');
    expect(args.join(' ')).not.toContain('model_reasoning_effort');
  });
});

describe('CodexEngine argv — RESUME turn', () => {
  it('keeps the effort override but carries NO -m (model is session-scoped)', async () => {
    const { session, procs, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2');
    const args2 = argsOf(1);
    expect(args2.slice(0, 3)).toEqual(['exec', 'resume', 'thread-42']);
    expect(args2).toContain('model_reasoning_effort=high');
    // -m IS accepted on resume (measured); its absence is the product decision
    // that a model change opens a new session.
    expect(args2).not.toContain('-m');
    expect(args2).not.toContain('gpt-5.6-sol');
  });

  it('a per-turn reasoningEffort overrides the session default on that turn', async () => {
    const { session, procs, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2', { reasoningEffort: 'low' });
    const args2 = argsOf(1);
    expect(args2).toContain('model_reasoning_effort=low');
    expect(args2).not.toContain('model_reasoning_effort=high');
  });

  it('an override-free turn falls back to the session effort', async () => {
    const { session, procs, argsOf } = startEngine({ effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2', {});
    expect(argsOf(1)).toContain('model_reasoning_effort=high');
  });
});

describe('CodexEngine usage — turn.completed', () => {
  it('folds the five counters onto the contract and reports NO dollar cost', async () => {
    const { session, procs, emitted } = startEngine({ model: 'gpt-5.6-sol' });
    await session.send('salut');
    emitted.length = 0;
    // Verbatim payload from a real codex turn (live-verified 2026-07-27).
    procs[0].emitLine({
      type: 'turn.completed',
      usage: { input_tokens: 37581, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 11, reasoning_output_tokens: 0 },
    });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({
      engine: 'codex',
      model: 'gpt-5.6-sol',
      inputTokens: 37581,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 11,
      reasoningOutputTokens: 0,
      // codex bills a subscription: no price is reported, and none is invented.
      costUsd: null,
    });
  });

  it('omits a counter the payload does not carry (no fabricated zero)', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    emitted.length = 0;
    procs[0].emitLine({ type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 'nope' } });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({ engine: 'codex', model: null, inputTokens: 12, costUsd: null });
    expect(done?.usage && 'outputTokens' in done.usage).toBe(false);
  });

  it('a turn.completed with no usage block still reports the engine and a null cost', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    emitted.length = 0;
    procs[0].emitLine({ type: 'turn.completed' });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({ engine: 'codex', model: null, costUsd: null });
  });
});

// codex carries no clock of its own (measured: its frame keys are exactly
// {item,type}), so the engine stamps the instant it reads the line. Fake timers
// make that instant exact instead of approximate.
describe('CodexEngine — bounding an item in time', () => {
  const T0 = Date.parse('2026-07-31T09:41:16.116Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pairs item.started with item.completed on the id codex gave', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    procs[0].emitLine(itemStarted());
    vi.setSystemTime(T0 + 3200);
    procs[0].emitLine(itemCompleted());

    const [begun, ended] = activities(emitted);
    expect(begun).toEqual({ name: 'commande', detail: 'ls', phase: 'start', id: 't1:item_1', at: T0, ok: undefined });
    expect(ended).toEqual({ name: 'commande', detail: 'ls', phase: 'end', id: 't1:item_1', at: T0 + 3200, ok: true });

    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.steps[0].durationMs).toBe(3200);
  });

  it('does NOT fuse two turns that reuse the same item id', async () => {
    // Measured on codex-cli 0.146: a fresh turn and its `exec resume` follow-up
    // both emit item_0/item_1/item_2. Paired on the raw id, the second turn's
    // command would close the first turn's step and report a duration spanning
    // both — a wrong measurement rather than a missing one.
    const { session, procs, emitted } = startEngine();
    await session.send('tour 1');
    procs[0].emitLine(itemStarted());
    vi.setSystemTime(T0 + 1000);
    procs[0].emitLine(itemCompleted());
    await firstTurnDone(procs);

    await session.send('tour 2');
    vi.setSystemTime(T0 + 5000);
    procs[1].emitLine(itemStarted());
    vi.setSystemTime(T0 + 5500);
    procs[1].emitLine(itemCompleted());

    expect(activities(emitted).map((a) => a.id)).toEqual([
      't1:item_1', 't1:item_1', 't2:item_1', 't2:item_1',
    ]);
    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.steps).toHaveLength(2);
    expect(timeline.steps.map((s) => s.durationMs)).toEqual([1000, 500]);
    // Two commands one after the other, never at the same time.
    expect(timeline.concurrent).toBe(false);
  });

  it('reads a non-zero exit code as a step that did not go through', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    procs[0].emitLine(itemStarted());
    procs[0].emitLine(itemCompleted('item_1', 127));
    expect(activities(emitted)[1].ok).toBe(false);
  });

  it('leaves an item that never completes OPEN, with no duration', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    procs[0].emitLine(itemStarted());
    vi.setSystemTime(T0 + 9000);
    procs[0].emitLine({ type: 'turn.completed', usage: {} });

    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.openCount).toBe(1);
    expect(timeline.steps[0].endedAt).toBeUndefined();
    expect(timeline.steps[0].durationMs).toBeUndefined();
  });

  it('keeps an item.completed whose start was never announced', async () => {
    // Measured: an agent_message emits item.completed ONLY. The tool item types
    // were not all observed emitting item.started, so an end without a start is
    // a real case — it keeps its instant and leaves the beginning unknown.
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    procs[0].emitLine(itemCompleted('item_4'));

    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.steps[0]).toMatchObject({ id: 't1:item_4', endedAt: T0, open: false });
    expect(timeline.steps[0].startedAt).toBeUndefined();
    expect(timeline.steps[0].durationMs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Le choix d'agent sur codex.
//
// MESURE du 2026-08-04, codex-cli 0.146.0 : `codex exec --help` n'expose AUCUN
// `--agent`. L'adaptateur met donc la definition EN TETE du tour, sur l'entree
// standard — la meme voie que le message. Ce qu'on obtient est la persona ; le
// modele et les outils declares dans le front-matter ne sont PAS appliques, et
// l'interface le dit (shared/engine-options.ts -> AGENT_SUPPORT_NOTE).
// ---------------------------------------------------------------------------
describe('CodexEngine — choix d agent', () => {
  it("met les instructions de l agent avant le message, sur l entree standard", async () => {
    const { session, procs } = startEngine({ agent: 'bmad-byan' });
    await session.send('salut');

    const ecrit = procs[0].stdin.written.join('');
    expect(ecrit.indexOf('Tu es bmad-byan')).toBeGreaterThanOrEqual(0);
    expect(ecrit.indexOf('Tu es bmad-byan')).toBeLessThan(ecrit.indexOf('salut'));
  });

  it("ne met AUCUN drapeau agent sur la ligne de commande", async () => {
    // codex n'en a pas. En passer un ferait echouer le lancement, ou pire, serait
    // ignore en silence et donnerait l'illusion que l'agent est charge.
    const { session, argsOf } = startEngine({ agent: 'bmad-byan' });
    await session.send('salut');
    expect(argsOf(0).join(' ')).not.toContain('--agent');
    expect(argsOf(0).join(' ')).not.toContain('bmad-byan');
  });

  it("envoie le message SEUL quand aucun agent n est demande", async () => {
    const { session, procs } = startEngine();
    await session.send('salut');
    expect(procs[0].stdin.written.join('')).toBe('salut');
  });

  it("remet la persona a CHAQUE tour, parce que codex relance un processus", async () => {
    // Un processus par tour : il n'y a aucun endroit ou installer la persona une
    // fois pour toutes. L'oublier au tour 2 la ferait disparaitre en silence.
    const { session, procs } = startEngine({ agent: 'bmad-byan' });
    await session.send('un');
    procs[0].emitLine({ type: 'thread.started', thread_id: 'th-1' });
    procs[0].emit('exit', 0, null);
    await new Promise((r) => setTimeout(r, 0));
    await session.send('deux');
    expect(procs[1].stdin.written.join('')).toContain('Tu es bmad-byan');
  });
});
