/**
 * Config Loader Tests
 */

const path = require('path');
const { loadConfig, validateConfig, getEnabledProviders, getProviderOrder, deepMerge } = require('../../src/loadbalancer/config');

describe('LoadBalancer Config', () => {
  describe('loadConfig', () => {
    test('loads defaults from bundled YAML', () => {
      const config = loadConfig('/tmp/nonexistent-project');
      expect(config.primary).toBe('claude');
      expect(config.providers.copilot.enabled).toBe(true);
      expect(config.providers.claude.enabled).toBe(true);
      expect(config.mcp_server.port).toBe(3838);
    });

    test('attaches _resolved metadata', () => {
      const config = loadConfig('/tmp/test');
      expect(config._resolved.projectRoot).toBe('/tmp/test');
      expect(config._resolved.configSources).toContain(
        path.join(__dirname, '../../src/loadbalancer/loadbalancer.default.yaml')
      );
    });
  });

  describe('validateConfig', () => {
    test('passes valid config', () => {
      const config = loadConfig('/tmp/test');
      const errors = validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    test('rejects missing providers', () => {
      const errors = validateConfig({ primary: 'claude', fallback_order: [] });
      expect(errors.some(e => e.includes('providers'))).toBe(true);
    });

    test('rejects missing primary', () => {
      const errors = validateConfig({
        providers: { claude: { enabled: true } },
        fallback_order: [],
      });
      expect(errors.some(e => e.includes('primary'))).toBe(true);
    });

    test('rejects primary not in providers', () => {
      const errors = validateConfig({
        providers: { claude: { enabled: true } },
        primary: 'nonexistent',
        fallback_order: [],
      });
      expect(errors.some(e => e.includes('nonexistent'))).toBe(true);
    });
  });

  describe('getEnabledProviders', () => {
    test('filters disabled providers', () => {
      const config = loadConfig('/tmp/test');
      const enabled = getEnabledProviders(config);
      const names = enabled.map(p => p.name);
      expect(names).toContain('copilot');
      expect(names).toContain('claude');
      expect(names).not.toContain('byan_api');
    });
  });

  describe('getProviderOrder', () => {
    test('returns primary first, then fallbacks', () => {
      const config = loadConfig('/tmp/test');
      const order = getProviderOrder(config);
      expect(order[0]).toBe('claude');
      expect(order).toContain('copilot');
    });

    test('skips disabled providers', () => {
      const config = loadConfig('/tmp/test');
      const order = getProviderOrder(config);
      expect(order).not.toContain('byan_api');
    });
  });

  describe('deepMerge', () => {
    test('merges nested objects', () => {
      const base = { a: { b: 1, c: 2 }, d: 3 };
      const override = { a: { c: 99 }, e: 4 };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: { b: 1, c: 99 }, d: 3, e: 4 });
    });

    test('arrays are replaced, not merged', () => {
      const base = { arr: [1, 2] };
      const override = { arr: [3] };
      expect(deepMerge(base, override)).toEqual({ arr: [3] });
    });
  });

  describe('env overrides', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    test('BYAN_LB_PRIMARY overrides primary', () => {
      process.env = { ...originalEnv, BYAN_LB_PRIMARY: 'copilot' };
      const config = loadConfig('/tmp/test');
      expect(config.primary).toBe('copilot');
    });

    test('BYAN_LB_PORT overrides mcp_server.port', () => {
      process.env = { ...originalEnv, BYAN_LB_PORT: '9999' };
      const config = loadConfig('/tmp/test');
      expect(config.mcp_server.port).toBe(9999);
    });
  });
});
