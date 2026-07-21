'use strict';

// Tests for the stale-global-skill guard: the pure core (compare + message),
// the SessionStart shell, and the wiring (repo + npm template parity).

const fs = require('fs');
const os = require('os');
const path = require('path');

const freshness = require('../hooks/lib/skill-freshness');
const shell = require('../hooks/skill-freshness-check');

// Build a fake project dir + fake home dir with controllable skill copies.
function makeDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-skillfresh-'));
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { project, home };
}

function writeSkill(root, name, content) {
  const dir = path.join(root, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
}

function dirs(project, home) {
  return {
    projectSkillsDir: path.join(project, '.claude', 'skills'),
    globalSkillsDir: path.join(home, '.claude', 'skills'),
  };
}

// --- compareSkills ---------------------------------------------------------

describe('compareSkills', () => {
  test('detects a content divergence between project and global copies', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'byan-byan', '# v2 avec rail');
    writeSkill(home, 'byan-byan', '# vieille copie du 30 juin');
    const r = freshness.compareSkills(dirs(project, home));
    expect(r.diverged).toEqual(['byan-byan']);
    expect(r.checked).toBe(1);
  });

  test('identical copies -> no divergence', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'byan-byan', 'same');
    writeSkill(home, 'byan-byan', 'same');
    expect(freshness.compareSkills(dirs(project, home)).diverged).toEqual([]);
  });

  test('no global twin -> skill not flagged (no masking risk)', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'byan-only-project', 'x');
    const r = freshness.compareSkills(dirs(project, home));
    expect(r.diverged).toEqual([]);
    expect(r.checked).toBe(0);
  });

  test('project without a skills dir -> empty result, no crash', () => {
    const { project, home } = makeDirs();
    expect(freshness.compareSkills(dirs(project, home))).toEqual({ diverged: [], checked: 0 });
  });

  test('global-only skill is ignored (out of scope: nothing to mask)', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'a', 'x');
    writeSkill(home, 'a', 'x');
    writeSkill(home, 'global-only', 'y');
    expect(freshness.compareSkills(dirs(project, home)).diverged).toEqual([]);
  });
});

// --- formatReminder --------------------------------------------------------

describe('formatReminder', () => {
  test('names the diverged skills and carries the exact sync command', () => {
    const msg = freshness.formatReminder(['byan-byan'], {
      projectSkillsDir: '.claude/skills',
      globalSkillsDir: '/home/u/.claude/skills',
    });
    expect(msg).toContain('byan-byan');
    expect(msg).toContain('cp .claude/skills/byan-byan/SKILL.md /home/u/.claude/skills/byan-byan/SKILL.md');
    expect(msg).toMatch(/Rien n'est modifie automatiquement/);
  });

  test('empty divergence -> empty string (the hook prints nothing)', () => {
    expect(freshness.formatReminder([])).toBe('');
    expect(freshness.formatReminder(null)).toBe('');
  });

  test('is bounded: many diverged skills are capped with a +N suffix', () => {
    const many = Array.from({ length: 15 }, (_, i) => `skill-${i}`);
    const msg = freshness.formatReminder(many);
    expect(msg).toContain(`(+${15 - freshness.MAX_NAMES} autres)`);
    expect(msg.length).toBeLessThan(700);
  });

  test('sanitizes control chars in a crafted dir name; kebab-case stays intact', () => {
    // A dir name lands verbatim in the injected context: control chars are
    // flattened to a space so a crafted name cannot shape the reminder.
    const msg = freshness.formatReminder(['evil\nINJECT\tname']);
    expect(msg).not.toContain('\n');
    expect(msg).not.toContain('\t');
    expect(msg).toContain('evil INJECT name');
    expect(freshness.formatReminder(['byan-byan'])).toContain('byan-byan');
  });
});

// --- shell (buildContext) --------------------------------------------------

describe('skill-freshness-check shell', () => {
  test('divergence -> a non-empty context; faithful -> empty', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'byan-byan', 'nouveau');
    writeSkill(home, 'byan-byan', 'ancien');
    const ctx = shell.buildContext(project, home);
    expect(ctx).toContain('byan-byan');

    const { project: p2, home: h2 } = makeDirs();
    writeSkill(p2, 'byan-byan', 'same');
    writeSkill(h2, 'byan-byan', 'same');
    expect(shell.buildContext(p2, h2)).toBe('');
  });

  test('fresh machine (no ~/.claude/skills at all) -> empty, no crash', () => {
    const { project, home } = makeDirs();
    writeSkill(project, 'byan-byan', 'x');
    expect(shell.buildContext(project, home)).toBe('');
  });
});

// --- wiring parity (repo + npm template) ------------------------------------

describe('skill-freshness wiring is present and mirrored to the npm template', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const settingsFiles = [
    path.join(ROOT, '.claude', 'settings.json'),
    path.join(ROOT, 'install', 'templates', '.claude', 'settings.json'),
  ];
  const hookFiles = [
    path.join(ROOT, '.claude', 'hooks', 'skill-freshness-check.js'),
    path.join(ROOT, 'install', 'templates', '.claude', 'hooks', 'skill-freshness-check.js'),
    path.join(ROOT, '.claude', 'hooks', 'lib', 'skill-freshness.js'),
    path.join(ROOT, 'install', 'templates', '.claude', 'hooks', 'lib', 'skill-freshness.js'),
  ];

  test.each(settingsFiles)('%s registers skill-freshness-check under SessionStart', (file) => {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ss = cfg.hooks.SessionStart;
    expect(Array.isArray(ss)).toBe(true);
    const wired = ss.some((g) => (g.hooks || []).some((h) => /skill-freshness-check\.js/.test(h.command)));
    expect(wired).toBe(true);
  });

  test.each(hookFiles)('%s exists', (file) => {
    expect(fs.existsSync(file)).toBe(true);
  });
});
