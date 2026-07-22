// Terminal IPC handler (F5) — open an EXTERNAL terminal running a command
// (default: `claude`) in a project directory. For users who prefer the raw CLI.
//
// Cross-OS, best-effort. The command that actually opens a terminal differs per
// platform and, on Linux, per installed emulator. buildLaunch() is pure so the
// per-OS argv is unit-tested ; the handler resolves the Linux emulator via PATH
// and spawns detached so closing the app does not kill the terminal.

import type { IpcMain } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS, TerminalOpenOpts, TerminalOpenResult } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { resolveExecutable, getAugmentedPath, spawnEnv } from '../resolve-bin';

// Linux emulators we try, most-common first. The first one found on PATH wins.
const LINUX_TERMINALS = [
  'x-terminal-emulator',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'xterm',
];

// Escape a double-quoted shell fragment (cwd/command embedded in a -lc string).
function shq(s: string): string {
  return s.replace(/(["$`\\])/g, '\\$1');
}

// Build the { file, args } to spawn for a given platform. Pure + deterministic so
// every OS branch is unit-tested. `terminalBin` is the resolved Linux emulator
// (ignored on darwin/win32). cwd is also passed as the child spawn cwd by the
// caller, but we still cd/flag it so emulators that reset to $HOME land right.
export function buildLaunch(
  platform: NodeJS.Platform,
  cwd: string,
  command: string,
  terminalBin?: string
): { file: string; args: string[] } {
  const cmd = command || 'claude';

  if (platform === 'darwin') {
    // Terminal.app has no argv command hook — drive it via AppleScript.
    const script = `tell application "Terminal" to do script "cd \\"${shq(cwd)}\\" && ${shq(cmd)}"`;
    return { file: 'osascript', args: ['-e', script, '-e', 'tell application "Terminal" to activate'] };
  }

  if (platform === 'win32') {
    // `start` opens a new console in the parent's cwd (set on spawn), so we do NOT
    // build a `cd /d "<cwd>"` shell string — cmd.exe cannot be safely string-escaped
    // (^ & | < > %VAR% differ from POSIX). cmd is metachar-validated by the handler.
    // The empty "" is the window title (start's first quoted arg).
    return { file: 'cmd.exe', args: ['/c', 'start', '', 'cmd', '/k', cmd] };
  }

  // linux (and any other unix) — argv shape depends on the emulator.
  const bin = terminalBin || 'xterm';
  const inner = `cd "${shq(cwd)}" && ${cmd}; exec bash`;
  switch (path.basename(bin)) {
    case 'gnome-terminal':
      return { file: bin, args: ['--working-directory', cwd, '--', 'bash', '-lc', `${cmd}; exec bash`] };
    case 'konsole':
      return { file: bin, args: ['--workdir', cwd, '-e', 'bash', '-lc', `${cmd}; exec bash`] };
    case 'xfce4-terminal':
      return { file: bin, args: ['--working-directory', cwd, '-e', `bash -lc "${shq(cmd)}; exec bash"`] };
    default:
      // x-terminal-emulator / xterm and friends: -e + a shell that cds itself.
      return { file: bin, args: ['-e', 'bash', '-lc', inner] };
  }
}

// Resolve the first Linux terminal emulator present on PATH. Scans the AUGMENTED
// PATH (login-shell + common dirs), not the truncated GUI-launch PATH — otherwise
// a double-clicked app finds no emulator and the terminal never opens (D-02).
function detectLinuxTerminal(pathString: string = getAugmentedPath()): string | null {
  const dirs = pathString.split(path.delimiter).filter(Boolean);
  for (const term of LINUX_TERMINALS) {
    for (const dir of dirs) {
      try {
        if (fs.existsSync(path.join(dir, term))) return term;
      } catch { /* ignore unreadable PATH entry */ }
    }
  }
  return null;
}

// The command reaches a shell interpreter on every platform (bash -lc / osascript
// do script / cmd /k). The IPC handler is the trust boundary, so command is
// constrained to a conservative allowlist — a binary path plus simple flags/args
// (letters, digits, space, dash, underscore, dot, slash). This rejects every
// shell metacharacter (; & | " ' $ ` < > % ^ ( ) newline) that could inject.
const SAFE_COMMAND = /^[A-Za-z0-9 _\-./]+$/;

export async function openTerminal(opts: TerminalOpenOpts): Promise<TerminalOpenResult> {
  if (!opts || typeof opts.cwd !== 'string' || !opts.cwd) {
    throw new IpcError('INVALID_ARGUMENT', 'openTerminal: cwd requis');
  }

  // Validate cwd: an existing absolute directory. This blocks both an arbitrary
  // working dir and a cwd crafted to break out of the embedded shell strings
  // (mac/linux) — a path with a quote is not an existing dir here.
  if (!path.isAbsolute(opts.cwd)) {
    return { ok: false, reason: 'bad-cwd', message: 'Le dossier doit être un chemin absolu.' };
  }
  try {
    if (!fs.statSync(opts.cwd).isDirectory()) {
      return { ok: false, reason: 'bad-cwd', message: 'Le chemin n\'est pas un dossier.' };
    }
  } catch {
    return { ok: false, reason: 'bad-cwd', message: 'Dossier introuvable.' };
  }

  const command = opts.command || 'claude';
  if (!SAFE_COMMAND.test(command)) {
    return { ok: false, reason: 'bad-command', message: 'Commande non autorisée (caractères interdits).' };
  }

  // GUI-launch PATH fix (D-02) : when the command starts with the bare `claude`,
  // substitute its ABSOLUTE path so it runs inside the terminal regardless of the
  // emulator's own (possibly truncated) shell PATH. An absolute path still passes
  // SAFE_COMMAND (it allows / and .). Extra args after `claude ` are preserved.
  let effectiveCommand = command;
  if (command === 'claude' || command.startsWith('claude ')) {
    const abs = resolveExecutable('claude');
    if (abs) effectiveCommand = abs + command.slice('claude'.length);
  }

  const platform = process.platform;

  let terminalBin: string | undefined;
  if (platform !== 'darwin' && platform !== 'win32') {
    const found = detectLinuxTerminal();
    if (!found) {
      return { ok: false, reason: 'no-terminal', message: 'Aucun terminal trouvé sur ce système.' };
    }
    terminalBin = found;
  }

  const { file, args } = buildLaunch(platform, opts.cwd, effectiveCommand, terminalBin);

  try {
    // env carries the augmented PATH so the emulator and the shell inside it (and
    // claude's own MCP node child) resolve user-installed tools.
    const child = spawn(file, args, { cwd: opts.cwd, detached: true, stdio: 'ignore', env: spawnEnv() });
    child.unref();
    return { ok: true, terminal: terminalBin || file };
  } catch (err) {
    return { ok: false, reason: 'spawn-failed', message: err instanceof Error ? err.message : String(err) };
  }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.terminal.open, wrap((_evt, opts: TerminalOpenOpts) => openTerminal(opts)));
}
