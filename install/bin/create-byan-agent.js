#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');

const BYAN_VERSION = '1.1.2';

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

// Source template directory (where BYAN package files are)
const getTemplateDir = () => {
  // Check if running from npm package
  const nodeModulesPath = path.join(__dirname, '..', '..', 'create-byan-agent', 'templates');
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }
  
  // Check if running from local installation
  const localPath = path.join(__dirname, '..', 'templates');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  
  // Fallback: assume we're in development
  return path.join(__dirname, '..', '_bmad');
};

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
  const githubAgentsDir = path.join(projectRoot, '.github', 'agents');
  
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'agents'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'steps'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'templates'));
  await fs.ensureDir(path.join(bmadDir, 'bmb', 'workflows', 'byan', 'data'));
  await fs.ensureDir(path.join(bmadDir, 'core'));
  await fs.ensureDir(path.join(bmadDir, '_config'));
  await fs.ensureDir(path.join(bmadDir, '_memory'));
  await fs.ensureDir(path.join(bmadDir, '_output'));
  await fs.ensureDir(githubAgentsDir);
  
  installSpinner.succeed('Directory structure created');
  
  // Step 5: Copy BYAN files from template
  const copySpinner = ora('Installing BYAN files...').start();
  
  const templateDir = getTemplateDir();
  
  try {
    // Copy agent files
    const agentsSource = path.join(templateDir, 'bmb', 'agents');
    const agentsDest = path.join(bmbDir, 'agents');
    
    if (await fs.pathExists(agentsSource)) {
      await fs.copy(agentsSource, agentsDest, { overwrite: true });
      copySpinner.text = 'Copied agent files...';
    } else {
      copySpinner.warn(`Agent source not found: ${agentsSource}`);
    }
    
    // Copy workflow files
    const workflowsSource = path.join(templateDir, 'bmb', 'workflows', 'byan');
    const workflowsDest = path.join(bmbDir, 'workflows', 'byan');
    
    if (await fs.pathExists(workflowsSource)) {
      await fs.copy(workflowsSource, workflowsDest, { overwrite: true });
      copySpinner.text = 'Copied workflow files...';
    } else {
      copySpinner.warn(`Workflow source not found: ${workflowsSource}`);
    }
    
    // Copy .github/agents files for Copilot CLI detection
    const githubAgentsSource = path.join(templateDir, '..', '.github', 'agents');
    
    if (await fs.pathExists(githubAgentsSource)) {
      await fs.copy(githubAgentsSource, githubAgentsDir, { overwrite: true });
      copySpinner.text = 'Copied Copilot CLI agent stubs...';
    } else {
      copySpinner.warn(`GitHub agents source not found: ${githubAgentsSource}`);
    }
    
    copySpinner.succeed('BYAN files installed');
  } catch (error) {
    copySpinner.fail('Error copying files');
    console.error(chalk.red('Details:'), error.message);
  }
  
  // Step 6: Create config.yaml
  const configSpinner = ora('Generating configuration...').start();
  
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
  
  configSpinner.succeed('Configuration generated');
  
  // Step 7: Create package.json script
  const shortcutSpinner = ora('Creating shortcuts...').start();
  
  if (hasPackageJson) {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    
    if (!pkg.scripts) pkg.scripts = {};
    
    if (!pkg.scripts.byan) {
      pkg.scripts.byan = 'echo "BYAN agent installed. Use: copilot and type /agent"';
      await fs.writeJson(pkgPath, pkg, { spaces: 2 });
      shortcutSpinner.succeed('NPM script added');
    } else {
      shortcutSpinner.info('NPM script already exists');
    }
  } else {
    shortcutSpinner.succeed('Shortcuts created');
  }
  
  // Step 8: Verification
  const verifySpinner = ora('Verifying installation...').start();
  
  const checks = [
    { name: 'Agents directory', path: path.join(bmbDir, 'agents') },
    { name: 'BYAN agent', path: path.join(bmbDir, 'agents', 'byan.md') },
    { name: 'RACHID agent', path: path.join(bmbDir, 'agents', 'rachid.md') },
    { name: 'MARC agent', path: path.join(bmbDir, 'agents', 'marc.md') },
    { name: 'Workflows', path: path.join(bmbDir, 'workflows', 'byan') },
    { name: 'Config', path: configPath },
    { name: 'GitHub agents dir', path: githubAgentsDir },
    { name: 'BYAN stub', path: path.join(githubAgentsDir, 'bmad-agent-byan.md') },
    { name: 'RACHID stub', path: path.join(githubAgentsDir, 'bmad-agent-rachid.md') },
    { name: 'MARC stub', path: path.join(githubAgentsDir, 'bmad-agent-marc.md') }
  ];
  
  let passed = 0;
  let failed = [];
  
  for (const check of checks) {
    if (await fs.pathExists(check.path)) {
      passed++;
    } else {
      failed.push(check.name);
    }
  }
  
  if (passed === checks.length) {
    verifySpinner.succeed(`Verification: ${passed}/${checks.length} checks passed ✅`);
  } else {
    verifySpinner.warn(`Verification: ${passed}/${checks.length} checks passed`);
    if (failed.length > 0) {
      console.log(chalk.yellow('  Missing:'), failed.join(', '));
    }
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
  console.log(`  • Agents Installed: ${chalk.cyan('BYAN, RACHID, MARC')}`);
  console.log('');
  
  console.log(chalk.bold('Next Steps:'));
  console.log('');
  console.log(chalk.yellow('1. Activate agents in GitHub Copilot CLI:'));
  console.log(`   ${chalk.blue('copilot')}`);
  console.log(`   Then type: ${chalk.blue('/agent')}`);
  console.log(`   Select: ${chalk.cyan('byan')} (create agents)`);
  console.log(`          ${chalk.cyan('rachid')} (NPM deployment)`);
  console.log(`          ${chalk.cyan('marc')} (Copilot CLI integration)`);
  console.log('');
  
  console.log(chalk.yellow('2. Create your first agent with BYAN:'));
  console.log('   [INT] Start Intelligent Interview (30-45 min)');
  console.log('   [QC] Quick Create (10 min)');
  console.log('');
  
  console.log(chalk.yellow('3. Deploy with RACHID:'));
  console.log('   Use RACHID to publish BYAN to npm');
  console.log('   Validate package.json and dependencies');
  console.log('');
  
  console.log(chalk.yellow('4. Integrate with MARC:'));
  console.log('   Use MARC to test /agent detection');
  console.log('   Validate .github/agents/ structure');
  console.log('');
  
  console.log(chalk.gray('Need help? Type \'/bmad-help\' when BYAN is active'));
  console.log('');
  console.log(chalk.blue('Happy agent building! 🏗️'));
}

// CLI Program
program
  .name('create-byan-agent')
  .description('Install BYAN - Builder of YAN agent creator with RACHID and MARC')
  .version(BYAN_VERSION)
  .action(install);

program.parse(process.argv);
