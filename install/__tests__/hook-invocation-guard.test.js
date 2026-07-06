const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// The shipped Claude Code hooks (install/templates/.claude/settings.json) run on
// every tool (empty matcher). If a hook script is not resolvable — wrong project,
// empty $CLAUDE_PROJECT_DIR, partial install, version drift — a bare
// `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/X.js` throws MODULE_NOT_FOUND and
// spams on every tool call. Each command must therefore be self-guarded: absent
// script -> exit 0 (no-op, the tool proceeds); present script -> exec node so its
// exit code is preserved (a blocking PreToolUse hook still blocks).

const TEMPLATE_SETTINGS = path.join(
  __dirname,
  '..',
  'templates',
  '.claude',
  'settings.json'
);

// A node-hook command targets _byan-less .claude/hooks/<name>.js under the
// project dir. The guarded shape is exactly what byan hardening emits.
const HOOK_REF = /\.claude\/hooks\/[\w.-]+\.js/;
const GUARDED = /^p="\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/[\w.-]+\.js"; \[ -f "\$p" \] \|\| exit 0; exec node "\$p"$/;

function nodeHookCommands(settingsPath) {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const cmds = [];
  for (const ev of Object.keys(s.hooks || {})) {
    for (const g of s.hooks[ev]) {
      for (const hk of g.hooks || []) {
        const c = hk.command || '';
        if (HOOK_REF.test(c)) cmds.push({ ev, matcher: g.matcher, command: c });
      }
    }
  }
  return cmds;
}

describe('shipped hook invocations are self-guarded', () => {
  test('every node-hook command in the template settings.json is guarded', () => {
    const cmds = nodeHookCommands(TEMPLATE_SETTINGS);
    expect(cmds.length).toBeGreaterThan(0);
    for (const { ev, command } of cmds) {
      expect(command).toMatch(GUARDED);
      // No bare `node "$CLAUDE_PROJECT_DIR"...` without the guard.
      expect(command.startsWith('node ')).toBe(false);
    }
  });

  // Run the ACTUAL guarded command shape through sh to prove the runtime
  // semantics, not just the string shape.
  const guardFor = (rel) =>
    `p="$CLAUDE_PROJECT_DIR/.claude/hooks/${rel}"; [ -f "$p" ] || exit 0; exec node "$p"`;

  function runGuard(cmd, projectDir, input) {
    try {
      execSync(cmd, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
        stdio: input === undefined ? 'ignore' : ['pipe', 'ignore', 'ignore'],
        input: input === undefined ? undefined : input,
        shell: '/bin/sh',
      });
      return 0;
    } catch (e) {
      return typeof e.status === 'number' ? e.status : 1;
    }
  }

  let tmp;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-hookguard-'));
    fs.mkdirSync(path.join(tmp, '.claude', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', 'hooks', 'blocker.js'), 'process.exit(2)\n');
    fs.writeFileSync(path.join(tmp, '.claude', 'hooks', 'passer.js'), 'process.exit(0)\n');
    // Reads the piped payload and blocks (exit 2) only when it contains BLOCK —
    // proves stdin reaches node through `exec` AND the exit code still propagates.
    fs.writeFileSync(
      path.join(tmp, '.claude', 'hooks', 'reader.js'),
      "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.exit(d.includes('BLOCK')?2:0))\n"
    );
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('absent script no-ops with exit 0 (no MODULE_NOT_FOUND spam)', () => {
    expect(runGuard(guardFor('missing.js'), tmp)).toBe(0);
  });

  test('empty CLAUDE_PROJECT_DIR no-ops with exit 0', () => {
    expect(runGuard(guardFor('inject-soul.js'), '')).toBe(0);
  });

  test('present blocking hook preserves its non-zero exit code (deny still works)', () => {
    expect(runGuard(guardFor('blocker.js'), tmp)).toBe(2);
  });

  test('present passing hook exits 0', () => {
    expect(runGuard(guardFor('passer.js'), tmp)).toBe(0);
  });

  test('the piped payload reaches the hook through exec and its exit code propagates', () => {
    // Payload with BLOCK -> hook exits 2 (stdin delivered + blocking preserved).
    expect(runGuard(guardFor('reader.js'), tmp, '{"decision":"BLOCK"}')).toBe(2);
    // Payload without BLOCK -> hook exits 0.
    expect(runGuard(guardFor('reader.js'), tmp, '{"decision":"ok"}')).toBe(0);
  });
});
