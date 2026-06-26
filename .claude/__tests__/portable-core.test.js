/**
 * Portable-core litmus (FD memory-portable-core, option 1).
 *
 * Two guarantees, made mechanical:
 *   1. RUNTIME INDEPENDENCE — BYAN's identity (soul/tao/soul-memory) and FD
 *      state reconstruct from the portable in-repo artifacts under _byan/, with
 *      only a project directory and NO native Claude layer. No critical read
 *      path depends on the native AutoMem (~/.claude/projects/.../memory/).
 *   2. DOCTRINE ARTIFACT — the portable-core doctrine is graved as a rule,
 *      mirrored to AGENTS.md (Codex), pointed to from CLAUDE.md WITHOUT an
 *      @-import (token-budget doctrine), and present in the install template.
 *
 * The runtime block is a regression guard: it is green because the audit
 * already established the property; it stays green only as long as no future
 * change couples a critical path to the native AutoMem. The doctrine block is
 * red until the rule is written (TDD).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const injectSoul = require('../hooks/inject-soul');
const injectTao = require('../hooks/inject-tao');
const voiceAnchor = require('../hooks/inject-voice-anchor');

// The native AutoMem lives at ~/.claude/projects/<hash>/memory/ — per-machine,
// path-hashed, not shippable via npm. A critical BYAN read path must never
// depend on it. These ASCII-stable patterns are accent-proof on purpose.
const NATIVE_AUTOMEM = /\.claude\/projects\/|AutoMem|memory\/MEMORY\.md/;

// Identity + FD-state read paths that MUST stay portable (project-local only).
const CRITICAL_FILES = [
  '.claude/hooks/inject-soul.js',
  '.claude/hooks/inject-tao.js',
  '.claude/hooks/inject-voice-anchor.js',
  '.claude/hooks/soul-memory-check.js',
  '.claude/hooks/soul-memory-triggers.js',
  '.claude/hooks/pre-compact-save.js',
  '_byan/mcp/byan-mcp-server/lib/fd-state.js',
];

const IDENTITY_FILES = [
  '_byan/agent/byan/soul.md',
  '_byan/agent/byan/tao.md',
  '_byan/agent/byan/soul-memory.md',
];

function portableProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-portable-'));
  fs.mkdirSync(path.join(dir, '_byan', 'agent', 'byan'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'soul.md'), '# Soul\nNoyau immuable.');
  fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), '# Tao\nRegistre artisan.');
  fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'soul-memory.md'), '# Soul-memory\nJournal.');
  return dir;
}

describe('portable-core: runtime independence (litmus, regression guard)', () => {
  test('the three portable identity files ship in-repo under _byan/', () => {
    for (const rel of IDENTITY_FILES) {
      const p = path.join(REPO, rel);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p, 'utf8').trim().length).toBeGreaterThan(0);
    }
  });

  test('identity reconstructs from a portable project alone (no native layer)', () => {
    const dir = portableProject();
    try {
      // Builders take only a project dir — they never reach into ~/.claude.
      expect(injectSoul.buildAdditionalContext(dir)).toMatch(/SOUL/);
      expect(injectSoul.buildAdditionalContext(dir)).toMatch(/SOUL-MEMORY/);
      expect(injectTao.buildTaoContext(dir).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the per-turn voice anchor is a non-empty constant (voice present without native)', () => {
    expect(typeof voiceAnchor.ANCHOR).toBe('string');
    expect(voiceAnchor.ANCHOR.trim().length).toBeGreaterThan(0);
  });

  test('no critical read path depends on the native AutoMem', () => {
    for (const rel of CRITICAL_FILES) {
      const p = path.join(REPO, rel);
      expect(fs.existsSync(p)).toBe(true);
      const src = fs.readFileSync(p, 'utf8');
      expect(src).not.toMatch(NATIVE_AUTOMEM);
    }
  });
});

describe('portable-core: doctrine artifact', () => {
  const RULE = path.join(REPO, '.claude/rules/portable-core.md');
  const TEMPLATE_RULE = path.join(REPO, 'install/templates/.claude/rules/portable-core.md');
  const AGENTS = path.join(REPO, 'AGENTS.md');
  const CLAUDE_MD = path.join(REPO, '.claude/CLAUDE.md');
  const TEMPLATE_CLAUDE_MD = path.join(REPO, 'install/templates/.claude/CLAUDE.md');

  test('the doctrine rule exists and states the three boundary points', () => {
    expect(fs.existsSync(RULE)).toBe(true);
    const rule = fs.readFileSync(RULE, 'utf8');
    expect(rule.length).toBeGreaterThan(500);
    expect(rule).toMatch(/_byan/);          // portable source of truth
    expect(rule).toMatch(/write-through/i); // native = accelerator, not dependency
    expect(rule).toMatch(/AutoMem/);        // named out-of-perimeter
    expect(rule).toMatch(/\.claude\/projects/); // the native path it excludes
  });

  test('the doctrine carries a feature -> adapter -> degraded-path table', () => {
    const rule = fs.readFileSync(RULE, 'utf8');
    expect(rule).toMatch(/@-import/);   // memory-files adapter
    expect(rule).toMatch(/AGENTS\.md/); // hooks <-> AGENTS.md adapter (Codex)
    expect(rule).toMatch(/subagent/i);  // subagent isolation adapter
  });

  test('the doctrine is mirrored into AGENTS.md (Codex degraded target)', () => {
    const agents = fs.readFileSync(AGENTS, 'utf8');
    expect(agents).toMatch(/portable/i);
    expect(agents).toMatch(/AutoMem/);
  });

  test('CLAUDE.md points to the rule WITHOUT an @-import (token budget)', () => {
    const claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');
    expect(claudeMd).toMatch(/portable-core\.md/);
    expect(claudeMd).not.toMatch(/@\.claude\/rules\/portable-core\.md/);
  });

  test('the rule and the CLAUDE.md pointer are mirrored to the install template', () => {
    expect(fs.existsSync(TEMPLATE_RULE)).toBe(true);
    expect(fs.readFileSync(TEMPLATE_RULE, 'utf8')).toMatch(/AutoMem/);
    expect(fs.readFileSync(TEMPLATE_CLAUDE_MD, 'utf8')).toMatch(/portable-core\.md/);
  });
});
