// BYAN intra-file reference rewriter (F16 / Stage B).
//
// The FS migrator (F8) moves files; it does NOT touch the path references that
// live INSIDE content files (agent bodies, workflow steps, knowledge docs).
// After a move, a body that says "load {project-root}/_byan/tea/testarch/
// knowledge/x.md" points at a dead path. This rewriter closes that gap: it
// rewrites every `_byan/...` reference in a content file to its post-migration
// location, using the SAME authority as the mover (mapPath). A reference is
// rewritten only when mapPath classifies it as a 'move' (files) or a moved
// directory; 'split' (config.yaml) and 'keep' references are left untouched, so
// the rewrite is safe and idempotent (a second pass is a no-op).

import fs from 'node:fs';
import path from 'node:path';
import { mapPath } from './migration-map.js';

// Token = a `_byan/...` path reference. Path chars: word chars, dot, slash, dash.
const REF_RE = /_byan\/[\w.\/-]+/g;

// Extensions whose free text can carry path references. Code (mcp/) and the CSV
// manifests (_byan/_config, rewritten column-aware by manifest-reconcile, F6)
// are excluded so each concern owns its rewrite.
const CONTENT_EXT = new Set(['.md', '.xml', '.yaml', '.yml', '.csv']);
const SENTINEL = '__byan_probe__';

// Resolve one captured reference to its post-migration form, or null if it must
// stay unchanged. Handles both a file ref (mapPath directly) and a directory
// ref (probe mapPath with a sentinel child and keep the rename only when the
// suffix is preserved — which holds for prefix renames like knowledge ->
// connaissance, but NOT for agents/ which restructure, so agent dir refs are
// deliberately left alone).
export function resolveRef(ref) {
  const trailingSlash = ref.endsWith('/');
  const clean = ref.replace(/\/+$/, '');

  const direct = mapPath(clean);
  if (direct.action === 'move' && typeof direct.target === 'string') {
    return direct.target + (trailingSlash ? '/' : '');
  }

  // Probe with a sentinel FILE child. Accept the rename only when the target is
  // a clean prefix rename: it ends with /<sentinel>.md AND the rewritten parent
  // does not itself contain the sentinel (which happens for agents/, where the
  // sentinel becomes the folder name — a restructure, not a prefix rename).
  const probe = mapPath(`${clean}/${SENTINEL}.md`);
  const suffix = `/${SENTINEL}.md`;
  if (probe.action === 'move' && typeof probe.target === 'string' && probe.target.endsWith(suffix)) {
    const newDir = probe.target.slice(0, -suffix.length);
    if (!newDir.includes(SENTINEL)) return newDir + (trailingSlash ? '/' : '');
  }
  return null;
}

// Rewrite every reference in a blob of text. Returns { text, changes } where
// changes is [{ from, to }]. Idempotent: text already on the target layout maps
// to itself (action 'keep') and is not touched.
export function rewriteText(text) {
  const changes = [];
  const out = text.replace(REF_RE, (token) => {
    // peel a trailing run of dots (sentence punctuation) off the path token
    const core = token.replace(/\.+$/, '');
    const trail = token.slice(core.length);
    const mapped = resolveRef(core);
    if (!mapped || mapped === core) return token;
    changes.push({ from: core, to: mapped });
    return mapped + trail;
  });
  return { text: out, changes };
}

function isContentFile(rel) {
  if (rel.startsWith('_byan/mcp/')) return false; // code + its tests
  if (rel.startsWith('_byan/_config/')) return false; // manifests: F6 owns these
  return CONTENT_EXT.has(path.extname(rel));
}

function walk(dir, root, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, acc);
    else acc.push(full);
  }
  return acc;
}

// Rewrite every content file under _byan/. Dry-run by default (apply=false):
// computes changes, writes nothing. Returns a report.
export function rewriteTree({ projectRoot, apply = false } = {}) {
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const byanDir = path.join(root, '_byan');
  const report = { applied: Boolean(apply), filesScanned: 0, filesChanged: 0, refsRewritten: 0, files: [] };
  if (!fs.existsSync(byanDir)) return report;

  for (const abs of walk(byanDir, root, [])) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!isContentFile(rel)) continue;
    report.filesScanned += 1;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const { text: out, changes } = rewriteText(text);
    if (!changes.length) continue;
    report.filesChanged += 1;
    report.refsRewritten += changes.length;
    report.files.push({ file: rel, count: changes.length, changes });
    if (apply) fs.writeFileSync(abs, out);
  }
  return report;
}
