/**
 * Interactive prompt for byan_web API URL + JWT/ApiKey token.
 *
 * Extracted verbatim from install's byan-web-integration so the UX does
 * not drift between create-byan-agent and update-byan-agent.
 */

const inquirer = require('inquirer');
const chalk = require('chalk');

const DEFAULT_API_URL = 'http://localhost:3737';
const ENV_KEYS = ['BYAN_API_TOKEN', 'BYAN_API_URL'];

/**
 * @returns {Promise<{ configured: boolean, apiUrl?: string, token?: string }>}
 */
async function promptForToken() {
  const { wantsToken } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantsToken',
      message:
        'Connect this project to your byan_web instance ? ' +
        chalk.yellow('(service payant — requires a paid subscription to generate a token)'),
      default: false,
    },
  ]);

  if (!wantsToken) return { configured: false };

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'byan_web API URL:',
      default: DEFAULT_API_URL,
      validate: (v) =>
        /^https?:\/\//.test(v.trim()) || 'Must start with http:// or https://',
    },
    {
      type: 'password',
      name: 'token',
      message: 'byan_web JWT token (from POST /api/auth/login):',
      mask: '*',
      validate: (v) =>
        (typeof v === 'string' && v.trim().length > 0) || 'Token cannot be empty',
    },
  ]);

  return {
    configured: true,
    apiUrl: answers.apiUrl.trim(),
    token: answers.token.trim(),
  };
}

module.exports = {
  promptForToken,
  ENV_KEYS,
  DEFAULT_API_URL,
};
