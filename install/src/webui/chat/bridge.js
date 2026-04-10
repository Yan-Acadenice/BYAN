/**
 * Unified Bridge interface for CLI adapters.
 * Each CLI adapter extends Bridge and implements: start(), send(), stop()
 */

const fs = require('fs');
const path = require('path');

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

    const candidates = [
      path.join(this.projectRoot, '.github', 'agents', `bmad-agent-${agentName}.md`),
      path.join(this.projectRoot, '_byan', 'agents', `${agentName}.md`),
    ];

    const bmadModules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
    for (const mod of bmadModules) {
      candidates.push(
        path.join(this.projectRoot, '_bmad', mod, 'agents', `${agentName}.md`)
      );
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        continue;
      }
    }

    return null;
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
