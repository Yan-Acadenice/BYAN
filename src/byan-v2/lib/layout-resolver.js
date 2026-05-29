'use strict';

// Read-side layout resolver (Gen3 adoption, Phase A).
//
// The platform is migrating its _byan/ tree from the legacy module layout
// (Gen2: _byan/{core,bmm,bmb,tea,cis}/{agents,workflows,tasks}/ + flat
// _byan/agents/, _byan/knowledge/, _byan/_memory/, root soul files) to a flat
// semantic layout (Gen3: _byan/agent/<name>/, _byan/connaissance/,
// _byan/memoire/, _byan/context/config.yaml, _byan/agent/byan/soul.md ...).
//
// This module is the single READ-side authority: "where does logical thing X
// physically live?". It answers Gen3-first, then falls back through the real
// on-disk Gen2 variants (flat AND per-module) and finally Gen1 (_bmad/). Every
// lookup is a pure existence check — no writes, no side effects — so it is
// idempotent and additive: before migration it finds Gen2, after migration it
// finds Gen3, during migration either works. That is what lets the FS migrator
// move files and "break nothing".
//
// The WRITE-side authority (where files SHOULD go) stays in the separately
// shipped MCP package: _byan/mcp/byan-mcp-server/lib/migration-map.js. That is
// an ESM module in a different package; this CJS module cannot require() it.
// MODULES below mirrors migration-map's MODULES; the mirror is kept honest by
// __tests__/byan-v2/layout-resolver.test.js, which parses migration-map.js and
// asserts equality. Do not change one list without the other.

const fs = require('fs');
const path = require('path');

const MODULES = ['core', 'bmm', 'bmb', 'tea', 'cis'];

function resolveProjectRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch (_e) {
    return false;
  }
}

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

// First candidate {rel, layout} whose file exists, else null. READ semantics.
function firstExisting(root, candidates) {
  for (const c of candidates) {
    const abs = path.join(root, c.rel);
    if (exists(abs)) return { path: abs, rel: c.rel, layout: c.layout, exists: true };
  }
  return null;
}

// Path to USE for a resource that lives in a Gen3 or a Gen2 location. Prefers
// the existing file; if neither exists, picks the layout whose parent dir is
// present (so a fresh write lands in the active layout), defaulting to Gen2 —
// the current on-disk layout. Never returns null. READ-OR-WRITE semantics.
function locate(root, gen3rel, gen2rel) {
  const g3 = path.join(root, gen3rel);
  const g2 = path.join(root, gen2rel);
  if (exists(g3)) return { path: g3, rel: gen3rel, layout: 'gen3', exists: true };
  if (exists(g2)) return { path: g2, rel: gen2rel, layout: 'gen2', exists: true };
  if (exists(path.dirname(g3))) return { path: g3, rel: gen3rel, layout: 'gen3', exists: false };
  return { path: g2, rel: gen2rel, layout: 'gen2', exists: false };
}

// Resolve an agent source file by name. Gen3 _byan/agent/<name>/<name>.md (or
// agent.md) first, then Gen2 flat _byan/agents/<name>.md, then Gen2 per-module
// _byan/<module>/agents/<name>.md, then Gen1 _bmad/<module>/agents/<name>.md.
// Returns {path, rel, layout} or null.
function resolveAgent(name, opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  const candidates = [
    { rel: `_byan/agent/${name}/${name}.md`, layout: 'gen3' },
    { rel: `_byan/agent/${name}/agent.md`, layout: 'gen3' },
    { rel: `_byan/agents/${name}.md`, layout: 'gen2-flat' },
  ];
  for (const m of MODULES) candidates.push({ rel: `_byan/${m}/agents/${name}.md`, layout: 'gen2-module' });
  for (const m of MODULES) candidates.push({ rel: `_bmad/${m}/agents/${name}.md`, layout: 'gen1' });
  return firstExisting(root, candidates);
}

// Ordered list of EXISTING agent-source directories, Gen3-first. Each entry:
// {dir (abs), rel, layout, nested}. nested=true => each child directory is one
// agent (Gen3 _byan/agent/<name>/); nested=false => *.md files are agents.
function agentDirs(opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  const out = [];
  const push = (rel, layout, nested) => {
    const dir = path.join(root, rel);
    if (exists(dir)) out.push({ dir, rel, layout, nested });
  };
  push('_byan/agent', 'gen3', true);
  push('_byan/agents', 'gen2-flat', false);
  for (const m of MODULES) push(`_byan/${m}/agents`, 'gen2-module', false);
  for (const m of MODULES) push(`_bmad/${m}/agents`, 'gen1', false);
  return out;
}

