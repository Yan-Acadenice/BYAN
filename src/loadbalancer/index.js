/**
 * BYAN LoadBalancer — Module Index
 *
 * Public API for the loadbalancer module.
 *
 * Usage:
 *   const { LoadBalancer, loadConfig } = require('./src/loadbalancer');
 *   const config = loadConfig(projectRoot);
 *   const lb = new LoadBalancer({ config, providers: {...} });
 */

const { LoadBalancer } = require('./loadbalancer');
const { loadConfig, getEnabledProviders, getProviderOrder } = require('./config');
const { RateLimitTracker, STATES } = require('./rate-limit-tracker');
const { SessionBridge } = require('./session-bridge');
const { SharedStateStore } = require('./state/db');
const { BaseProvider } = require('./providers/base-provider');
const { CopilotProvider } = require('./providers/copilot-provider');
const { ClaudeProvider } = require('./providers/claude-provider');
const { CopilotIntegration } = require('./native/copilot-integration');
const { ClaudeIntegration } = require('./native/claude-integration');
const { ByanApiProvider } = require('./providers/byan-api-provider');
const { HealthProbe } = require('./health-probe');
const { GracefulDegradation, PRIORITY } = require('./graceful-degradation');
const { CapabilityMatrix, DEFAULT_CAPABILITIES } = require('./capability-matrix');
const { Metrics } = require('./metrics');
const { startServer, VERSION } = require('./mcp-server');

module.exports = {
  // Core
  LoadBalancer,
  loadConfig,
  getEnabledProviders,
  getProviderOrder,

  // Rate limits
  RateLimitTracker,
  STATES,

  // Session management
  SessionBridge,
  SharedStateStore,

  // Providers
  BaseProvider,
  CopilotProvider,
  ClaudeProvider,
  ByanApiProvider,

  // Native integrations
  CopilotIntegration,
  ClaudeIntegration,

  // Robustness (Sprint 3)
  HealthProbe,
  GracefulDegradation,
  PRIORITY,
  CapabilityMatrix,
  DEFAULT_CAPABILITIES,
  Metrics,

  // MCP Server
  startServer,
  VERSION,
};
