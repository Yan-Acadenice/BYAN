const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const gen = require('../lib/subagent-generator');

const FIXTURE = `---
name: "architect"
description: "BMAD architect agent"
---

\`\`\`xml
<agent id="architect" name="Winston" title="Architect">
  <persona>
    <role>Software Architect</role>
    <identity>Designs systems, picks tech stacks</identity>
    <communication_style>Clear, structured, challenges trade-offs</communication_style>
  </persona>
  <rules>
    <r>Challenge trade-offs before proposing</r>
    <r>Document every ADR</r>
  </rules>
  <menu>
    <item cmd="ARCH" exec="x.md">[ARCH] Design architecture</item>
    <item cmd="EXIT">[EXIT] Leave</item>
  </menu>
  <capabilities>
    <cap id="adr">Write architecture decision records</cap>
    <cap id="stack">Pick a tech stack</cap>
  </capabilities>
</agent>
\`\`\`
`;

describe('subagent-generator', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-subagent-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('normalizeName strips bmad-agent- prefix and .md suffix', () => {
    expect(gen.normalizeName('bmad-agent-architect.md')).toBe('architect');
    expect(gen.normalizeName('architect.md')).toBe('architect');
  });

  test('pickModel returns opus for architect, haiku for rachid, sonnet default', () => {
    expect(gen.pickModel('architect')).toBe('opus');
    expect(gen.pickModel('tea')).toBe('opus');
    expect(gen.pickModel('bmad-master')).toBe('opus');
    expect(gen.pickModel('rachid')).toBe('haiku');
    expect(gen.pickModel('carmack')).toBe('haiku');
    expect(gen.pickModel('analyst')).toBe('sonnet');
    expect(gen.pickModel('unknown')).toBe('sonnet');
  });

  test('generateSubagent writes frontmatter with required fields', async () => {
    const stub = path.join(tmp, 'bmad-agent-architect.md');
    fs.writeFileSync(stub, FIXTURE);

    const outPath = path.join(tmp, 'out', 'bmad-architect.md');
    const r = gen.generateSubagent(stub, { outPath });

    expect(r.subagentName).toBe('bmad-architect');
    expect(r.model).toBe('opus');
    expect(fs.existsSync(outPath)).toBe(true);

    const content = fs.readFileSync(outPath, 'utf8');
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/name: bmad-architect/);
    expect(content).toMatch(/model: opus/);
    expect(content).toMatch(/color: purple/);
    expect(content).toMatch(/description: /);
  });

  test('body contains persona, rules, capabilities, menu, reporting contract', () => {
    const stub = path.join(tmp, 'bmad-agent-architect.md');
    fs.writeFileSync(stub, FIXTURE);

    const outPath = path.join(tmp, 'out', 'bmad-architect.md');
    gen.generateSubagent(stub, { outPath });
    const content = fs.readFileSync(outPath, 'utf8');

    expect(content).toContain('## Persona');
    expect(content).toContain('Software Architect');
    expect(content).toContain('## Operating rules');
    expect(content).toContain('Challenge trade-offs before proposing');
    expect(content).toContain('## Capabilities');
    expect(content).toContain('Write architecture decision records');
    expect(content).toContain('## Menu commands');
    expect(content).toContain('[ARCH]');
    expect(content).toContain('## Reporting contract');
    expect(content).toContain('status');
  });

  test('write:false returns content without writing', () => {
    const stub = path.join(tmp, 'bmad-agent-architect.md');
    fs.writeFileSync(stub, FIXTURE);
    const r = gen.generateSubagent(stub, { outPath: '/tmp/x', write: false });
    expect(fs.existsSync('/tmp/x')).toBe(false);
    expect(r.content).toContain('name: bmad-architect');
  });

  test('cleanXmlTags strips nested tags in persona body', () => {
    const dirty = '<role>Architect</role>\n<identity>Designs</identity>';
    const clean = gen.cleanXmlTags(dirty);
    expect(clean).not.toContain('<role>');
    expect(clean).not.toContain('</identity>');
    expect(clean).toContain('Architect');
    expect(clean).toContain('Designs');
  });

  test('model override option wins over ROLE_MODEL_MAP', () => {
    const stub = path.join(tmp, 'bmad-agent-architect.md');
    fs.writeFileSync(stub, FIXTURE);
    const r = gen.generateSubagent(stub, {
      outPath: path.join(tmp, 'o.md'),
      model: 'haiku',
    });
    expect(r.model).toBe('haiku');
    expect(r.color).toBe('cyan');
  });

  test('color uses model→color map (opus=purple, sonnet=blue, haiku=cyan)', () => {
    const stub = path.join(tmp, 'bmad-agent-foo.md');
    fs.writeFileSync(stub, FIXTURE.replace('name: "architect"', 'name: "foo"'));
    const r = gen.generateSubagent(stub, {
      outPath: path.join(tmp, 'o.md'),
      model: 'sonnet',
    });
    expect(r.color).toBe('blue');
  });

  test('throws when stub has no name frontmatter', () => {
    const stub = path.join(tmp, 'bad.md');
    fs.writeFileSync(stub, '# no frontmatter');
    expect(() => gen.generateSubagent(stub, { outPath: '/tmp/x' })).toThrow();
  });
});
