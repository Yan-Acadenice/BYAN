// BYAN FS migrator (F8).
//
// Applies the F7 migration plan (buildMigrationPlan) to move the legacy
// module-based layout to the new by-type layout. Two guarantees:
//   - non-destructive : an existing target is never overwritten (reported as a
//     conflict, the source is preserved) — protects user customizations.
//   - idempotent : after a successful apply the sources are gone and their
//     targets map to `keep`, so a second run moves nothing.
//
// Dry-run is the default; `apply: true` is required to touch the disk. Only the
// unambiguous `move` actions are applied. `split` (config.yaml) and `review`
// (module configs, teams, workers.md...) are reported as `manual` and left in
// place — auto-transforming them could break the platform (No Silent Cut).

import fs from 'node:fs';
import path from 'node:path';
import { buildMigrationPlan } from './migration-map.js';

export function migrate({ projectRoot, apply = false } = {}) {
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const plan = buildMigrationPlan({ projectRoot: root });

  const report = { applied: Boolean(apply), moved: [], kept: [], skipped: [], manual: [], conflicts: [] };

  for (const e of plan) {
    if (e.action === 'keep') { report.kept.push(e); continue; }
    if (e.action === 'skip') { report.skipped.push(e); continue; }
    if (e.action === 'split' || e.action === 'review') { report.manual.push(e); continue; }
    if (e.action !== 'move' || typeof e.to !== 'string') { report.manual.push(e); continue; }

    const fromAbs = path.join(root, e.from);
    const toAbs = path.join(root, e.to);

    if (!apply) { report.moved.push(e); continue; } // dry-run: would move

    if (fs.existsSync(toAbs)) { report.conflicts.push(e); continue; } // non-destructive
    if (!fs.existsSync(fromAbs)) { report.skipped.push({ ...e, reason: 'source_absent' }); continue; }

    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.renameSync(fromAbs, toAbs);
    report.moved.push(e);
  }

  return report;
}
