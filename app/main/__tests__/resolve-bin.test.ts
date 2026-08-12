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

// resolve-bin is the POSIX GUI-launch PATH fix (macOS/Linux windowed apps inherit
// a truncated PATH ; Windows GUIs get the full PATH from the registry, so the
// mechanism does not apply there). The module itself is cross-platform (path.join
// / path.delimiter), but these fixtures assert POSIX path SHAPES ('/home/…', ':'
// delimiter) that cannot match on a Windows runner. Run them on POSIX only.
const POSIX_ONLY = process.platform === 'win32';

describe.skipIf(POSIX_ONLY)('commonBinDirs', () => {
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

describe.skipIf(POSIX_ONLY)('nodeVersionBinDirs', () => {
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

describe.skipIf(POSIX_ONLY)('buildAugmentedPath', () => {
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

describe.skipIf(POSIX_ONLY)('resolveExecutable', () => {
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

// LA BRANCHE WINDOWS (F3, chantier installateur-multi-os-droits).
//
// Le module etait cross-plateforme dans sa MECANIQUE (path.join, path.delimiter)
// mais pas dans son VOCABULAIRE : la liste de dossiers ne contenait que des
// chemins POSIX, et la resolution cherchait le nom nu. Sous Windows, npm pose un
// relais nomme claude.cmd dans %APPDATA%\npm — chercher "claude" n'y trouve rien.
// Le paquet @anthropic-ai/claude-code declare d'ailleurs son binaire en
// bin/claude.exe sur TOUTES les plateformes (lu le 2026-08-11 dans son
// package.json ; sur cette machine Linux le fichier .exe est un binaire ELF).
//
// Ces cas passent une plateforme injectee, donc ils tournent partout, y compris
// sur le runner Linux — c'est la seule facon de prouver la branche Windows.
describe('branche Windows', () => {
  const winDeps = {
    platform: 'win32' as NodeJS.Platform,
    env: {
      PATH: 'C:\\Windows\\System32',
      SHELL: '',
      APPDATA: 'C:\\Users\\yan\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\yan\\AppData\\Local',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    } as never,
    home: 'C:\\Users\\yan',
    spawnSync: (() => ({ status: 1, stdout: '' })) as never,
    readdirSync: () => { throw new Error('ENOENT'); },
  };

  it('cherche dans les dossiers Windows, pas dans /usr/local/bin', () => {
    const dirs = commonBinDirs('C:\\Users\\yan', winDeps.env, 'win32');
    expect(dirs.some((d) => d.includes('AppData') && d.endsWith('npm'))).toBe(true);
    expect(dirs).not.toContain('/usr/local/bin');
    expect(dirs).not.toContain('/opt/homebrew/bin');
  });

  it('resout claude en claude.cmd via PATHEXT', () => {
    // PATHEXT est en majuscules, le relais pose par npm s'appelle claude.cmd :
    // le systeme de fichiers Windows est insensible a la casse, donc la sonde
    // trouve l'un par l'autre. Le faux systeme de fichiers doit modeler ca,
    // sinon le test echoue sur une propriete que Windows n'a pas.
    const surDisque = path.win32.join('C:\\Users\\yan\\AppData\\Roaming\\npm', 'claude.cmd');
    const got = resolveExecutable('claude', {
      ...winDeps,
      statSync: ((p: string) => {
        if (p.toLowerCase() === surDisque.toLowerCase()) return { isFile: () => true };
        throw new Error('ENOENT');
      }) as never,
    });
    expect(got?.toLowerCase()).toBe(surDisque.toLowerCase());
  });

  it('ne retient pas un fichier sans extension de PATHEXT', () => {
    // Un fichier nomme exactement "claude", sans extension, existe mais n'est
    // pas executable sous Windows. Le retenir donnerait un faux positif.
    const nu = path.win32.join('C:\\Users\\yan\\AppData\\Roaming\\npm', 'claude');
    const got = resolveExecutable('claude', {
      ...winDeps,
      statSync: ((p: string) => {
        if (p === nu) return { isFile: () => true };
        throw new Error('ENOENT');
      }) as never,
    });
    expect(got).toBeNull();
  });

  it('un nom deja suffixe passe tel quel', () => {
    const exe = path.win32.join('C:\\Users\\yan\\AppData\\Roaming\\npm', 'node.exe');
    const got = resolveExecutable('node.exe', {
      ...winDeps,
      statSync: ((p: string) => {
        if (p === exe) return { isFile: () => true };
        throw new Error('ENOENT');
      }) as never,
    });
    expect(got).toBe(exe);
  });
});
