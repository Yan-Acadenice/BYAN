#!/usr/bin/env node
// WI-7 — the armament observation report (CLI, ESM).
//
// Reads the observation ledgers under _byan-output/, reads the CURRENT armed
// flags from config, and prints per-guard : sample size, would-fire count (the
// false-positive risk proxy), current armed state, and a calibrated
// recommendation. It NEVER arms anything — arming is a deliberate config flip the
// human makes after reading this.
//
// Usage : node bin/byan-armament-report.js [--json] [--root <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { buildReport } from '../lib/armament-report.js';

function parseArgs(argv) {
  const a = { json: false, root: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') a.json = true;
    else if (argv[i] === '--root') a.root = argv[++i];
  }
  return a;
}

function readLedger(root, name) {
  try {
    const p = path.join(root, '_byan-output', name);
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// Best-effort read of the current armed flags from config (absent -> false).
function readArmedFlags(root) {
  const flags = { autobench: false, punt: false, completeness: false };
  try {
    const a = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'hooks', 'lib', 'autobench-config.json'), 'utf8'));
    flags.autobench = Boolean(a && a.enforcement && a.enforcement.armed);
  } catch { /* absent -> false */ }
  try {
    const d = JSON.parse(fs.readFileSync(path.join(root, '_byan', '_config', 'delivery-default.json'), 'utf8'));
    flags.punt = Boolean(d && d.puntGuard && d.puntGuard.armed);
    flags.completeness = Boolean(d && d.completenessGate && d.completenessGate.armed);
  } catch { /* absent -> false */ }
  return flags;
}

function render(report) {
  const lines = ['BYAN armament report (observe first, arm on evidence) :', ''];
  const label = { autobench: 'Auto-Benchmark', punt: 'Punt guard', completeness: 'Completeness gate' };
  for (const key of Object.keys(report)) {
    const g = report[key];
    const s = g.summary;
    lines.push(`- ${label[key] || key} : armed=${g.armed} | observations=${s.total} | would-fire=${s.wouldFire} (${Math.round(s.fireRate * 100)}%)`);
    lines.push(`    -> ${g.recommend.arm ? 'ARM' : 'HOLD'} : ${g.recommend.reason}`);
  }
  lines.push('');
  lines.push('Note : "would-fire" est un indicateur de risque a relire, pas un compte prouve de faux positifs.');
  lines.push('Armer reste une decision manuelle (autobench-config.json enforcement.armed, delivery-default.json puntGuard/completenessGate.armed).');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildReport(
    {
      benchmark: readLedger(args.root, 'benchmark-ledger.jsonl'),
      punt: readLedger(args.root, 'punt-ledger.jsonl'),
      completeness: readLedger(args.root, 'completeness-ledger.jsonl'),
    },
    readArmedFlags(args.root)
  );
  if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(render(report) + '\n');
}

main();

export { readLedger, readArmedFlags, render };