function isSoulSibling(fileName) {
  return /-(soul|tao)\.md$/.test(fileName) || /-soul-memory\.md$/.test(fileName);
}

// Discover all agents across layouts. Returns [{name, path, rel, layout}],
// deduped by name with the highest-priority directory winning (Gen3 > flat >
// module > gen1). Soul/tao siblings are not agents and are skipped.
function listAgents(opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  const seen = new Map();
  const record = (name, abs, layout) => {
    if (!seen.has(name)) {
      seen.set(name, { name, path: abs, rel: toPosix(path.relative(root, abs)), layout });
    }
  };
  for (const d of agentDirs({ projectRoot: root })) {
    let entries;
    try {
      entries = fs.readdirSync(d.dir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }
    if (d.nested) {
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const inner = [`${e.name}.md`, 'agent.md']
          .map((f) => path.join(d.dir, e.name, f))
          .find(exists);
        if (inner) record(e.name, inner, d.layout);
      }
    } else {
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue;
        if (isSoulSibling(e.name)) continue;
        record(e.name.replace(/\.md$/, ''), path.join(d.dir, e.name), d.layout);
      }
    }
  }
  return Array.from(seen.values());
}

const SOUL_FILES = { soul: 'soul.md', tao: 'tao.md', 'soul-memory': 'soul-memory.md' };

// Resolve BYAN's own soul/tao/soul-memory. Gen3 _byan/agent/<agent>/<file>
// first, Gen2 root _byan/<file> fallback. READ (existence). null if neither.
function resolveSoul(which, opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  const agent = opts.agent || 'byan';
  const file = SOUL_FILES[which];
  if (!file) return null;
  return firstExisting(root, [
    { rel: `_byan/agent/${agent}/${file}`, layout: 'gen3' },
    { rel: `_byan/${file}`, layout: 'gen2' },
  ]);
}

// Soul path to USE (never null) — for appending to soul-memory even when the
// file does not exist yet.
function soulPath(which, opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  const agent = opts.agent || 'byan';
  const file = SOUL_FILES[which];
  if (!file) return null;
  return locate(root, `_byan/agent/${agent}/${file}`, `_byan/${file}`);
}

// Knowledge file (read-or-write path): _byan/connaissance/ then _byan/knowledge/.
function knowledgePath(file, opts = {}) {
  return locate(resolveProjectRoot(opts.projectRoot), `_byan/connaissance/${file}`, `_byan/knowledge/${file}`);
}

// Memory/state file (read-or-write path): _byan/memoire/ then _byan/_memory/.
function memoryPath(file, opts = {}) {
  return locate(resolveProjectRoot(opts.projectRoot), `_byan/memoire/${file}`, `_byan/_memory/${file}`);
}

// Resolve the installed-platform config. Gen3 _byan/context/config.yaml, then
// Gen2 root _byan/config.yaml, then the module config _byan/bmb/config.yaml
// (the authoritative installed config that carries byan_version +
// installed_agents). READ (existence). null if none.
function resolveConfig(opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  return firstExisting(root, [
    { rel: '_byan/context/config.yaml', layout: 'gen3' },
    { rel: '_byan/config.yaml', layout: 'gen2-root' },
    { rel: '_byan/bmb/config.yaml', layout: 'gen2-module' },
  ]);
}

// Pure predicate (no fs): does a repo-relative path look like an agent source
// file, in any layout? Used by hooks that scope validation by path.
function isAgentPath(relPath) {
  const rel = toPosix(relPath);
  if (/(^|\/)_byan\/agent\//.test(rel)) return true; // Gen3
  if (/(^|\/)_byan\/agents\//.test(rel)) return true; // Gen2 flat
  if (new RegExp(`(^|/)_byan/(${MODULES.join('|')})/agents/`).test(rel)) return true; // Gen2 module
  return false;
}

// 'gen3' if the Gen3 agent directory exists, else 'gen2'.
function detectLayout(opts = {}) {
  const root = resolveProjectRoot(opts.projectRoot);
  return exists(path.join(root, '_byan', 'agent')) ? 'gen3' : 'gen2';
}

module.exports = {
  MODULES,
  resolveProjectRoot,
  locate,
  resolveAgent,
  agentDirs,
  listAgents,
  resolveSoul,
  soulPath,
  knowledgePath,
  memoryPath,
  resolveConfig,
  isAgentPath,
  detectLayout,
};
