/**
 * e2e tests for .claude/hooks/fact-check-absolutes.js.
 * Spawns the actual hook process and checks the JSON output.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', '.claude', 'hooks', 'fact-check-absolutes.js');

function runHook(payload) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 5000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  return { code: r.status, parsed, stdout: r.stdout, stderr: r.stderr };
}

describe('fact-check-absolutes PreToolUse hook', () => {
  test('allows non-Edit/Write tools', () => {
    const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('allows Edit on non-doc file (source code)', () => {
    const r = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/x.js', new_string: 'never return null' },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('blocks Write on .md with unsourced absolute', () => {
    const r = runHook({
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/doc.md',
        content: 'Redis is always faster than PostgreSQL.',
      },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r.parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/unsourced absolute/);
    expect(r.parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/always/i);
  });

  test('allows Write on .md when absolute has a URL nearby', () => {
    const r = runHook({
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/doc.md',
        content:
          'Redis benchmarks show it is always faster than PostgreSQL on K/V workloads (see https://redis.io/benchmarks).',
      },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('allows Write on .md when absolute has [CLAIM Lx] prefix', () => {
    const r = runHook({
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/doc.md',
        content: '[CLAIM L2] Redis is always faster than PostgreSQL on pure K/V read paths.',
      },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('blocks Edit on .md when absolute introduced without source', () => {
    const r = runHook({
      tool_name: 'Edit',
      tool_input: {
        file_path: '/tmp/doc.md',
        old_string: 'Redis is slow',
        new_string: 'Redis is obviously the best option for every caching scenario.',
      },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  test('detects French absolutes (toujours, jamais)', () => {
    const r = runHook({
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/doc.md',
        content: 'Ce code est toujours correct.',
      },
    });
    expect(r.parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  test('malformed stdin does not crash hook', () => {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(r.status).toBe(0);
  });
});
