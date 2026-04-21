/**
 * e2e tests for the stage-to-byan Stop hook.
 *
 * Spawns the real hook with a fake stdin payload, verifies it exits 0
 * with continue:true, and (when enabled) queues an entry to
 * _byan-output/staging/staging-queue.jsonl.
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'stage-to-byan.js');

function runHook(payload, env = {}) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  return { code: r.status, parsed, stdout: r.stdout, stderr: r.stderr };
}

function setup(root) {
  const staging = path.join(root, 'src', 'staging');
  fs.mkdirpSync(staging);
  fs.copyFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'staging', 'staging.js'),
    path.join(staging, 'staging.js')
  );
}

describe('stage-to-byan Stop hook', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-stop-hook-'));
    setup(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('missing stdin → continue:true exit 0', () => {
    const r = runHook({}, { CLAUDE_PROJECT_DIR: root });
    expect(r.code).toBe(0);
    expect(r.parsed.continue).toBe(true);
  });

  test('no transcript field → continue:true, no queue file', () => {
    const r = runHook({ no_transcript: true }, { CLAUDE_PROJECT_DIR: root });
    expect(r.code).toBe(0);
    expect(r.parsed.continue).toBe(true);
    expect(fs.existsSync(path.join(root, '_byan-output', 'staging', 'staging-queue.jsonl'))).toBe(false);
  });

  test('memory_sync disabled → no queue entry', () => {
    fs.writeFileSync(
      path.join(root, 'loadbalancer.yaml'),
      'memory_sync:\n  enabled: false\n'
    );
    const r = runHook(
      {
        session_id: 's1',
        transcript: [
          { role: 'user', content: 'a substantial user message with many characters and context '.repeat(3) },
          { role: 'assistant', content: 'Some assistant answer with enough substance to possibly pass triage' },
        ],
      },
      { CLAUDE_PROJECT_DIR: root }
    );
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(root, '_byan-output', 'staging', 'staging-queue.jsonl'))).toBe(false);
  });

  test('memory_sync enabled but no url/token → queued locally, not flushed', () => {
    fs.writeFileSync(
      path.join(root, 'loadbalancer.yaml'),
      'memory_sync:\n  enabled: true\n'
    );
    const content = 'decided to refactor the auth module and chose to use jwt over session cookies '.repeat(3);
    const r = runHook(
      {
        session_id: 's1',
        transcript: [
          { role: 'user', content },
          { role: 'assistant', content: 'Refactored src/auth.js and migrated the tests' },
        ],
      },
      { CLAUDE_PROJECT_DIR: root }
    );
    expect(r.code).toBe(0);
    expect(r.parsed.continue).toBe(true);

    const queue = path.join(root, '_byan-output', 'staging', 'staging-queue.jsonl');
    expect(fs.existsSync(queue)).toBe(true);
    const lines = fs.readFileSync(queue, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.cliSource).toBe('claude-code');
    expect(entry.sessionId).toBe('s1');
  });

  test('chit-chat turn is filtered out (not queued)', () => {
    fs.writeFileSync(
      path.join(root, 'loadbalancer.yaml'),
      'memory_sync:\n  enabled: true\n'
    );
    const r = runHook(
      {
        session_id: 's1',
        transcript: [
          { role: 'user', content: 'ok' },
          { role: 'assistant', content: 'ok' },
        ],
      },
      { CLAUDE_PROJECT_DIR: root }
    );
    expect(r.code).toBe(0);
    const queue = path.join(root, '_byan-output', 'staging', 'staging-queue.jsonl');
    expect(fs.existsSync(queue)).toBe(false);
  });

  test('malformed stdin does not crash the hook', () => {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(0);
  });
});
