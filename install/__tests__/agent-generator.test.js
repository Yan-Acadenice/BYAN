const path = require('path');
const fs = require('fs');
const os = require('os');
const gen = require('../lib/agent-generator');

const FIXTURE = `---
name: "sample"
description: "Sample BYAN agent for testing"
---

Preamble text.

\`\`\`xml
<agent id="sample" name="Sample" title="Sample agent" icon="X">
  <activation critical="MANDATORY">
    <step n="1">Load persona</step>
  </activation>
  <persona>
    <role>Tester</role>
    <identity>Runs tests</identity>
    <communication_style>Terse</communication_style>
  </persona>
  <rules>
    <r>Always test</r>
    <r>Never skip</r>
  </rules>
  <menu>
    <item cmd="T or fuzzy match on test" exec="tests/run.md">[T] Run tests</item>
    <item cmd="EXIT">[EXIT] Leave</item>
  </menu>
  <capabilities>
    <cap id="run">Run test suites</cap>
    <cap id="report">Generate reports</cap>
  </capabilities>
  <anti_patterns>
    <anti id="skip">Never skip tests</anti>
  </anti_patterns>
</agent>
\`\`\`
`;

describe('agent-generator', () => {
  let tmpRoot;
  let fixturePath;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-gen-'));
    fixturePath = path.join(tmpRoot, 'sample.md');
    fs.writeFileSync(fixturePath, FIXTURE);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('parseFrontmatter', () => {
    test('extracts name and description', () => {
      const fm = gen.parseFrontmatter(FIXTURE);
      expect(fm.name).toBe('sample');
      expect(fm.description).toBe('Sample BYAN agent for testing');
    });

    test('returns {} when no frontmatter', () => {
      expect(gen.parseFrontmatter('no frontmatter here')).toEqual({});
    });
  });

  describe('extractXmlBlock', () => {
    test('extracts xml content between fences', () => {
      const xml = gen.extractXmlBlock(FIXTURE);
      expect(xml).toContain('<agent');
      expect(xml).toContain('</agent>');
    });

    test('returns empty string when no xml block', () => {
      expect(gen.extractXmlBlock('no block')).toBe('');
    });
  });

  describe('extractMenuItems', () => {
    test('parses items with attributes and labels', () => {
      const xml = gen.extractXmlBlock(FIXTURE);
      const items = gen.extractMenuItems(xml);
      expect(items).toHaveLength(2);
      expect(items[0].cmd).toBe('T or fuzzy match on test');
      expect(items[0].exec).toBe('tests/run.md');
      expect(items[0].label).toBe('[T] Run tests');
    });
  });

  describe('extractListItems', () => {
    test('extracts rules/capabilities/anti_patterns', () => {
      const xml = gen.extractXmlBlock(FIXTURE);
      expect(gen.extractListItems(xml, 'rules', 'r')).toEqual([
        'Always test',
        'Never skip',
      ]);
      expect(gen.extractListItems(xml, 'capabilities', 'cap')).toEqual([
        'Run test suites',
        'Generate reports',
      ]);
      expect(gen.extractListItems(xml, 'anti_patterns', 'anti')).toEqual([
        'Never skip tests',
      ]);
    });
  });

  describe('generateClaudeSkill', () => {
    test('writes SKILL.md with frontmatter and body', () => {
      const outPath = path.join(tmpRoot, 'out', 'SKILL.md');
      const result = gen.generateClaudeSkill(fixturePath, { outPath });

      expect(result.skillName).toBe('byan-sample');
      expect(fs.existsSync(outPath)).toBe(true);

      const content = fs.readFileSync(outPath, 'utf8');
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/name: byan-sample/);
      expect(content).toMatch(/description: /);
      expect(content).toContain('## Persona');
      expect(content).toContain('## Menu');
      expect(content).toContain('## Rules');
      expect(content).toContain('## Capabilities');
      expect(content).toContain('## Anti-patterns');
      expect(content).toContain('Always test');
      expect(content).toContain('[T] Run tests');
    });

    test('write:false returns content without writing', () => {
      const outPath = path.join(tmpRoot, 'out', 'SKILL.md');
      const result = gen.generateClaudeSkill(fixturePath, { outPath, write: false });
      expect(fs.existsSync(outPath)).toBe(false);
      expect(result.content).toContain('name: byan-sample');
    });

    test('throws when canonical stub has no name frontmatter', () => {
      const badPath = path.join(tmpRoot, 'bad.md');
      fs.writeFileSync(badPath, '# no frontmatter');
      expect(() => gen.generateClaudeSkill(badPath, { outPath: '/tmp/x' })).toThrow();
    });

    test('custom skillName overrides default byan-<name>', () => {
      const outPath = path.join(tmpRoot, 'out', 'SKILL.md');
      const result = gen.generateClaudeSkill(fixturePath, {
        outPath,
        skillName: 'custom-id',
      });
      expect(result.skillName).toBe('custom-id');
      expect(result.content).toContain('name: custom-id');
    });
  });

  describe('buildDescription', () => {
    test('appends role and keywords when provided', () => {
      const d = gen.buildDescription(
        { description: 'base' },
        'Architect',
        ['design', 'plan']
      );
      expect(d).toContain('base');
      expect(d).toContain('Architect');
      expect(d).toContain('design');
      expect(d).toContain('plan');
    });
  });
});
