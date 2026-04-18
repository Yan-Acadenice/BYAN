/**
 * Agent dual-format generator.
 *
 * Reads a canonical BYAN agent stub (Copilot format: YAML frontmatter +
 * XML code block) and emits a Claude Code skill (`.claude/skills/byan-<name>/SKILL.md`)
 * with equivalent semantics expressed as markdown + frontmatter.
 *
 * The Copilot stub remains the canonical source — the generator only
 * derives the Claude skill from it. No mutation of the input.
 */

const path = require('path');
const fs = require('fs');

const XML_BLOCK_RE = /```xml\s*\n([\s\S]*?)\n```/;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;

function parseFrontmatter(raw) {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return {};
  const body = m[1];
  const out = {};
  for (const line of body.split(/\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[kv[1]] = val;
  }
  return out;
}

function extractXmlBlock(raw) {
  const m = raw.match(XML_BLOCK_RE);
  return m ? m[1] : '';
}

function extractSection(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractMenuItems(xml) {
  const menu = extractSection(xml, 'menu');
  if (!menu) return [];
  const items = [];
  const itemRe = /<item(?:\s+([^>]*))?>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(menu)) !== null) {
    const attrs = parseAttrs(m[1] || '');
    items.push({ ...attrs, label: m[2].trim() });
  }
  return items;
}

function parseAttrs(src) {
  const out = {};
  const re = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[2];
  return out;
}

function extractListItems(xml, parentTag, itemTag) {
  const parent = extractSection(xml, parentTag);
  if (!parent) return [];
  const re = new RegExp(`<${itemTag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${itemTag}>`, 'g');
  const items = [];
  let m;
  while ((m = re.exec(parent)) !== null) items.push(m[1].trim());
  return items;
}

function buildDescription(frontmatter, personaRole, keywords = []) {
  const base = frontmatter.description || '';
  const role = personaRole ? ` Role: ${personaRole}.` : '';
  const trig = keywords.length
    ? ` Invoke when user mentions : ${keywords.join(', ')}.`
    : '';
  return `${base}${role}${trig}`.trim();
}

function renderSkillBody(sections, items) {
  const out = [];

  if (sections.persona) {
    out.push('## Persona');
    out.push('');
    out.push(sections.persona.replace(/<\/?(role|identity|communication_style|principles|mantras_core)[^>]*>/g, (_, t) => `\n**${t.replace(/_/g, ' ')}:** `).trim());
    out.push('');
  }

  if (items.length) {
    out.push('## Menu');
    out.push('');
    out.push('| Command | Action |');
    out.push('|---|---|');
    for (const it of items) {
      const cmd = (it.cmd || '').split(' or ')[0];
      out.push(`| ${cmd} | ${it.label.replace(/\|/g, '\\|')} |`);
    }
    out.push('');
  }

  if (sections.rules && sections.rules.length) {
    out.push('## Rules');
    out.push('');
    for (const r of sections.rules) out.push(`- ${r}`);
    out.push('');
  }

  if (sections.capabilities && sections.capabilities.length) {
    out.push('## Capabilities');
    out.push('');
    for (const c of sections.capabilities) out.push(`- ${c}`);
    out.push('');
  }

  if (sections.antiPatterns && sections.antiPatterns.length) {
    out.push('## Anti-patterns');
    out.push('');
    for (const a of sections.antiPatterns) out.push(`- ${a}`);
    out.push('');
  }

  return out.join('\n');
}

function generateClaudeSkill(copilotStubPath, options = {}) {
  const raw = fs.readFileSync(copilotStubPath, 'utf8');
  const fm = parseFrontmatter(raw);
  if (!fm.name) {
    throw new Error(`Canonical stub missing name frontmatter: ${copilotStubPath}`);
  }
  const xml = extractXmlBlock(raw);

  const roleNode = extractSection(xml, 'role');
  const menuItems = extractMenuItems(xml);
  const rules = extractListItems(xml, 'rules', 'r');
  const capabilities = extractListItems(xml, 'capabilities', 'cap');
  const antiPatterns = extractListItems(xml, 'anti_patterns', 'anti');
  const personaRaw = extractSection(xml, 'persona') || '';

  const keywords = menuItems
    .map((it) => (it.cmd || '').split(' or ').map((s) => s.trim()))
    .flat()
    .filter((s) => s && s.length < 30)
    .slice(0, 10);

  const skillName = options.skillName || `byan-${fm.name}`;
  const description = buildDescription(fm, roleNode, keywords);
  const body = renderSkillBody(
    { persona: personaRaw, rules, capabilities, antiPatterns },
    menuItems
  );

  const content = `---\nname: ${skillName}\ndescription: ${escapeYamlValue(description)}\n---\n\n# ${fm.name}\n\n${body}`;

  const outPath =
    options.outPath ||
    path.join('.claude', 'skills', skillName, 'SKILL.md');

  if (options.write !== false) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
  }

  return { outPath, skillName, description, content };
}

function escapeYamlValue(v) {
  if (typeof v !== 'string') return '';
  if (/[:#\n]/.test(v)) return JSON.stringify(v);
  return v;
}

module.exports = {
  parseFrontmatter,
  extractXmlBlock,
  extractSection,
  extractMenuItems,
  extractListItems,
  buildDescription,
  renderSkillBody,
  generateClaudeSkill,
};
