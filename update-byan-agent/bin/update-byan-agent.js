#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');

const Analyzer = require('../lib/analyzer');
const Backup = require('../lib/backup');
const CustomizationDetector = require('../lib/customization-detector');
const { applyUpdate, resolvePackageRoot } = require('../lib/apply-update');

// Read the version from this package, not a hand-maintained literal that drifts.
let UPDATER_VERSION = '0.0.0';
try {
  UPDATER_VERSION = require('../package.json').version;
} catch { /* keep fallback */ }

program
  .name('update-byan-agent')
  .description('Gestion des mises a jour BYAN avec detection de conflits')
  .version(UPDATER_VERSION);

program
  .command('check')
  .description('Verifier version actuelle vs derniere version npm')
  .action(async () => {
    const spinner = ora('Verification version BYAN...').start();
    
    try {
      const installPath = process.cwd();
      const analyzer = new Analyzer(installPath);
      
      const versionInfo = await analyzer.checkVersion();
      
      spinner.succeed('Verification terminee');
      
      console.log('');
      console.log(chalk.bold('Informations de version:'));
      console.log(chalk.gray('  Version actuelle: ') + chalk.cyan(versionInfo.current));
      console.log(chalk.gray('  Version npm:      ') + chalk.cyan(versionInfo.latest));
      console.log('');
      
      if (versionInfo.upToDate) {
        console.log(chalk.green('  BYAN est a jour!'));
      } else if (versionInfo.needsUpdate) {
        console.log(chalk.yellow('  Une mise a jour est disponible'));
        console.log(chalk.gray('  Executer: npx update-byan-agent update'));
      } else if (versionInfo.ahead) {
        console.log(chalk.blue('  Vous utilisez une version dev en avance sur npm'));
      }
      
    } catch (error) {
      spinner.fail('Erreur verification version');
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Mettre a jour installation BYAN')
  .option('--dry-run', 'Analyser sans appliquer les changements')
  .option('--force', 'Forcer la mise a jour meme si deja a jour')
  .option('-y, --yes', 'Mode non-interactif : confirmer automatiquement')
  .option('--non-interactive', 'Alias de --yes (utile en CI / headless)')
  .action(async (options) => {
    const installPath = process.cwd();

    try {
      // Step 1: Check version
      const spinner = ora('Verification version...').start();
      const analyzer = new Analyzer(installPath);
      const versionInfo = await analyzer.checkVersion();
      spinner.succeed(`Version actuelle: ${versionInfo.current}, npm: ${versionInfo.latest}`);

      if (versionInfo.upToDate && !options.force) {
        console.log(chalk.green('\nBYAN est deja a jour!'));
        return;
      }

      if (options.dryRun) {
        console.log(chalk.cyan('\nMode dry-run: Aucune modification appliquee'));
        return;
      }

      // Step 2: Confirm update. Skip the prompt when explicitly non-interactive
      // (--yes / --non-interactive / --force) or when stdout is not a TTY (CI,
      // pipe, headless) — otherwise the updater hangs on the Y/n in automation.
      const autoConfirm =
        options.yes || options.nonInteractive || options.force ||
        !process.stdout.isTTY || !process.stdin.isTTY;
      if (!autoConfirm) {
        const { confirmUpdate } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmUpdate',
          message: `Mettre a jour BYAN ${versionInfo.current} -> ${versionInfo.latest}?`,
          default: true
        }]);
        if (!confirmUpdate) {
          console.log(chalk.yellow('Mise a jour annulee'));
          return;
        }
      }
      
      // Step 3: Detect customizations
      const detectorSpinner = ora('Detection des personnalisations...').start();
      const detector = new CustomizationDetector(installPath);
      const customizations = await detector.detectCustomizations();
      detectorSpinner.succeed(`${customizations.length} fichiers a preserver detectes`);
      
      // Step 4: Create backup
      const backupSpinner = ora('Creation backup...').start();
      const backup = new Backup(installPath);
      const backupPath = await backup.create();
      backupSpinner.succeed(`Backup cree: ${path.basename(backupPath)}`);
      
      // Step 5: Preserve customizations
      const preserveSpinner = ora('Sauvegarde des personnalisations...').start();
      const tempDir = path.join(installPath, '.byan-update-temp');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      for (const custom of customizations) {
        if (fs.existsSync(custom.path)) {
          const relativePath = path.relative(installPath, custom.path);
          const tempPath = path.join(tempDir, relativePath);
          const tempParent = path.dirname(tempPath);
          
          if (!fs.existsSync(tempParent)) {
            fs.mkdirSync(tempParent, { recursive: true });
          }
          
          if (fs.statSync(custom.path).isDirectory()) {
            copyRecursive(custom.path, tempPath);
          } else {
            fs.copyFileSync(custom.path, tempPath);
          }
        }
      }
      preserveSpinner.succeed('Personnalisations sauvegardees');
      
      // Step 6: Rebuild from the running package template (no network install).
      // The updater is launched via `npx -p create-byan-agent@latest`, so the
      // @latest package (and its template) is already on disk next to this bin.
      // We resolve it locally instead of re-installing it into the user project
      // (BUG3), validate the template BEFORE deleting anything, and swap via
      // rename so a failure never leaves _byan missing (BUG2).
      const updateSpinner = ora('Reconstruction depuis le template du package...').start();
      let pkgRoot;
      try {
        const resolved = resolvePackageRoot({ installPath, binDir: __dirname });
        pkgRoot = resolved.pkgRoot;

        const report = applyUpdate({ installPath, pkgRoot });
        updateSpinner.succeed(
          `Template applique (${report.byanEntries} entrees _byan` +
          (report.githubAgentsEntries != null
            ? `, ${report.githubAgentsEntries} stubs .github/agents` : '') +
          `) depuis ${resolved.source}`
        );

        // Refresh Claude Code native (.claude/hooks, .claude/skills,
        // .claude/agents, .claude/settings.json, .mcp.json, _byan/mcp/) from the
        // SAME local package root.
        const nativeSpinner = ora('Refresh Claude Code native...').start();
        try {
          const setupModule = path.join(pkgRoot, 'install', 'lib', 'claude-native-setup.js');
          if (fs.existsSync(setupModule)) {
            // eslint-disable-next-line import/no-dynamic-require, global-require
            const { setupClaudeNative } = require(setupModule);
            await setupClaudeNative(installPath, { installDeps: true, quiet: true });
            nativeSpinner.succeed('Claude Code native rafraichi');
          } else {
            nativeSpinner.info('Module claude-native-setup absent, refresh ignore');
          }
        } catch (e) {
          nativeSpinner.warn(`Claude native refresh ignore: ${e.message}`);
        }

        // FS migration (F11) — dormant by default. Acts only when explicitly
        // enabled (env BYAN_FS_MIGRATE=1 or _byan/_config/migrate-fs.enabled)
        // AND the legacy module layout is present. Same local package root.
        try {
          const hookModule = path.join(pkgRoot, 'install', 'lib', 'fs-migration-hook.js');
          if (fs.existsSync(hookModule)) {
            // eslint-disable-next-line import/no-dynamic-require, global-require
            const { runFsMigration } = require(hookModule);
            const r = runFsMigration({ projectRoot: installPath });
            if (r.ran) {
              console.log(chalk.green(`  FS migration applied (backup: ${r.backup})`));
            }
          }
        } catch (e) {
          console.warn(chalk.yellow(`  FS migration skipped: ${e.message}`));
        }
      } catch (error) {
        updateSpinner.fail('Erreur reconstruction');

        // Rollback. With the atomic-swap rebuild, _byan is only ever replaced
        // after a validated stage, so most failures happen before destruction;
        // the backup restore is the belt-and-suspenders net.
        const rollbackSpinner = ora('Restauration backup...').start();
        await backup.restore(backupPath);
        rollbackSpinner.succeed('Backup restaure');

        throw error;
      }
      
      // Step 7: Restore customizations
      const restoreSpinner = ora('Restauration personnalisations...').start();
      for (const custom of customizations) {
        const relativePath = path.relative(installPath, custom.path);
        const tempPath = path.join(tempDir, relativePath);
        
        if (fs.existsSync(tempPath)) {
          const targetParent = path.dirname(custom.path);
          
          if (!fs.existsSync(targetParent)) {
            fs.mkdirSync(targetParent, { recursive: true });
          }
          
          if (fs.statSync(tempPath).isDirectory()) {
            copyRecursive(tempPath, custom.path);
          } else {
            fs.copyFileSync(tempPath, custom.path);
          }
        }
      }
      restoreSpinner.succeed('Personnalisations restaurees');
      
      // Cleanup temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      
      console.log('');
      console.log(chalk.green.bold('Mise a jour terminee avec succes!'));
      console.log(chalk.gray(`  ${versionInfo.current} -> ${versionInfo.latest}`));
      console.log('');

      // Post-update: auto-heal .mcp.json for pre-fix installs (G8)
      try {
        const { runMigration } = require('../lib/migrate-mcp-config');
        const result = await runMigration(process.cwd(), { verbose: false });
        if (result.migrated) {
          console.log(chalk.green(`  .mcp.json migrated (${result.changes.length} change${result.changes.length > 1 ? 's' : ''})`));
        } else if (result.reason === 'no-token-available') {
          console.log(chalk.yellow(`  ${result.hint}`));
        }
        // silent on already-ok / no-mcp-json / no-byan-server
      } catch (err) {
        console.log(chalk.gray(`  (migration skipped: ${err.message})`));
        // never block the update
      }

    } catch (error) {
      console.error('');
      console.error(chalk.red.bold('Erreur lors de la mise a jour:'));
      console.error(chalk.red(`  ${error.message}`));
      console.error('');
      console.error(chalk.yellow('Le backup est disponible dans _byan.backup/'));
      process.exit(1);
    }
  });

