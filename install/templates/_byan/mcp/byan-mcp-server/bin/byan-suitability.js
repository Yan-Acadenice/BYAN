#!/usr/bin/env node
// Advisory surface for the model-suitability ledger (F4).
//
// READ-ONLY by construction. It prints the learned ratings and NEVER edits
// routing. A human reads this and decides whether to keep a downgrade, keep
// watching it, or demote it back to the strong model. The linter floor and the
// .claude/workflows/*.js scripts are untouched by this command — there is no
// write path here at all.
//
// Usage:
//   node bin/byan-suitability.js            # all pairs, most-actionable first
//   node bin/byan-suitability.js --model haiku
//   node bin/byan-suitability.js --json

import { reportLedger, ledgerPath, resolveRoot } from '../lib/suitability-store.js';
import { formatRating } from '../lib/suitability.js';

export function renderReport(rows, { ledger, json } = {}) {
  if (json) {
    return JSON.stringify({ ledger, advisory: true, rows }, null, 2);
  }
  const lines = [`Model-suitability ledger (advisory only) — ${ledger}`];
  if (rows.length === 0) {
    lines.push('No outcomes recorded yet. The ledger learns from adversarial-pass verdicts.');
    return lines.join('\n');
  }
  lines.push(`${rows.length} (model x leaf) pair(s), most-actionable first:`);
  for (const r of rows) lines.push(`  ${formatRating(r)}`);
  lines.push('');
  lines.push('Advisory only — this does not change routing. You decide.');
  return lines.join('\n');
}

export function main(argv = process.argv) {
  const args = argv.slice(2);
  const modelIdx = args.indexOf('--model');
  const model = modelIdx >= 0 ? args[modelIdx + 1] : undefined;
  const json = args.includes('--json');
  // Resolve the root once so the printed header path and the data source are
  // provably the same root, whatever the cwd at invocation.
  const projectRoot = resolveRoot();
  const rows = reportLedger({ model, projectRoot });
  process.stdout.write(renderReport(rows, { ledger: ledgerPath(projectRoot), json }) + '\n');
  return 0;
}

// Run only when invoked directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
