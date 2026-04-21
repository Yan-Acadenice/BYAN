const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const staging = require('../../src/staging/staging');

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-staging-'));
});

afterEach(async () => {
  await fs.remove(tmpRoot);
});

describe('staging/extract', () => {
  test('extracts user + assistant text from messages[] array', () => {
    const turn = {
      sessionId: 's1',
      messages: [
        { role: 'user', content: 'Please refactor the auth module and add tests' },
        { role: 'assistant', content: 'Refactored src/auth.js and wrote 12 tests in __tests__/auth.test.js' },
      ],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.cliSource).toBe('claude-code');
    expect(e.sessionId).toBe('s1');
    expect(e.content).toContain('refactor the auth module');
    expect(e.content).toContain('Refactored src/auth.js');
  });

  test('extracts from Claude content blocks (array of {type, text})', () => {
    const turn = {
      messages: [
        { role: 'user', content: 'hello world how are you doing today with a long message' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part of my answer.' },
            { type: 'text', text: 'Second part follows.' },
          ],
        },
      ],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.content).toContain('First part of my answer');
    expect(e.content).toContain('Second part follows');
  });

  test('extracts filesTouched from toolCalls', () => {
    const turn = {
      messages: [
        { role: 'user', content: 'edit foo.js please with more context to pass the filter' },
      ],
      toolCalls: [
        { input: { file_path: '/src/foo.js' } },
        { input: { file_path: '/src/bar.js' } },
      ],
    };
    const e = staging.extract({ turn, cliSource: 'copilot-cli' });
    expect(e.metadata.filesTouched).toEqual(['/src/foo.js', '/src/bar.js']);
  });

  test('classify: decision keyword → category=decision', () => {
    const turn = {
      messages: [{ role: 'user', content: 'I decided to use React instead of Vue because of team skills and ecosystem' }],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.category).toBe('decision');
  });

  test('classify: error keyword → category=blocker', () => {
    const turn = {
      messages: [{ role: 'user', content: 'The build fails with error ENOENT on missing package lock file in CI' }],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.category).toBe('blocker');
  });

  test('classify: files touched → category=artifact', () => {
    const turn = {
      messages: [{ role: 'user', content: 'please add a new component for the login page' }],
      toolCalls: [{ input: { file_path: '/src/Login.jsx' } }],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.category).toBe('artifact');
  });

  test('classify: plain text with no markers → category=fact', () => {
    const turn = {
      messages: [{ role: 'user', content: 'Our API rate limit is 1000 requests per minute for free tier users' }],
    };
    const e = staging.extract({ turn, cliSource: 'claude-code' });
    expect(e.category).toBe('fact');
  });
});

describe('staging/shouldKeep (triage)', () => {
  test('rejects entries below MIN_CONTENT_CHARS', () => {
    expect(staging.shouldKeep({ content: 'hi', metadata: {} })).toBe(false);
  });

  test('rejects chit-chat like "ok thanks"', () => {
    expect(staging.shouldKeep({ content: 'ok thanks', metadata: {} })).toBe(false);
    expect(staging.shouldKeep({ content: 'yes', metadata: {} })).toBe(false);
  });

  test('keeps entries with files touched even if content is shortish', () => {
    const entry = {
      content: 'edit file to fix bug in rate limiting logic observed yesterday',
      metadata: { filesTouched: ['/src/foo.js'] },
    };
    expect(staging.shouldKeep(entry)).toBe(true);
  });

  test('keeps long substantive content without files', () => {
    const entry = {
      content: 'x'.repeat(200),
      metadata: { filesTouched: [] },
    };
    expect(staging.shouldKeep(entry)).toBe(true);
  });

  test('rejects null/undefined entries', () => {
    expect(staging.shouldKeep(null)).toBe(false);
    expect(staging.shouldKeep({})).toBe(false);
  });
});

describe('staging/dedup', () => {
  test('first occurrence not duplicate, second is', () => {
    const e = { content: 'some memory content here' };
    expect(staging.isDuplicate(e, tmpRoot)).toBe(false);
    staging.markSeen(e, tmpRoot);
    expect(staging.isDuplicate(e, tmpRoot)).toBe(true);
  });

  test('different content → different hash → not duplicate', () => {
    staging.markSeen({ content: 'A' }, tmpRoot);
    expect(staging.isDuplicate({ content: 'B' }, tmpRoot)).toBe(false);
  });

  test('seen hashes cap at 500 on write', () => {
    for (let i = 0; i < 600; i++) {
      staging.markSeen({ content: 'entry-' + i }, tmpRoot);
    }
    const seen = JSON.parse(fs.readFileSync(staging.seenPath(tmpRoot), 'utf8'));
    expect(seen.hashes.length).toBe(500);
  });
});

