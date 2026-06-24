#!/usr/bin/env node
'use strict';

/**
 * setup-gdoc -- explicit opt-in setup for the byan_publish service-account key.
 *
 * Run on demand: `npm run setup-gdoc` (or `node install/setup-gdoc.js`). Walks
 * the user through creating a Google service account + key, imports the JSON to
 * ~/.byan/google-sa.json (0600), and persists the publish config into
 * ~/.byan/credentials.json. It NEVER throws and exits 0 : the SA setup is
 * optional and must not fail the surrounding flow. The real logic lives in
 * lib/gdoc-setup.js and is unit-tested.
 */

const chalk = require('chalk');
const { setupGdocPublish } = require('./lib/gdoc-setup');

async function main() {
  console.log(chalk.cyan('\nbyan_publish -- clé service account (Google Docs headless)'));
  console.log(chalk.gray('  Open source : tu fournis ta clé ; rien de secret ne ship.\n'));

  const result = await setupGdocPublish({ log: (...a) => console.log(...a) });

  if (result.configured) {
    console.log(chalk.green(`\n  Configuré. Clé : ${result.path}`));
    console.log(chalk.gray('  Installe aussi googleapis dans le MCP server : (cd _byan/mcp/byan-mcp-server && npm install googleapis google-auth-library)'));
  } else {
    console.log(chalk.yellow(`\n  Non configuré (${result.skipReason || 'ignoré'}). BYAN reste fonctionnel.`));
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    // Last-resort guard : an optional setup must not crash with a non-zero exit.
    console.log(chalk.yellow(`  setup-gdoc ignoré : ${err.message}`));
    process.exit(0);
  });
}

module.exports = { main };
