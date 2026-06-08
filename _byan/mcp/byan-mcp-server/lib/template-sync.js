// Template fidelity sync — keep install/templates/ faithful to root.
//
// Only install/templates/ ships on npm (package.json files[]); the dev code
// lives at root _byan/ and .claude/. With no mechanism to mirror root -> template,
// the template drifted: 81 stale files accumulated across several chantiers, so a
// published version could promise features its package did not contain.
//
// This module is that mechanism. The contract is deliberately narrow to avoid the
// opposite failure (shipping the 4000+ dev-only files at root):
//
//   - The mirrored perimeter is the template ITSELF. Every file already present in
//     install/templates/ is re-synced from its root twin. The template is its own
//     manifest of "what must stay up to date" — we never walk root and copy down.
//   - TARGET_ADDITIONS is the explicit, reviewed list of NEW files that must enter
//     the template (the 2.21.0 routing/ledger chantier). Growth of the shipped set
//     is a deliberate edit here, never an accident of a glob.
//   - EXCLUSIONS are runtime/seed files that legitimately differ between a dev
//     checkout and a fresh install (the memoire ledger holds the maintainer's ELO
//     scores). Re-syncing them would push dev state into the package.
//
// The risky half — classifying each file — is pure (buildPlan / checkDrift, no
// I/O). The I/O half (walk + copy) takes an injected `io` so the unit tests pin
// behaviour without touching the real filesystem, the same shape suitability-store
// uses.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Runtime/seed paths that must keep their template value, never the dev value.
// Prefix match on a POSIX-style relative path.
export const EXCLUSIONS = ['_byan/memoire/'];

// New files that must enter the template. Each is a root-relative POSIX path.
// This list is the ONLY way the shipped set grows: adding a file here is a
// reviewed decision, not a side effect of a directory glob.
export const TARGET_ADDITIONS = [
  '_byan/mcp/byan-mcp-server/lib/native-tiers.js',
  '_byan/mcp/byan-mcp-server/lib/suitability.js',
  '_byan/mcp/byan-mcp-server/lib/suitability-store.js',
  '_byan/mcp/byan-mcp-server/lib/suitability-feeder.js',
  '_byan/mcp/byan-mcp-server/bin/byan-suitability.js',
  '.claude/skills/byan-suitability/SKILL.md',
  '.claude/rules/team-doctrine.md',
];

// The template lives under this root-relative directory.
export const TEMPLATE_DIR = path.join('install', 'templates');

export function isExcluded(relPath) {
  const posix = relPath.split(path.sep).join('/');
  return EXCLUSIONS.some((prefix) => posix.startsWith(prefix));
}

// Content fingerprint for the root-vs-template comparison. sha1 is for change
// detection, not security: a fast digest that flags any byte difference (text or
// binary) is all the drift check needs.
function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// Pure classification. The caller supplies the template's current file list and
// two readers; this function performs no I/O of its own, which is what makes the
// risky logic exhaustively unit-testable.
//
//   templateFiles : array of root-relative POSIX paths currently in the template
//   readRoot(rel) : Buffer of root/rel, or null if absent in root
//   readTemplate(rel) : Buffer of template/rel
//   additions     : explicit new-file list (defaults to TARGET_ADDITIONS)
//
// Returns { toUpdate, toAdd, excluded, orphans, identical, missingTargets }.
//   toUpdate : in template, present in root, content differs  -> re-sync
//   identical: in template, present in root, content matches   -> no-op
//   excluded : matches an EXCLUSION prefix                      -> never touched
//   orphans  : in template, ABSENT from root                   -> never touched
//   toAdd    : a target absent from template, present in root   -> add
//   missingTargets : a target absent from BOTH                  -> surfaced, not silent
export function buildPlan({ templateFiles, readRoot, readTemplate, additions = TARGET_ADDITIONS }) {
  const plan = { toUpdate: [], toAdd: [], excluded: [], orphans: [], identical: [], missingTargets: [] };
  const inTemplate = new Set(templateFiles);

  for (const rel of templateFiles) {
    if (isExcluded(rel)) {
      plan.excluded.push(rel);
      continue;
    }
    const rootBuf = readRoot(rel);
    if (rootBuf === null || rootBuf === undefined) {
      plan.orphans.push(rel);
      continue;
    }
    const tmplBuf = readTemplate(rel);
    if (sha1(rootBuf) === sha1(tmplBuf)) plan.identical.push(rel);
    else plan.toUpdate.push(rel);
  }

  for (const rel of additions) {
    if (inTemplate.has(rel)) continue; // already handled by the template loop
    if (isExcluded(rel)) continue; // an excluded path is never an addition
    const rootBuf = readRoot(rel);
    if (rootBuf === null || rootBuf === undefined) {
      plan.missingTargets.push(rel); // cannot add what root does not have — surface it
      continue;
    }
    plan.toAdd.push(rel);
  }

  return plan;
}

// Pure drift verdict for --check. Drift = anything the sync WOULD change.
// Exclusions and orphans are not drift (they are intentionally left alone).
// missingTargets is drift: a promised file the package cannot ship.
export function checkDrift(plan) {
  const drifted = [...plan.toUpdate];
  const missing = [...plan.toAdd, ...plan.missingTargets];
  return { drifted, missing, ok: drifted.length === 0 && missing.length === 0 };
}

// Recursively list root-relative POSIX paths of every file under dir. Returns []
// if dir does not exist (a fresh checkout without a template is not an error here).
export function walkRelFiles(dir, { io = fs, base = dir } = {}) {
  let entries;
  try {
    entries = io.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkRelFiles(full, { io, base }));
    } else if (e.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

// Build the plan against real directories. rootDir holds the source of truth;
// templateDir is install/templates/ under rootDir.
export function planSync({ rootDir, templateDir, io = fs } = {}) {
  const tmplAbs = templateDir || path.join(rootDir, TEMPLATE_DIR);
  const templateFiles = walkRelFiles(tmplAbs, { io });
  const readRoot = (rel) => {
    const p = path.join(rootDir, rel);
    if (!io.existsSync(p)) return null;
    return io.readFileSync(p);
  };
  const readTemplate = (rel) => io.readFileSync(path.join(tmplAbs, rel));
  return buildPlan({ templateFiles, readRoot, readTemplate });
}

// Apply a plan: copy root/rel -> template/rel for every toUpdate and toAdd.
// Each copy is atomic (stage adjacent tmp, then rename over the target) so a crash
// mid-run never leaves a half-written file that would masquerade as a real one.
// Returns { updated, added }.
export function applyPlan(plan, { rootDir, templateDir, io = fs } = {}) {
  const tmplAbs = templateDir || path.join(rootDir, TEMPLATE_DIR);
  const copy = (rel) => {
    const src = path.join(rootDir, rel);
    const dest = path.join(tmplAbs, rel);
    io.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    try {
      io.writeFileSync(tmp, io.readFileSync(src));
      io.renameSync(tmp, dest);
    } catch (err) {
      try {
        io.unlinkSync(tmp);
      } catch {
        void 0;
      }
      throw err;
    }
  };
  for (const rel of plan.toUpdate) copy(rel);
  for (const rel of plan.toAdd) copy(rel);
  return { updated: [...plan.toUpdate], added: [...plan.toAdd] };
}

// Convenience: plan + drift verdict in one call (used by --check).
export function checkSync({ rootDir, templateDir, io = fs } = {}) {
  return checkDrift(planSync({ rootDir, templateDir, io }));
}
