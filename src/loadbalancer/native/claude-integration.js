/**
 * Claude Native Integration
 *
 * Wires LoadBalancer into Claude Code's agent system.
 * Ensures Claude executes BYAN logic natively via Claude Agent SDK,
 * with hooks feeding the LoadBalancer tracker.
 */

const { createClaudeHooks } = require('../hooks/claude-hooks');

class ClaudeIntegration {
  /**
   * @param {import('../loadbalancer').LoadBalancer} lb
   */
  constructor(lb) {
    this.lb = lb;
    this.tracker = lb.getTracker('claude');
  }

  /**
   * Get Claude Agent SDK hooks wired to the rate limit tracker.
   * @returns {object} Hook configuration for Claude Agent SDK
   */
  getHooks() {
    if (!this.tracker) return {};
    return createClaudeHooks(this.tracker);
  }

  /**
   * Generate .mcp.json entry for connecting Claude to the LB MCP server.
   * @returns {object} MCP configuration fragment
   */
  getMcpConfig() {
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

  /**
   * Generate CLAUDE.md directive for LoadBalancer awareness.
   * @returns {string} Markdown directive
   */
  getClaudeMdDirective() {
    return [
      '## LoadBalancer Integration',
      '',
      'This project uses BYAN LoadBalancer for automatic failover between',
      'GitHub Copilot CLI and Claude Code. The MCP tool `byan-loadbalancer`',
      'provides: lb_status, lb_send, lb_switch, lb_get_context, lb_rate_limits,',
      'lb_history.',
      '',
      'When rate-limited, the LoadBalancer automatically switches to the',
      'alternate provider with context transfer.',
    ].join('\n');
  }
}

module.exports = { ClaudeIntegration };
