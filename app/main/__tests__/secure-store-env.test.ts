// FallbackStore against the REAL filesystem — the behaviors the mocked suite
// cannot see: value round-trips through the on-disk format, stale-lock
// reclaim, atomicity leftovers. keytar is force-disabled so the composite
// resolves to the .env fallback; XDG_CONFIG_HOME points the file at a tmpdir.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { secureStore, _injectKeytarForTests } from '../secure-store';

const IS_WIN = process.platform === 'win32';

let tmpDir: string;
const origXdg = process.env.XDG_CONFIG_HOME;

function envFile(): string {
  return path.join(tmpDir, 'byan', '.env');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-ss-env-'));
  process.env.XDG_CONFIG_HOME = tmpDir;
  _injectKeytarForTests(null); // force the .env fallback
  secureStore._resetForTests();
});

afterEach(() => {
  if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = origXdg;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe.skipIf(IS_WIN)('FallbackStore on the real fs', () => {
  it('round-trips a value containing newlines (JSON-quoted on disk)', async () => {
    const value = 'ligne 1\nligne 2\navec "guillemets"';
    await secureStore.set('multi.line', value);
    expect(await secureStore.get('multi.line')).toBe(value);
    // The raw file stays one line per key — no spurious key injected.
    const raw = fs.readFileSync(envFile(), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
  });

  it('round-trips trailing whitespace', async () => {
    await secureStore.set('padded', '  value  ');
    expect(await secureStore.get('padded')).toBe('  value  ');
  });

  it('keeps parsing a legacy plain-value file', async () => {
    fs.mkdirSync(path.dirname(envFile()), { recursive: true });
    fs.writeFileSync(envFile(), 'legacy_key=plain-value\n', 'utf8');
    expect(await secureStore.get('legacy.key')).toBe('plain-value');
  });

  it('reclaims a stale lock instead of writing unlocked forever', async () => {
    fs.mkdirSync(path.dirname(envFile()), { recursive: true });
    const lockPath = envFile() + '.lock';
    fs.writeFileSync(lockPath, '', 'utf8');
    // Age the lock past the staleness threshold (10s).
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, past, past);

    const t0 = Date.now();
    await secureStore.set('after.stale', 'ok');
    const elapsed = Date.now() - t0;

    expect(await secureStore.get('after.stale')).toBe('ok');
    // The old behavior burned the full retry budget (~1s); reclaim is instant.
    expect(elapsed).toBeLessThan(500);
    expect(fs.existsSync(lockPath)).toBe(false); // released after the write
  });

  it('leaves no temp file behind and secrets survive successive writes', async () => {
    await secureStore.set('k1', 'v1');
    await secureStore.set('k2', 'v2');
    await secureStore.delete('k1');
    expect(await secureStore.get('k2')).toBe('v2');
    expect(await secureStore.get('k1')).toBeNull();
    const leftovers = fs.readdirSync(path.dirname(envFile())).filter((f) => f.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });

  it('serializes concurrent writes without losing either update', async () => {
    await Promise.all([
      secureStore.set('c1', 'v1'),
      secureStore.set('c2', 'v2'),
    ]);
    expect(await secureStore.get('c1')).toBe('v1');
    expect(await secureStore.get('c2')).toBe('v2');
  });
});