describe('staging/queue', () => {
  test('enqueue appends a jsonl line with enqueued_at + attempts=0', () => {
    const e = { content: 'memorable thing', category: 'fact', cliSource: 'claude-code' };
    staging.enqueue(e, tmpRoot);
    const q = staging.readQueue(tmpRoot);
    expect(q).toHaveLength(1);
    expect(q[0].content).toBe('memorable thing');
    expect(q[0].attempts).toBe(0);
    expect(q[0].enqueued_at).toBeDefined();
  });

  test('readQueue skips malformed lines', () => {
    const p = staging.queuePath(tmpRoot);
    fs.mkdirpSync(path.dirname(p));
    fs.writeFileSync(p, '{"ok":1}\nnot-json\n{"ok":2}\n');
    const q = staging.readQueue(tmpRoot);
    expect(q).toHaveLength(2);
  });

  test('writeQueue with empty array removes the file', () => {
    staging.enqueue({ content: 'x' }, tmpRoot);
    staging.writeQueue(tmpRoot, []);
    expect(fs.existsSync(staging.queuePath(tmpRoot))).toBe(false);
  });
});

describe('staging/isEnabled', () => {
  test('enabled when memory_sync.enabled = true', () => {
    expect(staging.isEnabled({ memory_sync: { enabled: true } })).toBe(true);
  });

  test('camelCase memorySync also works', () => {
    expect(staging.isEnabled({ memorySync: { enabled: true } })).toBe(true);
  });

  test('false when missing / wrong type', () => {
    expect(staging.isEnabled(null)).toBe(false);
    expect(staging.isEnabled({})).toBe(false);
    expect(staging.isEnabled({ memory_sync: { enabled: 'yes' } })).toBe(false);
    expect(staging.isEnabled({ memory_sync: { enabled: false } })).toBe(false);
  });
});

describe('staging/detectProjectId', () => {
  test('returns a stable 16-char hex string', () => {
    const id = staging.detectProjectId(tmpRoot);
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    const id2 = staging.detectProjectId(tmpRoot);
    expect(id2).toBe(id);
  });

  test('different roots give different ids', () => {
    const id1 = staging.detectProjectId(tmpRoot);
    const id2 = staging.detectProjectId(path.join(tmpRoot, 'subdir'));
    expect(id1).not.toBe(id2);
  });
});

describe('staging/processTurn orchestration', () => {
  test('returns skipped=disabled when config off', async () => {
    const r = await staging.processTurn({
      turn: { messages: [{ role: 'user', content: 'x'.repeat(200) }] },
      cliSource: 'claude-code',
      config: { memory_sync: { enabled: false } },
      projectRoot: tmpRoot,
    });
    expect(r.skipped).toBe('disabled');
  });

  test('returns skipped=filtered for chit-chat', async () => {
    const r = await staging.processTurn({
      turn: { messages: [{ role: 'user', content: 'ok' }] },
      cliSource: 'claude-code',
      config: { memory_sync: { enabled: true } },
      projectRoot: tmpRoot,
      flushNow: false,
    });
    expect(r.skipped).toBe('filtered');
  });

  test('returns skipped=duplicate on 2nd identical turn', async () => {
    const turn = {
      messages: [{ role: 'user', content: 'a substantial message with lots of context '.repeat(5) }],
    };
    await staging.processTurn({
      turn,
      cliSource: 'claude-code',
      config: { memory_sync: { enabled: true } },
      projectRoot: tmpRoot,
      flushNow: false,
    });
    const r = await staging.processTurn({
      turn,
      cliSource: 'claude-code',
      config: { memory_sync: { enabled: true } },
      projectRoot: tmpRoot,
      flushNow: false,
    });
    expect(r.skipped).toBe('duplicate');
  });

  test('queues and marks seen on first valid turn', async () => {
    const turn = {
      messages: [{ role: 'user', content: 'a substantial message with lots of context '.repeat(5) }],
    };
    const r = await staging.processTurn({
      turn,
      cliSource: 'claude-code',
      config: { memory_sync: { enabled: true } },
      projectRoot: tmpRoot,
      flushNow: false,
    });
    expect(r.queued).toBe(true);
    expect(staging.readQueue(tmpRoot)).toHaveLength(1);
  });

  test('flush is no-op when url or token missing', async () => {
    const r = await staging.flush({
      config: { memory_sync: { enabled: true } },
      projectRoot: tmpRoot,
    });
    expect(r.flushed).toBe(0);
    expect(r.reason).toMatch(/missing url or token/);
  });
});
