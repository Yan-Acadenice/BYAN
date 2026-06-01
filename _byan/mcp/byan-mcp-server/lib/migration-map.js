// BYAN migration map (F7).
//
// Pure mapping logic from the legacy module-based FS (bmb/bmm/tea/cis) to the
// new by-type FS (agent/worker/workflow/command/context/regle/connaissance/
// memoire). mapPath() classifies a single source path; buildMigrationPlan()
// produces a dry-run plan for the whole _byan/ tree and resolves name
// collisions by provenance. No file is moved here — F8 applies the plan.

import fs from 'node:fs';
import path from 'node:path';

const MODULES = ['core', 'bmm', 'bmb', 'tea', 'cis'];

// Paths already in the target layout, or infra that is not moved.
const KEEP_PREFIXES = [
  '_byan/agent/', '_byan/worker/', '_byan/workflow/', '_byan/command/',
  '_byan/context/', '_byan/regle/', '_byan/connaissance/', '_byan/memoire/',
  '_byan/projet/', '_byan/docs/', '_byan/_config/', '_byan/mcp/',
];
const KEEP_FILES = ['_byan/INDEX.md'];

// Root files explicitly belonging to BYAN's own agent.
const BYAN_ROOT_SOUL = new Set([
  'soul.md', 'tao.md', 'soul-memory.md',
  'byan-soul.md', 'byan-tao.md', 'byan-soul-memory.md',
  'creator-soul.md',
]);

