const {
  codexAuthState,
  autodelegateConfig,
  writeAutodelegateConfig,
  setupCodexAutodelegate,
  DEVICE_FLOW_INSTRUCTION,
} = require('../lib/codex-autodelegate-setup');

// F4 — the installer step that opts the user into a Codex backup pool and ARMS
// the F5 auto-delegation hook by writing _byan/_config/autodelegate.json. Linking
// uses the LOCAL Codex auth (ChatGPT subscription via `codex login`) — no API
// credit. All fs is injected so the suite writes nothing real.

describe('install/codex-autodelegate-setup', () => {
  const origKey = process.env.CODEX_API_KEY;
  afterEach(() => {
    if (origKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = origKey;
  });

  describe('codexAuthState', () => {
    test('CODEX_API_KEY -> api-key', () => {
      process.env.CODEX_API_KEY = 'sk-x';
      expect(codexAuthState({ home: '/h', fs: { existsSync: () => false } })).toBe('api-key');
    });
    test('no key but ~/.codex/auth.json -> subscription', () => {
      delete process.env.CODEX_API_KEY;
      expect(codexAuthState({ home: '/h', fs: { existsSync: () => true } })).toBe('subscription');
    });
    test('neither -> null', () => {
      delete process.env.CODEX_API_KEY;
      expect(codexAuthState({ home: '/h', fs: { existsSync: () => false } })).toBeNull();
    });
  });

  describe('autodelegateConfig', () => {
    test('default shape arms the hook with the entitled model + 80 threshold', () => {
      const c = autodelegateConfig();
      expect(c.enabled).toBe(true);
      expect(c.threshold).toBe(80);
      expect(c.budget).toBeNull();
      expect(c.invocation).toContain('gpt-5.4');
      expect(c.model).toBe('gpt-5.4');
    });
    test('overrides are honored', () => {
      const c = autodelegateConfig({ threshold: 70, budget: 5000000 });
      expect(c.threshold).toBe(70);
      expect(c.budget).toBe(5000000);
    });
  });

  describe('writeAutodelegateConfig', () => {
    test('writes _byan/_config/autodelegate.json with the config JSON', () => {
      const writes = {};
      const fs = {
        mkdirSync: () => {},
        writeFileSync: (p, data) => { writes[p] = data; },
      };
      const p = writeAutodelegateConfig({ projectRoot: '/proj', config: autodelegateConfig(), fs });
      expect(p).toBe('/proj/_byan/_config/autodelegate.json');
      const parsed = JSON.parse(writes[p]);
      expect(parsed.enabled).toBe(true);
      expect(parsed.invocation).toContain('gpt-5.4');
    });
  });

  describe('setupCodexAutodelegate', () => {
    test('linked (subscription) -> ARMS the hook and writes the config', async () => {
      delete process.env.CODEX_API_KEY;
      const writes = {};
      const fs = {
        existsSync: () => true, // auth.json present
        mkdirSync: () => {},
        writeFileSync: (p, d) => { writes[p] = d; },
      };
      const r = await setupCodexAutodelegate('/proj', { fs, home: '/h', quiet: true });
      expect(r.armed).toBe(true);
      expect(r.authPool).toBe('subscription');
      expect(writes['/proj/_byan/_config/autodelegate.json']).toBeDefined();
    });

    test('NOT linked -> stays disarmed, surfaces the device-flow instruction, writes nothing', async () => {
      delete process.env.CODEX_API_KEY;
      const writes = {};
      const fs = {
        existsSync: () => false, // no auth
        mkdirSync: () => {},
        writeFileSync: (p, d) => { writes[p] = d; },
      };
      const r = await setupCodexAutodelegate('/proj', { fs, home: '/h', quiet: true });
      expect(r.armed).toBe(false);
      expect(r.reason).toBe('codex-not-linked');
      expect(Object.keys(writes)).toHaveLength(0);
      expect(DEVICE_FLOW_INSTRUCTION).toMatch(/device-auth/);
    });
  });
});
