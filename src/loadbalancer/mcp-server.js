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

const VERSION = '0.1.0';

class LoadBalancerStub {
  constructor(config) {
    this.config = config;
    this.activeProvider = config.primary;
    this.startedAt = new Date().toISOString();
  }

  getStatus() {
    return {
      version: VERSION,
      activeProvider: this.activeProvider,
      primary: this.config.primary,
      fallbackOrder: this.config.fallback_order,
      providers: Object.entries(this.config.providers).reduce((acc, [name, p]) => {
        acc[name] = {
          enabled: p.enabled !== false,
          state: 'HEALTHY',
        };
        return acc;
      }, {}),
      uptime: Date.now() - new Date(this.startedAt).getTime(),
    };
  }

  getRateLimitDetails() {
    return Object.entries(this.config.providers).reduce((acc, [name]) => {
      acc[name] = {
        state: 'HEALTHY',
        count429: 0,
        windowResetAt: null,
        message: 'RateLimitTracker not yet integrated (LB-02)',
      };
      return acc;
    }, {});
  }

  getSwitchoverHistory(limit = 20) {
    return { events: [], total: 0, limit, message: 'SharedStateStore not yet integrated (LB-STATE)' };
  }

  async send(opts) {
    return {
      provider: this.activeProvider,
      status: 'stub',
      message: 'ProviderAdapter not yet integrated (LB-01). Routing logic pending.',
      prompt: opts.prompt?.substring(0, 100),
    };
  }

  async switchProvider(opts) {
    const prev = this.activeProvider;
    this.activeProvider = opts.target;
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
}

async function startServer(projectRoot) {
  const resolvedRoot = projectRoot || process.env.BYAN_PROJECT_ROOT || process.cwd();
  const config = loadConfig(resolvedRoot);
  const lb = new LoadBalancerStub(config);
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

module.exports = { startServer, LoadBalancerStub, VERSION };