program
  .command('backup')
  .description('Creer backup manuel de _byan')
  .action(async () => {
    const spinner = ora('Creation backup...').start();
    
    try {
      const installPath = process.cwd();
      const backup = new Backup(installPath);
      const backupPath = await backup.create();
      
      spinner.succeed('Backup cree avec succes');
      console.log(chalk.gray(`  Chemin: ${backupPath}`));
      
    } catch (error) {
      spinner.fail('Erreur creation backup');
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('restore')
  .description('Restaurer depuis backup')
  .option('-p, --path <path>', 'Chemin du backup (dernier par defaut)')
  .action(async (options) => {
    const spinner = ora('Restauration backup...').start();
    
    try {
      const installPath = process.cwd();
      const backup = new Backup(installPath);
      
      await backup.restore(options.path);
      
      spinner.succeed('Backup restaure avec succes');
      
    } catch (error) {
      spinner.fail('Erreur restauration backup');
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('list-backups')
  .description('Lister les backups disponibles')
  .action(async () => {
    try {
      const installPath = process.cwd();
      const backup = new Backup(installPath);
      const backups = await backup.listBackups();
      
      if (backups.length === 0) {
        console.log(chalk.yellow('Aucun backup disponible'));
        return;
      }
      
      console.log(chalk.bold('\nBackups disponibles:'));
      backups.forEach((b, i) => {
        const size = (b.size / 1024).toFixed(2);
        console.log(`  ${i + 1}. ${chalk.cyan(b.name)}`);
        console.log(`     ${chalk.gray('Date:')} ${new Date(b.timestamp).toLocaleString()}`);
        console.log(`     ${chalk.gray('Taille:')} ${size} KB`);
      });
      
    } catch (error) {
      console.error(chalk.red(`Erreur: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('migrate-mcp-config')
  .description('Migrer .mcp.json pre-fix : inject BYAN_API_TOKEN si absent, strip /api de BYAN_API_URL')
  .option('--dry-run', 'Simuler sans ecrire')
  .action(async (options) => {
    const { runMigration } = require('../lib/migrate-mcp-config');
    await runMigration(process.cwd(), { dryRun: options.dryRun, verbose: true });
  });

/**
 * Helper function to copy directory recursively
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

program.parse();
