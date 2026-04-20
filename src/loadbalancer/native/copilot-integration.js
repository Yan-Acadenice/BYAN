/**
 * Copilot Native Integration
 *
 * Wires LoadBalancer into GitHub Copilot CLI's agent system.
 * Ensures Copilot executes BYAN logic natively via its own SDK,
 * with rate limit hooks feeding the LoadBalancer tracker.
 */

const { attachCopilotHooks, wrapCopilotSend } = require('../hooks/copilot-hooks');

class CopilotIntegration {
  /**
   * @param {import('../loadbalancer').LoadBalancer} lb
   */
  constructor(lb) {
    this.lb = lb;
    this.tracker = lb.getTracker('copilot');
  }

  /**
   * Enhance a Copilot SDK session with rate limit tracking.
   * @param {object} session - Copilot SDK session object
   * @returns {object} Enhanced session
   */
  enhanceSession(session) {
    if (!this.tracker) return session;
    attachCopilotHooks(session, this.tracker);
    return session;
  }

  /**
   * Wrap a sendAndWait function with rate limit tracking.
   * @param {Function} sendFn
   * @returns {Function}
   */
  wrapSend(sendFn) {
    if (!this.tracker) return sendFn;
    return wrapCopilotSend(sendFn, this.tracker);
  }

  /**
   * Generate .mcp.json entry for connecting Copilot to the LB MCP server.
   * @returns {object} MCP configuration fragment
   */
  getMcpConfig() {
    const mcpConfig = this.lb.config.mcp_server || {};
    return {
      'byan-loadbalancer': {
        command: 'node',
        args: ['src/loadbalancer/mcp-server.js'],
        env: {
          BYAN_PROJECT_ROOT: '{project-root}',
        },
      },
    };
  }
}

module.exports = { CopilotIntegration };
