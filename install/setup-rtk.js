#!/usr/bin/env node
'use strict';

/**
 * setup-rtk — explicit opt-in installer for the RTK token optimizer (rtk-ai/rtk).
 *
 * Run on demand: `npm run setup-rtk` (or `node install/setup-rtk.js`). It delegates
 * the install to rtk's own canonical installer (brew / cargo / official script) and
 * the Claude Code hook wiring to rtk's own `rtk init -g --auto-patch`. It NEVER throws: a missing
 * installer or a failed step is reported and exits 0 (RTK is optional; BYAN works
 * without it). The real logic lives in lib/rtk-integration.js and is unit-tested.
 */

const chalk = require('chalk');
const { setupRtkIntegration, doctor } = require('./lib/rtk-integration');

function main() {
  console.log(chalk.cyan('\nRTK token optimizer (rtk-ai/rtk) — optional native component'));
  console.log(chalk.gray('  Cuts dev-command tokens 60-90%; wires its own Claude Code hook.'));
  console.log(chalk.gray('  Progress streams below. The cargo fallback compiles from source (minutes); Ctrl+C is safe.\n'));

  const result = setupRtkIntegration({ log: (m) => console.log(chalk.gray('  ' + m)) });

  if (result.synced) {
    console.log(chalk.green(`\n  rtk ready (${result.installedVia}, v${result.version || '?'}). Restart Claude Code to activate.`));
    if (result.pathHint) console.log(chalk.yellow(`  rtk is not on your PATH — add it: ${result.pathHint}`));
  } else if (result.reason === 'no-installer') {
    console.log(chalk.yellow('\n  No installer found (brew / curl / cargo). Install one, then re-run `npm run setup-rtk`.'));
  } else if (result.pathHint) {
    console.log(chalk.yellow(`\n  rtk found off-PATH (${result.reason}) — add it then re-run: ${result.pathHint}`));
  } else {
    console.log(chalk.yellow(`\n  rtk not wired (${result.reason}). BYAN is unaffected; you can retry later.`));
  }

  const d = doctor();
  console.log(chalk.gray(`  doctor: installed=${d.installed} version=${d.version || '-'} (pinned ${d.pinned})`));
  // Optional component -> always a clean exit; never fail the surrounding flow.
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
