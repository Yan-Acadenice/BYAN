'use strict';

/**
 * gdoc-setup -- install-time setup of the byan_publish service-account key.
 *
 * BYAN is open source : NO key ships. Each user provides THEIR OWN Google service
 * account at install time. This module walks the user through creating the SA +
 * key in the Google Cloud console, imports the downloaded JSON to
 * ~/.byan/google-sa.json (chmod 0600), and persists the publish config
 * (GOOGLE_APPLICATION_CREDENTIALS + optional GDOC_TEMPLATE_ID / GDOC_LOGO_PNG_URL)
 * into ~/.byan/credentials.json via byan-platform-config's writeCredentials. The
 * byan MCP server then reads them through resolve-config.
 *
 * Mirrors the shape of rtk-integration.js : graceful (NEVER throws, ok stays
 * true so a failed step never breaks the BYAN install), and every side-effecting
 * dep (prompt / fs / writeCredentials) is injectable, so the whole flow is
 * unit-tested without touching a real key, the network, or the user HOME.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { writeCredentials } = require('byan-platform-config');

const SA_FILENAME = 'google-sa.json';

const SETUP_LINKS = [
  {
    step: "Projet Google Cloud (idéalement rattaché à ton org Workspace)",
    url: 'https://console.cloud.google.com/projectcreate',
  },
  {
    step: 'Activer les APIs Google Docs + Google Drive',
    url: 'https://console.cloud.google.com/apis/library',
  },
  {
    step: 'Créer un service account',
    url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
  },
  {
    step: 'Sur le service account -> Keys -> Add key -> Create new key -> JSON -> télécharger',
    url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
  },
];

function saDestPath(homedir = os.homedir()) {
  return path.join(homedir, '.byan', SA_FILENAME);
}

/**
 * A plausible service-account key : an object carrying a client_email and a
 * private_key. Shape-only -- we never validate the key cryptographically.
 */
function validateServiceAccount(parsed) {
  return Boolean(
    parsed &&
      typeof parsed === 'object' &&
      typeof parsed.client_email === 'string' &&
      parsed.client_email.trim() &&
      typeof parsed.private_key === 'string' &&
      parsed.private_key.includes('PRIVATE KEY')
  );
}

/**
 * shouldOfferGdoc() -> offer the setup only when interactive and not opted out
 * (BYAN_SKIP_GDOC=1). Never prompts in CI / non-TTY.
 */
function shouldOfferGdoc({ env = process.env, isTTY = !!(process.stdin && process.stdin.isTTY) } = {}) {
  if (env && env.BYAN_SKIP_GDOC === '1') return false;
  return Boolean(isTTY);
}

function printSetupGuide(log) {
  log();
  log(chalk.cyan('Clé service account pour byan_publish (Google Docs headless) :'));
  log(chalk.gray('  Open source -> tu fournis TA clé ; rien de secret ne ship. ~2 min, une fois.'));
  SETUP_LINKS.forEach((s, i) => {
    log(chalk.gray(`  ${i + 1}. ${s.step}`));
    log(chalk.gray(`     -> ${s.url}`));
  });
  log();
}

/**
 * setupGdocPublish(deps) -> { ok, configured, ... }. Never throws ; ok stays
 * true on every path. configured=true only when a valid key was imported and
 * persisted.
 *
 * @param {object} [deps]
 * @param {Function} [deps.prompt]            inquirer.prompt (injected in tests)
 * @param {Function} [deps.log]               line sink
 * @param {string}   [deps.homedir]
 * @param {object}   [deps.fsImpl]            fs-extra-like (readJson/ensureDir/writeFile/chmod)
 * @param {Function} [deps.persist]           writeCredentials (injected in tests)
 * @param {boolean}  [deps.quiet]
 */
async function setupGdocPublish(deps = {}) {
  const prompt = deps.prompt || inquirer.prompt;
  const homedir = deps.homedir || os.homedir();
  const fsImpl = deps.fsImpl || fs;
  const persist = deps.persist || writeCredentials;
  const log = deps.quiet ? () => {} : deps.log || ((...a) => console.log(...a));

  try {
    printSetupGuide(log);

    const { hasKey } = await prompt([
      {
        type: 'confirm',
        name: 'hasKey',
        message: 'Tu as téléchargé le JSON de la clé service account ?',
        default: false,
      },
    ]);
    if (!hasKey) {
      return {
        ok: true,
        configured: false,
        skipReason: "Setup reporté -- relance `npm run setup-gdoc` une fois le JSON téléchargé.",
      };
    }

    const { jsonPath } = await prompt([
      {
        type: 'input',
        name: 'jsonPath',
        message: 'Chemin local vers le JSON de la clé SA :',
        validate: (v) => (v && v.trim().length > 0) || 'Chemin requis',
      },
    ]);

    let parsed;
    try {
      parsed = await fsImpl.readJson(path.resolve(jsonPath.trim()));
    } catch (e) {
      return { ok: true, configured: false, skipReason: `JSON illisible : ${e.message}` };
    }
    if (!validateServiceAccount(parsed)) {
      return {
        ok: true,
        configured: false,
        skipReason:
          'Ce fichier ne ressemble pas à une clé service account (client_email + private_key requis).',
      };
    }

    // Store the key OUTSIDE any repo, in ~/.byan/, at 0600 (created restrictively).
    const dir = path.join(homedir, '.byan');
    const dest = saDestPath(homedir);
    await fsImpl.ensureDir(dir);
    try {
      await fsImpl.chmod(dir, 0o700);
    } catch {
      // POSIX modes unsupported -> proceed without the dir tightening.
    }
    await fsImpl.writeFile(dest, JSON.stringify(parsed, null, 2) + '\n', { mode: 0o600 });
    try {
      await fsImpl.chmod(dest, 0o600);
    } catch {
      // see above
    }

    const { templateId } = await prompt([
      {
        type: 'input',
        name: 'templateId',
        message: 'ID d\'un Google Doc template brandé (optionnel, Entrée pour passer) :',
        default: '',
      },
    ]);
    const { logoUrl } = await prompt([
      {
        type: 'input',
        name: 'logoUrl',
        message: 'URL PNG du logo (optionnel, Entrée pour passer) :',
        default: '',
      },
    ]);

    const values = { GOOGLE_APPLICATION_CREDENTIALS: dest };
    if (templateId && templateId.trim()) values.GDOC_TEMPLATE_ID = templateId.trim();
    if (logoUrl && logoUrl.trim()) values.GDOC_LOGO_PNG_URL = logoUrl.trim();

    const res = await persist(values, { homedir });
    log(chalk.green(`  clé SA -> ${dest} (0600)`));
    log(chalk.gray(`  persisté dans ~/.byan/credentials.json : ${(res.written || []).join(', ')}`));
    return {
      ok: true,
      configured: true,
      path: dest,
      persisted: res.written || [],
      clientEmail: parsed.client_email,
    };
  } catch (err) {
    return { ok: true, configured: false, skipReason: `setup gdoc échoué : ${err.message}` };
  }
}

module.exports = {
  setupGdocPublish,
  shouldOfferGdoc,
  validateServiceAccount,
  printSetupGuide,
  saDestPath,
  SETUP_LINKS,
  SA_FILENAME,
};
