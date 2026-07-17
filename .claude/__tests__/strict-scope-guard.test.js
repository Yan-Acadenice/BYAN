'use strict';

// WI-6 — the Bash write-redirection leak in the strict scope guard.
// bashWriteTargets extraction + decideScope on Bash (in-repo out-of-scope writes
// deny ; fd-dups, /dev, and out-of-repo temp writes pass), plus a Write/Edit
// regression so the pre-WI-6 behavior is unchanged.

const path = require('path');

const REPO = '/repo';
const savedRoot = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = REPO;
const { decideScope, bashWriteTargets } = require('../hooks/strict-scope-guard');

afterAll(() => {
  if (savedRoot === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = savedRoot;
});

const engaged = { active: true, completed: false, scope_lock: { allowed_paths: ['.claude/**', '_byan/**'] } };
const config = { scope_guard: { enforce_paths: true, exempt_globs: ['.byan-strict/**', '_byan-output/**'] }, banners: {} };

describe('bashWriteTargets (WI-6)', () => {
  test('catches > , >> , tee, and fd-prefixed redirections to a path', () => {
    expect(bashWriteTargets('echo hi > src/x.js')).toContain('src/x.js');
    expect(bashWriteTargets('echo hi >> logs/a.log')).toContain('logs/a.log');
    expect(bashWriteTargets('foo | tee out.txt')).toContain('out.txt');
    expect(bashWriteTargets('cmd 2> errors.log')).toContain('errors.log');
    expect(bashWriteTargets('cat <<EOF > gen.js\nx\nEOF')).toContain('gen.js');
  });
  test('skips fd-dups, process substitution and /dev sinks (no false target)', () => {
    expect(bashWriteTargets('cmd 2>&1')).toEqual([]);
    expect(bashWriteTargets('cmd >&2')).toEqual([]);
    expect(bashWriteTargets('diff <(a) >(b)')).toEqual([]);
    expect(bashWriteTargets('noisy > /dev/null 2>&1')).toEqual([]);
    expect(bashWriteTargets('just a plain command')).toEqual([]);
  });
  test('FALSE-POSITIVE regression: comparison / arithmetic / here-string / variable are NOT write targets', () => {
    expect(bashWriteTargets('[ 5 > 3 ]')).toEqual([]);           // test comparison
    expect(bashWriteTargets('(( a > 2 ))')).toEqual([]);         // arithmetic
    expect(bashWriteTargets('if [ "$x" > "$y" ]; then :; fi')).toEqual([]);
    expect(bashWriteTargets('grep foo <<< "a > b"')).toEqual([]); // here-string operand
    expect(bashWriteTargets('echo hi > $F')).toEqual([]);         // unexpanded variable target
    expect(bashWriteTargets('node -e "if (x > 3) y"')).toEqual([]); // the case that trapped the reviewer
  });
});

describe('decideScope — Bash branch (WI-6)', () => {
  test('in-repo redirection out of scope -> deny', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Bash', command: 'echo pwned > src/evil.js' });
    expect(d.deny).toBe(true);
    expect(d.reason).toMatch(/src\/evil\.js/);
  });
  test('in-repo redirection inside scope -> allow', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Bash', command: 'echo ok > .claude/generated.js' });
    expect(d.deny).toBe(false);
  });
  test('out-of-repo temp write (/tmp) -> allow (transient, not our concern)', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Bash', command: 'echo x > /tmp/scratch.js' });
    expect(d.deny).toBe(false);
  });
  test('fd-dup only -> allow (not a file write)', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Bash', command: 'run-tests 2>&1 | tee /dev/null' });
    expect(d.deny).toBe(false);
  });
});

describe('decideScope — Write/Edit regression (unchanged by WI-6)', () => {
  test('Write out of scope -> deny', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Write', filePath: path.join(REPO, 'src/evil.js') });
    expect(d.deny).toBe(true);
  });
  test('Write inside scope -> allow', () => {
    const d = decideScope({ state: engaged, config, toolName: 'Write', filePath: path.join(REPO, '.claude/hooks/x.js') });
    expect(d.deny).toBe(false);
  });
  test('not engaged -> allow', () => {
    const d = decideScope({ state: { active: false }, config, toolName: 'Write', filePath: path.join(REPO, 'src/evil.js') });
    expect(d.deny).toBe(false);
  });
  test('enforce_paths off -> allow', () => {
    const d = decideScope({ state: engaged, config: { scope_guard: { enforce_paths: false } }, toolName: 'Bash', command: 'echo > src/evil.js' });
    expect(d.deny).toBe(false);
  });
});
