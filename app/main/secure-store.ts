// SecureStore — token/secret storage with OS keychain as primary backend.
//
// Primary:  keytar (libsecret on Linux, Credential Manager on Windows).
// Fallback: user-scoped .env file when keytar is unavailable (headless Linux,
//           CI, minimal containers without libsecret).
//
// SECURITY INVARIANT: values stored here never travel to the renderer.
// The renderer obtains a token by calling the auth.getToken IPC channel,
// which returns it directly over the secured IPC bridge — never stored in
// the renderer process memory or localStorage.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------- Public interface ----------

export interface SecureStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// ---------- Keytar backend ----------

// keytar has native bindings. We lazy-require it once and memo the result so
// every subsequent call skips the require + availability probe.
//
// Three possible states after the first probe:
//   'untested'  — not yet probed
//   keytar module — available and operational
//   null        — unavailable (require threw, or first call threw)

type KeytarModule = {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

const KEYTAR_SERVICE = 'byan';

let keytarState: 'untested' | KeytarModule | null = 'untested';

function loadKeytar(): KeytarModule | null {
  if (keytarState !== 'untested') return keytarState;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('keytar') as KeytarModule;
    // Sanity-check: the module must expose the three methods we rely on.
    if (
      typeof mod.setPassword === 'function' &&
      typeof mod.getPassword === 'function' &&
      typeof mod.deletePassword === 'function'
    ) {
      keytarState = mod;
    } else {
      keytarState = null;
    }
  } catch {
    // libsecret not installed, Credential Manager unavailable, etc.
    keytarState = null;
  }

  return keytarState;
}

// Reset the lazy memo — only used in tests.
export function _resetKeytarState(): void {
  keytarState = 'untested';
}

// Inject a keytar implementation directly — only used in tests.
// Calling this bypasses the require() probe so test environments without
// libsecret can still exercise the KeytarStore code path.
export function _injectKeytarForTests(kt: KeytarModule | null): void {
  keytarState = kt;
}

// ---------- Fallback: user-scoped .env file ----------

function envFilePath(): string {
  let configDir: string;

  if (process.platform === 'win32') {
    configDir = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'byan');
  } else {
    const xdg = process.env.XDG_CONFIG_HOME;
    configDir = xdg ? path.join(xdg, 'byan') : path.join(os.homedir(), '.config', 'byan');
  }

  return path.join(configDir, '.env');
}

// Parse a KEY=VALUE .env file into a Map. Lines starting with # are comments.
// Values may contain '=' — only the first '=' per line is the separator.
function parseDotEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const k = trimmed.slice(0, eqIdx);
    const v = trimmed.slice(eqIdx + 1);
    map.set(k, v);
  }
  return map;
}

function serializeDotEnv(map: Map<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of map) {
    lines.push(`${k}=${v}`);
  }
  // Trailing newline keeps POSIX editors happy.
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

// Sanitize a key so it can be used as a .env variable name.
// We replace anything that isn't [A-Za-z0-9_] with '_'. Collisions are
// theoretically possible but the key space for auth.token / store.* is safe.
function envKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, '_');
}

// Write the .env file with an advisory lock to guard against concurrent writes
// from two app instances on the same machine.
//
// Linux: we use a lock file + O_EXCL to implement a spin-and-retry advisory
//        lock, then chmod 0600 the .env so only the current user can read it.
// Windows: O_EXCL is not supported on all FS types; we accept a simple
//          no-lock write and document the limitation.
function writeDotEnvSafe(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (process.platform !== 'win32') {
    // Linux / macOS — advisory lock via a companion .lock file.
    // chmod 0600 on Linux so only the process owner can read the secrets.
    const lockPath = filePath + '.lock';
    const maxRetries = 20;
    const retryDelayMs = 50;

    let fd: number | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
        break;
      } catch {
        // Lock held by another instance — busy-wait (synchronous, acceptable
        // because writes happen rarely and hold the lock for microseconds).
        const deadline = Date.now() + retryDelayMs;
        while (Date.now() < deadline) { /* spin */ }
      }
    }

    try {
      fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
      // Ensure mode is 0600 even if the file already existed.
      try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort */ }
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch { /* ignore */ }
        try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
      }
    }
  } else {
    // Windows: Credential Manager is the preferred path; if we land here the
    // file contains at most the fallback token. Race conditions between two
    // simultaneous writes are extremely unlikely in a desktop app context.
    // A proper fix would use a named mutex via a native addon — deferred to F10.
    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  }
}

function readDotEnvSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

// ---------- FallbackStore ----------

class FallbackStore implements SecureStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = envFilePath();
  }

  async set(key: string, value: string): Promise<void> {
    const content = readDotEnvSafe(this.filePath);
    const map = parseDotEnv(content);
    map.set(envKey(key), value);
    writeDotEnvSafe(this.filePath, serializeDotEnv(map));
  }

  async get(key: string): Promise<string | null> {
    const content = readDotEnvSafe(this.filePath);
    const map = parseDotEnv(content);
    return map.get(envKey(key)) ?? null;
  }

  async delete(key: string): Promise<void> {
    const content = readDotEnvSafe(this.filePath);
    const map = parseDotEnv(content);
    map.delete(envKey(key));
    writeDotEnvSafe(this.filePath, serializeDotEnv(map));
  }
}

// ---------- KeytarStore ----------

class KeytarStore implements SecureStore {
  private readonly kt: KeytarModule;

  constructor(kt: KeytarModule) {
    this.kt = kt;
  }

  async set(key: string, value: string): Promise<void> {
    await this.kt.setPassword(KEYTAR_SERVICE, key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.kt.getPassword(KEYTAR_SERVICE, key);
  }

  async delete(key: string): Promise<void> {
    await this.kt.deletePassword(KEYTAR_SERVICE, key);
  }
}

// ---------- Composite store with automatic fallback ----------

class CompositeStore implements SecureStore {
  // Resolved once on the first operation.
  private _resolved: SecureStore | null = null;

  private resolve(): SecureStore {
    if (!this._resolved) {
      const kt = loadKeytar();
      this._resolved = kt ? new KeytarStore(kt) : new FallbackStore();
    }
    return this._resolved;
  }

  // Reset inner state — only used in tests.
  _resetForTests(): void {
    this._resolved = null;
  }

  async set(key: string, value: string): Promise<void> {
    return this.resolve().set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.resolve().get(key);
  }

  async delete(key: string): Promise<void> {
    return this.resolve().delete(key);
  }
}

// ---------- Singleton ----------

export const secureStore: SecureStore & { _resetForTests(): void } = new CompositeStore();
