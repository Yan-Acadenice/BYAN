#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');

const BYAN_VERSION = '2.0.0-alpha.1';

// ASCII Art Banner
const banner = `
${chalk.blue('╔════════════════════════════════════════════════════════════╗')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.bold('🏗️  BYAN INSTALLER v' + BYAN_VERSION)}                   ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Builder of YAN - Agent Creator')}                          ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Architecture: 4 Pilliers + v2.0 Runtime')}              ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Methodology: Merise Agile + TDD + 64 Mantras')}           ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('╚════════════════════════════════════════════════════════════╝')}
`;

// Source template directory
const getTemplateDir = () => {
  const npmPackagePath = path.join(__dirname, '..', 'templates');
  if (fs.existsSync(npmPackagePath)) {
    console.log(chalk.gray(`[DEBUG] Template dir found: ${npmPackagePath}`));
    return npmPackagePath;
  }
  
  const devPath = path.join(__dirname, '..', '..');
  if (fs.existsSync(devPath)) {
    console.log(chalk.gray(`[DEBUG] Dev template dir found: ${devPath}`));
    return devPath;
  }
  
  console.error(chalk.red('⚠️  WARNING: Template directory not found!'));
  console.error(chalk.red(`   Searched: ${npmPackagePath}`));
  console.error(chalk.red(`   Also searched: ${devPath}`));
  return null;
};

// Detect if v2.0 structure exists in template
async function detectV2Structure(templateDir) {
  const srcPath = path.join(templateDir, 'src');
  const testsPath = path.join(templateDir, '__tests__');
  const indexPath = path.join(templateDir, 'src', 'index.js');
  
  const hasSrc = await fs.pathExists(srcPath);
  const hasTests = await fs.pathExists(testsPath);
  const hasIndex = await fs.pathExists(indexPath);
  
  return {
    isV2Available: hasSrc && hasTests && hasIndex,
    hasSrc,
    hasTests,
    hasIndex
  };
}

// Copy v2.0 runtime structure
async function copyV2Runtime(templateDir, projectRoot, spinner) {
  const v2Files = [
    { src: 'src', dest: 'src', desc: 'v2.0 Core Components' },
    { src: '__tests__', dest: '__tests__', desc: 'v2.0 Tests' }
  ];
  
  let copiedCount = 0;
  
  for (const file of v2Files) {
    const sourcePath = path.join(templateDir, file.src);
    const destPath = path.join(projectRoot, file.dest);
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, destPath, { overwrite: false });
      spinner.text = `Installing ${file.desc}...`;
      console.log(chalk.green(`  ✓ ${file.desc}: ${file.src} → ${file.dest}`));
      copiedCount++;
    } else {
      console.log(chalk.yellow(`  ⚠ Skipping ${file.desc} (not found in template)`));
    }
  }
  
  return copiedCount;
}

