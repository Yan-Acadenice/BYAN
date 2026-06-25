/**
 * F-B — CLAUDE.md context budget invariants.
 *
 * The 3 heavy generated doctrines (strict / benchmark / fact-check) must NOT be
 * `@`-imported by CLAUDE.md (an `@path` import force-loads the whole file into
 * every turn's context). Their behavioral SUMMARY stays inline in CLAUDE.md and
 * their enforcement lives in hooks, so dropping the `@`-import removes redundant
 * always-on documentation WITHOUT making any behavior conditional. The full text
 * stays reachable on demand via the skill and a plain (non-`@`) path pointer.
 *
 * Identity doctrines the user keeps always-on (ELO, team-doctrine) MUST remain
 * `@`-imported — this test pins that they were not removed by mistake.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, '.claude', 'CLAUDE.md'),
  path.join(ROOT, 'install', 'templates', '.claude', 'CLAUDE.md'),
];

// The 3 doctrines de-referenced by F-B (behavior summarized inline + hook-enforced).
const DE_REFERENCED = ['strict-mode', 'benchmark', 'fact-check'];
// Identity doctrines that MUST stay always-on (user red line).
const KEPT_IMPORTS = ['elo-trust', 'team-doctrine'];
// Behavioral summary headers that must remain inline in CLAUDE.md.
const SUMMARY_HEADERS = ['## BYAN Strict Mode', '## BYAN Auto-Benchmark', '## Fact-Check'];

describe.each(FILES)('F-B context budget — %s', (file) => {
  const content = fs.readFileSync(file, 'utf8');

  test.each(DE_REFERENCED)('does NOT @-import %s.md (not force-loaded each turn)', (rule) => {
    expect(content).not.toContain(`@.claude/rules/${rule}.md`);
  });

  test.each(DE_REFERENCED)('keeps a plain (non-@) pointer to %s.md (discoverable on demand)', (rule) => {
    expect(content).toContain(`.claude/rules/${rule}.md`);
  });

  test.each(SUMMARY_HEADERS)('keeps the inline behavioral summary %s', (header) => {
    expect(content).toContain(header);
  });

  test.each(KEPT_IMPORTS)('still @-imports the always-on identity doctrine %s.md', (rule) => {
    expect(content).toContain(`@.claude/rules/${rule}.md`);
  });

  // G2: compaction directive so a long session does not lose BYAN state.
  test('keeps a Compact instructions section that names the FD/strict/soul state to preserve', () => {
    expect(content).toContain('## Compact instructions');
    expect(content).toContain('fd-state.json');
    expect(content).toContain('Strict Mode');
    expect(content).toContain('tao');
  });
});

describe('F-B — the de-referenced rule files still exist on disk (on-demand reachable)', () => {
  test.each(DE_REFERENCED)('%s.md is present in .claude/rules', (rule) => {
    expect(fs.existsSync(path.join(ROOT, '.claude', 'rules', `${rule}.md`))).toBe(true);
  });
});
