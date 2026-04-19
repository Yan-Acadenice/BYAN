/**
 * End-to-end tests for the tool-failure-guard hook.
 *
 * Unlike failure-detector.test.js (pure logic), these tests SPAWN the
 * actual hook script as a child process and verify :
 *   - exit code (2 = blocking, 0 = allow)
 *   - stdout JSON shape (decision, hookSpecificOutput)
 *   - stderr human message for the user
 *   - log file side-effects
 *
 * The goal is to make it mechanically impossible for me to silently
 * retry when tools flake. If these tests pass, the user can trust that
 * "1 tool result missing" or "1 internal error" will block immediately
 * and force me to talk.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', '.claude', 'hooks', 'tool-failure-guard.js');

function runHook(payload, { logPath, env = {} } = {}) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });

  const projectRoot = path.dirname(path.dirname(logPath));
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectRoot,
      ...env,
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed: safeJson(result.stdout),
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

let tmpRoot;
let logPath;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-e2e-'));
  const outDir = path.join(tmpRoot, '_byan-output');
  fs.mkdirSync(outDir, { recursive: true });
  logPath = path.join(outDir, '.tool-failures.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('tool-failure-guard e2e — silence-is-lying enforcement', () => {
  test('1st "tool result missing" → exit 2 (BLOCKING)', () => {
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { content: 'tool result missing due to internal error' },
      },
      { logPath }
    );

    expect(r.code).toBe(2);
    expect(r.parsed).not.toBeNull();
    expect(r.parsed.decision).toBe('block');
    expect(r.parsed.reason).toMatch(/tool result missing/i);
  });

  test('1st "internal error" → exit 2 (BLOCKING)', () => {
    const r = runHook(
      {
        tool_name: 'Edit',
        tool_response: { content: 'internal error from the backend' },
      },
      { logPath }
    );

    expect(r.code).toBe(2);
    expect(r.parsed.decision).toBe('block');
    expect(r.parsed.reason).toMatch(/internal error/i);
  });

  test('blocking stdout contains hookEventName and additionalContext', () => {
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { content: 'tool result missing' },
      },
      { logPath }
    );

    expect(r.parsed.hookSpecificOutput).toBeDefined();
    expect(r.parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(r.parsed.hookSpecificOutput.additionalContext).toMatch(
      /Surface this to the user/
    );
    expect(r.parsed.hookSpecificOutput.additionalContext).toMatch(
      /Do not retry silently/
    );
  });

  test('stderr carries the human-readable block message', () => {
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { content: 'internal error' },
      },
      { logPath }
    );

    expect(r.stderr).toMatch(/BLOCKED by tool-failure-guard/);
    expect(r.stderr).toMatch(/Recent events/);
  });

  test('successful tool (no failure signal) → exit 0, no block', () => {
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { content: 'hello world\n', is_error: false },
      },
      { logPath }
    );

    expect(r.code).toBe(0);
    expect(r.parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(r.parsed.hookSpecificOutput.additionalContext).toBe('');
  });

  test('generic is_error (no pattern) → records but does NOT block on 1st', () => {
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { is_error: true, content: 'some unrelated failure' },
      },
      { logPath }
    );

    expect(r.code).toBe(0);
    expect(fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
  });

  test('2 same-tool is_error failures in 2 min → exit 2 (BLOCKING)', () => {
    runHook(
      {
        tool_name: 'Bash',
        tool_response: { is_error: true, content: 'failure A' },
      },
      { logPath }
    );
    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { is_error: true, content: 'failure B' },
      },
      { logPath }
    );

    expect(r.code).toBe(2);
    expect(r.parsed.reason).toMatch(/2 Bash failures/);
  });

  test('log file appended on every detected failure', () => {
    runHook(
      {
        tool_name: 'Bash',
        tool_response: { content: 'tool result missing' },
      },
      { logPath }
    );
    const lines = fs
      .readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.tool_name).toBe('Bash');
    expect(entry.kind).toBe('pattern');
  });

  test('blocking does NOT prevent log append (auditability)', () => {
    const r = runHook(
      {
        tool_name: 'Write',
        tool_response: { content: 'internal error' },
      },
      { logPath }
    );
    expect(r.code).toBe(2);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
  });

  test('malformed stdin payload → exit 0, no crash', () => {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    const projectRoot = path.dirname(dir);

    const result = spawnSync('node', [HOOK], {
      input: 'not-json-at-all',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.status).toBe(0);
  });
});

describe('tool-failure-guard e2e — regression guards', () => {
  test('different tools do not cross-pollute same-tool threshold', () => {
    runHook(
      {
        tool_name: 'Bash',
        tool_response: { is_error: true, content: 'one' },
      },
      { logPath }
    );
    const r = runHook(
      {
        tool_name: 'Write',
        tool_response: { is_error: true, content: 'two' },
      },
      { logPath }
    );
    expect(r.code).toBe(0);
  });

  test('old entries (>5 min) do not count toward pattern threshold', () => {
    const oldEntry = {
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      tool_name: 'Bash',
      kind: 'pattern',
      detail: 'tool result missing',
    };
    fs.writeFileSync(logPath, JSON.stringify(oldEntry) + '\n');

    const r = runHook(
      {
        tool_name: 'Bash',
        tool_response: { is_error: true, content: 'unrelated' },
      },
      { logPath }
    );
    expect(r.code).toBe(0);
  });
});
