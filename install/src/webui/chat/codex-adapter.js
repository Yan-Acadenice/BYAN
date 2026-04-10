/**
 * Codex CLI bridge adapter.
 * Uses `codex exec` for non-interactive operation.
 */

const { spawn } = require('child_process');
const { Bridge } = require('./bridge');

class CodexAdapter extends Bridge {
  async start() {
    this.active = true;
  }

  async send(message) {
    if (!this.active) return;

    const args = ['exec', '--prompt', message, '--approval-mode', 'auto-edit'];

    this.process = spawn('codex', args, {
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
      if (text) this.onError(new Error(`codex stderr: ${text}`));
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

module.exports = CodexAdapter;
