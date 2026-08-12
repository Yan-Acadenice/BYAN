/**
 * Interactive prompt for byan_web API URL + JWT/ApiKey token.
 *
 * Extracted verbatim from install's byan-web-integration so the UX does
 * not drift between create-byan-agent and update-byan-agent.
 */

const inquirer = require('inquirer');
const chalk = require('chalk');

// La valeur proposee par defaut vient de la source unique (install/lib/
// api-defaults.js). Elle valait localhost:3737 : la question proposait donc a
// l'utilisateur de pointer sur sa propre machine, ou byan_web ne tourne pas.
// Chargement par chemin relatif, comme le reste des liens entre install/lib et
// ce paquet — la dependance file: avait produit le defaut d'empaquetage
// corrige en 2.59.3.
const { PROD_API_URL: DEFAULT_API_URL } = require('../../../lib/api-defaults');
const ENV_KEYS = ['BYAN_API_TOKEN', 'BYAN_API_URL'];
const LEANTIME_ENV_KEYS = [
  'LEANTIME_API_URL',
  'LEANTIME_API_TOKEN',
  'LEANTIME_ASSIGN_USER_ID',
];

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

/**
 * Interactive prompt for an optional Leantime board connection.
 *
 * Leantime is a SELF-HOSTED, per-instance board : every user points at THEIR
 * own instance with THEIR own API key — there is no shared token. The prompt
 * is opt-in (default no) and, when declined, returns { configured: false }
 * without touching anything.
 *
 * The URL field warns about the wrong-host trap : Leantime serves the HTML app
 * and the JSON-RPC API on the same domain, so the value must be the BACKEND
 * host (the one answering /api/jsonrpc), not the UI host. Pointing at the UI
 * host makes the API return an HTML login page (the non_json failure).
 *
 * @returns {Promise<{ configured: boolean, apiUrl?: string, token?: string, assignUserId?: string }>}
 */
async function promptForLeantime() {
  const { wantsLeantime } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantsLeantime',
      message:
        'Connect a self-hosted Leantime board for FD -> board sync ? ' +
        chalk.gray('(optional — your own Leantime instance + API key)'),
      default: false,
    },
  ]);

  if (!wantsLeantime) return { configured: false };

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message:
        'Leantime backend URL ' +
        chalk.yellow('(the host answering /api/jsonrpc, NOT the UI host):'),
      validate: (v) =>
        /^https?:\/\//.test(String(v).trim()) ||
        'Must start with http:// or https://',
    },
    {
      type: 'password',
      name: 'token',
      message:
        'Leantime API key ' +
        chalk.gray('(Company Settings -> Cle d\'API -> Generate, prefix lt_):'),
      mask: '*',
      validate: (v) =>
        (typeof v === 'string' && v.trim().length > 0) || 'Token cannot be empty',
    },
    {
      type: 'input',
      name: 'assignUserId',
      message:
        'Your Leantime user id ' +
        chalk.gray('(optional — board shows in your selector + default assignee; Enter to skip):'),
      default: '',
      validate: (v) => {
        const t = String(v).trim();
        return t === '' || /^\d+$/.test(t) || 'Must be a number (or empty to skip)';
      },
    },
  ]);

  const result = {
    configured: true,
    apiUrl: answers.apiUrl.trim(),
    token: answers.token.trim(),
  };
  const assignUserId = String(answers.assignUserId || '').trim();
  if (assignUserId) result.assignUserId = assignUserId;
  return result;
}

module.exports = {
  promptForToken,
  promptForLeantime,
  ENV_KEYS,
  LEANTIME_ENV_KEYS,
  DEFAULT_API_URL,
};
