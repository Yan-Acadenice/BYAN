/**
 * Installer step — BYAN memory-sync opt-in + consent (SM5).
 *
 * Shown during create-byan-agent. Only prompts when the user already
 * provided a byan_web URL + token (via setupByanWebIntegration), since
 * memory-sync without credentials is a no-op.
 *
 * On opt-in, writes :
 *   _byan/config.yaml  → memory_sync: { enabled: true }
 *   OR loadbalancer.yaml if _byan/config.yaml not present
 *
 * Prints a clear consent notice listing what gets sent and how to
 * disable. The user must type "oui" / "yes" to enable — no default to
 * true.
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const chalk = require('chalk');

const CONSENT_NOTICE = [
  '',
  chalk.yellow.bold('BYAN memory-sync — consent requis'),
  '',
  'Si vous activez cette option, apres chaque interaction avec',
  'Claude Code ou Copilot CLI, BYAN envoie automatiquement a votre',
  'instance byan_web les elements suivants :',
  '',
  '  - messages utilisateur (prompts)',
  '  - reponses assistant',
  '  - chemins de fichiers modifies',
  '  - sessionId et timestamp',
  '',
  'Filtrage applique AVANT envoi :',
  '  - chit-chat (moins de 50 caracteres) -> ignore',
  '  - doublons (hash SHA256 du contenu)   -> ignore',
  '  - categories : fact | decision | blocker | artifact',
  '',
  'Les donnees sont stockees dans VOTRE instance byan_web',
  '(pas de tierce partie). Le token JWT identifie l auteur.',
  '',
  chalk.cyan('Desactiver plus tard :'),
  '  - editer _byan/config.yaml    -> memory_sync: { enabled: false }',
  '  - OU invoquer le skill        -> /byan-no-stage pour un turn',
  '',
].join('\n');

async function promptConsent({ skipPrompts, defaultAnswer } = {}) {
  if (skipPrompts) return { enabled: defaultAnswer === true };

  console.log(CONSENT_NOTICE);

  const { enable } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enable',
      message:
        'Activer la synchronisation automatique de vos conversations vers byan_web ?',
      default: false,
    },
  ]);

  return { enabled: enable };
}

function configPaths(projectRoot) {
  return {
    byanConfig: path.join(projectRoot, '_byan', 'config.yaml'),
    lbConfig: path.join(projectRoot, 'loadbalancer.yaml'),
  };
}

async function writeMemorySyncFlag(projectRoot, enabled) {
  const { byanConfig, lbConfig } = configPaths(projectRoot);

  // Prefer _byan/config.yaml (BYAN primary config). Fall back to
  // loadbalancer.yaml only if _byan/config.yaml is missing AND
  // loadbalancer.yaml already exists.
  let target;
  if (await fs.pathExists(byanConfig)) {
    target = byanConfig;
  } else if (await fs.pathExists(lbConfig)) {
    target = lbConfig;
  } else {
    target = byanConfig;
  }
  await fs.ensureDir(path.dirname(target));

  let doc = {};
  if (await fs.pathExists(target)) {
    try {
      doc = yaml.load(await fs.readFile(target, 'utf8')) || {};
    } catch {
      doc = {};
    }
  }
  doc.memory_sync = { ...(doc.memory_sync || {}), enabled: enabled === true };

  await fs.writeFile(target, yaml.dump(doc), 'utf8');
  return target;
}

async function setupStagingConsent(projectRoot, options = {}) {
  const tokenPresent = options.byanWebConfigured === true;
  if (!tokenPresent) {
    if (!options.quiet) {
      console.log(
        chalk.gray('  i memory-sync skipped (no byan_web token configured)')
      );
    }
    return { configured: false, reason: 'no_token' };
  }

  const { enabled } = await promptConsent({
    skipPrompts: options.skipPrompts === true,
    defaultAnswer: options.presetEnabled === true,
  });

  const target = await writeMemorySyncFlag(projectRoot, enabled);

  if (!options.quiet) {
    if (enabled) {
      console.log(chalk.green('  OK memory-sync ENABLED in ' + path.relative(projectRoot, target)));
      console.log(
        chalk.gray(
          '     a chaque fin de turn, votre hook Stop (Claude) et votre'
        )
      );
      console.log(
        chalk.gray(
          '     extension Copilot staging enverront les memoires a byan_web.'
        )
      );
    } else {
      console.log(chalk.gray('  i memory-sync left DISABLED (opt-in declined)'));
    }
  }

  return { configured: true, enabled, configPath: target };
}

module.exports = {
  setupStagingConsent,
  writeMemorySyncFlag,
  promptConsent,
  CONSENT_NOTICE,
};
