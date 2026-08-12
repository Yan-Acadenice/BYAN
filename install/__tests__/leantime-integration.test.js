const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  setupLeantimeIntegration,
} = require('../lib/byan-leantime-integration');
const {
  mcpConfig: { mergeLeantimeRefs, looksLikeSecret },
  validate: { validateLeantimeReachability },
  tokenPrompt: { LEANTIME_ENV_KEYS },
} = require('../packages/platform-config');

// Synthetic token — shape only, never a real secret (avoids Push Protection
// false positives and leaks). 'lt_' prefix matches the Leantime key shape.
const FAKE_TOKEN = 'lt_test_' + '0'.repeat(40);
const FAKE_URL = 'https://leantime.example.test';

describe('byan-leantime-integration / setupLeantimeIntegration', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-leantime-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('skipPrompts + presetInputs(configured:false) writes nothing and returns not configured', async () => {
    const r = await setupLeantimeIntegration(tmp, {
      skipPrompts: true,
      presetInputs: { configured: false },
      quiet: true,
    });
    expect(r.configured).toBe(false);
    expect(await fs.pathExists(path.join(tmp, '.env'))).toBe(false);
    expect(await fs.pathExists(path.join(tmp, '.claude', 'settings.local.json'))).toBe(false);
    expect(await fs.pathExists(path.join(tmp, '.mcp.json'))).toBe(false);
  });

  test('configured: writes LEANTIME vars to settings.local.json AND .env', async () => {
    const r = await setupLeantimeIntegration(tmp, {
      skipPrompts: true,
      presetInputs: { configured: true, apiUrl: FAKE_URL, token: FAKE_TOKEN },
      quiet: true,
    });
    expect(r.configured).toBe(true);

    const settings = await fs.readJson(path.join(tmp, '.claude', 'settings.local.json'));
    expect(settings.env.LEANTIME_API_URL).toBe(FAKE_URL);
    expect(settings.env.LEANTIME_API_TOKEN).toBe(FAKE_TOKEN);

    const dotenv = await fs.readFile(path.join(tmp, '.env'), 'utf8');
    expect(dotenv).toMatch(/^LEANTIME_API_URL=https:\/\/leantime\.example\.test$/m);
    expect(dotenv).toMatch(new RegExp(`^LEANTIME_API_TOKEN=${FAKE_TOKEN}$`, 'm'));
  });

  test('assignUserId present is written; absent is omitted (no dangling line/key)', async () => {
    // present
    await setupLeantimeIntegration(tmp, {
      skipPrompts: true,
      presetInputs: { configured: true, apiUrl: FAKE_URL, token: FAKE_TOKEN, assignUserId: '6' },
      quiet: true,
    });
    const settingsWith = await fs.readJson(path.join(tmp, '.claude', 'settings.local.json'));
    expect(settingsWith.env.LEANTIME_ASSIGN_USER_ID).toBe('6');

    // absent — fresh tmp
    const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-leantime-'));
    await setupLeantimeIntegration(tmp2, {
      skipPrompts: true,
      presetInputs: { configured: true, apiUrl: FAKE_URL, token: FAKE_TOKEN },
      quiet: true,
    });
    const settingsWithout = await fs.readJson(path.join(tmp2, '.claude', 'settings.local.json'));
    expect('LEANTIME_ASSIGN_USER_ID' in settingsWithout.env).toBe(false);
    const dotenv2 = await fs.readFile(path.join(tmp2, '.env'), 'utf8');
    expect(dotenv2).not.toMatch(/LEANTIME_ASSIGN_USER_ID/);
    await fs.remove(tmp2);
  });

  test('SECURITY: token never appears literally in .mcp.json — only ${...} refs', async () => {
    await setupLeantimeIntegration(tmp, {
      skipPrompts: true,
      presetInputs: { configured: true, apiUrl: FAKE_URL, token: FAKE_TOKEN },
      quiet: true,
    });
    const mcpRaw = await fs.readFile(path.join(tmp, '.mcp.json'), 'utf8');
    expect(mcpRaw).not.toContain(FAKE_TOKEN);
    expect(mcpRaw).toContain('${LEANTIME_API_TOKEN}');
    expect(mcpRaw).toContain('${LEANTIME_API_URL}');
  });

  test('preserves an existing .env / settings.local key', async () => {
    await fs.writeFile(path.join(tmp, '.env'), 'EXISTING_KEY=keepme\n');
    await fs.ensureDir(path.join(tmp, '.claude'));
    await fs.writeJson(path.join(tmp, '.claude', 'settings.local.json'), {
      env: { BYAN_API_URL: 'http://keep' },
    });

    await setupLeantimeIntegration(tmp, {
      skipPrompts: true,
      presetInputs: { configured: true, apiUrl: FAKE_URL, token: FAKE_TOKEN },
      quiet: true,
    });

    const settings = await fs.readJson(path.join(tmp, '.claude', 'settings.local.json'));
    expect(settings.env.BYAN_API_URL).toBe('http://keep');
    expect(settings.env.LEANTIME_API_URL).toBe(FAKE_URL);
    const dotenv = await fs.readFile(path.join(tmp, '.env'), 'utf8');
    expect(dotenv).toMatch(/^EXISTING_KEY=keepme$/m);
  });
});

