// The record of what the installer wrote, so a hand edit can be told apart from
// a stale copy. See installers/fingerprint.ts for the decision that reads it.
//
// It lives in ~/.byan/, next to the projects registry, NOT inside the user's
// project. It describes this installation's history rather than the project's
// content: it should not be committed, should not travel in a git clone, and
// should not appear in the file tree the user is looking at.
//
// A missing or corrupt file reads as "no record", which classifyAction degrades
// to 'update' — exactly the behaviour the app had before fingerprints existed.
// Losing this file therefore costs the conflict detection, never correctness.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// projectRoot -> (absolute destination path -> content hash at write time)
type Store = Record<string, Record<string, string>>;

// BYAN_HOME overrides the home dir, as in projects-registry.
export function fingerprintsPath(): string {
  const home = process.env.BYAN_HOME || os.homedir();
  return path.join(home, '.byan', 'install-fingerprints.json');
}

function readStore(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(fingerprintsPath(), 'utf8')) as Store;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// What we recorded writing under this project root. Empty when we have no record.
export function readFingerprints(projectRoot: string): Record<string, string> {
  const entry = readStore()[projectRoot];
  return entry && typeof entry === 'object' ? entry : {};
}

// Merge in the hashes just written. Merged, not replaced: one apply usually
// covers a subset of the files (one platform, or a conflict the user accepted),
// and replacing would erase the record of everything else and turn the next
// preview's conflicts back into blind updates.
export function recordFingerprints(projectRoot: string, written: Record<string, string>): void {
  if (Object.keys(written).length === 0) return;
  const store = readStore();
  store[projectRoot] = { ...(store[projectRoot] ?? {}), ...written };
  const file = fingerprintsPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write to a temp file and rename: a crash mid-write would otherwise leave
    // corrupt JSON, which reads as "no record" and silently disables conflict
    // detection for the whole project.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    // Best effort. Failing to record degrades the next preview to 'update',
    // which is the honest fallback — it must not fail the write that succeeded.
  }
}
