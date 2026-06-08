#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { planSync, applyPlan, checkDrift } from '../lib/template-sync.js';

// Keep install/templates/ faithful to root. Two modes:
//   (default) apply  : re-sync drifted template files + add the target list.
//   --check          : report drift and exit non-zero if any remains (no writes).
//                      This is the pre-commit gate's entry point.
// Usage: node bin/byan-sync-template.js [--check] [--root <dir>]

function parseArgs(argv) {
  const args = { check: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const root = args.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const templateDir = path.join(root, 'install', 'templates');

if (!fs.existsSync(templateDir)) {
  process.stdout.write('[byan-sync-template] no install/templates/ directory - nothing to sync\n');
  process.exit(0);
}

const plan = planSync({ rootDir: root, templateDir });

if (args.check) {
  const { drifted, missing, ok } = checkDrift(plan);
  if (ok) {
    process.stdout.write('[byan-sync-template] OK - template is faithful to root on all mirrored paths\n');
    process.exit(0);
  }
  for (const rel of drifted) process.stderr.write(`[byan-sync-template] drift: ${rel}\n`);
  for (const rel of missing) process.stderr.write(`[byan-sync-template] missing: ${rel}\n`);
  process.stderr.write(
    `[byan-sync-template] FAIL - ${drifted.length} drifted, ${missing.length} missing. Run: node bin/byan-sync-template.js\n`,
  );
  process.exit(1);
}

const { updated, added } = applyPlan(plan, { rootDir: root, templateDir });
if (plan.missingTargets.length) {
  for (const rel of plan.missingTargets) {
    process.stderr.write(`[byan-sync-template] target absent from root, cannot add: ${rel}\n`);
  }
}
process.stdout.write(
  `[byan-sync-template] synced - ${updated.length} updated, ${added.length} added` +
    (plan.missingTargets.length ? `, ${plan.missingTargets.length} target(s) unresolved\n` : '\n'),
);
process.exit(plan.missingTargets.length ? 1 : 0);
