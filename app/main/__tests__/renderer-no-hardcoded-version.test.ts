// A version literal cannot stay true.
//
// Four places printed `v1.0` while the app shipped 1.4.0: the status bar, the
// login footer, the onboarding footer and the settings page. Each was written
// once and then quietly diverged from package.json for four minor releases.
//
// Three per-site tests would have covered those four. This scans instead, so the
// FIFTH site — the one nobody has written yet — is caught the day it appears.
// The version always comes from main via useAppVersion().
//
// It lives under main/__tests__ rather than renderer/__tests__ because it reads
// files: the renderer lint config forbids fs there, and rightly so. Static source
// scans belong with the other build-time guards (see ci-workflow.test.ts).

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const RENDERER = path.resolve(__dirname, '..', '..', 'renderer');

// Mentioning the literal while explaining why it is forbidden is legitimate, so a
// comment line is exempt. Everything else — JSX text, a string, an attribute — is
// a value the user can read on screen.
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('no hardcoded app version in the renderer', () => {
  it('finds source files to scan at all', () => {
    // Without this the scan below would pass by scanning nothing.
    expect(sourceFiles(RENDERER).length).toBeGreaterThan(30);
  });

  it('prints no version literal outside a comment', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(RENDERER)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        // The shape that existed: a v-prefixed dotted number.
        if (/\bv\d+\.\d+(\.\d+)?\b/i.test(line)) {
          offenders.push(`${path.relative(RENDERER, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Read the version from main via useAppVersion() instead:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