describe('mcp-config / mergeLeantimeRefs', () => {
  test('adds ${LEANTIME_*} refs to the byan entry, preserving existing env', () => {
    const merged = mergeLeantimeRefs({
      mcpServers: { byan: { command: 'node', args: ['x.js'], env: { BYAN_API_URL: 'http://keep' } } },
    });
    expect(merged.mcpServers.byan.env.BYAN_API_URL).toBe('http://keep');
    expect(merged.mcpServers.byan.env.LEANTIME_API_URL).toBe('${LEANTIME_API_URL}');
    expect(merged.mcpServers.byan.env.LEANTIME_API_TOKEN).toBe('${LEANTIME_API_TOKEN}');
  });

  test('creates a minimal byan entry when none exists (fresh install)', () => {
    const merged = mergeLeantimeRefs({});
    expect(merged.mcpServers.byan.command).toBe('node');
    expect(merged.mcpServers.byan.env.LEANTIME_API_TOKEN).toBe('${LEANTIME_API_TOKEN}');
  });

  test('preserves OTHER mcp servers', () => {
    const merged = mergeLeantimeRefs({ mcpServers: { other: { command: 'foo' } } });
    expect(merged.mcpServers.other.command).toBe('foo');
    expect(merged.mcpServers.byan.env.LEANTIME_API_URL).toBe('${LEANTIME_API_URL}');
  });
});

describe('validate / validateLeantimeReachability', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });

  test('detects non_json (HTML login = wrong host) and surfaces the UI hint', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      json: async () => {
        throw new Error('Unexpected token <');
      },
    });
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN });
    expect(r.reachable).toBe(true);
    expect(r.reason).toBe('non_json');
    expect(r.hint).toMatch(/UI/);
  });

  test('OK path: JSON-RPC result -> reachable, no reason', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ jsonrpc: '2.0', id: 'byan-install-probe', result: [] }),
    });
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN });
    expect(r.reachable).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  test('a JSON-RPC error envelope still proves the host is right (reason rpc_error, reachable)', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ jsonrpc: '2.0', id: 'x', error: { code: -32601, message: 'no' } }),
    });
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN });
    expect(r.reachable).toBe(true);
    expect(r.reason).toBe('rpc_error');
  });

  test('no base / no token -> not reachable, never throws', async () => {
    expect(await validateLeantimeReachability({ apiUrl: '', token: FAKE_TOKEN })).toMatchObject({
      reachable: false,
      reason: 'no_base',
    });
    expect(await validateLeantimeReachability({ apiUrl: FAKE_URL, token: '' })).toMatchObject({
      reachable: false,
      reason: 'no_token',
    });
  });

  test('non-2xx -> reachable host, reason http_<status>', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
    });
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN });
    expect(r.reachable).toBe(true);
    expect(r.reason).toBe('http_503');
    expect(r.status).toBe(503);
  });

  test('AbortController abort -> reason timeout, not reachable, never throws', async () => {
    global.fetch = async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    };
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN, timeoutMs: 10 });
    expect(r.reachable).toBe(false);
    expect(r.reason).toBe('timeout');
  });

  test('transport failure -> reason network_error, not reachable, never throws', async () => {
    global.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const r = await validateLeantimeReachability({ apiUrl: FAKE_URL, token: FAKE_TOKEN });
    expect(r.reachable).toBe(false);
    expect(r.reason).toBe('network_error');
  });
});

describe('contracts (lock symmetry + secret-guard hardening)', () => {
  test('LEANTIME_ENV_KEYS lists exactly the three Leantime vars (mirror of ENV_KEYS)', () => {
    expect(LEANTIME_ENV_KEYS).toEqual([
      'LEANTIME_API_URL',
      'LEANTIME_API_TOKEN',
      'LEANTIME_ASSIGN_USER_ID',
    ]);
  });

  test('looksLikeSecret flags a real-shaped lt_ key but NOT the ${...} placeholder', () => {
    expect(looksLikeSecret('lt_' + 'a'.repeat(30))).toBe(true);
    expect(looksLikeSecret('${LEANTIME_API_TOKEN}')).toBe(false);
  });
});
