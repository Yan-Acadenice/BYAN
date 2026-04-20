/**
 * LoadBalancer MCP Tool Definitions
 *
 * Tools exposed to both Claude Code and Copilot CLI via MCP protocol.
 * Each tool is a { name, description, inputSchema, handler } object.
 */

function createTools(lb) {
  return [
    {
      name: 'lb_status',
      description: 'Get current loadbalancer status: active provider, rate limit states, session info.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const status = lb.getStatus();
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      },
    },
    {
      name: 'lb_send',
      description: 'Send a prompt through the loadbalancer. Routes to healthiest provider automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to send' },
          session_id: { type: 'string', description: 'Optional session ID for sticky routing' },
          prefer_provider: { type: 'string', enum: ['claude', 'copilot', 'auto'], description: 'Provider preference (default: auto)' },
        },
        required: ['prompt'],
      },
      handler: async (args) => {
        const result = await lb.send({
          prompt: args.prompt,
          sessionId: args.session_id,
          preferProvider: args.prefer_provider || 'auto',
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    },
    {
      name: 'lb_switch',
      description: 'Force switch to a specific provider. Triggers context transfer via SessionBridge.',
      inputSchema: {
        type: 'object',
        properties: {
          target_provider: { type: 'string', enum: ['claude', 'copilot'], description: 'Provider to switch to' },
          session_id: { type: 'string', description: 'Session to transfer context from' },
          reason: { type: 'string', description: 'Reason for the switch' },
        },
        required: ['target_provider'],
      },
      handler: async (args) => {
        const result = await lb.switchProvider({
          target: args.target_provider,
          sessionId: args.session_id,
          reason: args.reason || 'manual_switch',
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    },
    {
      name: 'lb_get_context',
      description: 'Get the current session context in provider-agnostic format. Useful before manual switch.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session to get context for' },
        },
      },
      handler: async (args) => {
        const context = await lb.getSessionContext(args.session_id);
        return { content: [{ type: 'text', text: JSON.stringify(context, null, 2) }] };
      },
    },
    {
      name: 'lb_rate_limits',
      description: 'Get detailed rate limit state for all providers. Shows circuit breaker state, 429 counts, reset times.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const limits = lb.getRateLimitDetails();
        return { content: [{ type: 'text', text: JSON.stringify(limits, null, 2) }] };
      },
    },
    {
      name: 'lb_history',
      description: 'Get switchover history. Shows when and why provider switches occurred.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max events to return (default: 20)' },
        },
      },
      handler: async (args) => {
        const history = lb.getSwitchoverHistory(args.limit || 20);
        return { content: [{ type: 'text', text: JSON.stringify(history, null, 2) }] };
      },
    },
    {
      name: 'lb_quota',
      description: 'Get real-time rate limit pressure per provider as percentage (0-100). Shows pressure score, velocity (req/min), trend, ETA to limit, and recommendation (ok/caution/switch_now).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        if (typeof lb.getQuota !== 'function') {
          return { content: [{ type: 'text', text: 'lb_quota requires LoadBalancerLive (not stub). Upgrade mcp-server.' }] };
        }
        const quota = lb.getQuota();
        const summaries = Object.values(quota).map(q => q.summary).join('\n\n');
        return { content: [{ type: 'text', text: summaries + '\n\n' + JSON.stringify(quota, null, 2) }] };
      },
    },
  ];
}

module.exports = { createTools };
