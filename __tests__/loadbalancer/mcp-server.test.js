const path = require('path');
const { LoadBalancerLive, VERSION } = require('../../src/loadbalancer/mcp-server');
const { createTools } = require('../../src/loadbalancer/tools/index');
const { loadConfig } = require('../../src/loadbalancer/config');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('loadbalancer/mcp-server', () => {
  let config;

  beforeAll(() => {
    config = loadConfig(PROJECT_ROOT);
  });

  describe('LoadBalancerLive', () => {
    test('constructor sets active provider to config.primary', () => {
      const lb = new LoadBalancerLive(config);
      expect(lb.activeProvider).toBe(config.primary);
      expect(lb.config).toBe(config);
      expect(lb.startedAt).toBeDefined();
      lb.destroy();
    });

    test('creates RateLimitTracker per enabled provider', () => {
      const lb = new LoadBalancerLive(config);
      expect(lb.trackers.copilot).toBeDefined();
      expect(lb.trackers.claude).toBeDefined();
      expect(lb.trackers.byan_api).toBeUndefined();
      lb.destroy();
    });

    test('creates VelocityEstimator per enabled provider', () => {
      const lb = new LoadBalancerLive(config);
      expect(lb.velocities.copilot).toBeDefined();
      expect(lb.velocities.claude).toBeDefined();
      lb.destroy();
    });

    test('getStatus returns version, active provider, provider map, uptime', () => {
      const lb = new LoadBalancerLive(config);
      const status = lb.getStatus();
      expect(status.version).toBe(VERSION);
      expect(status.activeProvider).toBe(config.primary);
      expect(status.primary).toBe(config.primary);
      expect(Array.isArray(status.fallbackOrder)).toBe(true);
      expect(typeof status.providers).toBe('object');
      for (const name of Object.keys(config.providers)) {
        expect(status.providers[name]).toBeDefined();
      }
      expect(typeof status.uptime).toBe('number');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      lb.destroy();
    });

    test('getRateLimitDetails returns real tracker state per provider', () => {
      const lb = new LoadBalancerLive(config);
      const details = lb.getRateLimitDetails();
      expect(details.copilot.state).toBe('HEALTHY');
      expect(details.copilot.totalRequests).toBe(0);
      expect(details.copilot.count429InWindow).toBe(0);
      expect(details.byan_api.state).toBe('DISABLED');
      lb.destroy();
    });

    test('getSwitchoverHistory returns empty list initially', () => {
      const lb = new LoadBalancerLive(config);
      const h = lb.getSwitchoverHistory();
      expect(h.events).toEqual([]);
      expect(h.total).toBe(0);
      expect(h.limit).toBe(20);
      lb.destroy();
    });

    test('getSwitchoverHistory respects custom limit', () => {
      const lb = new LoadBalancerLive(config);
      const h = lb.getSwitchoverHistory(5);
      expect(h.limit).toBe(5);
      lb.destroy();
    });

    test('recordSuccess and record429 update tracker state', () => {
      const lb = new LoadBalancerLive(config);
      lb.recordSuccess('claude');
      lb.record429('copilot', { source: 'test' });
      expect(lb.trackers.claude.totalRequests).toBe(1);
      expect(lb.trackers.copilot.total429s).toBe(1);
      lb.destroy();
    });

    test('send delegates to an available injected provider and records window usage', async () => {
      const fake = {
        name: 'claude',
        initialize: async () => {},
        isAvailable: async () => true,
        send: async () => ({ provider: 'claude', content: 'real answer', usage: { totalTokens: 500 }, rateLimited: false }),
      };
      const lb = new LoadBalancerLive(config, { providers: { claude: fake } });
      const result = await lb.send({ prompt: 'hi' });
      expect(result.content).toBe('real answer');
      expect(result.degraded).toBe(false);
      expect(result.status).toBeUndefined(); // no more stub marker
      // window tracker got the usage
      expect(lb.getWindowStates().claude.windowTokens).toBe(500);
      lb.destroy();
    });

    test('send returns a graceful degraded result (no throw) when no provider is available', async () => {
      const unavailable = { name: 'claude', initialize: async () => {}, isAvailable: async () => false, send: async () => { throw new Error('should not be called'); } };
      const lb = new LoadBalancerLive(config, { providers: { claude: unavailable } });
      const result = await lb.send({ prompt: 'hi' });
      expect(result.degraded).toBe(true);
      expect(result.rateLimited).toBe(true);
      expect(result.content).toBeNull();
      expect(result.reason).toMatch(/no provider available/);
      lb.destroy();
    });

    test('send skips a rate-limited pool and falls through to a healthy one', async () => {
      const limited = { name: 'claude', initialize: async () => {}, isAvailable: async () => true, send: async () => ({ provider: 'claude', content: null, rateLimited: true, rateLimitHeaders: {} }) };
      const healthy = { name: 'codex', initialize: async () => {}, isAvailable: async () => true, send: async () => ({ provider: 'codex', content: 'from codex', usage: { totalTokens: 10 }, rateLimited: false }) };
      const lb = new LoadBalancerLive(config, { providers: { claude: limited, codex: healthy } });
      const result = await lb.send({ prompt: 'hi' });
      expect(result.provider).toBe('codex');
      expect(result.content).toBe('from codex');
      lb.destroy();
    });

    test('switchProvider updates activeProvider and records history (no stub message)', async () => {
      const lb = new LoadBalancerLive(config);
      const prev = lb.activeProvider;
      const target = Object.keys(config.providers).find((n) => n !== prev && config.providers[n].enabled !== false);
      const result = await lb.switchProvider({ target, reason: 'test' });
      expect(result.switched).toBe(true);
      expect(result.from).toBe(prev);
      expect(result.to).toBe(target);
      expect(result.message).toBeUndefined(); // stub message gone
      expect(result.contextTransferred).toBe(false); // no bridge configured
      expect(lb.activeProvider).toBe(target);
      expect(lb.switchHistory).toHaveLength(1);
      lb.destroy();
    });

    test('switchProvider transfers context when a bridge is injected', async () => {
      const bridge = {
        transfer: async () => ({ injectionPrompt: '--- CONTEXT TRANSFER ---', context: {} }),
      };
      const lb = new LoadBalancerLive(config, { bridge, providers: { claude: { name: 'claude' }, codex: { name: 'codex' } } });
      const result = await lb.switchProvider({ target: 'codex', sessionId: 's1', reason: 'quota' });
      expect(result.contextTransferred).toBe(true);
      expect(result.injectionPrompt).toMatch(/CONTEXT TRANSFER/);
      lb.destroy();
    });

    test('getSessionContext returns current sessionId + honest no-store note when none provided', async () => {
      const lb = new LoadBalancerLive(config);
      const ctx = await lb.getSessionContext();
      expect(ctx.sessionId).toBe('current');
      expect(ctx.provider).toBe(config.primary);
      expect(ctx.context).toBeNull();
      expect(ctx.note).toMatch(/no session store/);
      expect(ctx.message).toBeUndefined(); // no fabricated stub message
      lb.destroy();
    });

    test('getSessionContext echoes provided sessionId', async () => {
      const lb = new LoadBalancerLive(config);
      const ctx = await lb.getSessionContext('abc-123');
      expect(ctx.sessionId).toBe('abc-123');
      lb.destroy();
    });

    test('getWindowStates + getDegradationStatus are wired (no longer orphaned)', () => {
      const lb = new LoadBalancerLive(config);
      const ws = lb.getWindowStates();
      expect(ws[config.primary]).toBeDefined();
      expect(ws[config.primary].pool).toBe(config.primary);
      const deg = lb.getDegradationStatus();
      expect(deg).toHaveProperty('queueSize');
      lb.destroy();
    });

    test('planRoute (F5 ladder wired): healthy primary keeps work on the primary', () => {
      const lb = new LoadBalancerLive(config);
      const plan = lb.planRoute('mechanical');
      expect(plan.action).toBe('route');
      expect(plan.target).toBe(config.primary); // idle -> healthy -> stays primary
      expect(plan.rung).toBe('HEALTHY');
      lb.destroy();
    });

    test('planRoute honours the red line: primary-only nature never targets a secondary', () => {
      const lb = new LoadBalancerLive(config);
      const plan = lb.planRoute('verification');
      expect(plan.delegable).toBe(false);
      expect(plan.target).toBe(config.primary);
      lb.destroy();
    });

    test('getQuota returns pressure data per enabled provider', () => {
      const lb = new LoadBalancerLive(config);
      const quota = lb.getQuota();
      expect(quota.copilot.pressureScore).toBe(0);
      expect(quota.copilot.recommendation).toBe('ok');
      expect(quota.copilot.summary).toContain('copilot');
      expect(quota.byan_api.recommendation).toBe('disabled');
      lb.destroy();
    });
  });

  describe('createTools', () => {
    let lb;
    let tools;

    beforeEach(() => {
      lb = new LoadBalancerLive(config);
      tools = createTools(lb);
    });

    afterEach(() => {
      lb.destroy();
    });

    test('registers the 7 canonical tools', () => {
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'lb_get_context',
        'lb_history',
        'lb_quota',
        'lb_rate_limits',
        'lb_send',
        'lb_status',
        'lb_switch',
      ]);
    });

    test('every tool has name, description, inputSchema, handler', () => {
      for (const t of tools) {
        expect(typeof t.name).toBe('string');
        expect(typeof t.description).toBe('string');
        expect(t.description.length).toBeGreaterThan(10);
        expect(typeof t.inputSchema).toBe('object');
        expect(t.inputSchema.type).toBe('object');
        expect(typeof t.handler).toBe('function');
      }
    });

    test('lb_send requires prompt argument', () => {
      const tool = tools.find((t) => t.name === 'lb_send');
      expect(tool.inputSchema.required).toContain('prompt');
    });

    test('lb_switch requires target_provider and enums it', () => {
      const tool = tools.find((t) => t.name === 'lb_switch');
      expect(tool.inputSchema.required).toContain('target_provider');
      expect(tool.inputSchema.properties.target_provider.enum).toEqual(['claude', 'copilot', 'codex']);
    });

    test('lb_status handler returns MCP text content with valid JSON', async () => {
      const tool = tools.find((t) => t.name === 'lb_status');
      const r = await tool.handler({});
      expect(r.content).toHaveLength(1);
      expect(r.content[0].type).toBe('text');
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.version).toBe(VERSION);
    });

    test('lb_send handler forwards arguments to lb.send with defaulted prefer_provider', async () => {
      let captured = null;
      lb.send = async (opts) => {
        captured = opts;
        return { ok: true };
      };
      const tool = tools.find((t) => t.name === 'lb_send');
      await tool.handler({ prompt: 'hi', session_id: 's1' });
      expect(captured).toEqual({ prompt: 'hi', sessionId: 's1', preferProvider: 'auto' });
    });

    test('lb_switch handler forwards target_provider as target and defaults reason', async () => {
      let captured = null;
      lb.switchProvider = async (opts) => {
        captured = opts;
        return { ok: true };
      };
      const tool = tools.find((t) => t.name === 'lb_switch');
      await tool.handler({ target_provider: 'copilot' });
      expect(captured.target).toBe('copilot');
      expect(captured.reason).toBe('manual_switch');
    });

    test('lb_history handler defaults limit to 20', async () => {
      let captured = null;
      lb.getSwitchoverHistory = (limit) => {
        captured = limit;
        return { events: [], total: 0, limit };
      };
      const tool = tools.find((t) => t.name === 'lb_history');
      await tool.handler({});
      expect(captured).toBe(20);
    });

    test('lb_quota handler returns pressure summaries', async () => {
      const tool = tools.find((t) => t.name === 'lb_quota');
      const r = await tool.handler({});
      expect(r.content).toHaveLength(1);
      expect(r.content[0].text).toContain('copilot');
      expect(r.content[0].text).toContain('/100');
    });
  });
});
