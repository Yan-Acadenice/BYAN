// Install / update BYAN into a local folder (N2).
//
// The real installer already exists as a library: install/lib/install-engine.js
// (runInstall). The app ships install/lib + install/templates as extraResources,
// so main can drive it directly and stream progress to the renderer. Create and
// update are the SAME call — runInstall copies templates with overwrite:true, so
// a folder without _byan/ is created and one with _byan/ is refreshed.
//
// Loaded via createRequire (not `require`, which eslint forbids) because the
// engine path is dynamic (resourcesPath when packaged, repo path in dev) and
// cannot be a static import.

import { createRequire } from 'node:module';
import * as fs from 'fs';
import * as path from 'path';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, LocalInstallOpts, LocalInstallProgress, LocalInstallResult } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { resolveTemplateRoot } from '../installers/template-root';

const req = createRequire(__filename);

// Minimal shape of the slice of install-engine we call.
interface InstallEngine {
  runInstall(
    options: { projectRoot: string; projectName?: string; templateDir?: string; rtk?: boolean },
    hooks: {
      onStep?: (s: { index: number; total: number; id: string; label: string }) => void;
      log?: (line: string) => void;
    }
  ): Promise<LocalInstallResult>;
}

// Resolve install-engine.js : packaged under resourcesPath/install/lib, else the
// repo checkout relative to the compiled handler (dist/main/ipc-handlers).
function enginePath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packaged = path.join(resourcesPath, 'install', 'lib', 'install-engine.js');
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.resolve(__dirname, '..', '..', '..', 'install', 'lib', 'install-engine.js');
}

// install-engine ships OUTSIDE the asar (resources/install/lib) but its bare deps
// (fs-extra, js-yaml, chalk...) live in the app's asar-unpacked node_modules.
type ResolveFn = (request: string, parent: unknown, isMain: boolean, options?: { paths?: string[] }) => string;
interface NodeModuleCtor {
  _initPaths?: () => void;
  _resolveFilename?: ResolveFn;
  __byanUnpackedPatched?: boolean;
}

// The real fix (v3) : Electron's packaged main process does NOT honour
// Module.globalPaths (NODE_PATH) for a bare require coming from a file OUTSIDE the
// asar. NODE_PATH + _initPaths resolves fs-extra under plain Node but NOT under a
// packaged Electron main — so the engine crashed with "Cannot find module
// 'fs-extra'" in the field despite the deps being unpacked. Instead of relying on
// globalPaths, we add a fallback on Module._resolveFilename : if the normal lookup
// throws, retry once with the unpacked node_modules as an explicit search path.
// Fallback-only -> anything that already resolves is untouched ; transitive
// requires (claude-native-setup -> fs-extra, ...) are covered because they all
// pass through _resolveFilename. Idempotent via a marker.
export function patchModuleResolution(M: NodeModuleCtor | undefined, unpacked: string): boolean {
  if (!M || typeof M._resolveFilename !== 'function' || M.__byanUnpackedPatched) return false;
  const orig = M._resolveFilename.bind(M);
  M._resolveFilename = function patched(request, parent, isMain, options) {
    try {
      return orig(request, parent, isMain, options);
    } catch (err) {
      try {
        return orig(request, parent, isMain, { ...(options || {}), paths: [unpacked] });
      } catch {
        throw err; // preserve the original resolution error
      }
    }
  };
  M.__byanUnpackedPatched = true;
  return true;
}

function ensureUnpackedNodePath(): void {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return;
  const unpacked = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  if (!fs.existsSync(unpacked)) return;
  // NODE_PATH + _initPaths first : harmless, and it does help plain Node and any
  // child process we later spawn (they inherit NODE_PATH).
  const cur = process.env.NODE_PATH || '';
  if (!cur.split(path.delimiter).includes(unpacked)) {
    process.env.NODE_PATH = cur ? `${unpacked}${path.delimiter}${cur}` : unpacked;
  }
  const mod = req('node:module') as { Module?: NodeModuleCtor };
  mod.Module?._initPaths?.();
  // The decisive part for packaged Electron : the _resolveFilename fallback.
  patchModuleResolution(mod.Module, unpacked);
}

function loadEngine(): InstallEngine {
  ensureUnpackedNodePath();
  return req(enginePath()) as InstallEngine;
}

export interface RunInstallDeps {
  // Injected in tests so we never touch the real engine / disk.
  runInstall?: InstallEngine['runInstall'];
  templateDir?: string;
}

// Core: drive runInstall, map its hooks onto onProgress, return the verdict.
export async function runProjectInstall(
  opts: LocalInstallOpts,
  onProgress: (p: LocalInstallProgress) => void,
  deps: RunInstallDeps = {}
): Promise<LocalInstallResult> {
  if (!opts || typeof opts.projectRoot !== 'string' || !opts.projectRoot) {
    throw new IpcError('INVALID_ARGUMENT', 'install: projectRoot requis');
  }
  // Trust boundary : the IPC contract lets the renderer pass any path to a
  // create + overwrite + spawn engine. Require an ABSOLUTE path (a relative one
  // would resolve against main's cwd), and if it already exists it must be a
  // directory (never overwrite a file). Same posture as F5's openTerminal.
  if (!path.isAbsolute(opts.projectRoot)) {
    throw new IpcError('INVALID_ARGUMENT', 'install: projectRoot doit etre un chemin absolu');
  }
  try {
    if (!fs.statSync(opts.projectRoot).isDirectory()) {
      throw new IpcError('INVALID_ARGUMENT', 'install: le chemin existe et n\'est pas un dossier');
    }
  } catch (err) {
    if (err instanceof IpcError) throw err; // non-directory -> reject
    // ENOENT : the folder does not exist yet -> the engine creates it. OK.
  }
  const runInstall = deps.runInstall ?? loadEngine().runInstall;
  const templateDir = deps.templateDir ?? resolveTemplateRoot();

  // rtk:false — the desktop "New project" installs the BYAN platform INTO the
  // chosen folder ; it must not try to install rtk (a global Rust CLI) as a side
  // effect. In packaged Electron the PATH rarely sees a user's existing rtk, so
  // the engine's rtk step wrongly thought it absent and blocked the install up
  // to its 5-minute spawnSync timeout ("galere a l'etape 8"). rtk stays an
  // explicit, separate user install.
  return runInstall(
    { projectRoot: opts.projectRoot, projectName: opts.projectName, templateDir, rtk: false },
    {
      onStep: (s) => onProgress({ type: 'step', index: s.index, total: s.total, id: s.id, label: s.label }),
      log: (line) => onProgress({ type: 'log', line }),
    }
  );
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.projectsLocal.install,
    wrap((evt: IpcMainInvokeEvent, opts: LocalInstallOpts) =>
      runProjectInstall(opts, (p) => {
        if (!evt.sender.isDestroyed()) evt.sender.send('byan:install:progress', p);
      })
    )
  );
}
