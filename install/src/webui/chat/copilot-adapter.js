/**
 * GitHub Copilot CLI bridge adapter.
 * Copilot CLI is TUI-based; this uses one-shot spawns per message.
 * Full multi-turn PTY support deferred to P2.
 */

const { spawn } = require('child_process');
const { Bridge } = require('./bridge');

class CopilotAdapter extends Bridge {
  async start() {
    this.active = true;
  }

  async send(message) {
    if (!this.active) return;

    const args = [];

    if (this.agent) {
      const agentPath = this.resolveAgent(this.agent);
      if (agentPath) {
        args.push(`--agent=${agentPath}`);
      }
    }

    args.push('--prompt', message);

    this.process = spawn('copilot', args, {
      cwd: this.projectRoot,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';

    this.process.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      this.onChunk(chunk);
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (!text) return;
      // Copilot dumps usage stats to stderr — not errors
      if (/^(Total usage|API time|Total session|Total code|Breakdown by|claude-|gpt-|o[1-4]|Est\.|Premium request)/m.test(text)) return;
      this.onError(new Error(`copilot stderr: ${text}`));
    });

    this.process.on('error', (err) => {
      this.onError(err);
    });

    this.process.on('exit', (code) => {
      this.process = null;
      this.onComplete({ code, output });
    });
  }

  async stop() {
    this.active = false;
    if (this.process) {
      await this._killProcess(this.process);
      this.process = null;
    }
  }
}

module.exports = CopilotAdapter;
