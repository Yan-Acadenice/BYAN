const { CodexProvider, parseCodexJsonl, detectCodexAuth } = require('../../src/loadbalancer/providers/codex-provider');

// Codex is a SYSTEM CLI (codex exec), not an npm SDK. The provider spawns it and
// parses the --json JSONL stream. The parser is a pure function (fixture-tested)
// and the spawn is injectable (this._runCodex) so these tests never touch the
// real binary, network, or the user's OpenAI subscription.

// A representative `codex exec --json` stream (JSON Lines): thread.started ->
// turn.started -> item.* (agent message) -> turn.completed (usage).
const JSONL_OK = [
  JSON.stringify({ type: 'thread.started', thread: { id: 'th_abc123' } }),
  JSON.stringify({ type: 'turn.started' }),
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello from Codex.' } }),
  JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1200, output_tokens: 340 } }),
].join('\n');

describe('loadbalancer/codex-provider', () => {
  describe('parseCodexJsonl (pure)', () => {
    test('extracts content, usage and threadId from a well-formed stream', () => {
      const r = parseCodexJsonl(JSONL_OK);
      expect(r.content).toBe('Hello from Codex.');
      expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 340, totalTokens: 1540 });
      expect(r.threadId).toBe('th_abc123');
    });

    test('concatenates multiple agent messages in order', () => {
      const src = [
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'part one' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'part two' } }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } }),
      ].join('\n');
      expect(parseCodexJsonl(src).content).toBe('part one\npart two');
    });

    test('tolerates blank lines and non-JSON noise without throwing', () => {
      const src = `\n  \nnot json at all\n${JSONL_OK}\n`;
      const r = parseCodexJsonl(src);
      expect(r.content).toBe('Hello from Codex.');
      expect(r.usage.totalTokens).toBe(1540);
    });

    test('missing usage yields zeroed usage, never undefined', () => {
      const src = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'x' } });
      const r = parseCodexJsonl(src);
      expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    });

    test('reads alternate usage field names (input/output)', () => {
      const src = JSON.stringify({ type: 'turn.completed', usage: { input: 10, output: 5 } });
      expect(parseCodexJsonl(src).usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    });

    test('empty input is safe', () => {
      const r = parseCodexJsonl('');
      expect(r.content).toBe('');
      expect(r.usage.totalTokens).toBe(0);
      expect(r.threadId).toBeNull();
    });
  });

  describe('detectCodexAuth (pure, injectable fs)', () => {
    const fakeFs = (authExists) => ({ existsSync: () => authExists });

    test('CODEX_API_KEY present -> api-key pool (wins over subscription)', () => {
      expect(detectCodexAuth({ env: { CODEX_API_KEY: 'sk-x' }, fs: fakeFs(true) })).toBe('api-key');
    });

    test('no key but ~/.codex/auth.json present -> subscription', () => {
      expect(detectCodexAuth({ env: {}, fs: fakeFs(true) })).toBe('subscription');
    });

    test('neither -> null', () => {
      expect(detectCodexAuth({ env: {}, fs: fakeFs(false) })).toBeNull();
    });
  });

  describe('CodexProvider', () => {
    test('name is "codex", starts uninitialized', () => {
      const p = new CodexProvider({});
      expect(p.name).toBe('codex');
      expect(p.initialized).toBe(false);
    });

    test('initialize degrades cleanly when the codex binary is absent (no throw)', async () => {
      const p = new CodexProvider({});
      p._probeBinary = async () => false; // simulate missing CLI
      await p.initialize();
      expect(p.initialized).toBe(false);
    });

    test('initialize succeeds when the binary probes ok', async () => {
      const p = new CodexProvider({});
      p._probeBinary = async () => true;
      await p.initialize();
      expect(p.initialized).toBe(true);
    });

    test('isAvailable false when not initialized', async () => {
      const p = new CodexProvider({});
      expect(await p.isAvailable()).toBe(false);
    });

    test('isAvailable false when initialized but no auth', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      p._detectAuth = () => null;
      expect(await p.isAvailable()).toBe(false);
    });

    test('isAvailable true when initialized + auth present', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      p._detectAuth = () => 'subscription';
      expect(await p.isAvailable()).toBe(true);
    });

    test('send throws when not initialized', async () => {
      const p = new CodexProvider({});
      await expect(p.send({ prompt: 'hi' })).rejects.toThrow(/not initialized/);
    });

    test('send parses an injected codex run into a ProviderResponse with usage', async () => {
      const p = new CodexProvider({ models: { agent: 'gpt-5-codex' } });
      p.initialized = true;
      p._runCodex = async () => ({ stdout: JSONL_OK, stderr: '', code: 0 });
      const r = await p.send({ prompt: 'do it' });
      expect(r.provider).toBe('codex');
      expect(r.content).toBe('Hello from Codex.');
      expect(r.model).toBe('gpt-5-codex');
      expect(r.rateLimited).toBe(false);
      expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 340, totalTokens: 1540 });
      expect(typeof r.latencyMs).toBe('number');
    });

    test('send passes the sandbox + model + no-approval flags to the runner', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      let capturedArgs = null;
      p._runCodex = async (args) => { capturedArgs = args; return { stdout: JSONL_OK, stderr: '', code: 0 }; };
      await p.send({ prompt: 'x', model: 'gpt-5' });
      expect(capturedArgs).toEqual(expect.arrayContaining(['exec', '--json']));
      expect(capturedArgs).toEqual(expect.arrayContaining(['-m', 'gpt-5']));
      // non-interactive automation: never pause for approval, sandboxed writes
      expect(capturedArgs).toEqual(expect.arrayContaining(['-a', 'never']));
      const sIdx = capturedArgs.indexOf('-s');
      expect(sIdx).toBeGreaterThan(-1);
      expect(['read-only', 'workspace-write']).toContain(capturedArgs[sIdx + 1]);
    });

    test('send detects a rate-limit exit and returns rateLimited=true, not a throw', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      p._runCodex = async () => ({ stdout: '', stderr: 'error: usage limit reached, resets in 2h', code: 1 });
      const r = await p.send({ prompt: 'x' });
      expect(r.rateLimited).toBe(true);
      expect(r.content).toBeNull();
    });

    test('send throws on a non-rate-limit failure', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      p._runCodex = async () => ({ stdout: '', stderr: 'bad flag', code: 2 });
      await expect(p.send({ prompt: 'x' })).rejects.toThrow();
    });

    test('getCapabilities reports the codex pool shape', () => {
      const caps = new CodexProvider({}).getCapabilities();
      expect(caps.multiTurn).toBe(true);
      expect(caps.tools).toBe(true);
      expect(typeof caps.maxContextTokens).toBe('number');
      expect(caps.maxContextTokens).toBeGreaterThan(0);
    });

    test('authPool exposes which OpenAI pool is in use (for the subscription tracker)', async () => {
      const p = new CodexProvider({});
      p.initialized = true;
      p._detectAuth = () => 'api-key';
      expect(p.authPool()).toBe('api-key');
    });
  });
});
