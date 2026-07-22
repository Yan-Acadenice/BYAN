// Executable + PATH resolution for a WINDOWED launch.
//
// Root of a whole class of field failures ("spawn claude ENOENT", terminal that
// won't open, rtk wrongly "absent"): when the app is started by double-click
// (AppImage / .app / .desktop), it inherits a MINIMAL PATH — no ~/.local/bin, no
// nvm/fnm shims, no fish_add_path entries. So spawn('claude') can't find claude
// even though the user's terminal runs it fine.
//
// Two levers, both here:
//   augmentedPath()      -> the user's REAL PATH : process PATH + the login shell's
//                           PATH (fish/zsh/bash) + common user bin dirs. Pass it as
//                           env.PATH to any child we spawn so claude (and claude's
//                           own MCP node child) resolve.
//   resolveExecutable()  -> the ABSOLUTE path of a binary by scanning that PATH, so
//                           we spawn the real file, independent of the child's PATH.

import { spawnSync as realSpawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ResolveDeps {
  env?: NodeJS.ProcessEnv;
  home?: string;
  spawnSync?: typeof realSpawnSync;
  statSync?: (p: string) => { isFile(): boolean };
  readdirSync?: (p: string) => string[];
}

// Markers bracket the PATH so any interactive banner / prompt noise printed by
// the login shell on stdout is discarded — only the bytes between them are read.
const PATH_MARK_A = '__BYAN_PATH_A__';
const PATH_MARK_B = '__BYAN_PATH_B__';

// User-level bin dirs a GUI-launch PATH commonly misses. Expanded from HOME so a
// fresh machine still resolves the usual CLI install locations.
export function commonBinDirs(home = os.homedir()): string[] {
  return [
    path.join(home, '.claude', 'local'),   // Claude Code local install
    path.join(home, '.local', 'bin'),      // pip / pipx / npm --prefix ~/.local
    path.join(home, 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.yarn', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.deno', 'bin'),
    path.join(home, '.cargo', 'bin'),      // rtk (rust) lands here
    '/usr/local/bin',
    '/opt/homebrew/bin',                   // macOS arm64 Homebrew
    '/usr/bin',
    '/bin',
    '/usr/local/sbin',
    '/usr/sbin',
  ];
}

// Ask the user's LOGIN shell for its PATH. This is the reliable route because it
// reflects exactly what the terminal sees — nvm/fnm shims, fish_add_path, etc.
//
// Crucially the shell must be INTERACTIVE + login (`-ilc`) so it sources its rc
// (.zshrc/.bashrc) where nvm/fnm/pyenv add to PATH — a plain `-lc` login shell
// skips the rc and returns a bare PATH (the nvm dir was missing in testing). fish
// always loads its config + universal vars for a login shell and rejects `-i`
// without a tty, so it uses `-lc`. fish prints $PATH space-separated -> we join it.
// Status is ignored (an interactive shell may exit non-zero over job control) ;
// the marker's presence is the success signal. Best-effort, never throws.
export function loginShellPath(deps: ResolveDeps = {}): string | null {
  const env = deps.env ?? process.env;
  const spawnSync = deps.spawnSync ?? realSpawnSync;
  const shell = env.SHELL;
  if (!shell) return null;
  const base = path.basename(shell);
  const printPath = base === 'fish'
    ? `printf '${PATH_MARK_A}%s${PATH_MARK_B}' (string join : $PATH)`
    : `printf '${PATH_MARK_A}%s${PATH_MARK_B}' "$PATH"`;
  const args = base === 'fish' ? ['-lc', printPath] : ['-ilc', printPath];
  try {
    const r = spawnSync(shell, args, { encoding: 'utf8', timeout: 5000 });
    const out = r && typeof r.stdout === 'string' ? r.stdout : '';
    const a = out.indexOf(PATH_MARK_A);
    const b = out.indexOf(PATH_MARK_B);
    if (a !== -1 && b > a) {
      const p = out.slice(a + PATH_MARK_A.length, b).trim();
      return p || null;
    }
  } catch { /* login shell unavailable — fall back to common + node-version dirs */ }
  return null;
}

// nvm / fnm install node under versioned dirs whose exact names are dynamic, so a
// static list can't name them. Glob them so a claude installed as an npm global on
// the active node resolves even when the login-shell capture misses (D-01 belt).
export function nodeVersionBinDirs(deps: ResolveDeps = {}): string[] {
  const home = deps.home ?? os.homedir();
  const readdirSync = deps.readdirSync ?? ((p: string) => fs.readdirSync(p));
  const roots = [
    path.join(home, '.nvm', 'versions', 'node'),
    path.join(home, '.local', 'share', 'fnm', 'node-versions'),
    path.join(home, '.fnm', 'node-versions'),
  ];
  const out: string[] = [];
  for (const root of roots) {
    try {
      for (const v of readdirSync(root)) {
        out.push(path.join(root, v, 'bin'));                    // nvm
        out.push(path.join(root, v, 'installation', 'bin'));    // fnm
      }
    } catch { /* root absent — skip */ }
  }
  return out;
}

// The user's real PATH : current PATH + login-shell PATH + common bin dirs, in
// that priority, deduped. Non-existent dirs are kept (harmless for env.PATH ;
// resolveExecutable checks existence per file).
export function buildAugmentedPath(deps: ResolveDeps = {}): string {
  const env = deps.env ?? process.env;
  const home = deps.home ?? os.homedir();
  const parts: string[] = [];
  if (env.PATH) parts.push(...env.PATH.split(path.delimiter));
  const shellPath = loginShellPath(deps);
  if (shellPath) parts.push(...shellPath.split(path.delimiter));
  parts.push(...commonBinDirs(home));
  parts.push(...nodeVersionBinDirs(deps));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.join(path.delimiter);
}

// Absolute path of an executable, scanning the augmented PATH. null when nowhere.
export function resolveExecutable(name: string, deps: ResolveDeps = {}): string | null {
  const statSync = deps.statSync ?? ((p: string) => fs.statSync(p));
  const dirs = buildAugmentedPath(deps).split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, name);
    try {
      if (statSync(full).isFile()) return full;
    } catch { /* not here — keep scanning */ }
  }
  return null;
}

// ---- process-wide cache (the login-shell spawn is the only real cost) ----

let _cachedPath: string | null = null;

// Cached augmented PATH for the running process. Computed once (login shell asked
// a single time). Tests pass deps to bypass the cache.
export function getAugmentedPath(): string {
  if (_cachedPath == null) _cachedPath = buildAugmentedPath();
  return _cachedPath;
}

// Reset the cache (tests only).
export function _resetAugmentedPathCache(): void {
  _cachedPath = null;
}

// An env with PATH replaced by the augmented PATH — hand this to every spawn so
// the child and its grandchildren resolve user-installed tools.
export function spawnEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, PATH: getAugmentedPath() };
}
