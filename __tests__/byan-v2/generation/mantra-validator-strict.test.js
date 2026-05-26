const fs = require('fs');
const path = require('path');
const MantraValidator = require('../../../src/byan-v2/generation/mantra-validator');

const STRICT_DATA = path.join(__dirname, '../../../src/byan-v2/data/strict-mantras.json');
const STRICT_SKILL = path.join(
  __dirname,
  '../../../.claude/skills/byan-strict/SKILL.md'
);

const hasStrictData = fs.existsSync(STRICT_DATA);

describe('MantraValidator — strict-mode extension', () => {
  test('strict-mantras.json exists and holds >= 10 mantras', () => {
    expect(hasStrictData).toBe(true);
    const data = JSON.parse(fs.readFileSync(STRICT_DATA, 'utf8'));
    expect(data.mantras.length).toBeGreaterThanOrEqual(10);
    data.mantras.forEach((m) => {
      expect(m.id).toMatch(/^STRICT-\d+$/);
      expect(m.validation.type).toBe('keyword');
      expect(Array.isArray(m.validation.keywords)).toBe(true);
    });
  });

  test('persona artifact is scored against the 64 persona mantras', () => {
    const v = new MantraValidator();
    const r = v.validate('# Agent\npersona: Mary\nresponsable owner assignee');
    expect(r.totalMantras).toBe(64);
  });

  test('strict artifact is auto-detected and scored against strict mantras', () => {
    const v = new MantraValidator();
    const content = '---\nname: byan-strict\n---\n# BYAN Strict Mode\nSTRICT-1 STRICT-2 STRICT-3';
    const r = v.validate(content);
    expect(r.totalMantras).toBeLessThanOrEqual(20);
    expect(r.totalMantras).toBeGreaterThanOrEqual(10);
  });

  test('content with 3+ STRICT-N ids is treated as strict even without frontmatter', () => {
    const v = new MantraValidator();
    const r = v.validate('notes: STRICT-1 then STRICT-7 and STRICT-12 apply');
    expect(r.totalMantras).toBeLessThanOrEqual(20);
  });

  test('the generated strict SKILL.md scores 100%', () => {
    if (!fs.existsSync(STRICT_SKILL)) {
      return; // generated artifact not present in this checkout
    }
    const v = new MantraValidator();
    const r = v.validate(fs.readFileSync(STRICT_SKILL, 'utf8'));
    const pct = Math.round((r.compliant.length / r.totalMantras) * 100);
    expect(pct).toBe(100);
  });

  test('explicit mantrasData in constructor disables strict auto-switch', () => {
    const custom = {
      mantras: [
        {
          id: 'X1',
          title: 'custom',
          validation: { type: 'keyword', keywords: ['zzz'], required: true },
          priority: 'high',
        },
      ],
    };
    const v = new MantraValidator(custom);
    const r = v.validate('---\nname: byan-strict\n---\n# BYAN Strict Mode\nSTRICT-1 STRICT-2 STRICT-3');
    expect(r.totalMantras).toBe(1); // stayed on the explicit set
  });
});
