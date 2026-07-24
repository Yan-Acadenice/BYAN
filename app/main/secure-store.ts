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

// A value containing a newline (or leading/trailing whitespace, or starting
// with a double quote) cannot survive the line-oriented format verbatim — it
// used to round-trip truncated to its first line and could inject spurious
// keys. Such values are JSON-quoted on write and unquoted on read; plain
// values stay untouched, so existing files keep parsing.
function encodeValue(v: string): string {
  return /[\n\r]|^\s|\s$|^"/.test(v) ? JSON.stringify(v) : v;
}

function decodeValue(raw: string): string {
  if (raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'string') return parsed;
    } catch { /* legacy plain value that happens to start with a quote */ }
  }
  return raw;
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
    const v = decodeValue(trimmed.slice(eqIdx + 1));
    map.set(k, v);
  }
  return map;
}

function serializeDotEnv(map: Map<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of map) {
    lines.push(`${k}=${encodeValue(v)}`);
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

// Advisory lock parameters. A lock file left behind by a process that died
// mid-write is reclaimed after LOCK_STALE_MS — without that, every later write
// waited the full retry budget and then wrote unlocked, forever.
const LOCK_STALE_MS = 10_000;
const LOCK_MAX_RETRIES = 20;
const LOCK_RETRY_DELAY_MS = 50;

// Take the companion .lock file (O_EXCL). Waits are async sleeps, never a
// synchronous spin (the old busy-wait blocked the main process ~1s per write
// once the lock had gone stale). Returns null when the lock never freed — the
// caller proceeds unlocked, best-effort, as before.
async function acquireLock(lockPath: string): Promise<number | null> {
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      return fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
    } catch {
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue; // reclaimed — retry immediately
        }
      } catch {
        continue; // lock vanished between open and stat — retry immediately
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
    }
  }
  return null;
}

function releaseLock(fd: number, lockPath: string): void {
  try { fs.closeSync(fd); } catch { /* ignore */ }
  try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
}

// Atomic replace: write a temp file in the same directory, then rename over
// the target. A crash mid-write leaves the old file intact (writeFileSync in
// place truncated first — a crash there destroyed ALL stored secrets).
function writeFileAtomic(filePath: string, content: string, mode?: number): void {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, content, mode !== undefined ? { encoding: 'utf8', mode } : { encoding: 'utf8' });
  fs.renameSync(tmpPath, filePath);
}

function readDotEnvSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

// Read-modify-write of the .env under the advisory lock — the WHOLE cycle,
// not just the final write (a lock wrapping only the write did not prevent
// two instances from interleaving their read-modify-write and losing updates).
//
// Linux/macOS: companion .lock + chmod 0600 so only the owner reads secrets.
// Windows: Credential Manager is the preferred path; if we land here the file
// contains at most the fallback token, no lock file (O_EXCL unreliable across
// FS types) — the atomic rename still applies.
async function mutateDotEnvSafe(filePath: string, mutate: (map: Map<string, string>) => void): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (process.platform !== 'win32') {
    const lockPath = filePath + '.lock';
    const fd = await acquireLock(lockPath);
    try {
      const map = parseDotEnv(readDotEnvSafe(filePath));
      mutate(map);
      writeFileAtomic(filePath, serializeDotEnv(map), 0o600);
      // Ensure mode is 0600 even if the file already existed.
      try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort */ }
    } finally {
      if (fd !== null) releaseLock(fd, lockPath);
    }
  } else {
    const map = parseDotEnv(readDotEnvSafe(filePath));
    mutate(map);
    writeFileAtomic(filePath, serializeDotEnv(map));
  }
}

// ---------- FallbackStore ----------

class FallbackStore implements SecureStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = envFilePath();
  }

  async set(key: string, value: string): Promise<void> {
    await mutateDotEnvSafe(this.filePath, (map) => { map.set(envKey(key), value); });
  }

  async get(key: string): Promise<string | null> {
    const content = readDotEnvSafe(this.filePath);
    const map = parseDotEnv(content);
    return map.get(envKey(key)) ?? null;
  }

  async delete(key: string): Promise<void> {
    await mutateDotEnvSafe(this.filePath, (map) => { map.delete(envKey(key)); });
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
  private _downgradeWarned = false;

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
    this._downgradeWarned = false;
  }

  // Run an operation against the resolved backend. The keytar module can LOAD
  // fine (native binding present) yet FAIL at call time when the OS keychain is
  // locked or absent — on Linux libsecret then throws "Password is required".
  // Deciding the backend only at load time (resolve) meant that runtime failure
  // propagated and NOTHING persisted (token, mode, onboarding.projectRoot). Here
  // a runtime keytar failure degrades PERMANENTLY to the .env fallback and the
  // op is retried there, so the caller never sees the keychain error.
  private async run<T>(op: (store: SecureStore) => Promise<T>): Promise<T> {
    const store = this.resolve();
    if (store instanceof FallbackStore) return op(store);
    try {
      return await op(store);
    } catch (err) {
      if (!this._downgradeWarned) {
        this._downgradeWarned = true;
        console.warn(
          `[secure-store] OS keychain unavailable (${err instanceof Error ? err.message : String(err)}); ` +
          'falling back to the per-user .env file (chmod 0600).'
        );
      }
      const fallback = new FallbackStore();
      this._resolved = fallback;
      return op(fallback);
    }
  }

  async set(key: string, value: string): Promise<void> {
    return this.run((store) => store.set(key, value));
  }

  async get(key: string): Promise<string | null> {
    return this.run((store) => store.get(key));
  }

  async delete(key: string): Promise<void> {
    return this.run((store) => store.delete(key));
  }
}

// ---------- Singleton ----------

export const secureStore: SecureStore & { _resetForTests(): void } = new CompositeStore();
