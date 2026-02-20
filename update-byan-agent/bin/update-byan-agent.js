#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const Analyzer = require('../lib/analyzer');
const Backup = require('../lib/backup');
const CustomizationDetector = require('../lib/customization-detector');

program
  .name('update-byan-agent')
  .description('Gestion des mises a jour BYAN avec detection de conflits')
  .version('2.6.1');

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
      
      // Step 2: Confirm update
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
      
      // Step 6: Download and install latest version
      const updateSpinner = ora('Telechargement derniere version...').start();
      try {
        // Remove current _byan directory
        const byanDir = path.join(installPath, '_byan');
        if (fs.existsSync(byanDir)) {
          fs.rmSync(byanDir, { recursive: true, force: true });
        }
        
        // Run npm install to get latest create-byan-agent
        execSync('npm install --no-save create-byan-agent@latest', {
          cwd: installPath,
          stdio: 'pipe'
        });
        
        // Copy _byan from node_modules to project root
        const nodeModulesByan = path.join(installPath, 'node_modules', 'create-byan-agent', '_byan');
        if (fs.existsSync(nodeModulesByan)) {
          copyRecursive(nodeModulesByan, byanDir);
        } else {
          throw new Error('_byan directory not found in npm package');
        }
        
        updateSpinner.succeed('Derniere version installee');
      } catch (error) {
        updateSpinner.fail('Erreur installation');
        
        // Rollback
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
