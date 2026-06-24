/**
 * Google Workspace MCP extension (gdrive)
 *
 * Wraps the npm package `google-workspace-mcp` (Docs, Sheets, Slides, Drive,
 * Gmail, Calendar, Forms — 95+ tools). The package ships its own CLI for
 * interactive credential setup and persists everything under
 * ~/.google-mcp/ (gitignored by virtue of being in $HOME).
 *
 * Our role here is:
 *   1. Detect if the package is reachable (npx).
 *   2. Detect if credentials are already on disk.
 *   3. If not, walk the user through the Google Cloud setup steps with
 *      direct console links, and delegate the actual OAuth flow to the
 *      package's `setup` / `accounts add` CLI subcommands.
 *   4. Provide the .mcp.json entry to register the server.
 *
 * No credential ever touches the project tree. The .mcp.json entry only
 * declares command/args — every secret stays in ~/.google-mcp/.
 *
 * DURABLE + MUTUALIZED AUTH (the design choice): we guide the user to an OAuth
 * consent screen in "Internal" mode (Workspace-org only). "External + Testing"
 * expires the refresh token in ~7 days for scopes beyond openid/email/profile
 * (all of gw's Drive/Docs/... scopes qualify) ; "Internal" does not, and skips
 * Google app verification (source: developers.google.com/identity/protocols/oauth2).
 * This OAuth client is THE single Google credential of byan — the claude.ai Drive
 * connector becomes redundant. NOTE: this package (pm990320/google-workspace-mcp)
 * does NOT support service accounts (README: "Service account authentication is
 * not currently supported"), so a service-account JSON is not an option here ;
 * "Internal" is the durable path that keeps the package's 95+ tools.
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { execSync, spawnSync } = require('child_process');

const PACKAGE_NAME = 'google-workspace-mcp';
const CONFIG_DIR = path.join(os.homedir(), '.google-mcp');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');

const SETUP_LINKS = [
  {
    step: 'Créer un projet Google Cloud RATTACHÉ à ton organisation Workspace (ex : acadenice.fr) — pas un compte Gmail perso',
    url: 'https://console.cloud.google.com/projectcreate',
  },
  {
    step: 'Activer les APIs (Drive, Docs, Sheets, Slides, Gmail, Calendar, Forms)',
    url: 'https://console.cloud.google.com/apis/library',
  },
  {
    step: 'Écran de consentement OAuth : User type = "Internal" (durable : pas d\'expiration 7 j, pas de vérification Google)',
    url: 'https://console.cloud.google.com/apis/credentials/consent',
  },
  {
    step: 'Créer un OAuth Client ID type "Desktop App"',
    url: 'https://console.cloud.google.com/apis/credentials/oauthclient',
  },
];

async function isPackageInstallable() {
  try {
    execSync(`npm view ${PACKAGE_NAME} version --silent`, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function hasCredentials() {
  return fs.pathExists(CREDENTIALS_PATH);
}

async function isConfigured() {
  return hasCredentials();
}

function buildEntry() {
  return {
    command: 'npx',
    args: ['-y', PACKAGE_NAME, 'serve'],
  };
}

async function buildMcpEntry() {
  return buildEntry();
}

function printSetupGuide(log) {
  log();
  log(chalk.cyan('Étapes Google Cloud (faire dans le navigateur, dans cet ordre) :'));
  SETUP_LINKS.forEach((s, i) => {
    log(chalk.gray(`  ${i + 1}. ${s.step}`));
    log(chalk.gray(`     → ${s.url}`));
  });
  log();
  log(chalk.gray(`  5. Télécharger le JSON OAuth Client (bouton "Download JSON")`));
  log(chalk.gray(`  6. Renommer ce fichier en : credentials.json`));
  log(chalk.gray(`  7. Le placer dans : ${CREDENTIALS_PATH}`));
  log();
  // The single thing that makes the credential durable. "External + Testing"
  // expires the refresh token in ~7 days for scopes beyond openid/email/profile
  // (all gw scopes qualify) ; "Internal" does not, and skips Google app
  // verification. Source: developers.google.com/identity/protocols/oauth2.
  log(chalk.yellow('  Durabilité — LE point qui compte :'));
  log(chalk.yellow('    Écran de consentement en "Internal" → credential pérenne (token qui ne meurt pas).'));
  log(chalk.yellow('    "External + Testing" → refresh token expiré sous ~7 jours (scopes hors openid/email/profile, donc tous ceux de gw). À éviter.'));
  log(chalk.gray('    Limite "Internal" : seuls les comptes de ton org Workspace peuvent autoriser, et il faut UN login navigateur au premier setup.'));
  log(chalk.gray('    Ce client OAuth devient LE credential Google unique de byan (le connecteur claude.ai Drive devient redondant).'));
  log();
}

async function importCredentialsFromPath(srcPath, log) {
  const abs = path.resolve(srcPath);
  if (!(await fs.pathExists(abs))) {
    throw new Error(`Fichier introuvable : ${abs}`);
  }
  let parsed;
  try {
    parsed = await fs.readJson(abs);
  } catch (e) {
    throw new Error(`JSON invalide : ${e.message}`);
  }
  // Sanity check — Google OAuth client JSON has either "installed" or "web"
  if (!parsed.installed && !parsed.web) {
    throw new Error(
      `Format inattendu : ce fichier ne ressemble pas à un OAuth Client Google (clé "installed" ou "web" absente)`
    );
  }
  await fs.ensureDir(CONFIG_DIR);
  // Tighten dir perms : 700 (owner only). Best-effort on non-POSIX.
  try {
    await fs.chmod(CONFIG_DIR, 0o700);
  } catch {
    // ignore on platforms where this fails
  }
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(parsed, null, 2), {
    mode: 0o600,
  });
  log(chalk.green(`  ✓ credentials.json copié vers ${CREDENTIALS_PATH} (perm 600)`));
}

async function runOAuthFlow(log) {
  log();
  log(chalk.cyan('Lancement du flow OAuth Google (le navigateur va s\'ouvrir)'));
  log(chalk.gray('  Suis les instructions à l\'écran. Ferme la fenêtre quand le flow est terminé.'));
  log();

  const { accountName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'accountName',
      message: 'Nom du compte Google (un slug — ex : "perso", "work") :',
      default: 'default',
      validate: (v) => /^[a-z0-9_-]+$/i.test(v) || 'Caractères autorisés : a-z, 0-9, _, -',
    },
  ]);

  const result = spawnSync('npx', ['-y', PACKAGE_NAME, 'accounts', 'add', accountName], {
    stdio: 'inherit',
    timeout: 600_000, // 10 minutes
  });

  if (result.status !== 0) {
    throw new Error(`google-workspace-mcp accounts add a échoué (exit ${result.status})`);
  }
  log(chalk.green(`  ✓ Compte "${accountName}" ajouté`));
  return accountName;
}

async function setup({ quiet } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);

  if (!(await isPackageInstallable())) {
    return {
      configured: false,
      skipReason: `Le package npm "${PACKAGE_NAME}" n'est pas accessible (réseau / registre indisponible). Réessaie plus tard.`,
    };
  }

  if (await hasCredentials()) {
    log(chalk.gray(`  · credentials.json déjà présent à ${CREDENTIALS_PATH}`));
    const { reuse } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reuse',
        message: 'Réutiliser la config existante (sans relancer OAuth) ?',
        default: true,
      },
    ]);
    if (reuse) {
      log(chalk.gray('  Rappel durabilité : si ce client OAuth est en "External + Testing", son token meurt sous ~7 j (scopes Workspace gw concernés).'));
      log(chalk.gray('  Pour un credential pérenne, l\'écran de consentement doit être en "Internal" (org Workspace).'));
      return { configured: true, message: 'reused existing credentials' };
    }
  } else {
    printSetupGuide(log);

    const { hasJson } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'hasJson',
        message: 'Tu as téléchargé le credentials.json (étapes 1-5) ?',
        default: false,
      },
    ]);

    if (!hasJson) {
      return {
        configured: false,
        skipReason:
          'Setup interrompu — relance l\'installer une fois le credentials.json téléchargé.',
      };
    }

    const { jsonPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'jsonPath',
        message: 'Chemin local vers le credentials.json téléchargé :',
        validate: (v) => v && v.trim().length > 0 || 'Chemin requis',
      },
    ]);

    try {
      await importCredentialsFromPath(jsonPath.trim(), log);
    } catch (err) {
      return { configured: false, skipReason: `Import des credentials échoué : ${err.message}` };
    }
  }

  const { runAuth } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runAuth',
      message: 'Lancer le flow OAuth maintenant (ouvre le navigateur) ?',
      default: true,
    },
  ]);

  if (!runAuth) {
    return {
      configured: true,
      message:
        'credentials importés ; lance le flow OAuth plus tard via : npx -y google-workspace-mcp accounts add <name>',
    };
  }

  try {
    const account = await runOAuthFlow(log);
    return { configured: true, message: `compte "${account}" authentifié` };
  } catch (err) {
    return {
      configured: false,
      skipReason:
        `OAuth a échoué : ${err.message}. Relance manuellement : npx -y ${PACKAGE_NAME} accounts add <name>`,
    };
  }
}

module.exports = {
  id: 'gdrive',
  name: 'Google Workspace (Docs / Sheets / Slides / Drive / Gmail / Calendar)',
  description: '95+ tools via google-workspace-mcp, OAuth2, creds in ~/.google-mcp/',
  isConfigured,
  setup,
  buildMcpEntry,
  // exposed for tests
  buildEntry,
  printSetupGuide,
  CONFIG_DIR,
  CREDENTIALS_PATH,
  PACKAGE_NAME,
  SETUP_LINKS,
};
