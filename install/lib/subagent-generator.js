/**
 * BMAD subagent generator (AW2).
 *
 * Reads a BYAN Copilot agent stub (.github/agents/<name>.md — YAML
 * frontmatter + XML persona block) and emits a Claude Code native
 * subagent file at .claude/agents/bmad-<slug>.md with :
 *   - frontmatter : name, description, model, color
 *   - body : system prompt derived from <persona> + <rules> + <menu>
 *
 * The resulting file makes the BMAD agent available as a
 * subagent_type in Claude Code's Agent tool after a session restart.
 * Model assignment is driven by ROLE_MODEL_MAP (token-optimal defaults).
 */

const path = require('path');
const fs = require('fs');

const ROLE_MODEL_MAP = {
  // Reasoning-heavy → opus
  architect: 'opus',
  'bmm-architect': 'opus',
  tea: 'opus',
  'tea-tea': 'opus',
  quinn: 'opus',
  'bmm-quinn': 'opus',
  'bmad-master': 'opus',
  byan: 'opus',
  'creative-problem-solver': 'opus',
  'cis-creative-problem-solver': 'opus',

  // Narrow mechanical → haiku
  carmack: 'haiku',
  rachid: 'haiku',
  marc: 'haiku',
  patnote: 'haiku',
  drawio: 'haiku',
};

const ROLE_COLOR_MAP = {
  opus: 'purple',
  sonnet: 'blue',
  haiku: 'cyan',
};

function normalizeName(stubFilename) {
  return stubFilename
    .replace(/^bmad-agent-/, '')
    .replace(/\.md$/, '');
}

function pickModel(name) {
  return ROLE_MODEL_MAP[name] || 'sonnet';
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[kv[1]] = v;
  }
  return out;
}

function extractXmlBlock(raw) {
  const m = raw.match(/```xml\s*\n([\s\S]*?)\n```/);
  return m ? m[1] : '';
}

function extractSection(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
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

function cleanXmlTags(text) {
  if (!text) return '';
  return text
    .replace(/<\/?[a-zA-Z_][\w-]*(\s+[^>]*)?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildBody({ fm, persona, rules, menu, capabilities }) {
  const lines = [];
  lines.push(`# ${fm.name}`);
  lines.push('');
  if (fm.description) {
    lines.push(fm.description);
    lines.push('');
  }

  if (persona) {
    lines.push('## Persona');
    lines.push('');
    lines.push(cleanXmlTags(persona));
    lines.push('');
  }

  if (rules && rules.length) {
    lines.push('## Operating rules');
    lines.push('');
    for (const r of rules) lines.push(`- ${cleanXmlTags(r)}`);
    lines.push('');
  }

  if (capabilities && capabilities.length) {
    lines.push('## Capabilities');
    lines.push('');
    for (const c of capabilities) lines.push(`- ${cleanXmlTags(c)}`);
    lines.push('');
  }

  if (menu && menu.length) {
    lines.push('## Menu commands');
    lines.push('');
    for (const m of menu) lines.push(`- ${cleanXmlTags(m)}`);
    lines.push('');
  }

  lines.push('## Reporting contract');
  lines.push('');
  lines.push(
    'When invoked via the Agent tool, stay in the persona above. Respond with a concise JSON report when the task completes : { status: "ok|partial|failed", summary: "<200 words", files_changed: [paths], next_steps: [] }.'
  );

  return lines.join('\n');
}

function generateSubagent(stubPath, options = {}) {
  const raw = fs.readFileSync(stubPath, 'utf8');
  const fm = parseFrontmatter(raw);
  if (!fm.name) throw new Error(`stub missing name frontmatter: ${stubPath}`);

  const baseName = options.name || normalizeName(path.basename(stubPath));
  const xml = extractXmlBlock(raw);

  const persona = extractSection(xml, 'persona') || '';
  const rules = extractListItems(xml, 'rules', 'r');
  const menu = extractListItems(xml, 'menu', 'item');
  const capabilities = extractListItems(xml, 'capabilities', 'cap');

  const subagentName = options.subagentName || `bmad-${baseName}`;
  const model = options.model || pickModel(baseName);
  const color = options.color || ROLE_COLOR_MAP[model] || 'blue';

  const description =
    options.description ||
    fm.description ||
    `BMAD ${baseName} agent — invoke for ${baseName} role tasks`;

  const body = buildBody({
    fm: { ...fm, name: subagentName },
    persona,
    rules,
    menu,
    capabilities,
  });

  const content = `---\nname: ${subagentName}\ndescription: ${escapeYaml(description)}\nmodel: ${model}\ncolor: ${color}\n---\n\n${body}\n`;

  const outPath =
    options.outPath ||
    path.join('.claude', 'agents', `${subagentName}.md`);

  if (options.write !== false) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
  }

  return { outPath, subagentName, model, color, content };
}

function escapeYaml(v) {
  if (typeof v !== 'string') return '';
  if (/[:#\n]/.test(v)) return JSON.stringify(v);
  return v;
}

module.exports = {
  ROLE_MODEL_MAP,
  ROLE_COLOR_MAP,
  normalizeName,
  pickModel,
  parseFrontmatter,
  extractXmlBlock,
  extractSection,
  extractListItems,
  cleanXmlTags,
  buildBody,
  generateSubagent,
};
