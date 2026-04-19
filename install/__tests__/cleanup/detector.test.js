const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  findStaleSkills,
  findStaleDocs,
  SKILL_ALLOWLIST,
  DOC_ALLOWLIST,
} = require('../../lib/cleanup/detector');

describe('cleanup/detector', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-cleanup-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  function writeSkill(name, { desc = 'A real BYAN skill with enough words to pass description length', body = 'body' } = {}) {
    const dir = path.join(tmp, '.claude', 'skills', name);
    fs.mkdirpSync(dir);
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`
    );
  }

  function writeDoc(name, content = 'hello') {
    fs.writeFileSync(path.join(tmp, name), content);
  }

  describe('findStaleSkills', () => {
    test('flags byan-test as stale (test pattern)', () => {
      writeSkill('byan-test');
      const result = findStaleSkills(path.join(tmp, '.claude', 'skills'));
      expect(result.map((r) => r.name)).toContain('byan-test');
    });

    test('flags byan-test-dynamic (test pattern)', () => {
      writeSkill('byan-test-dynamic');
      const result = findStaleSkills(path.join(tmp, '.claude', 'skills'));
      expect(result.map((r) => r.name)).toContain('byan-test-dynamic');
    });

    test('flags byan-claude + byan-codex (platform pattern)', () => {
      writeSkill('byan-claude');
      writeSkill('byan-codex');
      const names = findStaleSkills(path.join(tmp, '.claude', 'skills')).map((r) => r.name);
      expect(names).toContain('byan-claude');
      expect(names).toContain('byan-codex');
    });

    test('flags tiny SKILL.md (< 200 bytes)', () => {
      const dir = path.join(tmp, '.claude', 'skills', 'byan-other');
      fs.mkdirpSync(dir);
      fs.writeFileSync(path.join(dir, 'SKILL.md'), 'short\n');
      const result = findStaleSkills(path.join(tmp, '.claude', 'skills'));
      expect(result.map((r) => r.name)).toContain('byan-other');
      const other = result.find((r) => r.name === 'byan-other');
      expect(other.reasons.some((r) => /tiny/.test(r))).toBe(true);
    });

    test('preserves allowlisted skills (byan-hermes-dispatch, byan-forge, ...)', () => {
      for (const keep of SKILL_ALLOWLIST) writeSkill(keep);
      const result = findStaleSkills(path.join(tmp, '.claude', 'skills'));
      expect(result).toHaveLength(0);
    });

    test('does NOT flag a legit agent skill with long description and body', () => {
      writeSkill('byan-architect', {
        desc: 'Architect agent role in BYAN — designs systems, picks tech stacks, makes architectural trade-offs',
        body: 'The architect reviews infrastructure, proposes service boundaries, weighs trade-offs. '.repeat(5),
      });
      const result = findStaleSkills(path.join(tmp, '.claude', 'skills'));
      expect(result.find((r) => r.name === 'byan-architect')).toBeUndefined();
    });

    test('returns [] on missing directory', () => {
      expect(findStaleSkills(path.join(tmp, 'nonexistent'))).toEqual([]);
    });
  });

  describe('findStaleDocs', () => {
    test('flags SPRINT*.md', () => {
      writeDoc('SPRINT5-PHASE2-STATUS-REPORT.md');
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).toContain('SPRINT5-PHASE2-STATUS-REPORT.md');
    });

    test('flags BYAN-V2.1.0-MANUAL-TEST-PLAN.md', () => {
      writeDoc('BYAN-V2.1.0-MANUAL-TEST-PLAN.md');
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).toContain('BYAN-V2.1.0-MANUAL-TEST-PLAN.md');
    });

    test('flags CHANGELOG-v*.md but not CHANGELOG.md', () => {
      writeDoc('CHANGELOG.md');
      writeDoc('CHANGELOG-v2.1.0.md');
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).toContain('CHANGELOG-v2.1.0.md');
      expect(names).not.toContain('CHANGELOG.md');
    });

    test('flags MIGRATION, README-BYAN-V2, API-BYAN-V2', () => {
      writeDoc('MIGRATION-v2.0-to-v2.1.md');
      writeDoc('README-BYAN-V2.md');
      writeDoc('API-BYAN-V2.md');
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).toContain('MIGRATION-v2.0-to-v2.1.md');
      expect(names).toContain('README-BYAN-V2.md');
      expect(names).toContain('API-BYAN-V2.md');
    });

    test('flags interview-summary-*.md', () => {
      writeDoc('interview-summary-2026-02-21-franck.md');
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).toContain('interview-summary-2026-02-21-franck.md');
    });

    test('preserves allowlisted docs (README.md, LICENSE, CLAUDE.md, ...)', () => {
      for (const keep of DOC_ALLOWLIST) writeDoc(keep);
      const result = findStaleDocs(tmp);
      expect(result).toHaveLength(0);
    });

    test('does NOT flag a random current doc', () => {
      writeDoc('PROJECT-NOTES.md');
      const result = findStaleDocs(tmp);
      expect(result.find((r) => r.name === 'PROJECT-NOTES.md')).toBeUndefined();
    });

    test('does NOT recurse into subdirs', () => {
      fs.mkdirpSync(path.join(tmp, 'sub'));
      writeDoc('sub/SPRINT1-COMPLETE.md'); // should be ignored
      const names = findStaleDocs(tmp).map((r) => r.name);
      expect(names).not.toContain('SPRINT1-COMPLETE.md');
    });
  });
});
