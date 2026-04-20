/**
 * CapabilityMatrix Tests
 */

const { CapabilityMatrix, DEFAULT_CAPABILITIES } = require('../../src/loadbalancer/capability-matrix');

describe('CapabilityMatrix', () => {
  let matrix;

  beforeEach(() => {
    matrix = new CapabilityMatrix();
  });

  describe('supports', () => {
    test('claude supports bash', () => {
      expect(matrix.supports('claude', 'bash')).toBe(true);
    });

    test('claude does not support web_search', () => {
      expect(matrix.supports('claude', 'web_search')).toBe(false);
    });

    test('copilot supports web_search', () => {
      expect(matrix.supports('copilot', 'web_search')).toBe(true);
    });

    test('byan_api does not support bash', () => {
      expect(matrix.supports('byan_api', 'bash')).toBe(false);
    });

    test('unknown provider returns false', () => {
      expect(matrix.supports('nonexistent', 'bash')).toBe(false);
    });
  });

  describe('findProviders', () => {
    test('finds providers that support bash', () => {
      const providers = matrix.findProviders('bash');
      expect(providers).toContain('claude');
      expect(providers).toContain('copilot');
      expect(providers).not.toContain('byan_api');
    });

    test('finds providers that support multi_turn', () => {
      const providers = matrix.findProviders('multi_turn');
      expect(providers).toContain('claude');
      expect(providers).toContain('copilot');
      expect(providers).toContain('byan_api');
    });
  });

  describe('findBestProvider', () => {
    test('finds provider with all required capabilities', () => {
      const result = matrix.findBestProvider(['bash', 'web_search']);
      expect(result.provider).toBe('copilot');
      expect(result.missing).toHaveLength(0);
    });

    test('respects prefer order', () => {
      const result = matrix.findBestProvider(['bash', 'git'], ['claude', 'copilot']);
      expect(result.provider).toBe('claude');
    });

    test('returns best partial match when no full match', () => {
      const result = matrix.findBestProvider(['bash', 'web_search', 'streaming'], ['claude']);
      expect(result.provider).toBe('claude');
      expect(result.missing).toContain('web_search');
    });
  });

  describe('compare', () => {
    test('returns all capabilities and providers', () => {
      const comparison = matrix.compare();
      expect(comparison.capabilities).toContain('bash');
      expect(comparison.capabilities).toContain('web_search');
      expect(comparison.providers.claude).toBeDefined();
      expect(comparison.providers.copilot).toBeDefined();
    });
  });

  describe('overrides', () => {
    test('applies per-provider overrides', () => {
      const custom = new CapabilityMatrix({
        claude: { web_search: true },
      });
      expect(custom.supports('claude', 'web_search')).toBe(true);
    });

    test('adds new providers via overrides', () => {
      const custom = new CapabilityMatrix({
        custom_llm: { bash: true, streaming: true },
      });
      expect(custom.supports('custom_llm', 'bash')).toBe(true);
    });
  });
});
