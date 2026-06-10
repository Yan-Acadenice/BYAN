// BYAN native-workflow registry generator + dual-path resolver.
//
// Phase 1 of the native-workflow bridge: BYAN's markdown/YAML workflows are
// LLM-interpreted and human-gated; Claude Code's in-CLI Workflow tool runs a
// deterministic JS script with no in-run human gate. Only the workflows whose
// steps run WITHOUT a per-step human gate (autonomous + deterministic pipeline)
// can be hosted by the native tool. The gated majority stays markdown by design.
//
// This module is the single source of truth for "which workflows are portable"
// and "where does a workflow physically live" (dual-path: native .js preferred,
// markdown fallback). It is manifest-driven and deterministic so regeneration is
// idempotent (writeIfChanged). It mirrors the index-generator pattern and reuses
// its CSV loader — no duplicate parser.

import fs from 'node:fs';
import path from 'node:path';
import { loadManifests } from './index-generator.js';

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// Portable buckets, derived from the read-based classification of the 45-row
// manifest (see docs/native-workflows-contract.md). Membership is data, not a
// guess: each name must also exist in the manifest or it is surfaced as drift.
export const PORTABLE = {
  autonomous: [
    'dev-story',
    'create-story',
    'qa-automate',
    'testarch-atdd',
    'testarch-automate',
    'testarch-ci',
    'testarch-framework',
    'testarch-nfr',
    'testarch-test-design',
    'testarch-test-review',
    'testarch-trace',
  ],
  pipeline: [
    'sprint-planning',
    'code-review',
    'document-project',
    'check-implementation-readiness',
    'quick-dev',
    'create-excalidraw-diagram',
    'create-excalidraw-dataflow',
    'create-excalidraw-flowchart',
    'create-excalidraw-wireframe',
    'byan-benchmark',
  ],
};

// Bucket of a workflow name. 'gated' = stays LLM-interpreted markdown.
export function classify(name) {
  if (PORTABLE.autonomous.includes(name)) return 'autonomous';
  if (PORTABLE.pipeline.includes(name)) return 'pipeline';
  return 'gated';
}

function nativeRel(name) {
  return `.claude/workflows/${name}.js`;
}

// Dual-path resolver. Prefers the native script .claude/workflows/<name>.js if
// it exists, else falls back to the markdown workflow path from the manifest.
// Pure existence check, no side effects. Returns {name, kind, rel, path} or null.
export function resolveWorkflow(name, { projectRoot, workflows } = {}) {
  const root = resolveRoot(projectRoot);
  const nativeAbs = path.join(root, '.claude', 'workflows', `${name}.js`);
  if (fs.existsSync(nativeAbs)) {
    return { name, kind: 'native', rel: nativeRel(name), path: nativeAbs };
  }
  const rows = workflows || loadManifests(root).workflows;
  const row = rows.find((w) => w.name === name);
  if (row && row.path) {
    return { name, kind: 'markdown', rel: row.path, path: path.join(root, row.path) };
  }
  return null;
}

// Render the human/agent-readable registry of portable workflows. Deterministic:
// sorted, no timestamp. native/markdown status reflects which .js exist on disk.
export function renderRegistry({ workflows = [], projectRoot } = {}) {
  const root = resolveRoot(projectRoot);
  const byName = new Map(workflows.map((w) => [w.name, w]));
  const lines = [];
  lines.push('# BYAN Native Workflows');
  lines.push('');
  lines.push("> Registre des workflows portables vers l'outil Workflow natif de Claude Code.");
  lines.push('> Genere automatiquement — ne pas editer a la main. Source : `_byan/_config/workflow-manifest.csv`.');
  lines.push('> Regenerer : `node _byan/mcp/byan-mcp-server/bin/byan-build-workflows.js`.');
  lines.push('>');
  lines.push("> Resolution dual-path : le skill prefere `.claude/workflows/<name>.js` s'il existe,");
  lines.push('> sinon il retombe sur le workflow markdown du manifest. Les workflows gated (a gate');
  lines.push('> humain par etape) restent markdown interprete — ils ne sont pas portables.');
  lines.push('');

  for (const bucket of ['autonomous', 'pipeline']) {
    const names = PORTABLE[bucket].filter((n) => byName.has(n)).slice().sort();
    lines.push(`## ${bucket} (${names.length})`);
    lines.push('');
    for (const name of names) {
      const nativeAbs = path.join(root, '.claude', 'workflows', `${name}.js`);
      const status = fs.existsSync(nativeAbs) ? 'native' : 'markdown';
      const src = byName.get(name).path || '';
      lines.push(`- \`${name}\` — ${status} — source \`${src}\``);
    }
    lines.push('');
  }

  // Drift guard: a portable name absent from the manifest is a real problem
  // (renamed/removed upstream). Surface it instead of silently dropping it.
  const declared = [...PORTABLE.autonomous, ...PORTABLE.pipeline];
  const missing = declared.filter((n) => !byName.has(n)).slice().sort();
  if (missing.length) {
    lines.push('## drift (noms portables absents du manifest)');
    lines.push('');
    for (const n of missing) lines.push(`- \`${n}\``);
    lines.push('');
  }

  return lines.join('\n');
}

function writeIfChanged(filePath, content) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prev === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

// Build (or refresh) .claude/workflows/INDEX.md from the manifest. Idempotent.
export function buildWorkflowsRegistry({ projectRoot } = {}) {
  const root = resolveRoot(projectRoot);
  const { workflows } = loadManifests(root);
  const content = renderRegistry({ workflows, projectRoot: root });
  const indexPath = path.join(root, '.claude', 'workflows', 'INDEX.md');
  const written = writeIfChanged(indexPath, content);
  const inManifest = (n) => workflows.some((w) => w.name === n);
  return {
    written,
    path: indexPath,
    counts: {
      autonomous: PORTABLE.autonomous.filter(inManifest).length,
      pipeline: PORTABLE.pipeline.filter(inManifest).length,
    },
  };
}
