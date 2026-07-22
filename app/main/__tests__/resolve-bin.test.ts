// resolve-bin tests — the GUI-launch PATH fix. A windowed app inherits a minimal
// PATH ; these helpers rebuild the user's real PATH (login shell + common dirs)
// and resolve a binary's absolute path so spawn('claude') can't ENOENT.

import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import {
  commonBinDirs,
  loginShellPath,
  nodeVersionBinDirs,
  buildAugmentedPath,
  resolveExecutable,
} from '../resolve-bin';

describe('commonBinDirs', () => {
  it('expands the usual user bin dirs from HOME', () => {
    const dirs = commonBinDirs('/home/yan');
    expect(dirs).toContain('/home/yan/.claude/local');
    expect(dirs).toContain('/home/yan/.local/bin');
    expect(dirs).toContain('/home/yan/.cargo/bin'); // rtk lands here
    expect(dirs).toContain('/usr/bin');
  });
});

// The shell wraps its PATH in the markers; helper to build that stdout.
const marked = (p: string) => `some banner noise\n__BYAN_PATH_A__${p}__BYAN_PATH_B__\n`;

describe('loginShellPath', () => {
  it('asks fish with the join form (login) and extracts the marked PATH', () => {
    const spawnSync = vi.fn(() => ({ status: 0, stdout: marked('/home/yan/.local/bin:/usr/bin') })) as never;
    const out = loginShellPath({ env: { SHELL: '/usr/bin/fish' } as never, spawnSync });
    expect(out).toBe('/home/yan/.local/bin:/usr/bin'); // banner noise stripped
    const [shell, args] = (spawnSync as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(shell).toBe('/usr/bin/fish');
    expect(args[0]).toBe('-lc');
    expect(String(args[1])).toContain('string join : $PATH');
  });

  it('asks a POSIX shell INTERACTIVE + login (-ilc) so rc files (nvm) are sourced', () => {
    const spawnSync = vi.fn(() => ({ status: 0, stdout: marked('/usr/bin') })) as never;
    loginShellPath({ env: { SHELL: '/bin/zsh' } as never, spawnSync });
    const args = (spawnSync as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1];
    expect(args[0]).toBe('-ilc'); // interactive is what pulls in nvm's PATH edits
    expect(String(args[1])).toContain('"$PATH"');
  });

  it('ignores non-zero exit when the marker is present (interactive job-control)', () => {
    const spawnSync = vi.fn(() => ({ status: 1, stdout: marked('/opt/bin') })) as never;
    expect(loginShellPath({ env: { SHELL: '/bin/bash' } as never, spawnSync })).toBe('/opt/bin');
  });

  it('returns null when no SHELL, no marker, or the shell throws', () => {
    expect(loginShellPath({ env: {} as never, spawnSync: (() => ({ status: 0, stdout: '' })) as never })).toBeNull();
    expect(loginShellPath({ env: { SHELL: '/bin/zsh' } as never, spawnSync: (() => ({ status: 0, stdout: 'no markers here' })) as never })).toBeNull();
    const boom = vi.fn(() => { throw new Error('no shell'); }) as never;
    expect(loginShellPath({ env: { SHELL: '/bin/bash' } as never, spawnSync: boom })).toBeNull();
  });
});

describe('nodeVersionBinDirs', () => {
  it('globs nvm and fnm versioned node bin dirs', () => {
    const readdirSync = (p: string) => {
      if (p.endsWith('/.nvm/versions/node')) return ['v24.13.1', 'v20.0.0'];
      throw new Error('ENOENT');
    };
    const dirs = nodeVersionBinDirs({ home: '/home/yan', readdirSync });
    expect(dirs).toContain('/home/yan/.nvm/versions/node/v24.13.1/bin');
    expect(dirs).toContain('/home/yan/.nvm/versions/node/v20.0.0/bin');
  });
});

describe('buildAugmentedPath', () => {
  it('merges process PATH, login-shell PATH and common dirs, deduped, priority-ordered', () => {
    const spawnSync = vi.fn(() => ({ status: 0, stdout: marked('/shell/only:/usr/bin') })) as never;
    const p = buildAugmentedPath({
      env: { PATH: '/proc/bin:/usr/bin', SHELL: '/bin/bash' } as never,
      home: '/home/yan',
      spawnSync,
      readdirSync: () => { throw new Error('ENOENT'); },
    });
    const dirs = p.split(path.delimiter);
    expect(dirs[0]).toBe('/proc/bin');       // process PATH first
    expect(dirs).toContain('/shell/only');   // login-shell PATH merged
    expect(dirs).toContain('/home/yan/.local/bin'); // common dirs appended
    // /usr/bin appears once despite three sources
    expect(dirs.filter((d) => d === '/usr/bin')).toHaveLength(1);
  });
});

describe('resolveExecutable', () => {
  it('returns the absolute path of the first dir containing the binary as a file', () => {
    const statSync = (p: string) => {
      if (p === '/home/yan/.local/bin/claude') return { isFile: () => true };
      throw new Error('ENOENT');
    };
    const got = resolveExecutable('claude', {
      env: { PATH: '/usr/bin', SHELL: '' } as never,
      home: '/home/yan',
      spawnSync: (() => ({ status: 1, stdout: '' })) as never,
      readdirSync: () => { throw new Error('ENOENT'); },
      statSync,
    });
    expect(got).toBe('/home/yan/.local/bin/claude');
  });

  it('returns null when the binary is in no dir', () => {
    const got = resolveExecutable('nope', {
      env: { PATH: '/usr/bin', SHELL: '' } as never,
      home: '/home/yan',
      spawnSync: (() => ({ status: 1, stdout: '' })) as never,
      readdirSync: () => { throw new Error('ENOENT'); },
      statSync: () => { throw new Error('ENOENT'); },
    });
    expect(got).toBeNull();
  });
});
