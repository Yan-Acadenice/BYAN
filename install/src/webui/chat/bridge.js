/**
 * Unified Bridge interface for CLI adapters.
 * Each CLI adapter extends Bridge and implements: start(), send(), stop()
 */

const fs = require('fs');
const path = require('path');
const layoutResolver = require('../../../../src/byan-v2/lib/layout-resolver');

class Bridge {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.agent = options.agent || null;
    this.model = options.model || null;
    this.onChunk = options.onChunk || (() => {});
    this.onToolUse = options.onToolUse || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.process = null;
    this.active = false;
  }

  async start() { throw new Error('Not implemented'); }
  async send(message) { throw new Error('Not implemented'); }
  async stop() { throw new Error('Not implemented'); }

  resolveAgent(agentName) {
    if (!agentName) return null;

    // Copilot stub takes priority (it is the explicit entry point when present).
    const githubStub = path.join(this.projectRoot, '.github', 'agents', `bmad-agent-${agentName}.md`);
    try {
      if (fs.existsSync(githubStub)) return githubStub;
    } catch { /* ignore */ }

    // Then the layout resolver: Gen3 _byan/agent/<name>/ first, Gen2 flat +
    // per-module, Gen1 _bmad/ fallback.
    const hit = layoutResolver.resolveAgent(agentName, { projectRoot: this.projectRoot });
    return hit ? hit.path : null;
  }

  _killProcess(proc, timeoutMs = 5000) {
    if (!proc || proc.exitCode !== null) return Promise.resolve();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        resolve();
      }, timeoutMs);

      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      try { proc.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

function createBridge(cliName, options) {
  const name = (cliName || '').toLowerCase().trim();

  switch (name) {
    case 'claude': {
      const ClaudeAdapter = require('./claude-adapter');
      return new ClaudeAdapter(options);
    }
    case 'copilot': {
      const CopilotAdapter = require('./copilot-adapter');
      return new CopilotAdapter(options);
    }
    case 'codex': {
      const CodexAdapter = require('./codex-adapter');
      return new CodexAdapter(options);
    }
    default:
      throw new Error(`Unknown CLI adapter: ${cliName}`);
  }
}

module.exports = { Bridge, createBridge };
