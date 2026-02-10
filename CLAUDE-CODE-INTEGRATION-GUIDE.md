# Claude Code Integration Guide

## Overview

BYAN agents can now be natively integrated into Claude Desktop via MCP (Model Context Protocol) servers. This guide covers the complete setup process.

## Architecture

```
Claude Desktop
    ↓ reads config
claude_desktop_config.json
    ↓ launches
byan-mcp-server.js (stdio protocol)
    ↓ exposes
BYAN Agents (_byan/*/agents/*.md)
    ↓ available as
MCP Tools in Claude Desktop
```

## Quick Start

### 1. Install BYAN with Claude Support

```bash
npx create-byan-agent
```

When prompted:
- Select **"Claude Code"** or **"Auto (detect & install all)"**
- Yanstaller will guide you through the setup

### 2. Launch Agent Claude

```bash
@bmad-agent-claude
```

Select option **1: Create MCP server for BYAN agents**

### 3. Verify Installation

Agent Claude will:
1. Scan `_byan/` directory for agents
2. Generate `byan-mcp-server.js` 
3. Update `claude_desktop_config.json`
4. Test MCP server connectivity
5. Provide next steps

### 4. Restart Claude Desktop

Claude Desktop must be restarted to load the new MCP server.

After restart, your BYAN agents will appear as available tools in Claude.

## Manual Setup (Advanced)

### Step 1: Create MCP Server

Create `byan-mcp-server.js` in your project root:

```javascript
#!/usr/bin/env node
// MCP Server for BYAN Agents

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const BYAN_DIR = path.join(PROJECT_ROOT, '_byan');

// Scan _byan/ for agents
function getTools() {
  const tools = [];
  const modules = fs.readdirSync(BYAN_DIR);
  
  for (const mod of modules) {
    const agentsDir = path.join(BYAN_DIR, mod, 'agents');
    if (!fs.existsSync(agentsDir)) continue;
    
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    
    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const match = content.match(/^---\n(.*?)\n---/s);
      
      if (match) {
        const yaml = match[1];
        const name = yaml.match(/name:\s*['"]?(.*?)['"]?$/m)?.[1];
        const desc = yaml.match(/description:\s*['"]?(.*?)['"]?$/m)?.[1];
        
        if (name) {
          tools.push({
            name: `bmad-agent-${name}`,
            description: desc || `${name} agent`,
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'Action to perform' }
              }
            }
          });
        }
      }
    }
  }
  
  return tools;
}

// MCP Protocol: stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    
    if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: getTools() }
      };
      console.log(JSON.stringify(response));
    }
  } catch (error) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: request?.id || null,
      error: { code: -32603, message: error.message }
    };
    console.error(JSON.stringify(errorResponse));
  }
});

// Startup log (stderr only)
process.stderr.write('BYAN MCP Server started\n');
process.stderr.write(`Tools: ${getTools().length}\n`);
```

Make it executable:
```bash
chmod +x byan-mcp-server.js
```

### Step 2: Update Claude Config

Find your config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

Backup first:
```bash
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/claude_config.backup
```

Update config:
```json
{
  "mcpServers": {
    "byan": {
      "command": "node",
      "args": [
        "/absolute/path/to/your/project/byan-mcp-server.js"
      ],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

**Critical**: Use absolute paths, not relative or `~/`.

### Step 3: Test MCP Server

```bash
# Test locally
node byan-mcp-server.js

# Send test request (stdin)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node byan-mcp-server.js
```

Expected output (stdout):
```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
```

### Step 4: Restart Claude Desktop

Quit and restart Claude Desktop completely.

## Agent Claude Workflows

Once `@bmad-agent-claude` is activated, you have 6 workflows:

### 1. Create MCP Server
Generates `byan-mcp-server.js` and configures `claude_desktop_config.json`.

### 2. Validate Config
Checks JSON structure, paths, and node binary availability.

### 3. Test MCP Server
Launches server and verifies tool list response.

### 4. Update Agents
Rescans `_byan/` and refreshes registered tools.

### 5. Troubleshoot
Diagnoses common issues:
- Config file not found
- Invalid JSON syntax
- Relative paths used
- Node binary not in PATH
- Stdout pollution

### 6. Show Integration Guide
Displays this documentation.

## Troubleshooting

### MCP Server Won't Start

**Symptom**: Claude Desktop shows no BYAN tools.

**Causes**:
1. Relative paths in config → Use absolute paths
2. Node not in PATH → Use full path: `/usr/local/bin/node`
3. Syntax error in JSON → Validate with `jq`

**Fix**:
```bash
@bmad-agent-claude
# Select: 5. Troubleshoot MCP integration
```

### Tools Not Appearing

**Symptom**: MCP server starts but tools not visible in Claude.

**Causes**:
1. Stdout pollution (logs on stdout) → Move logs to stderr
2. Invalid tool schema → Check inputSchema format
3. Agent frontmatter missing → Ensure YAML frontmatter exists

**Fix**: Check Claude Desktop logs:
- **macOS**: `~/Library/Logs/Claude/`
- **Linux**: `~/.config/Claude/logs/`

### Agent Loading Fails

**Symptom**: Tool invocation returns error.

**Causes**:
1. Missing agent files in `_byan/`
2. Invalid Markdown structure
3. Frontmatter parsing error

**Fix**: Validate agent files:
```bash
@bmad-agent-claude
# Select: 2. Validate claude_desktop_config.json
```

## Platform-Specific Notes

### macOS
- Config path: `~/Library/Application Support/Claude/`
- Use `/usr/local/bin/node` if node not found
- Restart: Cmd+Q then reopen

### Linux
- Config path: `~/.config/Claude/`
- May need `~/.local/bin/node`
- Check permissions on config file

### Windows
- Config path: `%APPDATA%/Claude/`
- Use backslashes in paths: `C:\\path\\to\\project`
- Full path to node.exe: `C:\\Program Files\\nodejs\\node.exe`

## Advanced: Custom MCP Commands

You can extend `byan-mcp-server.js` to add custom MCP tools:

```javascript
// Add custom tool
if (request.method === 'tools/call') {
  const toolName = request.params.name;
  const args = request.params.arguments;
  
  if (toolName === 'bmad-agent-custom') {
    // Custom logic here
    const result = performCustomAction(args);
    
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: { output: result }
    };
    console.log(JSON.stringify(response));
  }
}
```

## Security Considerations

1. **File Access**: MCP server runs with your user permissions
2. **Command Execution**: Validate all inputs before executing
3. **Path Traversal**: Sanitize file paths
4. **Secrets**: Never log sensitive data to stdout/stderr

## Next Steps

- Explore agent workflows with `@bmad-agent-claude`
- Create custom BYAN agents with `@bmad-agent-byan`
- Check MCP protocol docs: https://modelcontextprotocol.io/

## Support

For issues:
1. Run `@bmad-agent-claude` → Option 5 (Troubleshoot)
2. Check Claude Desktop logs
3. Validate JSON config with `jq`
4. Test MCP server independently

---

**Agent Claude** is your expert guide for all Claude Code integration needs. Activate with `@bmad-agent-claude` anytime!
