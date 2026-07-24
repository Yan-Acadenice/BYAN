// Engine layer contracts — the local chat bridge drives N CLI engines through
// this narrow seam. An engine turns ONE logical chat session into whatever
// process shape its CLI needs:
//   - claude : one long-lived process, turns written to its stdin (stream-json)
//   - codex  : one process PER TURN (`codex exec --json`), chained by
//              `codex exec resume <thread_id>`
// The bridge stays engine-agnostic: session map, cap, quit sweep, broadcast.

import type { ChildProcess } from 'child_process';
import type { LocalChatMessage } from '../../shared/ipc-contract';

export type EngineId = 'claude' | 'codex';

export function isEngineId(v: unknown): v is EngineId {
  return v === 'claude' || v === 'codex';
}

// A spawn signature narrow enough for tests to inject a fake process.
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; stdio: [string, string, string]; env?: NodeJS.ProcessEnv; detached?: boolean }
) => ChildProcess;

// Injected by the bridge — one bag shared by every engine.
export interface EngineDeps {
  spawnFn: SpawnFn;
  // Absolute path of a binary on the augmented PATH; null -> caller falls back
  // to the bare name (dev launches where PATH is fine).
  resolveBin: (name: string) => string | null;
  // Env for spawned children (PATH augmented so the CLI and its MCP node
  // children resolve under a windowed launch).
  spawnEnv: () => NodeJS.ProcessEnv;
}

export interface EngineStartOpts {
  sessionId: string;
  // Project directory the CLI runs in — validated by the bridge (absolute,
  // existing). The MCP channel comes from that dir (claude: .mcp.json is read
  // natively; codex: the bridge-side adapter maps .mcp.json onto -c overrides).
  cwd: string;
  // Agent slug — claude only (--agent). The bridge passes null for engines
  // that have no equivalent.
  agent?: string | null;
  // Broadcast a normalized message for THIS session.
  emit: (msg: LocalChatMessage) => void;
  // The session became unusable (process died, user stopped it) — the bridge
  // drops it from the map. Must tolerate being called more than once.
  onClose: () => void;
}

export interface EngineSession {
  send(message: string): void | Promise<void>;
  // Graceful stop: terminate, escalate after a grace period. Engines call
  // onClose themselves when the underlying resources are gone.
  stop(): void;
  // Immediate best-effort kill — app quit path, no timers.
  kill(): void;
}

export interface Engine {
  readonly id: EngineId;
  start(opts: EngineStartOpts): EngineSession;
}
