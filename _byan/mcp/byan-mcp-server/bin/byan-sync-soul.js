#!/usr/bin/env node
import { checkSoul, syncSoul, SOUL_PAIRS } from '../lib/sync-soul.js';

// Keep the shippable soul source (_byan/agent/byan/byan-{soul,tao}.md) faithful
// to the active soul (_byan/agent/byan/{soul,tao}.md). Two modes:
//   (default) apply : mirror active -> shippable, report what changed.
//   --check         : report drift and exit non-zero if any remains (no writes).
//                     This is the pre-commit gate's entry point.
// soul-memory is out of scope (curated seed). See lib/sync-soul.js.
// Usage: node bin/byan-sync-soul.js [--check] [--root <dir>]

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

if (args.check) {
  const { drifted, missingActive, ok } = checkSoul({ projectRoot: root });
  if (ok) {
    process.stdout.write('[byan-sync-soul] OK - shippable soul is faithful to the active soul\n');
    process.exit(0);
  }
  for (const rel of drifted) {
    process.stderr.write(
      `[byan-sync-soul] drift: _byan/agent/byan/${rel} is stale vs its active source. Run: node _byan/mcp/byan-mcp-server/bin/byan-sync-soul.js\n`
    );
  }
  for (const rel of missingActive) {
    process.stderr.write(`[byan-sync-soul] missing active source: _byan/agent/byan/${rel}\n`);
  }
  process.exit(1);
}

const report = syncSoul({ projectRoot: root });
const missing = report.missingActive || [];
for (const { shippable } of SOUL_PAIRS) {
  if (report[shippable]) process.stdout.write(`  ${report[shippable].padEnd(9)} _byan/agent/byan/${shippable}\n`);
}
for (const rel of missing) {
  process.stderr.write(`[byan-sync-soul] WARN missing active source: _byan/agent/byan/${rel}\n`);
}
process.stdout.write('[byan-sync-soul] done\n');