// Merge package.json with v2.0 dependencies
async function mergePackageJson(templateDir, projectRoot, spinner) {
  const templatePkgPath = path.join(templateDir, 'package.json');
  const projectPkgPath = path.join(projectRoot, 'package.json');
  
  if (!(await fs.pathExists(templatePkgPath))) {
    spinner.warn('Template package.json not found, skipping dependency merge');
    return false;
  }
  
  const templatePkg = await fs.readJson(templatePkgPath);
  
  if (await fs.pathExists(projectPkgPath)) {
    const projectPkg = await fs.readJson(projectPkgPath);
    
    // Merge devDependencies (Jest)
    if (templatePkg.devDependencies) {
      projectPkg.devDependencies = projectPkg.devDependencies || {};
      Object.assign(projectPkg.devDependencies, templatePkg.devDependencies);
    }
    
    // Add Jest config if not present
    if (templatePkg.jest && !projectPkg.jest) {
      projectPkg.jest = templatePkg.jest;
    }
    
    // Add main entry point
    if (templatePkg.main && !projectPkg.main) {
      projectPkg.main = templatePkg.main;
    }
    
    // Add test scripts
    projectPkg.scripts = projectPkg.scripts || {};
    if (templatePkg.scripts) {
      if (templatePkg.scripts.test && !projectPkg.scripts.test) {
        projectPkg.scripts.test = templatePkg.scripts.test;
      }
      if (templatePkg.scripts['test:coverage'] && !projectPkg.scripts['test:coverage']) {
        projectPkg.scripts['test:coverage'] = templatePkg.scripts['test:coverage'];
      }
      if (templatePkg.scripts['test:watch'] && !projectPkg.scripts['test:watch']) {
        projectPkg.scripts['test:watch'] = templatePkg.scripts['test:watch'];
      }
    }
    
    await fs.writeJson(projectPkgPath, projectPkg, { spaces: 2 });
    spinner.text = 'Updated package.json with v2.0 dependencies';
    console.log(chalk.green('  ✓ package.json merged with v2.0 config'));
    return true;
  } else {
    // Create new package.json based on template
    const newPkg = {
      name: path.basename(projectRoot),
      version: '1.0.0',
      description: 'BYAN v2.0 enabled project',
      main: templatePkg.main,
      scripts: templatePkg.scripts,
      devDependencies: templatePkg.devDependencies,
      jest: templatePkg.jest
    };
    
    await fs.writeJson(projectPkgPath, newPkg, { spaces: 2 });
    spinner.text = 'Created package.json with v2.0 config';
    console.log(chalk.green('  ✓ package.json created'));
    return true;
  }
}

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
  
  // Step 2: Detect v2.0 structure availability
  const detectSpinner = ora('Detecting BYAN version...').start();
  const templateDir = getTemplateDir();
  
  if (!templateDir) {
    detectSpinner.fail('Template directory not found! Cannot proceed.');
    console.error(chalk.red('\nInstallation failed: Missing template files.'));
    console.error(chalk.yellow('This usually means the package was not installed correctly.'));
    process.exit(1);
  }
  
  const v2Detection = await detectV2Structure(templateDir);
  
  if (v2Detection.isV2Available) {
    detectSpinner.succeed('BYAN v2.0 detected (Runtime + Platform)');
    console.log(chalk.cyan('  ℹ Architecture 4 Pilliers + v2.0 Core Components'));
  } else {
    detectSpinner.succeed('BYAN v1.0 detected (Platform only)');
  }
  
  // Step 3: Platform selection
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
  
  // Step 4: User configuration
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
  
  // Step 5: Install v2.0 structure (if available)
  let v2Installed = false;
  
  if (v2Detection.isV2Available) {
    const { installV2 } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'installV2',
        message: 'Install BYAN v2.0 runtime components (src/, tests)?',
        default: true
      }
    ]);
    
    if (installV2) {
      const v2Spinner = ora('Installing v2.0 runtime...').start();
      
      try {
        const copiedCount = await copyV2Runtime(templateDir, projectRoot, v2Spinner);
        await mergePackageJson(templateDir, projectRoot, v2Spinner);
        
        v2Spinner.succeed(`v2.0 runtime installed (${copiedCount} components)`);
        v2Installed = true;
      } catch (error) {
        v2Spinner.fail('Error installing v2.0 runtime');
        console.error(chalk.red('Details:'), error.message);
        v2Installed = false;
      }
    }
  }
  
  // Step 5.5: Turbo Whisper voice dictation (optional)
  console.log(chalk.blue('\n🎤 Voice Dictation Setup'));
  console.log(chalk.gray('Turbo Whisper enables voice-to-text with local Whisper AI server.\n'));
  
  const { turboWhisperMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'turboWhisperMode',
      message: 'Install Turbo Whisper voice dictation?',
      choices: [
        { name: '🖥️  Local (CPU) - Run Whisper server locally', value: 'local' },
        { name: '🚀 Docker (GPU) - Run Whisper in Docker with GPU', value: 'docker' },
        { name: '⏭️  Skip - Install later manually', value: 'skip' }
      ],
      default: 'skip'
    }
  ]);
  
  let turboWhisperInstalled = false;
  
  if (turboWhisperMode !== 'skip') {
    try {
      const TurboWhisperInstaller = require(path.join(__dirname, '..', 'setup-turbo-whisper.js'));
      const turboInstaller = new TurboWhisperInstaller(projectRoot, turboWhisperMode);
      const result = await turboInstaller.install();
      turboWhisperInstalled = result.success;
    } catch (error) {
      console.error(chalk.red('Turbo Whisper installation failed:'), error.message);
      console.log(chalk.yellow('You can install it later with: node install/setup-turbo-whisper.js'));
      turboWhisperInstalled = false;
    }
  }
  
  // Step 6: Create directory structure (Platform - _bmad)
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
  
  // Step 7: Copy BYAN platform files from template
  const copySpinner = ora('Installing BYAN platform files...').start();
  
  try {
    // Copy agent files
    const agentsSource = path.join(templateDir, '_bmad', 'bmb', 'agents');
    const agentsDest = path.join(bmbDir, 'agents');
    
    if (await fs.pathExists(agentsSource)) {
      await fs.copy(agentsSource, agentsDest, { overwrite: true });
      copySpinner.text = 'Copied agent files...';
      console.log(chalk.green(`  ✓ Agents: ${agentsSource} → ${agentsDest}`));
    } else {
      copySpinner.warn(`⚠ Agent source not found: ${agentsSource}`);
    }
    
    // Copy workflow files
    const workflowsSource = path.join(templateDir, '_bmad', 'bmb', 'workflows', 'byan');
    const workflowsDest = path.join(bmbDir, 'workflows', 'byan');
    
    if (await fs.pathExists(workflowsSource)) {
      await fs.copy(workflowsSource, workflowsDest, { overwrite: true });
      copySpinner.text = 'Copied workflow files...';
      console.log(chalk.green(`  ✓ Workflows: ${workflowsSource} → ${workflowsDest}`));
    } else {
      copySpinner.warn(`⚠ Workflow source not found: ${workflowsSource}`);
    }
    
    // Copy .github/agents files
    const githubAgentsSource = path.join(templateDir, '.github', 'agents');
    
    if (await fs.pathExists(githubAgentsSource)) {
      await fs.copy(githubAgentsSource, githubAgentsDir, { overwrite: true });
      copySpinner.text = 'Copied Copilot CLI agent stubs...';
      console.log(chalk.green(`  ✓ GitHub agents: ${githubAgentsSource} → ${githubAgentsDir}`));
    } else {
      copySpinner.warn(`⚠ GitHub agents source not found: ${githubAgentsSource}`);
    }
    
    copySpinner.succeed('BYAN platform files installed');
  } catch (error) {
    copySpinner.fail('Error copying files');
    console.error(chalk.red('Details:'), error.message);
    console.error(chalk.red('Stack:'), error.stack);
  }
  
  // Step 8: Create config.yaml
  const configSpinner = ora('Generating configuration...').start();
  
  const configContent = {
    bmb_creations_output_folder: "{project-root}/_bmad-output/bmb-creations",
    user_name: config.userName,
    communication_language: config.language,
    document_output_language: config.language,
    output_folder: "{project-root}/_bmad-output",
    platform: platform,
    byan_version: v2Installed ? '2.0.0-alpha.1' : '1.0.0'
  };
  
  const configPath = path.join(bmbDir, 'config.yaml');
  await fs.writeFile(configPath, yaml.dump(configContent), 'utf8');
  
  configSpinner.succeed('Configuration generated');
  
  // Step 9: Create package.json script
  const shortcutSpinner = ora('Creating shortcuts...').start();
  
  if (hasPackageJson || v2Installed) {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    
    if (!pkg.scripts) pkg.scripts = {};
    
    if (!pkg.scripts.byan) {
      pkg.scripts.byan = 'echo "BYAN agent installed. Use: copilot and type /agent"';
    }
    
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    shortcutSpinner.succeed('NPM script added');
  } else {
    shortcutSpinner.succeed('Shortcuts created');
  }
  
  // Step 10: Verification
  const verifySpinner = ora('Verifying installation...').start();
  
  const checks = [
    { name: 'Agents directory', path: path.join(bmbDir, 'agents') },
    { name: 'BYAN agent', path: path.join(bmbDir, 'agents', 'byan.md') },
    { name: 'Workflows', path: path.join(bmbDir, 'workflows', 'byan') },
    { name: 'Config', path: configPath },
    { name: 'GitHub agents dir', path: githubAgentsDir }
  ];
  
  // Add v2.0 checks if installed
  if (v2Installed) {
    checks.push(
      { name: 'v2.0 src/', path: path.join(projectRoot, 'src') },
      { name: 'v2.0 tests', path: path.join(projectRoot, '__tests__') },
      { name: 'v2.0 entry point', path: path.join(projectRoot, 'src', 'index.js') },
      { name: 'package.json', path: path.join(projectRoot, 'package.json') }
    );
  }
  
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
  console.log(`  • Version: ${chalk.cyan(v2Installed ? 'v2.0.0-alpha.1 (Runtime + Platform)' : 'v1.0.0 (Platform only)')}`);
  console.log(`  • Installation Directory: ${chalk.cyan(bmbDir)}`);
  console.log(`  • Configuration: ${chalk.cyan(configPath)}`);
  console.log(`  • User: ${chalk.cyan(config.userName)}`);
  console.log(`  • Language: ${chalk.cyan(config.language)}`);
  console.log(`  • Turbo Whisper: ${chalk.cyan(turboWhisperInstalled ? `Installed (${turboWhisperMode} mode)` : 'Not installed')}`);
  
  if (v2Installed) {
    console.log(chalk.cyan('\n  v2.0 Components Installed:'));
    console.log(chalk.cyan('  ✓ Core: Context, Cache, Dispatcher, Worker Pool, Workflow'));
    console.log(chalk.cyan('  ✓ Observability: Logger, Metrics, Dashboard'));
    console.log(chalk.cyan('  ✓ Tests: 9 test suites with 364 tests'));
    console.log(chalk.cyan('  ✓ Entry Point: src/index.js'));
  }
  
  console.log('');
  
  console.log(chalk.bold('Next Steps:'));
  console.log('');
  
  if (v2Installed) {
    console.log(chalk.yellow('1. Install dependencies:'));
    console.log(`   ${chalk.blue('npm install')}`);
    console.log('');
    
    console.log(chalk.yellow('2. Run tests:'));
    console.log(`   ${chalk.blue('npm test')}`);
    console.log('');
    
    console.log(chalk.yellow('3. Test entry point:'));
    console.log(`   ${chalk.blue('node -e "const byan = require(\'./src/index.js\'); console.log(byan.createByanInstance)"')}`);
    console.log('');
    
    console.log(chalk.yellow('4. Activate BYAN agent:'));
  } else {
    console.log(chalk.yellow('1. Activate BYAN agent:'));
  }
  
  if (platform === 'copilot') {
    console.log(`   ${chalk.blue('copilot')}`);
    console.log(`   Then type: ${chalk.blue('/agent')}`);
    console.log(`   Select: ${chalk.cyan('byan')} (create agents)`);
  } else if (platform === 'vscode') {
    console.log('   Open VSCode Command Palette (Ctrl+Shift+P)');
    console.log('   Type: \'Activate BYAN Agent\'');
  } else if (platform === 'claude') {
    console.log(`   ${chalk.blue('claude chat --agent byan')}`);
  } else {
    console.log('   Follow your platform\'s agent activation procedure');
  }
  
  // Turbo Whisper instructions
  if (turboWhisperInstalled) {
    console.log('');
    console.log(chalk.yellow('🎤 Turbo Whisper Voice Dictation:'));
    console.log('');
    
    if (turboWhisperMode === 'local') {
      console.log(chalk.gray('  Start Whisper server:'));
      console.log(`   ${chalk.blue('./scripts/start-whisper-server.sh')}`);
      console.log('');
    } else if (turboWhisperMode === 'docker') {
      console.log(chalk.gray('  Start Docker container:'));
      console.log(`   ${chalk.blue('docker-compose -f docker-compose.turbo-whisper.yml up -d')}`);
      console.log('');
    }
    
    console.log(chalk.gray('  Launch voice dictation:'));
    console.log(`   ${chalk.blue('./scripts/launch-turbo-whisper.sh')}`);
    console.log('');
    console.log(chalk.gray('  Hotkey: Ctrl+Alt+R (start/stop recording)'));
    console.log(chalk.gray('  See: TURBO-WHISPER-SETUP.md for details'));
  }
  
  console.log('');
  console.log(chalk.gray('Need help? Type \'/bmad-help\' when BYAN is active'));
  console.log('');
  console.log(chalk.blue('Happy agent building! 🏗️'));
}

// CLI Program
program
  .name('create-byan-agent')
  .description('Install BYAN v2.0 - Builder of YAN agent creator with v2.0 runtime support')
  .version(BYAN_VERSION)
  .action(install);

program.parse(process.argv);
