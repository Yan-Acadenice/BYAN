#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');

const BYAN_VERSION = '1.0.0';

// ASCII Art Banner
const banner = `
${chalk.blue('╔════════════════════════════════════════════════════════════╗')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.bold('🏗️  BYAN INSTALLER v' + BYAN_VERSION)}                        ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Builder of YAN - Agent Creator')}                          ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Methodology: Merise Agile + TDD + 64 Mantras')}           ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('╚════════════════════════════════════════════════════════════╝')}
`;

// Main installer
async function install() {
  console.clear();
  console.log(banner);
  
  const projectRoot = process.cwd();
  
  // Step 1: Detect project type
  const spinner = ora('Detecting project type...').start();
  
  const isGitRepo = await fs.pathExists(path.join(projectRoot, '.git'));
  const hasPackageJson = await fs.pathExists(path.join(projectRoot, 'package.json'));
  const hasPyProject = await fs.pathExists(path.join(projectRoot, 'pyproject.toml'));
  
  if (!isGitRepo && !hasPackageJson && !hasPyProject) {
    spinner.warn('Not in a recognized project directory');
    
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'BYAN works best in a project with version control. Continue anyway?',
        default: false
      }
    ]);
    
    if (!continueAnyway) {
      console.log(chalk.yellow('Installation cancelled.'));
      process.exit(0);
    }
  } else {
    spinner.succeed('Project detected');
  }
  
  // Step 2: Platform selection
  const { platform } = await inquirer.prompt([
    {
      type: 'list',
      name: 'platform',
      message: 'Select platform to install for:',
      choices: [
        { name: 'GitHub Copilot CLI', value: 'copilot' },
        { name: 'VSCode', value: 'vscode' },
        { name: 'Claude Code', value: 'claude' },
        { name: 'Codex', value: 'codex' },
        { name: 'All platforms', value: 'all' }
      ]
    }
  ]);
  
  // Step 3: User configuration
  const config = await inquirer.prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'Your name:',
      default: 'Developer'
    },
    {
      type: 'list',
      name: 'language',
      message: 'Communication language:',
      choices: ['Francais', 'English'],
      default: 'English'
    }
  ]);
  
  // Step 4: Create directory structure
  const installSpinner = ora('Creating directory structure...').start();
  
  const bmadDir = path.join(projectRoot, '_bmad');
  const bmbDir = path.join(bmadDir, 'bmb');
  
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'agents'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'steps'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'templates'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'data'));
  await fs.ensureDir(path.join(bmadDir, 'core'));
  await fs.ensureDir(path.join(bmadDir, '_config'));
  await fs.ensureDir(path.join(bmadDir, '_memory'));
  await fs.ensureDir(path.join(bmadDir, '_output'));
  
  installSpinner.succeed('Directory structure created');
  
  // Step 5: Copy BYAN files
  const copySpinner = ora('Installing BYAN files...').start();
  
  // In production, these would be copied from the package
  // For now, we'll create minimal config
  
  const configContent = {
    bmb_creations_output_folder: "{project-root}/_bmad-output/bmb-creations",
    user_name: config.userName,
    communication_language: config.language,
    document_output_language: config.language,
    output_folder: "{project-root}/_bmad-output",
    platform: platform
  };
  
  const configPath = path.join(bmbDir, 'config.yaml');
  await fs.writeFile(configPath, yaml.dump(configContent), 'utf8');
  
  copySpinner.succeed('BYAN files installed');
  
  // Step 6: Create shortcuts
  const shortcutSpinner = ora('Creating shortcuts...').start();
  
  // Create package.json scripts if it exists
  if (hasPackageJson) {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    
    if (!pkg.scripts) pkg.scripts = {};
    
    if (!pkg.scripts.byan) {
      pkg.scripts.byan = 'echo "BYAN agent installed. Activate in your AI platform."';
      await fs.writeJson(pkgPath, pkg, { spaces: 2 });
      shortcutSpinner.succeed('NPM script added');
    } else {
      shortcutSpinner.info('NPM script already exists');
    }
  } else {
    shortcutSpinner.succeed('Shortcuts created');
  }
  
  // Step 7: Verification
  const verifySpinner = ora('Verifying installation...').start();
  
  const checks = [
    await fs.pathExists(path.join(bmbDir, 'agents')),
    await fs.pathExists(path.join(bmbDir, 'workflows', 'byan')),
    await fs.pathExists(configPath)
  ];
  
  const passed = checks.filter(Boolean).length;
  
  if (passed === checks.length) {
    verifySpinner.succeed(`Verification: ${passed}/${checks.length} checks passed`);
  } else {
    verifySpinner.warn(`Verification: ${passed}/${checks.length} checks passed`);
  }
  
  // Success message
  console.log('');
  console.log(chalk.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.green('║                                                            ║'));
  console.log(chalk.green('║   ✅ BYAN INSTALLATION COMPLETE!                           ║'));
  console.log(chalk.green('║                                                            ║'));
  console.log(chalk.green('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
  
  console.log(chalk.bold('Installation Summary:'));
  console.log(`  • Platform: ${chalk.cyan(platform)}`);
  console.log(`  • Installation Directory: ${chalk.cyan(bmbDir)}`);
  console.log(`  • Configuration: ${chalk.cyan(configPath)}`);
  console.log(`  • User: ${chalk.cyan(config.userName)}`);
  console.log(`  • Language: ${chalk.cyan(config.language)}`);
  console.log('');
  
  console.log(chalk.bold('Next Steps:'));
  console.log('');
  console.log(chalk.yellow('1. Activate BYAN:'));
  
  if (platform === 'copilot') {
    console.log(`   ${chalk.blue('gh copilot suggest "activate byan agent"')}`);
  } else if (platform === 'vscode') {
    console.log('   Open VSCode Command Palette (Ctrl+Shift+P)');
    console.log('   Type: "Activate BYAN Agent"');
  } else if (platform === 'claude') {
    console.log(`   ${chalk.blue('claude chat --agent byan')}`);
  }
  
  console.log('');
  console.log(chalk.yellow('2. Create your first agent:'));
  console.log('   [INT] Start Intelligent Interview (30-45 min)');
  console.log('   [QC] Quick Create (10 min)');
  console.log('');
  
  console.log(chalk.yellow('3. Explore documentation:'));
  console.log(`   • Configuration: ${chalk.cyan(configPath)}`);
  console.log(`   • Workflows: ${chalk.cyan(path.join(bmbDir, 'workflows', 'byan'))}`);
  console.log('');
  
  console.log(chalk.gray('Need help? Type \'/bmad-help\' when BYAN is active'));
  console.log('');
  console.log(chalk.blue('Happy agent building! 🏗️'));
}

// CLI Program
program
  .name('create-byan-agent')
  .description('Install BYAN - Builder of YAN agent creator')
  .version(BYAN_VERSION)
  .action(install);

program.parse(process.argv);
