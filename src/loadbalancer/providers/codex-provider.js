/**
 * CodexProvider — wraps the OpenAI Codex CLI (`codex exec`) as a load-balancer pool.
 *
 * Unlike ClaudeProvider / CopilotProvider (npm SDKs), Codex ships as a SYSTEM CLI
 * (`/usr/bin/codex`, codex-cli). So this provider spawns the binary in headless
 * mode (`codex exec --json`) and parses the JSON Lines stream, rather than
 * require()-ing a package. If the binary is absent the provider degrades to
 * initialized=false, exactly like a missing SDK — the load-balancer then skips it.
 *
 * Two auth pools back the same binary (the arbitrage the subscription tracker
 * reads): CODEX_API_KEY (billed per token, no weekly cap) wins when set, else the
 * ChatGPT-subscription session in ~/.codex/auth.json (the 5h + weekly window).
 *
 * Security posture for automation: `-a never` (no approval pauses) with a bounded
 * sandbox (`-s`, default read-only). A workspace-write run is opt-in via config.
 * The API key is read from the environment and passed to the child process env;
 * it is never logged, never written to disk, never placed in argv.
 *
 * Testability: parseCodexJsonl and detectCodexAuth are pure; the spawn is behind
 * this._runCodex and the binary probe behind this._probeBinary, so the unit tests
 * never touch the real CLI, the network, or the user's OpenAI quota.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { BaseProvider } = require('./base-provider');

// Parse a `codex exec --json` JSON Lines stream into { content, usage, threadId }.
// Defensive by construction: blank lines and non-JSON noise are skipped (the CLI
// may emit progress/log lines), agent-message items are concatenated in order,
// and usage falls back to zero (never undefined) so downstream accounting is safe.
function parseCodexJsonl(stdout) {
  const parts = [];
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let threadId = null;

  for (const rawLine of String(stdout || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // non-JSON progress/log noise
    }
    if (!ev || typeof ev !== 'object') continue;

    if (ev.type === 'thread.started' && ev.thread && ev.thread.id) {
      threadId = ev.thread.id;
      continue;
    }

    // Agent output: item events carrying a text payload. The item schema varies
    // by codex version, so read text from the common shapes.
    const item = ev.item || ev;
    const itemType = item && item.type;
    if (itemType === 'agent_message' || itemType === 'assistant_message' || itemType === 'message') {
      const text = item.text || item.content || item.message;
      if (typeof text === 'string' && text) parts.push(text);
      continue;
    }

    if (ev.type === 'turn.completed' && ev.usage) {
      const u = ev.usage;
      const input = Number(u.input_tokens ?? u.input ?? 0) || 0;
      const output = Number(u.output_tokens ?? u.output ?? 0) || 0;
      usage = { inputTokens: input, outputTokens: output, totalTokens: input + output };
    }
  }

  return { content: parts.join('\n'), usage, threadId };
}

// Decide which OpenAI pool backs the CLI. API key wins (per-token, no weekly cap);
// else the ChatGPT-subscription session file; else no auth. Pure — env and fs are
// injected so it is testable without a real home dir.
function detectCodexAuth({ env = process.env, fs: fsImpl = fs, home = os.homedir() } = {}) {
  if (env.CODEX_API_KEY) return 'api-key';
  const authPath = path.join(home, '.codex', 'auth.json');
  try {
    if (fsImpl.existsSync(authPath)) return 'subscription';
  } catch {
    /* fall through */
  }
  return null;
}

// Rate-limit / quota-exhaustion detection from a failed codex exec. Codex has no
// machine-readable quota (OpenAI issue #10233), so we key off the stderr text of
// a non-zero exit. Conservative: only clear usage-limit language counts as a
// rate-limit (a soft, retryable signal); any other failure is a hard error.
const RATE_LIMIT_RE = /(usage limit|rate limit|rate_limit|quota|429|too many requests|limit reached)/i;

function isRateLimitFailure({ code, stderr }) {
  return code !== 0 && RATE_LIMIT_RE.test(String(stderr || ''));
}

class CodexProvider extends BaseProvider {
  constructor(providerConfig = {}) {
    super('codex', providerConfig);
    this._auth = null;
  }

  // Probe whether the codex binary is on PATH (spawn `codex --version`). Seam for
  // tests. Resolves boolean, never throws.
  async _probeBinary() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      try {
        const bin = this.config.bin || 'codex';
        const child = spawn(bin, ['--version'], { stdio: 'ignore' });
        child.on('error', () => finish(false));
        child.on('close', (code) => finish(code === 0));
      } catch {
        finish(false);
      }
    });
  }

  _detectAuth() {
    return detectCodexAuth({});
  }

  async initialize() {
    const present = await this._probeBinary();
    this.initialized = present === true;
    if (this.initialized) this._auth = this._detectAuth();
  }

  authPool() {
    return this._detectAuth();
  }

  async isAvailable() {
    if (!this.initialized) return false;
    return this._detectAuth() !== null;
  }

  // Spawn `codex exec --json` and collect { stdout, stderr, code }. Seam for tests.
  // The prompt is passed on stdin (never argv — avoids leaking it into ps output).
  async _runCodex(args, input, env) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.config.bin || 'codex', args, {
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(err);
        return;
      }
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, code }));
      if (input) child.stdin.write(input);
      child.stdin.end();
    });
  }

  async send(opts) {
    if (!this.initialized) throw new Error('CodexProvider not initialized');

    const start = Date.now();
    const model = opts.model || this.config.models?.agent || 'gpt-5-codex';
    const sandbox = this.config.sandbox || 'read-only';

    // Non-interactive automation contract (developers.openai.com/codex/noninteractive):
    // exec + JSONL, no approval pauses, bounded sandbox, explicit model.
    const args = ['exec', '--json', '-a', 'never', '-s', sandbox, '-m', model];

    const { stdout, stderr, code } = await this._runCodex(args, opts.prompt, {});

    if (isRateLimitFailure({ code, stderr })) {
      return {
        provider: this.name,
        content: null,
        model,
        rateLimitHeaders: null,
        latencyMs: Date.now() - start,
        rateLimited: true,
      };
    }

    if (code !== 0) {
      throw new Error(`codex exec failed (exit ${code}): ${String(stderr).split('\n')[0]}`);
    }

    const parsed = parseCodexJsonl(stdout);
    return {
      provider: this.name,
      content: parsed.content,
      model,
      threadId: parsed.threadId,
      usage: parsed.usage,
      rateLimitHeaders: null,
      latencyMs: Date.now() - start,
      rateLimited: false,
    };
  }

  getCapabilities() {
    return {
      streaming: false, // exec is request/response; --json streams events, not tokens
      tools: true, // codex runs tools in its sandbox
      multiTurn: true, // thread id enables continuation
      maxContextTokens: this.config.max_context_tokens || 256000,
    };
  }

  async destroy() {
    this._auth = null;
    await super.destroy();
  }
}

module.exports = { CodexProvider, parseCodexJsonl, detectCodexAuth, isRateLimitFailure };
