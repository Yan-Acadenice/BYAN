#!/usr/bin/env node
import fs from 'node:fs';
import { analyzeScript, formatGateReason } from '../lib/tier-script.js';

// Per-script tiering report — works on ANY workflow script text: a committed
// .claude/workflows/*.js, an ad-hoc script persisted under the session dir, or
// a draft. One verdict per statically-labelled leaf against native-tiers.
//
// Exit codes (hook/CI friendly): 0 clean or acknowledged, 1 tier gaps,
// 2 violations (violations dominate gaps).
// Usage: node bin/byan-tier-script.js <script-file> [--json]

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  process.stderr.write('usage: byan-tier-script <script-file> [--json]\n');
  process.exit(2);
}

let src;
try {
  src = fs.readFileSync(file, 'utf8');
} catch (e) {
  process.stderr.write(`[byan-tier-script] cannot read ${file}: ${e.message}\n`);
  process.exit(2);
}

const analysis = analyzeScript(src);

if (jsonMode) {
  process.stdout.write(JSON.stringify(analysis, null, 2) + '\n');
} else {
  process.stdout.write(
    `[byan-tier-script] ${file}: ${analysis.agentCalls} agent() call(s), ` +
    `${analysis.leaves.length} labelled leaf/leaves, ` +
    `${analysis.gaps.length} gap(s), ${analysis.violations.length} violation(s)` +
    `${analysis.acknowledged ? ', acknowledged (BYAN-TIER: reviewed)' : ''}\n`
  );
  for (const l of analysis.leaves) {
    const model = l.model === null ? '(inherit)' : l.model;
    process.stdout.write(`  ${l.verdict.padEnd(12)} ${l.label} [${l.class}] model=${model} expected=${l.expectedModel ?? '(inherit)'}\n`);
  }
  if (analysis.gaps.length || analysis.violations.length) {
    process.stdout.write(formatGateReason(analysis) + '\n');
  }
}

if (analysis.acknowledged) process.exit(0);
if (analysis.violations.length) process.exit(2);
process.exit(analysis.gaps.length ? 1 : 0);
