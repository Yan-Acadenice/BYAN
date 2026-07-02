import fs from 'node:fs';
import path from 'node:path';

// byan-sync-soul — keeps the SHIPPABLE soul source in sync with the ACTIVE soul.
//
// BYAN's active identity lives at _byan/agent/byan/{soul,tao}.md. The installer
// (create-byan-agent, creator mode) ships the PREFIXED copies byan-soul.md /
// byan-tao.md and COPIES them to soul.md / tao.md at setup (the prefixed source
// also lands in the installed project via the bulk agent-dir copy). Those
// prefixed copies are a manual mirror of the active soul, so they drift when the
// active soul evolves (a soul revision, a new couche-vivante section). When they
// drift, a fresh install ships a stale identity. This generator mirrors active ->
// shippable so the transmission stays faithful, and --check lets the pre-commit
// gate block a commit that would ship a drifted soul. Dev-repo tooling: the bin
// is not shipped, so the shipped pre-commit no-ops the gate in installs (guarded
// by [ -f ]).
//
// soul-memory is DELIBERATELY out of scope: byan-soul-memory.md is a curated
// seed journal for fresh installs, not a byte-mirror of this repo's living
// soul-memory.md (which carries repo-local session entries). Forcing parity
// there would ship this repo's private journal.

// active basename -> shippable basename, both under _byan/agent/byan/.
export const SOUL_PAIRS = [
  { active: 'soul.md', shippable: 'byan-soul.md' },
  { active: 'tao.md', shippable: 'byan-tao.md' },
];

export function soulDir(projectRoot) {
  return path.join(projectRoot, '_byan', 'agent', 'byan');
}

function readOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Pure check — no writes. Returns { drifted, missingActive, ok }.
//   drifted       : shippable basenames whose content != their active source
//   missingActive : pairs whose active source file is absent (cannot mirror)
// ok is true only when nothing drifted AND no active source is missing.
export function checkSoul({ projectRoot } = {}) {
  const dir = soulDir(projectRoot);
  const drifted = [];
  const missingActive = [];
  for (const { active, shippable } of SOUL_PAIRS) {
    const activeContent = readOrNull(path.join(dir, active));
    if (activeContent === null) {
      missingActive.push(active);
      continue;
    }
    const shippableContent = readOrNull(path.join(dir, shippable));
    if (shippableContent !== activeContent) drifted.push(shippable);
  }
  return { drifted, missingActive, ok: drifted.length === 0 && missingActive.length === 0 };
}

// Mirror active -> shippable for every pair. Returns { <shippable>: 'written' |
// 'unchanged', ... } plus missingActive (pairs skipped because the source is
// absent). Never touches soul-memory. Idempotent: re-running yields 'unchanged'.
export function syncSoul({ projectRoot } = {}) {
  const dir = soulDir(projectRoot);
  const report = {};
  const missingActive = [];
  for (const { active, shippable } of SOUL_PAIRS) {
    const activePath = path.join(dir, active);
    const activeContent = readOrNull(activePath);
    if (activeContent === null) {
      missingActive.push(active);
      continue;
    }
    const shippablePath = path.join(dir, shippable);
    const current = readOrNull(shippablePath);
    if (current === activeContent) {
      report[shippable] = 'unchanged';
    } else {
      fs.writeFileSync(shippablePath, activeContent);
      report[shippable] = current === null ? 'created' : 'written';
    }
  }
  report.missingActive = missingActive;
  return report;
}
