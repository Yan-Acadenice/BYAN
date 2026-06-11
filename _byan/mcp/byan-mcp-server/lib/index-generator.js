// BYAN index generator.
//
// Produces _byan/INDEX.md — a human- and agent-readable map of the platform,
// derived from the machine-source manifests (_byan/_config/*-manifest.csv) plus
// a scan of the project zone (_byan/projet/*). Claude Code and Codex
// read this instead of walking the whole file system.
//
// Manifest-driven by design: the index reflects whatever the manifests declare,
// so it stays correct across the FS refactor (old or new layout). Output is
// deterministic (sorted, no timestamp) so regeneration is idempotent.

import fs from 'node:fs';
import path from 'node:path';

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'" };
function decodeEntities(s) {
  return String(s).replace(/&quot;|&amp;|&lt;|&gt;|&#39;/g, (m) => ENTITIES[m]);
}

// Minimal RFC-4180-ish CSV parser: quoted fields, embedded commas/newlines,
// "" escaped quotes. Returns an array of objects keyed by the header row.
export function parseManifestCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  const src = String(text);

  const pushField = () => {
    record.push(decodeEntities(field));
    field = '';
  };
  const pushRecord = () => {
    // Ignore blank records (e.g. trailing newline).
    if (record.length > 1 || (record.length === 1 && record[0] !== '')) {
      rows.push(record);
    }
    record = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField();
      pushRecord();
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) {
    pushField();
    pushRecord();
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cols) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    return obj;
  });
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseManifestCsv(fs.readFileSync(filePath, 'utf8'));
}

export function loadManifests(projectRoot) {
  const root = resolveRoot(projectRoot);
  const cfg = path.join(root, '_byan', '_config');
  const agents = readCsvRows(path.join(cfg, 'agent-manifest.csv')).map((r) => ({
    name: r.name, title: r.title || r.displayName || '', module: r.module || 'core', path: r.path || '',
  }));
  const workflows = readCsvRows(path.join(cfg, 'workflow-manifest.csv')).map((r) => ({
    name: r.name, description: r.description || '', module: r.module || 'core', path: r.path || '',
  }));
  // task-manifest legacy -> commands (D1). Prefer command-manifest if present.
  const cmdFile = fs.existsSync(path.join(cfg, 'command-manifest.csv'))
    ? 'command-manifest.csv' : 'task-manifest.csv';
  const commands = readCsvRows(path.join(cfg, cmdFile)).map((r) => ({
    name: r.name, description: r.description || '', module: r.module || 'core', path: r.path || '',
  }));
  return { agents, workflows, commands };
}

export function scanProjects(projectRoot) {
  const root = resolveRoot(projectRoot);
  const dir = path.join(root, '_byan', 'projet');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ slug: e.name, path: `_byan/projet/${e.name}` }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function groupByModule(items) {
  const byMod = new Map();
  for (const it of items) {
    const m = it.module || 'core';
    if (!byMod.has(m)) byMod.set(m, []);
    byMod.get(m).push(it);
  }
  return [...byMod.keys()].sort().map((m) => ({
    module: m,
    items: byMod.get(m).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function renderIndex({ agents = [], workflows = [], commands = [], projects = [] } = {}) {
  const lines = [];
  lines.push('# BYAN Index');
  lines.push('');
  lines.push('> Carte du systeme de fichiers BYAN. Genere automatiquement — ne pas editer a la main.');
  lines.push('> Source : `_byan/_config/*-manifest.csv` + scan `_byan/projet/`. Regenerer : `byan-build-index`.');
  lines.push('');

  lines.push(`## Agents (${agents.length})`);
  for (const grp of groupByModule(agents)) {
    lines.push('');
    lines.push(`### ${grp.module}`);
    for (const a of grp.items) {
      lines.push(`- \`${a.name}\` — ${a.title || ''} — \`${a.path}\``);
    }
  }
  lines.push('');

  lines.push(`## Workflows (${workflows.length})`);
  for (const grp of groupByModule(workflows)) {
    lines.push('');
    lines.push(`### ${grp.module}`);
    for (const w of grp.items) {
      lines.push(`- \`${w.name}\` — ${w.description || ''} — \`${w.path}\``);
    }
  }
  lines.push('');

  lines.push(`## Commandes (${commands.length})`);
  lines.push('');
  for (const c of commands.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`- \`${c.name}\` — ${c.description || ''} — \`${c.path}\``);
  }
  lines.push('');

  lines.push(`## Projets (${projects.length})`);
  lines.push('');
  for (const p of projects.slice().sort((a, b) => a.slug.localeCompare(b.slug))) {
    lines.push(`- \`${p.slug}\` — \`${p.path}\``);
  }
  lines.push('');

  return lines.join('\n');
}

function writeIfChanged(filePath, content) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prev === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

export function buildIndex({ projectRoot } = {}) {
  const root = resolveRoot(projectRoot);
  const { agents, workflows, commands } = loadManifests(root);
  const projects = scanProjects(root);
  const content = renderIndex({ agents, workflows, commands, projects });
  const indexPath = path.join(root, '_byan', 'INDEX.md');
  const written = writeIfChanged(indexPath, content);
  return { written, path: indexPath, counts: { agents: agents.length, workflows: workflows.length, commands: commands.length, projects: projects.length } };
}
