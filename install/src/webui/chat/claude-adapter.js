/**
 * Claude Code CLI bridge adapter.
 * Uses --print --verbose --output-format stream-json --input-format stream-json
 * for persistent streaming sessions (--verbose is mandatory with print+stream-json).
 */

const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { Bridge } = require('./bridge');

class ClaudeAdapter extends Bridge {
  constructor(options) {
    super(options);
    this._buffer = '';
    this._sessionId = null;
    // Preserves multi-byte UTF-8 (accented text, emoji) split across data chunks.
    this._decoder = new StringDecoder('utf8');
  }

  async start() {
    // Fresh line buffer + decoder for each run (start() can be re-called on reconnect).
    this._buffer = '';
    this._decoder = new StringDecoder('utf8');
    // --verbose is REQUIRED alongside --print + --output-format stream-json: the
    // CLI hard-refuses the combo otherwise ("When using --print,
    // --output-format=stream-json requires --verbose") and the chat spawn dies.
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
    ];

    if (this.agent) {
      // Claude Code expects agent name, not file path
      args.push('--agent', this.agent);
    }

    if (this.model) {
      args.push('--model', this.model);
    }

    // Resume an existing claude session (F3) takes precedence over --session-id.
    // --resume <uuid> reloads that session's context ; --session-id only pins the
    // id of a fresh one, which errors if the id already exists.
    if (this.resumeSessionId) {
      args.push('--resume', this.resumeSessionId);
    } else if (this._sessionId) {
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
      this._flushStdout(); // parse a final event that arrived without a closing newline
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

    // stream-json input shape: the CLI reads $.message.role. A flat
    // {type,content} makes it throw "Expected message role 'user', got 'undefined'".
    const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n';

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
    // Decode through a StringDecoder so a multi-byte UTF-8 char split across two
    // chunks is not mangled.
    this._buffer += this._decoder.write(data);
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this._parseLine(trimmed);
    }
  }

  // Flush the decoder tail + a trailing line with no newline at stream end / exit.
  _flushStdout() {
    this._buffer += this._decoder.end();
    const line = this._buffer.trim();
    this._buffer = '';
    if (line) this._parseLine(line);
  }

  _handleStderr(data) {
    // Split per line and surface ONLY non-benign lines : a single /m test
    // swallowed a real error when it followed a benign status line in the chunk.
    const benign = /^(Initializing|Loading|Connected|Session|Warming|Cost:|Token)/;
    const bad = data.toString().split('\n').map((l) => l.trim())
      .filter((l) => l && !benign.test(l));
    if (bad.length) this.onError(new Error(`claude stderr: ${bad.join(' ')}`));
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
        // is_error:true = a failed turn (rate limit, refusal, API error) ->
        // surface as an error, not a silent onComplete the server persists.
        if (event.is_error === true) {
          this.onError(new Error(event.result || event.subtype || 'claude: le tour a échoué'));
          break;
        }
        this.onComplete({
          result: event.result,
          cost: event.total_cost_usd, // real field is total_cost_usd, not cost_usd
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
