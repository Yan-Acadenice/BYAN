/**
 * Claude Code CLI bridge adapter.
 * Uses --print --output-format stream-json --input-format stream-json
 * for persistent streaming sessions.
 */

const { spawn } = require('child_process');
const { Bridge } = require('./bridge');

class ClaudeAdapter extends Bridge {
  constructor(options) {
    super(options);
    this._buffer = '';
    this._sessionId = null;
  }

  async start() {
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
    ];

    if (this.agent) {
      const agentPath = this.resolveAgent(this.agent);
      if (agentPath) {
        args.push('--agent', agentPath);
      }
    }

    if (this.model) {
      args.push('--model', this.model);
    }

    if (this._sessionId) {
      args.push('--session-id', this._sessionId);
    }

    this.process = spawn('claude', args, {
      cwd: this.projectRoot,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.active = true;

    this.process.stdout.on('data', (data) => this._handleStdout(data));
    this.process.stderr.on('data', (data) => this._handleStderr(data));

    this.process.on('error', (err) => {
      this.active = false;
      this.onError(err);
    });

    this.process.on('exit', (code) => {
      this.active = false;
      this.onComplete({ code, sessionId: this._sessionId });
    });
  }

  async send(message) {
    if (!this.active || !this.process || !this.process.stdin.writable) {
      if (!this.active) {
        await this.start();
      } else {
        this.onError(new Error('Claude process stdin is not writable'));
        return;
      }
    }

    const payload = JSON.stringify({ type: 'user', content: message }) + '\n';

    try {
      this.process.stdin.write(payload);
    } catch (err) {
      this.onError(err);
    }
  }

  async stop() {
    this.active = false;
    if (this.process) {
      await this._killProcess(this.process);
      this.process = null;
    }
  }

  _handleStdout(data) {
    this._buffer += data.toString();
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this._parseLine(trimmed);
    }
  }

  _handleStderr(data) {
    const text = data.toString().trim();
    if (text) {
      this.onError(new Error(`claude stderr: ${text}`));
    }
  }

  _parseLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.onChunk(line);
      return;
    }

    switch (event.type) {
      case 'assistant': {
        const contents = event.message?.content || event.content || [];
        const items = Array.isArray(contents) ? contents : [contents];
        for (const item of items) {
          if (typeof item === 'string') {
            this.onChunk(item);
          } else if (item.type === 'text') {
            this.onChunk(item.text || '');
          } else if (item.type === 'tool_use') {
            this.onToolUse({
              id: item.id,
              name: item.name,
              input: item.input,
            });
          }
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta') {
          this.onChunk(delta.text || '');
        }
        break;
      }

      case 'result': {
        if (event.session_id) this._sessionId = event.session_id;
        this.onComplete({
          result: event.result,
          cost: event.cost_usd,
          sessionId: event.session_id,
        });
        break;
      }

      case 'tool_use': {
        this.onToolUse({
          id: event.id || event.tool_use_id,
          name: event.name,
          input: event.input,
        });
        break;
      }

      case 'error': {
        this.onError(new Error(event.error || event.message || 'Unknown claude error'));
        break;
      }

      default:
        break;
    }
  }
}

module.exports = ClaudeAdapter;
