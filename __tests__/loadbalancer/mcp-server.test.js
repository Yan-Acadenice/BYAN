const path = require('path');
const { LoadBalancerStub, VERSION } = require('../../src/loadbalancer/mcp-server');
const { createTools } = require('../../src/loadbalancer/tools/index');
const { loadConfig } = require('../../src/loadbalancer/config');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('loadbalancer/mcp-server', () => {
  let config;

  beforeAll(() => {
    config = loadConfig(PROJECT_ROOT);
  });

  describe('LoadBalancerStub', () => {
    test('constructor sets active provider to config.primary', () => {
      const lb = new LoadBalancerStub(config);
      expect(lb.activeProvider).toBe(config.primary);
      expect(lb.config).toBe(config);
      expect(lb.startedAt).toBeDefined();
    });

    test('getStatus returns version, active provider, provider map, uptime', () => {
      const lb = new LoadBalancerStub(config);
      const status = lb.getStatus();
      expect(status.version).toBe(VERSION);
      expect(status.activeProvider).toBe(config.primary);
      expect(status.primary).toBe(config.primary);
      expect(Array.isArray(status.fallbackOrder)).toBe(true);
      expect(typeof status.providers).toBe('object');
      for (const name of Object.keys(config.providers)) {
        expect(status.providers[name]).toBeDefined();
        expect(status.providers[name].state).toBe('HEALTHY');
      }
      expect(typeof status.uptime).toBe('number');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    test('getRateLimitDetails flags LB-02 not-yet-integrated', () => {
      const lb = new LoadBalancerStub(config);
      const details = lb.getRateLimitDetails();
      for (const name of Object.keys(config.providers)) {
        expect(details[name].state).toBe('HEALTHY');
        expect(details[name].count429).toBe(0);
        expect(details[name].message).toMatch(/LB-02/);
      }
    });

    test('getSwitchoverHistory returns empty list with LB-STATE marker', () => {
      const lb = new LoadBalancerStub(config);
      const h = lb.getSwitchoverHistory();
      expect(h.events).toEqual([]);
      expect(h.total).toBe(0);
      expect(h.limit).toBe(20);
      expect(h.message).toMatch(/LB-STATE/);
    });

    test('getSwitchoverHistory respects custom limit', () => {
      const lb = new LoadBalancerStub(config);
      const h = lb.getSwitchoverHistory(5);
      expect(h.limit).toBe(5);
    });

    test('send returns stub response with active provider and truncated prompt', async () => {
      const lb = new LoadBalancerStub(config);
      const result = await lb.send({ prompt: 'x'.repeat(200) });
      expect(result.provider).toBe(config.primary);
      expect(result.status).toBe('stub');
      expect(result.message).toMatch(/LB-01/);
      expect(result.prompt.length).toBeLessThanOrEqual(100);
    });

    test('switchProvider updates activeProvider and returns from/to', async () => {
      const lb = new LoadBalancerStub(config);
      const prev = lb.activeProvider;
      const target = Object.keys(config.providers).find((n) => n !== prev);
      const result = await lb.switchProvider({ target, reason: 'test' });
      expect(result.switched).toBe(true);
      expect(result.from).toBe(prev);
      expect(result.to).toBe(target);
      expect(result.reason).toBe('test');
      expect(result.contextTransferred).toBe(false);
      expect(result.message).toMatch(/SessionBridge/);
      expect(lb.activeProvider).toBe(target);
    });

    test('getSessionContext returns current sessionId when none provided', async () => {
      const lb = new LoadBalancerStub(config);
      const ctx = await lb.getSessionContext();
      expect(ctx.sessionId).toBe('current');
      expect(ctx.provider).toBe(config.primary);
      expect(ctx.context).toBeNull();
      expect(ctx.message).toMatch(/LB-STATE/);
    });

    test('getSessionContext echoes provided sessionId', async () => {
      const lb = new LoadBalancerStub(config);
      const ctx = await lb.getSessionContext('abc-123');
      expect(ctx.sessionId).toBe('abc-123');
    });
  });

  describe('createTools', () => {
    let lb;
    let tools;

    beforeEach(() => {
      lb = new LoadBalancerStub(config);
      tools = createTools(lb);
    });

    test('registers the 6 canonical tools', () => {
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'lb_get_context',
        'lb_history',
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
      expect(tool.inputSchema.properties.target_provider.enum).toEqual(['claude', 'copilot']);
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

    test('lb_history handler passes explicit limit', async () => {
      let captured = null;
      lb.getSwitchoverHistory = (limit) => {
        captured = limit;
        return { events: [], total: 0, limit };
      };
      const tool = tools.find((t) => t.name === 'lb_history');
      await tool.handler({ limit: 5 });
      expect(captured).toBe(5);
    });
  });
});
