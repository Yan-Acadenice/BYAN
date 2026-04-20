/**
 * BYAN LoadBalancer — MCP Server
 *
 * Standalone MCP server exposing loadbalancer tools to Claude Code and
 * Copilot CLI. HTTP transport for persistence across sessions.
 *
 * Start: node src/loadbalancer/mcp-server.js
 * Connect: add to .mcp.json or claude settings
 *
 * Architecture:
 *   CLI (Claude/Copilot) --MCP--> this server --SDK--> providers
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { loadConfig } = require('./config');
const { createTools } = require('./tools/index');
const { RateLimitTracker } = require('./rate-limit-tracker');
const { Metrics } = require('./metrics');
const { VelocityEstimator } = require('./velocity-estimator');
const { calculatePressure, formatPressureSummary } = require('./pressure-score');
const { EventEmitter } = require('events');

const VERSION = '0.2.0';

class LoadBalancerLive extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.activeProvider = config.primary;
    this.startedAt = new Date().toISOString();
    this.switchHistory = [];

    this.trackers = {};
    this.velocities = {};
    this.metrics = new Metrics();

    const rlOpts = config.rate_limits || {};
    const quotaOpts = config.quota || {};
    this.preemptiveThreshold = quotaOpts.preemptive_threshold || 75;
    this.preemptiveEnabled = quotaOpts.preemptive_enabled !== false;

    for (const [name, prov] of Object.entries(config.providers)) {
      if (prov.enabled !== false) {
        this.trackers[name] = new RateLimitTracker(name, rlOpts);
        this.trackers[name].on('state_change', (evt) => {
          this.emit('rate_limit_change', evt);
        });

        this.velocities[name] = new VelocityEstimator(name, {
          windowMs: quotaOpts.velocity_window_ms || 120000,
          warningThresholdPerMin: quotaOpts.warning_threshold_per_min || 10,
          maxRequestsBeforeLimit: quotaOpts.max_requests_before_limit || 30,
        });
        this.velocities[name].on('threshold_warning', (evt) => {
          this.emit('velocity_warning', evt);
        });
      }
    }

    this.metrics.attachToLoadBalancer(this);
  }

  getTracker(provider) {
    return this.trackers[provider] || null;
  }

  getVelocity(provider) {
    return this.velocities[provider] || null;
  }

  getStatus() {
    const providers = {};
    for (const [name, prov] of Object.entries(this.config.providers)) {
      const tracker = this.trackers[name];
      providers[name] = {
        enabled: prov.enabled !== false,
        state: tracker ? tracker.state : 'DISABLED',
      };
    }

    return {
      version: VERSION,
      activeProvider: this.activeProvider,
      primary: this.config.primary,
      fallbackOrder: this.config.fallback_order,
      providers,
      uptime: Date.now() - new Date(this.startedAt).getTime(),
    };
  }

  getRateLimitDetails() {
    const result = {};
    for (const [name] of Object.entries(this.config.providers)) {
      const tracker = this.trackers[name];
      if (tracker) {
        const s = tracker.getState();
        result[name] = {
          state: s.state,
          count429InWindow: s.count429InWindow,
          totalRequests: s.totalRequests,
          total429s: s.total429s,
          windowMs: s.windowMs,
          canAcceptRequest: s.canAcceptRequest,
          lastStateChange: s.lastStateChange,
        };
      } else {
        result[name] = { state: 'DISABLED', message: 'Provider not enabled' };
      }
    }
    return result;
  }

  getSwitchoverHistory(limit = 20) {
    const events = this.switchHistory.slice(-limit);
    return { events, total: this.switchHistory.length, limit };
  }

  recordSuccess(provider) {
    const tracker = this.trackers[provider];
    if (tracker) tracker.recordSuccess();
    const ve = this.velocities[provider];
    if (ve) ve.recordRequest();
    this._checkPreemptive(provider);
  }

  record429(provider, meta) {
    const tracker = this.trackers[provider];
    if (tracker) tracker.record429(meta);
    const ve = this.velocities[provider];
    if (ve) ve.recordRequest();
    this._checkPreemptive(provider);
  }

  _checkPreemptive(provider) {
    if (!this.preemptiveEnabled) return;
    if (provider !== this.activeProvider) return;

    const tracker = this.trackers[provider];
    const ve = this.velocities[provider];
    if (!tracker || !ve) return;

    const trackerState = tracker.getState();
    const velocitySnap = ve.getSnapshot();
    const pressure = calculatePressure(trackerState, velocitySnap, {
      blockThreshold: this.config.rate_limits?.block_threshold,
    });

    if (pressure.score >= this.preemptiveThreshold) {
      const fallback = this._findBestFallback(provider);
      this.emit('preemptive_switch', {
        provider,
        pressureScore: pressure.score,
        recommendation: pressure.recommendation,
        suggestedTarget: fallback,
        timestamp: new Date().toISOString(),
      });
    }
  }

  _findBestFallback(excludeProvider) {
    const order = [this.config.primary, ...(this.config.fallback_order || [])];
    for (const name of order) {
      if (name === excludeProvider) continue;
      const tracker = this.trackers[name];
      if (tracker && tracker.canAcceptRequest()) return name;
    }
    return null;
  }

  getQuota() {
    const result = {};
    for (const [name] of Object.entries(this.config.providers)) {
      const tracker = this.trackers[name];
      const ve = this.velocities[name];
      if (tracker && ve) {
        const trackerState = tracker.getState();
        const velocitySnap = ve.getSnapshot();
        const pressure = calculatePressure(trackerState, velocitySnap, {
          blockThreshold: this.config.rate_limits?.block_threshold,
        });
        result[name] = {
          pressureScore: pressure.score,
          recommendation: pressure.recommendation,
          components: pressure.components,
          velocity: velocitySnap.velocity,
          trend: velocitySnap.trend,
          etaMinutes: velocitySnap.etaMinutes === Infinity ? null : velocitySnap.etaMinutes,
          circuitBreakerState: trackerState.state,
          summary: formatPressureSummary(name, pressure, velocitySnap),
        };
      } else {
        result[name] = { pressureScore: null, recommendation: 'disabled', summary: `${name}: DISABLED` };
      }
    }
    return result;
  }

  async send(opts) {
    return {
      provider: this.activeProvider,
      status: 'stub',
      message: 'ProviderAdapter not yet integrated (LB-01). Use lb_status/lb_quota for monitoring.',
      prompt: opts.prompt?.substring(0, 100),
    };
  }

  async switchProvider(opts) {
    const prev = this.activeProvider;
    this.activeProvider = opts.target;
    const entry = {
      timestamp: new Date().toISOString(),
      from: prev,
      to: opts.target,
      reason: opts.reason || 'manual_switch',
    };
    this.switchHistory.push(entry);
    this.emit('switch', entry);
    return {
      switched: true,
      from: prev,
      to: opts.target,
      reason: opts.reason,
      contextTransferred: false,
      message: 'SessionBridge not yet integrated (LB-04). No context transfer.',
    };
  }

  async getSessionContext(sessionId) {
    return {
      sessionId: sessionId || 'current',
      provider: this.activeProvider,
      context: null,
      message: 'SharedStateStore not yet integrated (LB-STATE).',
    };
  }

  destroy() {
    for (const tracker of Object.values(this.trackers)) {
      tracker.destroy();
    }
    for (const ve of Object.values(this.velocities)) {
      ve.destroy();
    }
    this.removeAllListeners();
  }
}

async function startServer(projectRoot) {
  const resolvedRoot = projectRoot || process.env.BYAN_PROJECT_ROOT || process.cwd();
  const config = loadConfig(resolvedRoot);
  const lb = new LoadBalancerLive(config);
  const tools = createTools(lb);

  const server = new Server(
    { name: 'byan-loadbalancer', version: VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      return await tool.handler(request.params.arguments || {});
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return { server, lb, config };
}

if (require.main === module) {
  startServer().catch(err => {
    process.stderr.write(`LoadBalancer MCP server failed to start: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { startServer, LoadBalancerLive, VERSION };
