// terminal.ts F5 — buildLaunch per-OS argv shapes. Pure, so every branch is
// covered without spawning a real terminal.

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import { buildLaunch, openTerminal } from '../../ipc-handlers/terminal';

describe('buildLaunch — macOS', () => {
  it('drives Terminal.app via osascript with cd + command', () => {
    const { file, args } = buildLaunch('darwin', '/home/yan/proj', 'claude');
    expect(file).toBe('osascript');
    // First -e carries the do-script with the cd + command.
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('cd \\"/home/yan/proj\\" && claude');
    expect(args).toContain('tell application "Terminal" to activate');
  });
});

describe('buildLaunch — Windows', () => {
  it('uses cmd start /k WITHOUT an embedded cd (relies on spawn cwd, no shell string)', () => {
    const { file, args } = buildLaunch('win32', 'C:/Users/yan/proj', 'claude');
    expect(file).toBe('cmd.exe');
    expect(args).toEqual(['/c', 'start', '', 'cmd', '/k', 'claude']);
    // The cwd is NOT interpolated into any shell string (cmd.exe can't be escaped).
    expect(args.join(' ')).not.toContain('C:/Users/yan/proj');
  });
});

describe('buildLaunch — Linux emulators', () => {
  it('gnome-terminal uses --working-directory + -- bash -lc', () => {
    const { file, args } = buildLaunch('linux', '/home/yan/proj', 'claude', '/usr/bin/gnome-terminal');
    expect(file).toBe('/usr/bin/gnome-terminal');
    expect(args).toEqual(['--working-directory', '/home/yan/proj', '--', 'bash', '-lc', 'claude; exec bash']);
  });

  it('konsole uses --workdir + -e', () => {
    const { args } = buildLaunch('linux', '/p', 'claude', 'konsole');
    expect(args.slice(0, 3)).toEqual(['--workdir', '/p', '-e']);
  });

  it('xfce4-terminal uses --working-directory + -e string', () => {
    const { args } = buildLaunch('linux', '/p', 'claude', 'xfce4-terminal');
    expect(args[0]).toBe('--working-directory');
    expect(args[1]).toBe('/p');
    expect(args[2]).toBe('-e');
  });

  it('falls back to xterm-style -e bash -lc that cds itself', () => {
    const { file, args } = buildLaunch('linux', '/home/yan/proj', 'claude', 'xterm');
    expect(file).toBe('xterm');
    expect(args[0]).toBe('-e');
    expect(args).toContain('cd "/home/yan/proj" && claude; exec bash');
  });

  it('defaults the command to claude when empty', () => {
    const { args } = buildLaunch('linux', '/p', '', 'xterm');
    expect(args.join(' ')).toContain('claude');
  });

  it('escapes double quotes in the cwd (defensive)', () => {
    const { args } = buildLaunch('linux', '/home/a"b', 'claude', 'xterm');
    // The embedded shell string must have the quote escaped, not raw.
    expect(args[args.length - 1]).toContain('a\\"b');
  });
});

describe('openTerminal — handler validation (trust boundary)', () => {
  it('rejects a non-absolute cwd', async () => {
    const r = await openTerminal({ cwd: 'relative/dir' });
    expect(r).toEqual({ ok: false, reason: 'bad-cwd', message: expect.any(String) });
  });

  it('rejects a non-existent cwd', async () => {
    const r = await openTerminal({ cwd: '/definitely/not/here/xyz-123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad-cwd');
  });

  it('rejects a command with shell metacharacters (injection)', async () => {
    // A real dir so validation reaches the command check before any spawn.
    const r = await openTerminal({ cwd: os.tmpdir(), command: 'claude; rm -rf /' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad-command');
  });

  it('rejects a command with quotes/backticks', async () => {
    const r = await openTerminal({ cwd: os.tmpdir(), command: 'claude `id`' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad-command');
  });

  it('accepts a plain claude with simple args (charset allowlist)', async () => {
    // We cannot assert a real spawn here, but the command must PASS validation ;
    // on this Linux CI a terminal may or may not exist, so accept ok OR no-terminal
    // OR spawn-failed — never a validation rejection for a clean command.
    const r = await openTerminal({ cwd: os.tmpdir(), command: 'claude --resume chat-1' });
    if (!r.ok) expect(['no-terminal', 'spawn-failed']).toContain(r.reason);
  });
});
