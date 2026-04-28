/**
 * MCP Extensions Registry — discovers and orchestrates third-party MCP
 * server integrations (Google Workspace, etc.) during yanstaller install.
 *
 * Each extension is a module under this directory exposing the contract:
 *
 *   {
 *     id          : string                       // unique slug (becomes mcpServers key)
 *     name        : string                       // human-readable name
 *     description : string                       // shown to user during prompt
 *     async isConfigured(): Promise<boolean>     // already set up on this machine?
 *     async setup(options): Promise<{
 *       configured: boolean,
 *       message:    string,
 *       skipReason?: string,
 *     }>                                          // interactive: walks the user
 *                                                 // through credential setup
 *     async buildMcpEntry(): Promise<object>     // returns the entry to write
 *                                                 // into mcpServers.<id>
 *   }
 *
 * The registry walks the list, prompts the user for each, runs setup if
 * accepted, and writes the resulting MCP entry into .mcp.json via
 * addMcpEntry (which refuses any entry containing a value that looks like
 * a secret — see mcp-config.js).
 *
 * No secret value is ever stored by this module. Per-extension credential
 * persistence is the extension's responsibility (typically under ~/.config/
 * or ~/.<package>/, never inside the project).
 */

'use strict';

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const inquirer = require('inquirer');

const {
  mcpConfig: { addMcpEntry },
} = require('byan-platform-config');

const gdrive = require('./gdrive');

const EXTENSIONS = [gdrive];

function listExtensions() {
  return EXTENSIONS.map((ext) => ({
    id: ext.id,
    name: ext.name,
    description: ext.description,
  }));
}

function getExtension(id) {
  return EXTENSIONS.find((ext) => ext.id === id) || null;
}

/**
 * Walk every registered extension and offer it to the user. For each
 * extension the user accepts, run its setup flow, then register the
 * resulting MCP entry in .mcp.json.
 *
 * @param {string} projectRoot
 * @param {{
 *   skipPrompts?: boolean,
 *   presetSelections?: Record<string, boolean>,  // { gdrive: true }
 *   quiet?: boolean,
 * }} options
 * @returns {Promise<Array<{ id: string, configured: boolean, message: string }>>}
 */
async function setupMcpExtensions(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);
  const results = [];

  if (EXTENSIONS.length === 0) return results;

  log();
  log(chalk.cyan('MCP extensions (optional third-party integrations)'));

  for (const ext of EXTENSIONS) {
    let want;
    if (options.skipPrompts) {
      want = options.presetSelections && options.presetSelections[ext.id] === true;
    } else {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'enable',
          message: `${ext.name} — ${ext.description}\n  Activer ?`,
          default: false,
        },
      ]);
      want = answers.enable === true;
    }

    if (!want) {
      log(chalk.gray(`  · ${ext.id}: skipped`));
      results.push({ id: ext.id, configured: false, message: 'skipped by user' });
      continue;
    }

    let setupResult;
    try {
      setupResult = await ext.setup({ projectRoot, quiet: options.quiet });
    } catch (err) {
      log(chalk.red(`  ✘ ${ext.id} setup failed: ${err.message}`));
      results.push({ id: ext.id, configured: false, message: `setup error: ${err.message}` });
      continue;
    }

    if (!setupResult || setupResult.configured !== true) {
      const reason = (setupResult && (setupResult.skipReason || setupResult.message)) || 'setup not completed';
      log(chalk.yellow(`  ⚠ ${ext.id}: ${reason}`));
      results.push({ id: ext.id, configured: false, message: reason });
      continue;
    }

    let entry;
    try {
      entry = await ext.buildMcpEntry({ projectRoot });
    } catch (err) {
      log(chalk.red(`  ✘ ${ext.id} buildMcpEntry failed: ${err.message}`));
      results.push({ id: ext.id, configured: false, message: `buildMcpEntry error: ${err.message}` });
      continue;
    }

    try {
      await addMcpEntry(projectRoot, ext.id, entry);
      log(chalk.green(`  ✓ ${ext.id} registered in .mcp.json`));
      results.push({ id: ext.id, configured: true, message: 'registered' });
    } catch (err) {
      log(chalk.red(`  ✘ ${ext.id} addMcpEntry failed: ${err.message}`));
      results.push({ id: ext.id, configured: false, message: `addMcpEntry error: ${err.message}` });
    }
  }

  return results;
}

module.exports = {
  listExtensions,
  getExtension,
  setupMcpExtensions,
  // re-exported for tests / programmatic callers
  EXTENSIONS,
};