// Module-scoped infra with no by-type home: module config + help + teams + data,
// and core base/activation/model-selector machinery. Retained in place by a
// deliberate non-breaking choice (read by name; the authoritative byan_version
// lives in a module config; soul-activation/CLAUDE.md reference these from
// outside _byan). Folding them is a separate design decision, not a silent move.
function isRetainedModuleScoped(rel) {
  if (/^_byan\/(core|bmm|bmb|tea|cis)\/(config\.yaml|module-help\.csv)$/.test(rel)) return true;
  if (/^_byan\/(core|bmm|bmb|tea|cis)\/(teams|data)\//.test(rel)) return true;
  if (/^_byan\/core\/(base|activation)\//.test(rel)) return true;
  if (/^_byan\/core\/(MODEL-SELECTOR-GUIDE\.md|model-selector\.(?:js|ya?ml))$/.test(rel)) return true;
  return false;
}

function norm(p) {
  return String(p).split(path.sep).join('/').replace(/^\.\//, '');
}

function isSkippable(rel, baseName) {
  if (rel === '_byan/workers-old-WRONG.md') return true;
  if (/^_byan\/(_test|_output|personas|reference|templates|features|data)\//.test(rel)) return true;
  if (rel === '_byan/COMPLETION-REPORT.md' || rel === '_byan/learning-log.md' || rel === '_byan/genealogie-des-ames.md') return true;
  // root-level template / reference scaffolds
  if (/^_byan\/[^/]+$/.test(rel) && /(-template|-reference)\.md$/.test(baseName)) return true;
  return false;
}

function soulKind(name) {
  if (/-soul\.md$/.test(name)) return { kind: 'soul', base: name.replace(/-soul\.md$/, '') };
  if (/-tao\.md$/.test(name)) return { kind: 'tao', base: name.replace(/-tao\.md$/, '') };
  return null;
}

// Map one source path. Options: { disambiguate } appends provenance to the
// agent folder to resolve a name collision.
export function mapPath(sourceRel, { disambiguate = false } = {}) {
  const rel = norm(sourceRel);
  const baseName = rel.split('/').pop();

  // 1. Already target / infra -> keep.
  if (KEEP_FILES.includes(rel) || KEEP_PREFIXES.some((p) => rel.startsWith(p))) {
    return { target: rel, type: 'infra', scope: 'systeme', provenance: null, action: 'keep' };
  }

  // 2. config split (D4).
  if (rel === '_byan/config.yaml') {
    return {
      target: null, type: 'config', scope: 'systeme', provenance: null, action: 'split',
      targets: ['_byan/context/config.yaml', '_byan/regle/config-rules.yaml'],
    };
  }

  // 3. junk / scaffolds -> skip.
  if (isSkippable(rel, baseName)) {
    return { target: null, type: 'junk', scope: null, provenance: null, action: 'skip' };
  }

  // 4. Agents (+ soul/tao siblings).
  const agentMatch = rel.match(/^_byan\/(?:(core|bmm|bmb|tea|cis)\/)?agents\/(.+)$/);
  if (agentMatch) {
    const provenance = agentMatch[1] || 'core';
    const tail = agentMatch[2];
    // subdir form : agents/<name>/<rest>
    const subdir = tail.match(/^([^/]+)\/(.+)$/);
    let name, innerFile;
    if (subdir) { name = subdir[1]; innerFile = subdir[2].split('/').pop(); }
    else { innerFile = tail; }
    const st = soulKind(innerFile);
    if (!subdir) {
      if (st) name = st.base;
      else name = innerFile.replace(/\.md$/, '');
    }
    const folder = disambiguate ? `${name}-${provenance}` : name;
    const targetFile = subdir ? subdir[2].split('/').pop() : innerFile;
    const target = `_byan/agent/${folder}/${targetFile}`;
    const type = st ? st.kind : 'agent';
    return { target, type, scope: 'systeme', provenance, action: 'move' };
  }

  // 5. Workflows -> workflow/simple/.
  const wfMatch = rel.match(/^_byan\/(?:(core|bmm|bmb|tea|cis)\/)?workflows\/(.+)$/);
  if (wfMatch) {
    return { target: `_byan/workflow/simple/${wfMatch[2]}`, type: 'workflow', scope: 'systeme', provenance: wfMatch[1] || 'core', action: 'move' };
  }

  // 6. Tasks -> command/ (D1).
  const taskMatch = rel.match(/^_byan\/(?:(core|bmm|bmb|tea|cis)\/)?tasks\/(.+)$/);
  if (taskMatch) {
    return { target: `_byan/command/${taskMatch[2]}`, type: 'command', scope: 'systeme', provenance: taskMatch[1] || 'core', action: 'move' };
  }

  // 7. Knowledge -> connaissance/.
  const knMatch = rel.match(/^_byan\/knowledge\/(.+)$/);
  if (knMatch) {
    return { target: `_byan/connaissance/${knMatch[1]}`, type: 'connaissance', scope: 'systeme', provenance: null, action: 'move' };
  }

  // 7b. Module testarch subtree -> connaissance/testarch/ (substructure
  // preserved verbatim, incl. the knowledge/ segment, so file refs and dir refs
  // map consistently; tea-index.csv rides along).
  const testarchMatch = rel.match(/^_byan\/(core|bmm|bmb|tea|cis)\/testarch\/(.+)$/);
  if (testarchMatch) {
    return { target: `_byan/connaissance/testarch/${testarchMatch[2]}`, type: 'connaissance', scope: 'systeme', provenance: testarchMatch[1], action: 'move' };
  }

  // 7c. Module resource docs (e.g. excalidraw helpers) -> connaissance/.
  const resMatch = rel.match(/^_byan\/(core|bmm|bmb|tea|cis)\/resources\/(.+)$/);
  if (resMatch) {
    return { target: `_byan/connaissance/${resMatch[2]}`, type: 'connaissance', scope: 'systeme', provenance: resMatch[1], action: 'move' };
  }

  // 8. _memory -> memoire/.
  const memMatch = rel.match(/^_byan\/_memory\/(.+)$/);
  if (memMatch) {
    return { target: `_byan/memoire/${memMatch[1]}`, type: 'memoire', scope: 'systeme', provenance: null, action: 'move' };
  }

  // 9. BYAN root soul/tao -> agent/byan/.
  if (/^_byan\/[^/]+$/.test(rel) && BYAN_ROOT_SOUL.has(baseName)) {
    const type = /-tao\.md$|^tao\.md$/.test(baseName) ? 'tao' : 'soul';
    return { target: `_byan/agent/byan/${baseName}`, type, scope: 'systeme', provenance: 'byan', action: 'move' };
  }

  // 10. workers.md -> worker/ (D3). A single concept doc, moved whole;
  // formalising it into per-worker files is a later refinement, not a split here.
  if (rel === '_byan/workers.md') {
    return { target: '_byan/worker/workers.md', type: 'worker', scope: 'systeme', provenance: null, action: 'move' };
  }

  // 10b. workers/ directory (launchers etc.) -> worker/.
  const workersDirMatch = rel.match(/^_byan\/workers\/(.+)$/);
  if (workersDirMatch) {
    return { target: `_byan/worker/${workersDirMatch[1]}`, type: 'worker', scope: 'systeme', provenance: null, action: 'move' };
  }

  // 10c. Module-scoped infra with no by-type home -> keep in place (see
  // isRetainedModuleScoped). Explicit retain, not a silent skip.
  if (isRetainedModuleScoped(rel)) {
    return { target: rel, type: 'module-infra', scope: 'systeme', provenance: rel.split('/')[1], action: 'keep' };
  }

  // 11. Anything else -> review (no silent move/skip).
  return { target: null, type: 'unknown', scope: null, provenance: null, action: 'review' };
}

function walk(dir, root, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, acc);
    else acc.push(norm(path.relative(root, full)));
  }
  return acc;
}

export function buildMigrationPlan({ projectRoot } = {}) {
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const byanDir = path.join(root, '_byan');
  if (!fs.existsSync(byanDir)) return [];

  const files = walk(byanDir, root, []);
  let entries = files.map((from) => {
    const m = mapPath(from);
    return { from, to: m.target || (m.targets ? m.targets : null), action: m.action, type: m.type, provenance: m.provenance };
  });

  // Collision resolution: any 'move' target claimed by >1 source.
  const byTarget = new Map();
  for (const e of entries) {
    if (e.action !== 'move' || typeof e.to !== 'string') continue;
    if (!byTarget.has(e.to)) byTarget.set(e.to, []);
    byTarget.get(e.to).push(e);
  }
  const isFlatAgent = (e) => /^_byan\/agents\//.test(e.from);
  for (const [, group] of byTarget) {
    if (group.length < 2) continue;
    const moduleMembers = group.filter((e) => !isFlatAgent(e));
    const flatMembers = group.filter(isFlatAgent);
    if (moduleMembers.length === 1 && flatMembers.length === group.length - 1) {
      // flat-vs-module duplicate: the MODULE agent wins the canonical target;
      // the flat copies are preserved under agent/<name>-flat/ (non-destructive).
      for (const e of flatMembers) {
        e.to = e.to.replace(/^(_byan\/agent\/)([^/]+)\//, '$1$2-flat/');
        e.disambiguated = true;
        e.superseded = true;
      }
    } else {
      // genuine cross-module collision (e.g. two distinct "dev" agents): keep
      // provenance disambiguation for every member.
      for (const e of group) {
        const m = mapPath(e.from, { disambiguate: true });
        e.to = m.target;
        e.disambiguated = true;
      }
    }
  }

  return entries;
}
