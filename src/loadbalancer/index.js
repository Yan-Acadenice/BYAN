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

  // Native integrations
  CopilotIntegration,
  ClaudeIntegration,

  // MCP Server
  startServer,
  VERSION,
};
