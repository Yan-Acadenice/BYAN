/**
 * BYAN cleanup detector.
 *
 * Two scans :
 *   - findStaleSkills(skillsDir)   : Claude Code skills under .claude/skills/
 *     that look like auto-generated stubs with no real BYAN value (test
 *     agents, self-referential, platform skills, or tiny SKILL.md files).
 *   - findStaleDocs(projectRoot)   : root-level .md files that look like
 *     historical artifacts (old version docs, sprint reports, test plans,
 *     interview summaries, announcement guides).
 *
 * All detection is pattern-based with a hard allowlist ; no file is
 * flagged without a named reason.
 */

const fs = require('fs');
const path = require('path');

const SKILL_ALLOWLIST = new Set([
  'byan-fact-check',
  'byan-elo-trust',
  'byan-merise-agile',
  'byan-hermes-dispatch',
  'byan-forge',
  'byan-byan', // BYAN itself as a skill — core, never flag
]);

const SKILL_PATTERNS = [
  { re: /(^|-)test(ing|-dynamic)?$/i, reason: 'test/placeholder agent (not a real BYAN capability)' },
  { re: /^byan-byan-(v2|test)$/i, reason: 'versioned or test stub of BYAN itself' },
  { re: /^byan-(claude|codex)$/i, reason: 'platform name (not an agent role)' },
  { re: /^byan-skeptic$/i, reason: 'experimental agent not wired in menus' },
];

const DOC_ALLOWLIST = new Set([
  'README.md',
  'LICENSE',
  'LICENSE.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'CLAUDE.md',
  'GUIDE-UTILISATION.md',
  'NOTES.md',
]);

const DOC_PATTERNS = [
  { re: /^SPRINT\d+-.*\.md$/i, reason: 'sprint report' },
  { re: /^BYAN-V\d+(\.\d+)*-.*\.md$/i, reason: 'old version snapshot doc' },
  { re: /^CHANGELOG-v\d+(\.\d+)*\.md$/i, reason: 'versioned changelog (current is CHANGELOG.md)' },
  { re: /^MIGRATION-.*\.md$/i, reason: 'migration guide for an older version' },
  { re: /^README-BYAN-V\d+(\.\d+)*\.md$/i, reason: 'versioned README (current is README.md)' },
  { re: /^API-BYAN-V\d+(\.\d+)*\.md$/i, reason: 'versioned API doc' },
  { re: /^TEST-GUIDE-.*\.md$/i, reason: 'historical test guide' },
  { re: /-MANUAL-TEST-PLAN\.md$/i, reason: 'manual test plan' },
  { re: /-STATUS-REPORT\.md$/i, reason: 'status report' },
  { re: /-COMPLETE\.md$/i, reason: 'completion report' },
  { re: /-SUMMARY(\.txt|\.md)$/i, reason: 'summary artifact' },
  { re: /-DELIVERY-SUMMARY\.md$/i, reason: 'delivery summary' },
  { re: /^interview-summary-.*\.md$/i, reason: 'interview summary' },
  { re: /^fd-.*\.md$/i, reason: 'forge-persona session artifact' },
  { re: /^AGENT-LAUNCHER-DOC.*\.md$/i, reason: 'agent launcher legacy doc' },
  { re: /^ANNOUNCEMENT-GUIDE-.*\.md$/i, reason: 'announcement guide for older version' },
  { re: /^SESSION-RESUME-.*\.md$/i, reason: 'session resume artifact' },
  { re: /^BYAN-V2-.*\.md$/i, reason: 'v2-specific doc (keep only if still referenced)' },
  { re: /^BMAD-QUICK-REFERENCE.*\.md$/i, reason: 'legacy quick reference' },
  { re: /^100-PERCENT-.*\.md$/i, reason: 'milestone completion report' },
];

function readFrontmatter(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return {};
    const out = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
      if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
  } catch {
    return {};
  }
}

function findStaleSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  const found = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKILL_ALLOWLIST.has(e.name)) continue;

    const skillFile = path.join(skillsDir, e.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    const reasons = [];

    for (const { re, reason } of SKILL_PATTERNS) {
      if (re.test(e.name)) reasons.push(reason);
    }

    const size = fs.statSync(skillFile).size;
    if (size < 200) reasons.push(`tiny SKILL.md (${size} bytes — likely placeholder stub)`);

    const fm = readFrontmatter(skillFile);
    if (!fm.description || fm.description.length < 40) {
      reasons.push('missing or too-short description in frontmatter');
    }

    if (reasons.length > 0) {
      found.push({
        path: path.join(skillsDir, e.name),
        name: e.name,
        reasons,
        size,
      });
    }
  }
  return found;
}

function findStaleDocs(projectRoot) {
  if (!fs.existsSync(projectRoot)) return [];
  const found = [];
  const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(md|txt)$/i.test(e.name)) continue;
    if (DOC_ALLOWLIST.has(e.name)) continue;

    const reasons = [];
    for (const { re, reason } of DOC_PATTERNS) {
      if (re.test(e.name)) reasons.push(reason);
    }

    if (reasons.length > 0) {
      const p = path.join(projectRoot, e.name);
      const size = fs.statSync(p).size;
      found.push({ path: p, name: e.name, reasons, size });
    }
  }
  return found;
}

module.exports = {
  SKILL_ALLOWLIST,
  SKILL_PATTERNS,
  DOC_ALLOWLIST,
  DOC_PATTERNS,
  findStaleSkills,
  findStaleDocs,
  readFrontmatter,
};
