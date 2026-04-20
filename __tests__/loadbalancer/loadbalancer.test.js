/**
 * LoadBalancer Core Tests
 */

const { LoadBalancer } = require('../../src/loadbalancer/loadbalancer');
const { STATES } = require('../../src/loadbalancer/rate-limit-tracker');

function createMockProvider(name, { rateLimited = false, latency = 50 } = {}) {
  return {
    name,
    config: { enabled: true },
    initialized: true,
    async send(opts) {
      await new Promise(r => setTimeout(r, latency));
      if (rateLimited) {
        return {
          provider: name,
          content: null,
          model: 'mock',
          rateLimitHeaders: { 'retry-after': '60' },
          latencyMs: latency,
          rateLimited: true,
        };
      }
      return {
        provider: name,
        content: `Response from ${name}: ${opts.prompt}`,
        model: 'mock',
        rateLimitHeaders: null,
        latencyMs: latency,
        rateLimited: false,
      };
    },
    async isAvailable() { return true; },
    getCapabilities() { return { streaming: true, tools: true, multiTurn: true, maxContextTokens: 100000 }; },
  };
}

function createTestConfig(overrides = {}) {
  return {
    primary: 'claude',
    fallback_order: ['copilot'],
    providers: {
      claude: { enabled: true, models: { agent: 'mock-claude' } },
      copilot: { enabled: true, models: { agent: 'mock-copilot' } },
    },
    rate_limits: {
      window_ms: 1000,
      throttle_threshold: 2,
      block_threshold: 3,
      recovery_probe_interval_ms: 100,
      half_open_max_requests: 2,
    },
    sessions: {
      sticky_timeout_ms: 5000,
      auto_switch_on_rate_limit: true,
    },
    ...overrides,
  };
}

describe('LoadBalancer', () => {
  let lb;

  afterEach(() => {
    if (lb) lb.destroy();
  });

  describe('basic routing', () => {
    test('routes to primary provider by default', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const result = await lb.send({ prompt: 'hello' });
      expect(result.provider).toBe('claude');
      expect(result.content).toContain('claude');
    });

    test('routes to preferred provider when specified', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const result = await lb.send({ prompt: 'hello', preferProvider: 'copilot' });
      expect(result.provider).toBe('copilot');
    });
  });

  describe('failover', () => {
    test('fails over to copilot when claude is rate-limited', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude', { rateLimited: true }),
          copilot: createMockProvider('copilot'),
        },
      });

      const result = await lb.send({ prompt: 'hello' });
      expect(result.provider).toBe('copilot');
    });

    test('returns error when all providers are rate-limited', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const claudeTracker = lb.getTracker('claude');
      const copilotTracker = lb.getTracker('copilot');
      claudeTracker.record429();
      claudeTracker.record429();
      claudeTracker.record429();
      copilotTracker.record429();
      copilotTracker.record429();
      copilotTracker.record429();

      expect(claudeTracker.state).toBe(STATES.BLOCKED);
      expect(copilotTracker.state).toBe(STATES.BLOCKED);

      const result = await lb.send({ prompt: 'hello' });
      expect(result.rateLimited).toBe(true);
      expect(result.error).toBeTruthy();
    });
  });

  describe('auto failover on state change', () => {
    test('emits auto_failover when primary gets BLOCKED', () => {
      const failovers = [];

      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      lb.on('auto_failover', e => failovers.push(e));

      const claudeTracker = lb.getTracker('claude');
      claudeTracker.record429();
      claudeTracker.record429();
      claudeTracker.record429();

      expect(failovers).toHaveLength(1);
      expect(failovers[0].from).toBe('claude');
      expect(failovers[0].to).toBe('copilot');
      expect(lb.activeProvider).toBe('copilot');
    });
  });

  describe('sticky sessions', () => {
    test('routes to same provider for same sessionId', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const r1 = await lb.send({ prompt: 'hello', sessionId: 'sess-1' });
      expect(r1.provider).toBe('claude');

      lb.activeProvider = 'copilot';

      const r2 = await lb.send({ prompt: 'follow up', sessionId: 'sess-1' });
      expect(r2.provider).toBe('claude');
    });
  });

  describe('manual switch', () => {
    test('switches active provider', async () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const result = await lb.switchProvider({ target: 'copilot', reason: 'test' });
      expect(result.switched).toBe(true);
      expect(result.from).toBe('claude');
      expect(result.to).toBe('copilot');
      expect(lb.activeProvider).toBe('copilot');
    });
  });

  describe('getStatus', () => {
    test('returns complete status object', () => {
      lb = new LoadBalancer({
        config: createTestConfig(),
        providers: {
          claude: createMockProvider('claude'),
          copilot: createMockProvider('copilot'),
        },
      });

      const status = lb.getStatus();
      expect(status.activeProvider).toBe('claude');
      expect(status.primary).toBe('claude');
      expect(status.providers.claude.state).toBe('HEALTHY');
      expect(status.providers.copilot.state).toBe('HEALTHY');
    });
  });
});
