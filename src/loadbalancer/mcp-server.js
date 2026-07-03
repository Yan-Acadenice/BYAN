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
const { buildProviders } = require('./providers/factory');
const { SessionBridge } = require('./session-bridge');
const { GracefulDegradation } = require('./graceful-degradation');
const { SubscriptionWindow } = require('./subscription-window');
const { decideRoute } = require('./degradation-ladder');
const { EventEmitter } = require('events');

const VERSION = '0.2.0';

class LoadBalancerLive extends EventEmitter {
  /**
   * @param {object} config - loaded loadbalancer config
   * @param {object} [deps] - injectable seams for tests: { providers, bridge,
   *   degradation, windows }. Omitted in production -> built from config.
   */
  constructor(config, deps = {}) {
    super();
    this.config = config;
    this.activeProvider = config.primary;
    this.startedAt = new Date().toISOString();
    this.switchHistory = [];

    this.trackers = {};
    this.velocities = {};
    this.windows = {}; // subscription-window tracker per pool (F2 -> F3 wiring)
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

        // Subscription-window burn tracker per pool (5h + weekly). Budgets are
        // optional per-provider config; absent -> honest null proximity.
        this.windows[name] = (deps.windows && deps.windows[name]) || new SubscriptionWindow(name, {
          windowTokenBudget: prov.window_token_budget || null,
          weeklyTokenBudget: prov.weekly_token_budget || null,
        });
      }
    }

    // Real execution surface (LB-01/LB-04/LB-STATE unblocked): a provider
    // registry, a session bridge for cross-provider context transfer, and the
    // graceful-degradation queue wired to this emitter's rate_limit_change events.
    this.providers = deps.providers || buildProviders(config);
    this.bridge = deps.bridge || (deps.store ? new SessionBridge({ store: deps.store, maxTokens: config.sessions?.context_summary_max_tokens }) : null);
    this._initializedProviders = new Set();
    this.degradation = deps.degradation || new GracefulDegradation({ lb: this });

    this.metrics.attachToLoadBalancer(this);
  }

  // Order of pools to try: preferred first (if not 'auto'), then primary, then
  // configured fallback order. Deduped, enabled-only.
  _providerOrder(prefer) {
    const order = [];
    if (prefer && prefer !== 'auto') order.push(prefer);
    order.push(this.config.primary, ...(this.config.fallback_order || []));
    return [...new Set(order)].filter((n) => this.trackers[n]);
  }

  async _ensureAvailable(name) {
    const provider = this.providers[name];
    if (!provider) return false;
    if (!this._initializedProviders.has(name)) {
      try {
        await provider.initialize();
      } catch {
        return false;
      }
      this._initializedProviders.add(name);
    }
    try {
      return await provider.isAvailable();
    } catch {
      return false;
    }
  }

  _recordWindowUsage(name, response) {
    const w = this.windows[name];
    if (w && typeof w.recordFromResponse === 'function') {
      w.recordFromResponse(response, Date.now());
    }
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

  // Real send (LB-01 unblocked): walk the provider order, skip pools that are
  // rate-limited (tracker) or unauthenticated/absent (isAvailable), call the
  // first healthy one, record success/429 + window usage. When NONE can serve,
  // return a graceful degraded result (never a throw, never a stub message).
  async send(opts = {}) {
    for (const name of this._providerOrder(opts.preferProvider)) {
      const tracker = this.trackers[name];
      const provider = this.providers[name];
      if (!provider || !tracker || !tracker.canAcceptRequest()) continue;
      if (!(await this._ensureAvailable(name))) continue;

      try {
        const res = await provider.send({ prompt: opts.prompt, model: opts.model, sessionId: opts.sessionId });
        if (res && res.rateLimited) {
          this.record429(name, res.rateLimitHeaders || {});
          continue; // try the next pool
        }
        this.recordSuccess(name);
        this._recordWindowUsage(name, res);
        this.activeProvider = name;
        return { ...res, provider: name, degraded: false };
      } catch (err) {
        // Hard failure on this pool: record and try the next one.
        this.record429(name, { source: 'send_error' });
        continue;
      }
    }

    return {
      provider: this.activeProvider,
      content: null,
      degraded: true,
      rateLimited: true,
      reason: 'no provider available (all rate-limited, unauthenticated, or absent)',
    };
  }

  // Real switch (LB-04 unblocked): flip the active pool + record history, and —
  // when a session bridge is configured — transfer the portable context so the
  // target pool resumes with the summary/decisions, not a cold start. Without a
  // bridge, the switch still happens; contextTransferred is honestly false.
  async switchProvider(opts = {}) {
    const prev = this.activeProvider;
    const target = opts.target;

    let injectionPrompt = null;
    let contextTransferred = false;
    if (this.bridge && opts.sessionId && this.providers[prev]) {
      try {
        const transfer = await this.bridge.transfer(
          this.providers[prev], target, opts.sessionId, opts.reason || 'manual_switch'
        );
        injectionPrompt = transfer.injectionPrompt;
        contextTransferred = true;
      } catch {
        contextTransferred = false;
      }
    }

    this.activeProvider = target;
    const entry = {
      timestamp: new Date().toISOString(),
      from: prev,
      to: target,
      reason: opts.reason || 'manual_switch',
      contextTransferred,
    };
    this.switchHistory.push(entry);
    this.emit('switch', entry);

    return { switched: true, from: prev, to: target, reason: opts.reason, contextTransferred, injectionPrompt };
  }

  // Real context read (LB-STATE unblocked): the portable context via the bridge
  // when a store is configured; otherwise the honest current-provider view with a
  // note that no session store is wired (no fabricated "not yet integrated" stub).
  async getSessionContext(sessionId) {
    const id = sessionId || 'current';
    if (this.bridge && sessionId && this.providers[this.activeProvider]) {
      try {
        const context = await this.bridge.extract(this.providers[this.activeProvider], sessionId);
        return { sessionId, provider: this.activeProvider, context };
      } catch {
        /* fall through to the no-context view */
      }
    }
    return {
      sessionId: id,
      provider: this.activeProvider,
      context: null,
      note: 'no session store configured; context transfer is unavailable this run',
    };
  }

  // Per-pool subscription-window burn (F2), for the degradation ladder (F5) and
  // the budget surface (F6).
  getWindowStates(now = Date.now()) {
    const out = {};
    for (const [name, w] of Object.entries(this.windows)) {
      out[name] = w.getState(now);
    }
    return out;
  }

  getDegradationStatus() {
    return this.degradation ? this.degradation.getStatus() : null;
  }

  // Unified cross-pool budget view — the anti-"limite atteinte" dashboard. Per
  // pool: rolling-5h + weekly burn, proximity (null when no budget is configured
  // -> honest estimate), ETA, recommendation. Plus the current ladder rung. The
  // note states the two hard truths plainly: this is an ESTIMATE (no provider
  // exposes a machine-readable 5h quota), and load-balancing DOUBLES the ceiling,
  // it does not remove it (Codex has its own 5h window).
  getBudget(now = Date.now()) {
    const windows = this.getWindowStates(now);
    const pools = {};
    for (const [name, w] of Object.entries(windows)) {
      pools[name] = {
        windowTokens: w.windowTokens,
        windowProximity: w.windowProximity,
        weekTokens: w.weekTokens,
        weekProximity: w.weekProximity,
        etaMinutes: w.etaMinutes === Infinity ? null : w.etaMinutes,
        recommendation: w.recommendation,
        budgetConfigured: w.windowBudget != null,
      };
    }
    return {
      pools,
      rung: this.planRoute('exploration', now).rung,
      note: 'estimate from observed token usage (no provider exposes a machine-readable 5h quota); load-balancing doubles the ceiling across pools, it does not remove it',
    };
  }

  // Advisory routing plan for a task of a given nature: assembles the ladder
  // snapshot from the window tracker + pressure + circuit-breaker state and
  // returns the degradation decision (route to a pool, or queue). Side-effect
  // free (uses canAccept, does not probe provider availability), so it is safe
  // to call for planning; the actual send() still verifies isAvailable.
  planRoute(nature, now = Date.now()) {
    const quota = this.getQuota();
    const windows = this.getWindowStates(now);
    const secondaries = (this.config.fallback_order || []).filter((n) => this.trackers[n]);
    const pools = {};
    for (const name of [this.config.primary, ...secondaries]) {
      const tracker = this.trackers[name];
      if (!tracker) continue;
      pools[name] = {
        windowProximity: windows[name] ? windows[name].windowProximity : null,
        pressureRecommendation: quota[name] ? quota[name].recommendation : 'ok',
        canAccept: tracker.canAcceptRequest(),
        usable: tracker.canAcceptRequest(),
      };
    }
    return decideRoute({ primary: this.config.primary, secondaries, pools }, nature);
  }

  destroy() {
    for (const tracker of Object.values(this.trackers)) {
      tracker.destroy();
    }
    for (const ve of Object.values(this.velocities)) {
      ve.destroy();
    }
    if (this.degradation && typeof this.degradation.destroy === 'function') {
      this.degradation.destroy();
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
