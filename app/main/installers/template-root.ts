// Resolve the install/templates root across runtime contexts.
//
// Three callers walk this tree (claude, copilot, codex installers) and each
// runs in a different __dirname:
//   - vitest unit tests    : <repo>/app/main/installers          → up 3
//   - dist Electron (dev)  : <repo>/app/dist/main/installers     → up 4
//   - packaged Electron    : <binary>/resources/app.asar/dist/... → use process.resourcesPath
//
// Trying every candidate and returning the first one that exists is more
// resilient than gating on a single env detection — if the layout shifts we
// notice via a clear "no templates found" rather than silently writing zero
// FileWritePlans.

import * as nodePath from 'path';
import * as fs from 'fs';

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

let cached: string | null = null;

// Test seam: point the installers at a small fixture tree instead of the real
// install/templates (1000+ files — walking it in every unit test is what made
// the installer suites time out under full-suite load). null restores the
// normal resolution.
export function _setTemplateRootForTests(root: string | null): void {
  cached = root;
}

export function resolveTemplateRoot(): string {
  if (cached) return cached;

  const candidates: string[] = [];

  // Packaged: electron-builder copies install/templates → resources/templates
  // (see app/electron-builder.yml extraResources).
  if (process.resourcesPath) {
    candidates.push(nodePath.join(process.resourcesPath, 'templates'));
  }

  // Dist Electron in dev mode: dist/main/installers/<file>.js
  candidates.push(nodePath.resolve(__dirname, '..', '..', '..', '..', 'install', 'templates'));

  // Source layout (vitest): main/installers/<file>.ts
  candidates.push(nodePath.resolve(__dirname, '..', '..', '..', 'install', 'templates'));

  for (const candidate of candidates) {
    if (exists(candidate)) {
      cached = candidate;
      return candidate;
    }
  }

  // Last resort — return the first candidate so the caller fails with a
  // recognizable ENOENT rather than walking some unrelated directory.
  return candidates[0] ?? candidates[1];
}
