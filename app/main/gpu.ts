// GPU acceleration toggle.
//
// Electron on some Linux stacks (driver + compositor dependent) falls back to
// software GL (llvmpipe) or spins the GPU process, which slows the WHOLE machine
// even at idle. This lets a user opt OUT of hardware acceleration permanently.
//
// `app.disableHardwareAcceleration()` MUST be called before `app.ready`, so the
// signal is read SYNCHRONOUSLY at boot (no async store). Enabled by EITHER :
//   - env `BYAN_DISABLE_GPU=1`, OR
//   - a marker file at <config>/byan/disable-gpu (create to enable, remove to
//     restore GPU). Same config dir as the secure-store .env fallback.
// Default (neither present) : hardware acceleration UNCHANGED (opt-in only), so
// the machines where the GPU works fine are not penalised.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface GpuDeps {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  existsSync?: (p: string) => boolean;
}

// Path of the opt-out marker file, mirroring the secure-store config dir.
export function gpuMarkerPath(deps: GpuDeps = {}): string {
  const env = deps.env ?? process.env;
  const home = (deps.homedir ?? os.homedir)();
  const base =
    process.platform === 'win32'
      ? path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'byan')
      : env.XDG_CONFIG_HOME
        ? path.join(env.XDG_CONFIG_HOME, 'byan')
        : path.join(home, '.config', 'byan');
  return path.join(base, 'disable-gpu');
}

// Pure decision : should hardware acceleration be disabled at this boot ?
export function shouldDisableGpu(deps: GpuDeps = {}): boolean {
  const env = deps.env ?? process.env;
  if (env.BYAN_DISABLE_GPU === '1') return true;
  const exists = deps.existsSync ?? fs.existsSync;
  try {
    return exists(gpuMarkerPath(deps));
  } catch {
    return false;
  }
}
