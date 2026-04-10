#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');

// Phase 2 modules
const { getDomainQuestions, buildPhase2Prompt } = require('../lib/domain-questions');
const { generateProjectAgentsDoc } = require('../lib/project-agents-generator');
const { launchPhase2Chat, generateDefaultConfig } = require('../lib/phase2-chat');

const BYAN_VERSION = require('../package.json').version;

// ASCII Art Banner
const banner = `
${chalk.blue('╔════════════════════════════════════════════════════════════╗')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.bold('🏗️  BYAN INSTALLER v' + BYAN_VERSION)}                          ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Builder of YAN - Agent Creator')}                          ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Architecture: _byan/ + Model Selector')}                ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Methodology: Merise Agile + TDD + 64 Mantras')}           ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Intelligence: Auto GPU Detection + Multi-Platform')}       ${chalk.blue('║')}
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

// Detect installed platforms (Yanstaller logic)
// Detects SYSTEM binaries, not project folders (.codex, .github/agents are created by yanstaller)
async function detectPlatforms() {
  const platforms = {
    copilot: false,
    codex: false,
    claude: false
  };
  
  // GitHub Copilot CLI detection (binary + config)
  try {
    const result = execSync('which copilot 2>/dev/null', { encoding: 'utf8' }).trim();
    if (result) {
      platforms.copilot = true;
    }
  } catch (e) {
    // Fallback: check config directory (means it was installed)
    const copilotPaths = [
      path.join(os.homedir(), '.config', 'github-copilot'),
      path.join(os.homedir(), '.config', 'copilot')
    ];
    for (const p of copilotPaths) {
      if (fs.existsSync(p)) {
        platforms.copilot = true;
        break;
      }
    }
  }
  
  // Codex detection (binary + config, NOT project .codex/ folder)
  try {
    const result = execSync('which codex 2>/dev/null', { encoding: 'utf8' }).trim();
    if (result) {
      platforms.codex = true;
    }
  } catch (e) {
    // Fallback: check config directory
    const codexPaths = [
      path.join(os.homedir(), '.config', 'codex'),
      path.join(os.homedir(), '.codex')
    ];
    for (const p of codexPaths) {
      if (fs.existsSync(p)) {
        platforms.codex = true;
        break;
      }
    }
  }
  
  // Claude Code detection (binary + config)
  try {
    const result = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim();
    if (result) {
      platforms.claude = true;
    }
  } catch (e) {
    // Fallback: check config directory
    const claudePaths = [
      path.join(os.homedir(), '.config', 'claude'),
      path.join(os.homedir(), '.claude')
    ];
    for (const p of claudePaths) {
      if (fs.existsSync(p)) {
        platforms.claude = true;
        break;
      }
    }
  }
  
  return platforms;
}

// Calculate installation complexity (Model Selector)
function calculateInstallComplexity() {
  const weights = {
    task_type: { install: 10 },
    context_size: { small: 5 },
    reasoning_depth: { shallow: 0 },
    quality_requirement: { fast: 0 }
  };
  
  const score = weights.task_type.install + 
                weights.context_size.small + 
                weights.reasoning_depth.shallow + 
                weights.quality_requirement.fast;
  
  return { score, recommended: score <= 30 ? 'gpt-5-mini (FREE)' : 'claude-haiku-4.5' };
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
  
  // Step 2.5: Auto-detect installed platforms (Yanstaller logic)
  console.log('');
  const platformSpinner = ora('Detecting installed AI platforms...').start();
  const detectedPlatforms = await detectPlatforms();
  platformSpinner.succeed('Platform detection complete');
  
  console.log(chalk.cyan('\n📦 Installed Platforms:'));
  console.log(`  GitHub Copilot CLI: ${detectedPlatforms.copilot ? chalk.green('✓ Detected') : chalk.gray('✗ Not found')}`);
  console.log(`  OpenAI Codex:       ${detectedPlatforms.codex ? chalk.green('✓ Detected') : chalk.gray('✗ Not found')}`);
  console.log(`  Claude Code:        ${detectedPlatforms.claude ? chalk.green('✓ Detected') : chalk.gray('✗ Not found')}`);
  console.log('');
  
  // Calculate recommended model for installation
  const complexity = calculateInstallComplexity();
  console.log(chalk.cyan('🧠 Model Selector (Complexity Analysis):'));
  console.log(`  Installation Score: ${chalk.yellow(complexity.score)} (simple task)`);
  console.log(`  Recommended Model:  ${chalk.green(complexity.recommended)}`);
  console.log(chalk.gray('  → Optimized for cost efficiency during installation'));
  console.log('');
  
  // Step 2.8: Installation mode selection
  const { installMode: initialInstallMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'installMode',
      message: 'Choose installation mode:',
      choices: [
        { name: '🚀 AUTO - Quick install with smart defaults (Recommended)', value: 'auto' },
        { name: '🎯 CUSTOM - Guided interview with personalized recommendations', value: 'custom' },
        { name: '📋 MANUAL - Choose agents individually from the full catalog', value: 'manual' }
      ],
      default: 'auto'
    }
  ]);

  let installMode = initialInstallMode;

  let interviewResults = null;
  let interviewAnswers = null;
  let manualSelection = null;

  // Step 2.9a: MANUAL mode - Full agent catalog selection by platform
  if (installMode === 'manual') {
    console.log('');
    console.log(chalk.blue('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue('║                                                            ║'));
    console.log(chalk.blue('║   📋 MANUAL MODE - Agent Catalog Selection                 ║'));
    console.log(chalk.blue('║   Choose your agents from the full BYAN catalog             ║'));
    console.log(chalk.blue('║                                                            ║'));
    console.log(chalk.blue('╚════════════════════════════════════════════════════════════╝'));
    console.log('');

    // Step 1: Select target platform(s)
    const availableManualPlatforms = [];
    if (detectedPlatforms.copilot) availableManualPlatforms.push({ name: '🤖 GitHub Copilot CLI (agents: .github/agents/)', value: 'copilot' });
    if (detectedPlatforms.codex) availableManualPlatforms.push({ name: '🔷 OpenAI Codex (skills: .codex/prompts/)', value: 'codex' });
    if (detectedPlatforms.claude) availableManualPlatforms.push({ name: '🧠 Claude Code (rules: .claude/)', value: 'claude' });

    // Always allow manual selection even if not detected
    if (!detectedPlatforms.copilot) availableManualPlatforms.push({ name: '🤖 GitHub Copilot CLI (not detected)', value: 'copilot' });
    if (!detectedPlatforms.codex) availableManualPlatforms.push({ name: '🔷 OpenAI Codex (not detected)', value: 'codex' });
    if (!detectedPlatforms.claude) availableManualPlatforms.push({ name: '🧠 Claude Code (not detected)', value: 'claude' });

    const { manualPlatforms } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'manualPlatforms',
      message: 'Select target platform(s):',
      choices: availableManualPlatforms,
      validate: (a) => a.length > 0 ? true : 'Select at least one platform'
    }]);

    // Step 2: Show agent catalog grouped by category (module + role)
    console.log('');
    console.log(chalk.cyan('📦 Agent Catalog'));
    console.log(chalk.gray('  Hermes (dispatcher) is always installed - it routes tasks to the right agent.'));
    console.log(chalk.gray('  Agents are organized by role: Workflow, Context, and Worker.'));
    console.log('');

    // Agent catalog with categories and roles
    const AGENT_CATALOG = {
      'Core - Dispatcher (always installed)': [
        { name: 'hermes', label: 'Hermes - Universal Dispatcher (routes all tasks)', checked: true, disabled: 'required' }
      ],
      'Core - Platform Specialists': (() => {
        const specialists = [];
        if (manualPlatforms.includes('copilot')) specialists.push({ name: 'marc', label: 'Marc - GitHub Copilot CLI Specialist [workflow agent]', checked: true });
        if (manualPlatforms.includes('claude')) specialists.push({ name: 'claude', label: 'Claude - Claude Code Integration Specialist [workflow agent]', checked: true });
        if (manualPlatforms.includes('codex')) specialists.push({ name: 'codex', label: 'Codex - OpenCode/Codex Integration Specialist [workflow agent]', checked: true });
        return specialists;
      })(),
      'Core - System Agents': [
        { name: 'bmad-master', label: 'BMad Master - Platform Orchestrator [context agent]', checked: false },
        { name: 'expert-merise-agile', label: 'Expert Merise Agile - Conception & Modeling [context agent]', checked: false }
      ],
      'BMB - Builder Agents (meta-system)': [
        { name: 'byan', label: 'BYAN - Agent Creator (intelligent interview) [workflow agent]', checked: false },
        { name: 'agent-builder', label: 'Bond - Agent Architecture Specialist [worker]', checked: false },
        { name: 'module-builder', label: 'Morgan - Module Creation Master [worker]', checked: false },
        { name: 'workflow-builder', label: 'Wendy - Workflow Building Master [worker]', checked: false },
        { name: 'rachid', label: 'Rachid - NPM/NPX Deployment Expert [worker]', checked: false },
        { name: 'drawio', label: 'DrawIO - Technical Diagrams Expert [worker]', checked: false },
        { name: 'turbo-whisper-integration', label: 'Turbo Whisper - Voice Dictation Integration [worker]', checked: false }
      ],
      'BMM - Software Development Lifecycle': [
        { name: 'analyst', label: 'Mary - Business Analyst [workflow agent]', checked: false },
        { name: 'pm', label: 'John - Product Manager [workflow agent]', checked: false },
        { name: 'architect', label: 'Winston - System Architect [workflow agent]', checked: false },
        { name: 'dev', label: 'Amelia - Developer Agent [worker]', checked: false },
        { name: 'sm', label: 'Bob - Scrum Master [workflow agent]', checked: false },
        { name: 'quinn', label: 'Quinn - QA Engineer [worker]', checked: false },
        { name: 'ux-designer', label: 'Sally - UX Designer [context agent]', checked: false },
        { name: 'tech-writer', label: 'Paige - Technical Writer [worker]', checked: false },
        { name: 'quick-flow-solo-dev', label: 'Barry - Quick Flow Solo Dev [workflow agent]', checked: false }
      ],
      'TEA - Test Architecture': [
        { name: 'tea', label: 'Murat - Master Test Architect [workflow agent]', checked: false }
      ],
      'CIS - Creative Innovation & Strategy': [
        { name: 'brainstorming-coach', label: 'Carson - Brainstorming Coach [workflow agent]', checked: false },
        { name: 'creative-problem-solver', label: 'Dr. Quinn - Problem Solver [workflow agent]', checked: false },
        { name: 'design-thinking-coach', label: 'Maya - Design Thinking Coach [workflow agent]', checked: false },
        { name: 'innovation-strategist', label: 'Victor - Innovation Strategist [context agent]', checked: false },
        { name: 'presentation-master', label: 'Caravaggio - Presentation Expert [worker]', checked: false },
        { name: 'storyteller', label: 'Sophia - Master Storyteller [worker]', checked: false }
      ],
      'Utility Agents': [
        { name: 'patnote', label: 'Patnote - Update Manager & Conflict Resolution [worker]', checked: false },
        { name: 'carmack', label: 'Carmack - Token Optimizer [worker]', checked: false }
      ],
      'Custom Agents': [
        { name: 'jimmy', label: 'Jimmy - Technical Documentation Specialist (Runbooks, Infra, Deploy, Web — Outline Wiki) [worker]', checked: false },
        { name: 'mike', label: 'Mike - Project Manager Specialist (Projects, Tasks, Sprints, Milestones — Leantime) [worker]', checked: false }
      ]
    };

    // Build inquirer choices from catalog
    const agentChoices = [];
    for (const [category, agents] of Object.entries(AGENT_CATALOG)) {
      if (agents.length === 0) continue;
      agentChoices.push(new inquirer.Separator(`\n  --- ${category} ---`));
      for (const agent of agents) {
        agentChoices.push({
          name: `${agent.label}`,
          value: agent.name,
          checked: agent.checked,
          disabled: agent.disabled || false
        });
      }
    }

    const { selectedAgents } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedAgents',
      message: 'Select agents to install (space to toggle, enter to confirm):',
      choices: agentChoices,
      pageSize: 30,
      validate: (a) => a.length > 0 ? true : 'Select at least one agent'
    }]);

    // Ensure hermes is always included
    const finalAgents = [...new Set(['hermes', ...selectedAgents])];

    manualSelection = {
      platforms: manualPlatforms,
      agents: finalAgents
    };

    console.log('');
    console.log(chalk.cyan('📋 Manual Selection Summary:'));
    console.log(chalk.green(`  Platforms: ${manualPlatforms.join(', ')}`));
    console.log(chalk.green(`  Agents (${finalAgents.length}): ${finalAgents.join(', ')}`));
    console.log(chalk.gray(`  Roles: dispatcher=hermes, workflow/context/worker agents selected`));
    console.log('');
  }

  // Step 2.9b: Intelligent Interview (if CUSTOM mode) - Delegate to Yanstaller Agent
  if (installMode === 'custom') {
    console.log('');
    console.log(chalk.blue('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.blue('║                                                            ║'));
    console.log(chalk.blue('║   🎯 YANSTALLER - Intelligent Interview                    ║'));
    console.log(chalk.blue('║   Powered by bmad-agent-yanstaller                         ║'));
    console.log(chalk.blue('║                                                            ║'));
    console.log(chalk.blue('╚════════════════════════════════════════════════════════════╝'));
    console.log('');
    
    // Gather user context via inquirer FIRST (fast, local, no tokens)
    interviewAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectType',
        message: '1. Type de projet?',
        choices: [
          { name: 'Nouveau (from scratch)', value: 'new' },
          { name: 'Existant (ajouter BYAN)', value: 'existing' },
          { name: 'Migration (autre système)', value: 'migration' }
        ]
      },
      {
        type: 'checkbox',
        name: 'objectives',
        message: '2. Objectifs? (espace pour sélectionner)',
        choices: [
          { name: 'Créer des agents', value: 'agents', checked: true },
          { name: 'Orchestrer workflows', value: 'workflows' },
          { name: 'Automatiser tests', value: 'tests' },
          { name: 'Analyser/documenter', value: 'analysis' },
          { name: 'Voice dictation', value: 'voice' }
        ],
        validate: (a) => a.length > 0 ? true : 'Choisissez au moins un'
      },
      {
        type: 'list',
        name: 'teamSize',
        message: '3. Taille équipe?',
        choices: ['solo', 'small (2-5)', 'medium (6-15)', 'large (16+)']
      },
      {
        type: 'list',
        name: 'experience',
        message: '4. Expérience AI?',
        choices: ['beginner', 'intermediate', 'expert']
      },
      {
        type: 'list',
        name: 'connectivity',
        message: '5. Connectivité?',
        choices: ['online', 'offline', 'intermittent']
      },
      {
        type: 'list',
        name: 'gpu',
        message: '6. GPU dispo (Turbo Whisper)?',
        choices: ['yes (NVIDIA)', 'no (CPU)', 'unknown']
      },
      {
        type: 'list',
        name: 'methodology',
        message: '7. Méthodologie?',
        choices: ['merise-agile (BYAN native)', 'tdd', 'agile/scrum', 'hybrid']
      },
      {
        type: 'list',
        name: 'domain',
        message: '8. Domaine?',
        choices: ['web', 'backend/API', 'data/ML', 'mobile', 'devops', 'multi-domain']
      },
      {
        type: 'list',
        name: 'frequency',
        message: '9. Fréquence?',
        choices: ['daily', 'weekly', 'occasional']
      },
      {
        type: 'list',
        name: 'quality',
        message: '10. Niveau qualité?',
        choices: ['mvp (speed)', 'balanced', 'production', 'critical']
      },
      {
        type: 'confirm',
        name: 'costOptimizer',
        message: '11. Optimiser coûts LLM automatiquement? (Économise ~54%)',
        default: true
      }
    ]);
    
    // Build prompt for yanstaller agent with interview data + detected platforms
    const interviewPrompt = [
      `Analyse ce profil utilisateur et retourne UNIQUEMENT un JSON de recommandations.`,
      `DETECTED PLATFORMS: copilot=${detectedPlatforms.copilot}, codex=${detectedPlatforms.codex}, claude=${detectedPlatforms.claude}`,
      `PROJECT: type=${interviewAnswers.projectType}, domain=${interviewAnswers.domain}`,
      `OBJECTIVES: ${interviewAnswers.objectives.join(',')}`,
      `TEAM: ${interviewAnswers.teamSize}, EXPERIENCE: ${interviewAnswers.experience}`,
      `CONNECTIVITY: ${interviewAnswers.connectivity}, GPU: ${interviewAnswers.gpu}`,
      `METHODOLOGY: ${interviewAnswers.methodology}, FREQUENCY: ${interviewAnswers.frequency}`,
      `QUALITY: ${interviewAnswers.quality}`,
      `Retourne UNIQUEMENT un JSON valide avec: platforms (array), turboWhisper (mode/reason),`,
      `agents (essential/optional arrays), modules (array), recommended_model (string).`,
      `Format: {"platforms":[...],"turboWhisper":{"mode":"...","reason":"..."},`,
      `"agents":{"essential":[...],"optional":[...]},"modules":[...],"recommended_model":"...","complexity_score":N}`
    ].join(' ');
    
    // Calculate model for interview analysis based on complexity
    const interviewComplexity = interviewAnswers.quality === 'critical' ? 'claude-haiku-4.5' : 'gpt-5-mini';
    
    // Pre-copy interview-only agent stub for Copilot CLI (requires .github/agents/ in CWD)
    // This stub is self-contained - no external workflow references
    // Codex and Claude use direct prompt execution, no agent stub needed
    if (detectedPlatforms.copilot) {
      const earlyGithubDir = path.join(projectRoot, '.github', 'agents');
      const interviewAgentSource = path.join(templateDir, '.github', 'agents', 'bmad-agent-yanstaller-interview.md');
      if (await fs.pathExists(interviewAgentSource)) {
        await fs.ensureDir(earlyGithubDir);
        await fs.copy(interviewAgentSource, path.join(earlyGithubDir, 'bmad-agent-yanstaller-interview.md'), { overwrite: true });
      }
    }
    
    // Write prompt to temp file to avoid shell escaping issues
    const promptFile = path.join(projectRoot, '.yanstaller-prompt.tmp');
    await fs.writeFile(promptFile, interviewPrompt, 'utf8');
    
    // Cross-platform CLI execution using spawnSync (no shell = no escaping issues)
    const isWindows = process.platform === 'win32';
    const promptContent = await fs.readFile(promptFile, 'utf8');
    let hasAgent = false;
    
    if (detectedPlatforms.copilot || detectedPlatforms.codex || detectedPlatforms.claude) {
      hasAgent = true;
      const agentSpinner = ora(`Analysing with yanstaller agent (${interviewComplexity})...`).start();
      
      try {
        const spawnOpts = {
          encoding: 'utf8',
          cwd: projectRoot,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        };
        if (isWindows) spawnOpts.shell = true;
        
        let res;
        if (detectedPlatforms.copilot) {
          res = spawnSync('copilot', [
            '--agent=bmad-agent-yanstaller-interview',
            '-p', promptContent,
            '--model', interviewComplexity,
            '-s'
          ], spawnOpts);
        } else if (detectedPlatforms.codex) {
          res = spawnSync('codex', ['exec', promptContent], spawnOpts);
        } else if (detectedPlatforms.claude) {
          res = spawnSync('claude', ['-p', promptContent], spawnOpts);
        }
        
        if (res.error) throw res.error;
        const result = (res.stdout || '').toString();
        
        agentSpinner.succeed(`Analysis complete (model: ${interviewComplexity})`);
        
        // Parse JSON from agent response - extract last valid JSON block
        const lines = result.split('\n');
        let jsonStr = null;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.includes('"platforms"')) {
            try {
              JSON.parse(trimmed);
              jsonStr = trimmed;
            } catch (e) { /* not valid JSON, try next line */ }
          }
        }
        // Fallback: greedy regex match
        if (!jsonStr) {
          const jsonMatch = result.match(/\{[^{}]*"platforms"\s*:\s*\[[\s\S]*?\}[\s\S]*?\}/);
          if (jsonMatch) jsonStr = jsonMatch[0];
        }
        if (jsonStr) {
          try {
            interviewResults = JSON.parse(jsonStr);
            
            console.log('');
            console.log(chalk.cyan('📊 Yanstaller Recommendations:'));
            if (interviewResults.platforms) {
              console.log(chalk.green(`  Platforms: ${interviewResults.platforms.join(', ')}`));
            }
            if (interviewResults.turboWhisper) {
              console.log(chalk.green(`  Turbo Whisper: ${interviewResults.turboWhisper.mode} (${interviewResults.turboWhisper.reason})`));
            }
            if (interviewResults.agents) {
              console.log(chalk.green(`  Essential agents: ${interviewResults.agents.essential ? interviewResults.agents.essential.join(', ') : 'none'}`));
            }
            if (interviewResults.modules) {
              console.log(chalk.green(`  Modules: ${interviewResults.modules.join(', ')}`));
            }
            console.log(chalk.green(`  Model: ${interviewResults.recommended_model || interviewComplexity}`));
            console.log(chalk.green(`  Complexity: ${interviewResults.complexity_score || 'N/A'}`));
          } catch (parseErr) {
            console.log(chalk.yellow('  ⚠ JSON parse error, using detection defaults'));
            interviewResults = null;
          }
        } else {
          console.log(chalk.yellow('  ⚠ No JSON in agent response, using detection defaults'));
          interviewResults = null;
        }
      } catch (error) {
        agentSpinner.warn(`Agent unavailable, using interview data directly`);
        // Build recommendations locally from interview data
        interviewResults = {
          platforms: Object.entries(detectedPlatforms).filter(([,v]) => v).map(([k]) => k),
          turboWhisper: {
            mode: interviewAnswers.gpu.startsWith('yes') && (interviewAnswers.objectives.includes('voice') || interviewAnswers.frequency === 'daily') ? 'docker' : 
                  interviewAnswers.objectives.includes('voice') || interviewAnswers.frequency === 'daily' ? 'local' : 'skip',
            reason: interviewAnswers.objectives.includes('voice') ? 'Voice dictation selected' : 
                    interviewAnswers.frequency === 'daily' ? 'Daily usage - productivity boost' : 'Based on interview'
          },
          agents: {
            essential: ['byan', 'analyst'],
            optional: interviewAnswers.experience === 'expert' ? ['dev', 'pm', 'architect', 'sm'] : ['dev']
          },
          modules: ['bmm', 'bmb'],
          recommended_model: interviewComplexity,
          complexity_score: 15
        };
        
        console.log('');
        console.log(chalk.cyan('📊 Local Recommendations (from interview):'));
        console.log(chalk.green(`  Platforms: ${interviewResults.platforms.join(', ')}`));
        console.log(chalk.green(`  Turbo Whisper: ${interviewResults.turboWhisper.mode}`));
        console.log(chalk.green(`  Essential agents: ${interviewResults.agents.essential.join(', ')}`));
        console.log(chalk.green(`  Model: ${interviewResults.recommended_model}`));
      }
    } else if (!hasAgent) {
      // No AI platform detected - build from interview data
      interviewResults = {
        platforms: ['copilot'],
        turboWhisper: {
          mode: interviewAnswers.gpu.startsWith('yes') && (interviewAnswers.objectives.includes('voice') || interviewAnswers.frequency === 'daily') ? 'docker' :
                interviewAnswers.objectives.includes('voice') || interviewAnswers.frequency === 'daily' ? 'local' : 'skip',
          reason: 'No AI platform detected'
        },
        agents: { essential: ['byan'], optional: [] },
        modules: ['bmm', 'bmb'],
        recommended_model: 'gpt-5-mini',
        complexity_score: 15
      };
      
      console.log(chalk.yellow('⚠ No AI platform detected, using defaults'));
    }
    
    // Cleanup temp prompt file
    await fs.remove(path.join(projectRoot, '.yanstaller-prompt.tmp')).catch(() => {});
    
    console.log('');
  }
  
  // User configuration (needed for config.yaml) - Asked for ALL modes, BEFORE conditional blocks
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
      default: 'Francais'
    }
  ]);
  
  // Step 3: Platform selection (with interview recommendations if CUSTOM mode)
  let recommendedPlatforms = [];
  let recommendedTurboWhisper = 'skip';
  let autoSelectPlatform = null;
  
  if (installMode === 'custom' && interviewResults) {
    // Use agent/interview recommendations
    console.log(chalk.blue('🎯 Recommandations personnalisées:'));
    console.log('');
    
    // Platform recommendations (from agent JSON or detected platforms)
    const agentPlatforms = interviewResults.platforms || [];
    if (agentPlatforms.length > 0) {
      agentPlatforms.forEach(p => {
        recommendedPlatforms.push(p);
        console.log(chalk.green(`  ✓ ${p} - Recommandé par yanstaller`));
      });
    } else {
      if (detectedPlatforms.copilot) { recommendedPlatforms.push('copilot'); console.log(chalk.green('  ✓ GitHub Copilot CLI - Détecté')); }
      if (detectedPlatforms.codex) { recommendedPlatforms.push('codex'); console.log(chalk.green('  ✓ Codex - Détecté')); }
      if (detectedPlatforms.claude) { recommendedPlatforms.push('claude'); console.log(chalk.green('  ✓ Claude Code - Détecté')); }
    }
    
    // Turbo Whisper (from agent or interview data)
    if (interviewResults.turboWhisper) {
      recommendedTurboWhisper = interviewResults.turboWhisper.mode || 'skip';
      if (recommendedTurboWhisper !== 'skip') {
        console.log(chalk.cyan(`  🎤 Turbo Whisper (${recommendedTurboWhisper}) - ${interviewResults.turboWhisper.reason || 'Recommandé'}`));
      }
    }
    
    // Agents recommendation
    if (interviewResults.agents) {
      console.log(chalk.cyan(`  📦 Agents essentiels: ${(interviewResults.agents.essential || []).join(', ')}`));
      if (interviewResults.agents.optional && interviewResults.agents.optional.length > 0) {
        console.log(chalk.gray(`  📦 Agents optionnels: ${interviewResults.agents.optional.join(', ')}`));
      }
    }
    
    // Model recommendation
    if (interviewResults.recommended_model) {
      console.log(chalk.cyan(`  🧠 Model recommandé: ${interviewResults.recommended_model} (score: ${interviewResults.complexity_score || 'N/A'})`));
    }
    
    console.log('');
    
    // NEW: Select preferred AI platform for Phase 2 conversation
    let selectedPlatform = null;
    const availablePlatforms = [];
    
    if (detectedPlatforms.copilot) availablePlatforms.push({ name: '🤖 GitHub Copilot CLI', value: 'copilot' });
    if (detectedPlatforms.codex) availablePlatforms.push({ name: '🔷 OpenAI Codex', value: 'codex' });
    if (detectedPlatforms.claude) availablePlatforms.push({ name: '🧠 Claude Code (Anthropic)', value: 'claude' });
    
    if (availablePlatforms.length > 1) {
      const { platform } = await inquirer.prompt([{
        type: 'list',
        name: 'platform',
        message: 'Quelle plateforme IA utiliser pour Phase 2?',
        choices: availablePlatforms,
        default: 'copilot'
      }]);
      selectedPlatform = platform;
    } else if (availablePlatforms.length === 1) {
      selectedPlatform = availablePlatforms[0].value;
      console.log(chalk.cyan(`🤖 Plateforme détectée: ${availablePlatforms[0].name}`));
    } else {
      console.log(chalk.red('❌ Aucune plateforme IA détectée. Installation en mode AUTO.'));
      installMode = 'auto';
    }
    
    // Update recommended model based on selected platform
    if (selectedPlatform === 'claude' && interviewResults) {
      const oldModel = interviewResults.recommended_model || '';
      if (oldModel.includes('gpt')) {
        interviewResults.recommended_model = 'claude-haiku-4.5';
        console.log(chalk.cyan(`  🧠 Model adapté: claude-haiku-4.5 (plateforme: Claude)`));
      }
    }
    
    // Verify authentication for selected platform
    if (selectedPlatform && installMode === 'custom') {
      console.log('');
      console.log(chalk.gray('🔐 Vérification de l\'authentification...'));
      
      let isAuthenticated = false;
      
      while (!isAuthenticated) {
        try {
          let authCheckCmd, authCheckArgs, loginInstructions;
          const isWindows = process.platform === 'win32';
          const spawnOpts = { encoding: 'utf8', timeout: 15000, stdio: 'pipe' };
          if (isWindows) spawnOpts.shell = true;
          
          if (selectedPlatform === 'copilot') {
            // copilot --version to check if CLI is available
            authCheckCmd = 'copilot';
            authCheckArgs = ['--version'];
            loginInstructions = [
              `${chalk.cyan('copilot auth')}`
            ];
          } else if (selectedPlatform === 'codex') {
            // codex --version as basic check (no auth status command available)
            authCheckCmd = 'codex';
            authCheckArgs = ['--version'];
            loginInstructions = [
              `${chalk.cyan('codex login')}`
            ];
          } else if (selectedPlatform === 'claude') {
            // claude --version checks install; auth errors surface during -p calls
            // Use 'claude -p "test" --max-turns 1' for real auth check
            authCheckCmd = 'claude';
            authCheckArgs = ['-p', 'reply OK', '--max-turns', '1'];
            loginInstructions = [
              `${chalk.cyan('claude login')}`,
              `${chalk.gray('ou:')} ${chalk.cyan('export ANTHROPIC_API_KEY=sk-ant-...')}`,
              `${chalk.gray('ou dans Claude Code:')} ${chalk.cyan('/login')}`
            ];
          }
          
          const res = spawnSync(authCheckCmd, authCheckArgs, spawnOpts);
          
          if (res.error) throw res.error;
          if (res.status !== 0) {
            const stderr = (res.stderr || '').toString().trim();
            throw new Error(stderr || `${selectedPlatform} returned exit code ${res.status}`);
          }
          
          isAuthenticated = true;
          console.log(chalk.green(`✓ ${selectedPlatform} authentifié et disponible`));
          
        } catch (error) {
          console.log('');
          console.log(chalk.yellow(`⚠️  ${selectedPlatform} n'est pas authentifié ou non disponible`));
          console.log(chalk.gray(`   Erreur: ${(error.message || '').substring(0, 120)}`));
          console.log('');
          console.log(chalk.bold('   Pour vous connecter:'));
          
          let loginInstructions;
          if (selectedPlatform === 'copilot') {
            loginInstructions = [`${chalk.cyan('copilot auth')}`];
          } else if (selectedPlatform === 'codex') {
            loginInstructions = [`${chalk.cyan('codex login')}`];
          } else if (selectedPlatform === 'claude') {
            loginInstructions = [
              `${chalk.cyan('claude login')}`,
              `${chalk.gray('ou:')} ${chalk.cyan('export ANTHROPIC_API_KEY=sk-ant-...')}`,
              `${chalk.gray('ou dans Claude Code:')} ${chalk.cyan('/login')}`
            ];
          }
          loginInstructions.forEach((inst, i) => console.log(`   ${i + 1}. ${inst}`));
          console.log('');
          
          const { authAction } = await inquirer.prompt([{
            type: 'list',
            name: 'authAction',
            message: 'Que souhaitez-vous faire?',
            choices: [
              { name: '🔄 Réessayer (après connexion dans un autre terminal)', value: 'retry' },
              { name: '⚡ Continuer en mode AUTO (sans conversation IA)', value: 'auto' },
              { name: '❌ Annuler l\'installation', value: 'cancel' }
            ]
          }]);
          
          if (authAction === 'retry') {
            console.log(chalk.gray('\n🔐 Nouvelle vérification...'));
            continue;
          } else if (authAction === 'auto') {
            installMode = 'auto';
            selectedPlatform = null;
            isAuthenticated = true; // exit loop
          } else {
            console.log(chalk.red('Installation annulée. Connectez-vous d\'abord à votre plateforme IA.'));
            process.exit(1);
          }
        }
      }
    }
    
    console.log('');
    
    // Phase 2: Interactive Chat with Yanstaller Agent
    // Ask user if they want to enter Phase 2 conversation
    const { enterPhase2 } = await inquirer.prompt([{
      type: 'list',
      name: 'enterPhase2',
      message: 'Phase 2 - Configuration avancée?',
      choices: [
        { name: '💬 Chat - Conversation personnalisée avec Yanstaller', value: 'chat' },
        { name: '⚡ Auto - Configuration par défaut (rapide)', value: 'auto' },
        { name: '⏭️  Skip - Passer Phase 2', value: 'skip' }
      ],
      default: 'chat'
    }]);
    
    let phase2Results = null;
    
    if (enterPhase2 === 'chat' && selectedPlatform) {
      // Launch interactive chat
      phase2Results = await launchPhase2Chat({
        interviewAnswers,
        detectedPlatforms,
        selectedPlatform, // NEW: Pass selected platform
        projectRoot,
        templateDir,
        userName: config.userName || null,
        language: config.language || 'Francais'
      });
      
      // If chat returned null, offer fallback
      if (!phase2Results) {
        console.log('');
        const { useFallback } = await inquirer.prompt([{
          type: 'confirm',
          name: 'useFallback',
          message: 'Utiliser la configuration par défaut?',
          default: true
        }]);
        
        if (useFallback) {
          phase2Results = generateDefaultConfig(interviewAnswers, detectedPlatforms, selectedPlatform);
        }
      }
    } else if (enterPhase2 === 'auto') {
      // Use default configuration
      const autoSpinner = ora('Generating default configuration...').start();
      phase2Results = generateDefaultConfig(interviewAnswers, detectedPlatforms, selectedPlatform);
      autoSpinner.succeed('Configuration generated');
    }
    
    // Display Phase 2 results if available
    if (phase2Results) {
      console.log('');
      console.log(chalk.cyan('📋 Configuration Agents:'));
      if (phase2Results.coreAgents) {
        console.log(chalk.green(`  Core: ${phase2Results.coreAgents.map(a => a.name).join(', ')}`));
      }
      if (phase2Results.agentRelationships && phase2Results.agentRelationships.length > 0) {
        console.log(chalk.gray(`  Relations: ${phase2Results.agentRelationships.length} defined`));
      }
      if (phase2Results.customAgentsToCreate && phase2Results.customAgentsToCreate.length > 0) {
        console.log(chalk.yellow(`  À créer: ${phase2Results.customAgentsToCreate.map(a => a.name).join(', ')}`));
      }
      console.log('');
      
      // Generate project-agents.md
      try {
        const outputDir = path.join(projectRoot, '_byan-output');
        const docPath = await generateProjectAgentsDoc(phase2Results, interviewAnswers, {}, outputDir);
        console.log(chalk.green(`  ✓ Généré: ${path.relative(projectRoot, docPath)}`));
        console.log('');
      } catch (error) {
        // Silent fail - document generation is optional
      }
    }
    
    autoSelectPlatform = recommendedPlatforms[0] || 'copilot';
  }
  
  // Step 3: Platform selection (skip in MANUAL mode - already selected)
  let platform;
  
  if (installMode === 'manual' && manualSelection) {
    // In MANUAL mode, use the first selected platform as primary
    // (all selected platforms will be used for stub generation)
    platform = manualSelection.platforms.length === 1 ? manualSelection.platforms[0] : 'all';
    console.log(chalk.cyan(`📦 Platform(s): ${manualSelection.platforms.join(', ')} (from manual selection)`));
    console.log('');
  } else {
    const platformChoices = [
      { name: `GitHub Copilot CLI ${detectedPlatforms.copilot ? chalk.green('(✓ Detected)') : ''}`, value: 'copilot' },
      { name: `VSCode`, value: 'vscode' },
      { name: `Claude Code ${detectedPlatforms.claude ? chalk.green('(✓ Detected)') : ''}`, value: 'claude' },
      { name: `Codex ${detectedPlatforms.codex ? chalk.green('(✓ Detected)') : ''}`, value: 'codex' },
      { name: 'All platforms', value: 'all' }
    ];
    
    // Auto-select first detected platform as default (or use interview recommendation)
    const defaultPlatform = (installMode === 'custom' && autoSelectPlatform) ? autoSelectPlatform :
                            (detectedPlatforms.copilot ? 'copilot' :
                             detectedPlatforms.codex ? 'codex' :
                             detectedPlatforms.claude ? 'claude' : 'copilot');
    
    const platformAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'platform',
        message: installMode === 'custom' ? 'Confirmer la plateforme (recommandation ci-dessus):' : 'Select platform to install for:',
        choices: platformChoices,
        default: defaultPlatform
      }
    ]);
    platform = platformAnswer.platform;
  }
  
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
  
  // Step 5.5: Turbo Whisper voice dictation (optional, with interview recommendation)
  console.log(chalk.blue('\n🎤 Voice Dictation Setup'));
  console.log(chalk.gray('Turbo Whisper enables voice-to-text with local Whisper AI server.\n'));
  
  let turboWhisperChoices = [
    { name: '🖥️  Local (CPU) - Run Whisper server locally', value: 'local' },
    { name: '🚀 Docker (GPU) - Run Whisper in Docker with GPU', value: 'docker' },
    { name: '⏭️  Skip - Install later manually', value: 'skip' }
  ];
  
  // Adjust default based on interview
  let defaultTurboMode = 'skip';
  if (installMode === 'custom' && recommendedTurboWhisper !== 'skip') {
    defaultTurboMode = recommendedTurboWhisper;
    console.log(chalk.cyan(`💡 Recommandation: ${recommendedTurboWhisper === 'docker' ? 'Docker (GPU)' : 'Local (CPU)'} basé sur votre profil\n`));
  }
  
  const { turboWhisperMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'turboWhisperMode',
      message: 'Install Turbo Whisper voice dictation?',
      choices: turboWhisperChoices,
      default: defaultTurboMode
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
  
  // Step 6: Create directory structure (Platform - _byan)
  const installSpinner = ora('Creating directory structure...').start();
  
  const byanDir = path.join(projectRoot, '_byan');
  const bmbDir = path.join(byanDir, 'bmb');
  const githubAgentsDir = path.join(projectRoot, '.github', 'agents');
  const isManual = installMode === 'manual' && manualSelection;
  const manualPlatformList = isManual ? manualSelection.platforms : [];
  
  await fs.ensureDir(path.join(byanDir, 'bmb', 'agents'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'steps'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'templates'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'data'));
  await fs.ensureDir(path.join(byanDir, 'core'));
  await fs.ensureDir(path.join(byanDir, '_config'));
  await fs.ensureDir(path.join(byanDir, '_memory'));
  await fs.ensureDir(path.join(byanDir, '_output'));
  
  // Create platform directories based on selection
  const needsCopilot = isManual ? manualPlatformList.includes('copilot') : true;
  const needsClaude = isManual ? manualPlatformList.includes('claude') : (detectedPlatforms.claude || platform === 'claude' || platform === 'all');
  const needsCodex = isManual ? manualPlatformList.includes('codex') : (detectedPlatforms.codex || platform === 'codex' || platform === 'all');
  
  if (needsCopilot) await fs.ensureDir(githubAgentsDir);
  if (needsClaude) await fs.ensureDir(path.join(projectRoot, '.claude', 'rules'));
  if (needsCodex) await fs.ensureDir(path.join(projectRoot, '.codex', 'prompts'));
  
  installSpinner.succeed('Directory structure created');
  
  // Step 7: Copy BYAN platform files from template
  const copySpinner = ora('Installing BYAN platform files...').start();
  
  try {
    // Copy the entire _byan/ structure (all modules, agents, configs, activation)
    const byanSource = path.join(templateDir, '_byan');
    
    // Core directories to copy from templates/_byan/ → project/_byan/
    const byanDirs = ['agents', 'core', 'bmb', 'bmm', 'tea', 'cis', '_config', '_memory', 'data', 'workflows'];
    
    for (const dir of byanDirs) {
      const source = path.join(byanSource, dir);
      const dest = path.join(byanDir, dir);
      if (await fs.pathExists(source)) {
        await fs.copy(source, dest, { overwrite: true });
      }
    }
    
    // Copy root-level files (config.yaml, workers.md, etc.)
    const rootFiles = await fs.readdir(byanSource);
    for (const file of rootFiles) {
      const fullPath = path.join(byanSource, file);
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        await fs.copy(fullPath, path.join(byanDir, file), { overwrite: true });
      }
    }
    
    copySpinner.text = 'Copied platform files...';
    console.log(chalk.green(`  ✓ Platform: _byan/ (agents, core, bmb, bmm, tea, cis, config)`));
    
    // Copy cost optimizer worker if enabled
    if (interviewAnswers && interviewAnswers.costOptimizer) {
      const workersDir = path.join(byanDir, 'workers');
      await fs.ensureDir(workersDir);
      
      const workerSource = path.join(templateDir, 'workers', 'cost-optimizer.js');
      const workerDest = path.join(workersDir, 'cost-optimizer.js');
      
      if (await fs.pathExists(workerSource)) {
        await fs.copy(workerSource, workerDest, { overwrite: true });
        copySpinner.text = 'Copied cost optimizer worker...';
        console.log(chalk.green(`  ✓ Cost Optimizer: ${workerSource} → ${workerDest}`));
        console.log(chalk.cyan('    💰 Automatic LLM cost optimization enabled (~54% savings)'));
      } else {
        copySpinner.warn(`⚠ Cost optimizer source not found: ${workerSource}`);
      }
    }
    
    // Workflow files already copied with full _byan/ structure above
    
    // MANUAL mode: Generate stubs only for selected agents on each selected platform
    if (isManual && manualSelection) {
      const selectedAgents = manualSelection.agents;
      
      // Agent name to stub filename mapping (must match existing templates)
      const AGENT_STUB_MAP = {
        'hermes': 'hermes',
        'franck': 'franck',
        'expert-merise-agile': 'expert-merise-agile',
        'bmad-master': 'bmad-agent-bmad-master',
        // BMB agents
        'byan': 'bmad-agent-byan',
        'agent-builder': 'bmad-agent-bmb-agent-builder',
        'module-builder': 'bmad-agent-bmb-module-builder',
        'workflow-builder': 'bmad-agent-bmb-workflow-builder',
        'marc': 'bmad-agent-marc',
        'rachid': 'bmad-agent-rachid',
        'claude': 'bmad-agent-claude',
        'codex': 'bmad-agent-codex',
        'drawio': 'bmad-agent-drawio',
        'turbo-whisper-integration': 'bmad-agent-turbo-whisper-integration',
        'patnote': 'bmad-agent-patnote',
        'carmack': 'bmad-agent-carmack',
        // BMM agents
        'analyst': 'bmad-agent-bmm-analyst',
        'pm': 'bmad-agent-bmm-pm',
        'architect': 'bmad-agent-bmm-architect',
        'dev': 'bmad-agent-bmm-dev',
        'sm': 'bmad-agent-bmm-sm',
        'quinn': 'bmad-agent-bmm-quinn',
        'ux-designer': 'bmad-agent-bmm-ux-designer',
        'tech-writer': 'bmad-agent-bmm-tech-writer',
        'quick-flow-solo-dev': 'bmad-agent-bmm-quick-flow-solo-dev',
        // TEA
        'tea': 'bmad-agent-tea-tea',
        // CIS agents
        'brainstorming-coach': 'bmad-agent-cis-brainstorming-coach',
        'creative-problem-solver': 'bmad-agent-cis-creative-problem-solver',
        'design-thinking-coach': 'bmad-agent-cis-design-thinking-coach',
        'innovation-strategist': 'bmad-agent-cis-innovation-strategist',
        'presentation-master': 'bmad-agent-cis-presentation-master',
        'storyteller': 'bmad-agent-cis-storyteller'
      };
      const agentToStubName = (agentName) => AGENT_STUB_MAP[agentName] || `bmad-agent-${agentName}`;
      
      // --- COPILOT: Copy matching .github/agents/ stubs ---
      if (manualPlatformList.includes('copilot')) {
        const githubAgentsSource = path.join(templateDir, '.github', 'agents');
        let copilotCount = 0;
        
        if (await fs.pathExists(githubAgentsSource)) {
          for (const agentName of selectedAgents) {
            const stubName = agentToStubName(agentName);
            const sourceFile = path.join(githubAgentsSource, `${stubName}.md`);
            const destFile = path.join(githubAgentsDir, `${stubName}.md`);
            
            if (await fs.pathExists(sourceFile)) {
              await fs.copy(sourceFile, destFile, { overwrite: true });
              copilotCount++;
            } else {
              // Generate stub if no template exists
              const stubContent = `---\nname: "${stubName}"\ndescription: "${agentName} agent from BYAN platform"\n---\n\nYou must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.\n\n<agent-activation CRITICAL="TRUE">\n1. LOAD the FULL agent file from {project-root}/_bmad/*/agents/${agentName}.md\n2. READ its entire contents - this contains the complete agent persona, menu, and instructions\n3. FOLLOW every step in the <activation> section precisely\n4. DISPLAY the welcome/greeting as instructed\n5. PRESENT the numbered menu\n6. WAIT for user input before proceeding\n</agent-activation>\n`;
              await fs.writeFile(destFile, stubContent, 'utf8');
              copilotCount++;
            }
          }
          console.log(chalk.green(`  ✓ Copilot CLI: ${copilotCount} agent stubs → .github/agents/`));
        }
      }
      
      // --- CODEX: Generate .codex/prompts/ skills ---
      if (manualPlatformList.includes('codex')) {
        const codexPromptsDir = path.join(projectRoot, '.codex', 'prompts');
        let codexCount = 0;
        
        for (const agentName of selectedAgents) {
          const skillName = agentName === 'hermes' ? 'hermes' : `bmad-${agentName}`;
          const skillPath = path.join(codexPromptsDir, `${skillName}.md`);
          const skillContent = `# ${agentName} Skill\n\nYou must fully embody this agent's persona and follow all activation instructions exactly as specified.\n\n<agent-activation CRITICAL="TRUE">\n1. LOAD the FULL agent file from {project-root}/_bmad/*/agents/${agentName}.md\n2. READ its entire contents - this contains the complete agent persona, menu, and instructions\n3. FOLLOW every step in the <activation> section precisely\n4. DISPLAY the welcome/greeting as instructed\n5. PRESENT the numbered menu\n6. WAIT for user input before proceeding\n</agent-activation>\n\n## Usage\ncodex skill ${skillName} [prompt]\n\n## Examples\n- codex skill ${skillName}\n- codex skill ${skillName} "help me with my project"\n`;
          await fs.writeFile(skillPath, skillContent, 'utf8');
          codexCount++;
        }
        console.log(chalk.green(`  ✓ Codex: ${codexCount} skills → .codex/prompts/`));
      }
      
      // --- CLAUDE: Copy rules + generate agent rules ---
      if (manualPlatformList.includes('claude')) {
        const claudeSource = path.join(templateDir, '.claude');
        const claudeDest = path.join(projectRoot, '.claude');
        
        if (await fs.pathExists(claudeSource)) {
          await fs.ensureDir(path.join(claudeDest, 'rules'));
          await fs.copy(claudeSource, claudeDest, { overwrite: true });
          console.log(chalk.green(`  ✓ Claude Code: CLAUDE.md + rules/ (Hermes, agents, methodology)`));
        }
      }
      
      console.log(chalk.gray(`  ℹ Agent roles: dispatcher(hermes), workflow agents, context agents, workers`));
      
    } else {
      // AUTO/CUSTOM mode: Copy all platform stubs (existing behavior)
      
      // Copy .github/agents files
      const githubAgentsSource = path.join(templateDir, '.github', 'agents');
      
      if (await fs.pathExists(githubAgentsSource)) {
        await fs.copy(githubAgentsSource, githubAgentsDir, { overwrite: true });
        copySpinner.text = 'Copied Copilot CLI agent stubs...';
        console.log(chalk.green(`  ✓ GitHub agents: ${githubAgentsSource} → ${githubAgentsDir}`));
      } else {
        copySpinner.warn(`⚠ GitHub agents source not found: ${githubAgentsSource}`);
      }
      
      // Copy .claude/ files for Claude Code integration (always includes Hermes)
      if (needsClaude) {
        const claudeSource = path.join(templateDir, '.claude');
        const claudeDest = path.join(projectRoot, '.claude');
        
        if (await fs.pathExists(claudeSource)) {
          await fs.ensureDir(path.join(claudeDest, 'rules'));
          await fs.copy(claudeSource, claudeDest, { overwrite: true });
          copySpinner.text = 'Copied Claude Code rules + Hermes dispatcher...';
          console.log(chalk.green(`  ✓ Claude Code: CLAUDE.md + rules/ (Hermes, agents, methodology)`));
        }
      }
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
    bmb_creations_output_folder: "{project-root}/_byan-output/bmb-creations",
    user_name: config.userName,
    communication_language: config.language,
    document_output_language: config.language,
    output_folder: "{project-root}/_byan-output",
    platform: isManual ? manualSelection.platforms.join(',') : platform,
    install_mode: installMode,
    byan_version: BYAN_VERSION
  };
  
  // Add installed agents list for MANUAL mode
  if (isManual && manualSelection) {
    configContent.installed_agents = manualSelection.agents;
  }
  
  const configPath = path.join(bmbDir, 'config.yaml');
  await fs.writeFile(configPath, yaml.dump(configContent), 'utf8');
  
  configSpinner.succeed('Configuration generated');
  
  // Step 8.5: Soul & Voice Setup
  console.log('');
  console.log(chalk.blue('--- Soul & Voice System ---'));
  console.log(chalk.gray('BYAN agents can carry a soul (values, personality, guardrails)'));
  console.log(chalk.gray('and a voice/tao (verbal signatures, tone, speech patterns).'));
  console.log('');
  
  const { soulMode } = await inquirer.prompt([{
    type: 'list',
    name: 'soulMode',
    message: 'Soul setup mode:',
    choices: [
      { name: 'CREATOR — Use Yan\'s soul as foundation (recommended for first-timers)', value: 'creator' },
      { name: 'BLANK — Start with empty templates to fill yourself', value: 'blank' },
      { name: 'IMPORT — Import existing soul files from a path', value: 'import' },
      { name: 'SKIP — No soul setup (can be added later)', value: 'skip' }
    ],
    default: 'creator'
  }]);
  
  if (soulMode !== 'skip') {
    const soulSpinner = ora('Setting up Soul & Voice system...').start();
    const soulDir = byanDir; // _byan/ root for soul files
    
    try {
      if (soulMode === 'creator') {
        // Copy Yan's soul files as active soul (creator mode = Yan's soul)
        const creatorSoulSrc = path.join(templateDir, '_byan', 'creator-soul.md');
        const byanSoulSrc = path.join(templateDir, '_byan', 'byan-soul.md');
        const byanTaoSrc = path.join(templateDir, '_byan', 'byan-tao.md');
        const byanMemorySrc = path.join(templateDir, '_byan', 'byan-soul-memory.md');
        const soulRefSrc = path.join(templateDir, '_byan', 'byan-soul-reference.md');
        const taoRefSrc = path.join(templateDir, '_byan', 'byan-tao-reference.md');
        const memoryRefSrc = path.join(templateDir, '_byan', 'soul-memory-reference.md');
        
        // Copy creator-soul as-is (Yan's soul = the original)
        if (await fs.pathExists(creatorSoulSrc)) {
          await fs.copy(creatorSoulSrc, path.join(soulDir, 'creator-soul.md'));
        }
        // Copy Yan's active soul files (what soul-activation.md actually reads)
        if (await fs.pathExists(byanSoulSrc)) {
          await fs.copy(byanSoulSrc, path.join(soulDir, 'soul.md'));
        }
        if (await fs.pathExists(byanTaoSrc)) {
          await fs.copy(byanTaoSrc, path.join(soulDir, 'tao.md'));
        }
        if (await fs.pathExists(byanMemorySrc)) {
          await fs.copy(byanMemorySrc, path.join(soulDir, 'soul-memory.md'));
        }
        // Copy references for inspiration
        if (await fs.pathExists(soulRefSrc)) {
          await fs.copy(soulRefSrc, path.join(soulDir, 'byan-soul-reference.md'));
        }
        if (await fs.pathExists(taoRefSrc)) {
          await fs.copy(taoRefSrc, path.join(soulDir, 'byan-tao-reference.md'));
        }
        if (await fs.pathExists(memoryRefSrc)) {
          await fs.copy(memoryRefSrc, path.join(soulDir, 'soul-memory-reference.md'));
        }
        
        soulSpinner.succeed('Soul system installed (Creator mode — Yan\'s soul active)');
        console.log(chalk.green('  + soul.md — Yan\'s soul (active)'));
        console.log(chalk.green('  + tao.md — Yan\'s voice directives (active)'));
        console.log(chalk.green('  + soul-memory.md — Living journal'));
        console.log(chalk.green('  + creator-soul.md — Yan\'s original creator soul'));
        console.log(chalk.cyan('  Tip: Use @byan with the Forge workflow to build your own soul'));
        
      } else if (soulMode === 'blank') {
        // Copy blank templates only
        const creatorTemplateSrc = path.join(templateDir, '_byan', 'creator-soul-template.md');
        const soulTemplateSrc = path.join(templateDir, '_byan', 'soul-template.md');
        const memoryTemplateSrc = path.join(templateDir, '_byan', 'soul-memory-template.md');
        
        if (await fs.pathExists(creatorTemplateSrc)) {
          await fs.copy(creatorTemplateSrc, path.join(soulDir, 'creator-soul.md'));
        }
        if (await fs.pathExists(soulTemplateSrc)) {
          await fs.copy(soulTemplateSrc, path.join(soulDir, 'soul.md'));
        }
        if (await fs.pathExists(memoryTemplateSrc)) {
          await fs.copy(memoryTemplateSrc, path.join(soulDir, 'soul-memory.md'));
        }
        
        soulSpinner.succeed('Soul system installed (Blank mode — empty templates)');
        console.log(chalk.green('  + creator-soul.md — Template to fill with YOUR values'));
        console.log(chalk.green('  + soul.md — Template for BYAN\'s personality'));
        console.log(chalk.green('  + soul-memory.md — Living journal (empty)'));
        console.log(chalk.cyan('  Tip: Use @byan with the Forge workflow to build your soul interactively'));
        
      } else if (soulMode === 'import') {
        const { importPath } = await inquirer.prompt([{
          type: 'input',
          name: 'importPath',
          message: 'Path to soul directory (containing creator-soul.md, soul.md, etc.):',
          validate: (input) => {
            if (!input) return 'Please provide a path';
            if (!fs.existsSync(input)) return `Path not found: ${input}`;
            return true;
          }
        }]);
        
        const soulFiles = ['creator-soul.md', 'soul.md', 'soul-memory.md', 'tao.md'];
        let imported = 0;
        
        for (const file of soulFiles) {
          const src = path.join(importPath, file);
          if (await fs.pathExists(src)) {
            await fs.copy(src, path.join(soulDir, file));
            imported++;
            console.log(chalk.green(`  + ${file} imported`));
          }
        }
        
        soulSpinner.succeed(`Soul system imported (${imported} files from ${importPath})`);
      }
      
      // Add soul_mode to config
      const existingConfig = yaml.load(await fs.readFile(configPath, 'utf8'));
      existingConfig.soul_mode = soulMode;
      await fs.writeFile(configPath, yaml.dump(existingConfig), 'utf8');
      
    } catch (soulError) {
      soulSpinner.warn(`Soul setup had issues: ${soulError.message}`);
      console.log(chalk.yellow('  Soul files can be added manually later'));
    }
    
    console.log('');
  }
  
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
    { name: 'Config', path: configPath }
  ];
  
  // Soul system checks
  if (soulMode && soulMode !== 'skip') {
    checks.push({ name: 'Soul file', path: path.join(byanDir, 'soul.md') });
    checks.push({ name: 'Soul memory', path: path.join(byanDir, 'soul-memory.md') });
  }
  
  // Platform-specific checks based on installation mode
  if (isManual) {
    if (manualPlatformList.includes('copilot')) {
      checks.push({ name: 'Copilot agents dir', path: githubAgentsDir });
      checks.push({ name: 'Hermes (Copilot)', path: path.join(githubAgentsDir, 'hermes.md') });
    }
    if (manualPlatformList.includes('codex')) {
      checks.push({ name: 'Codex prompts dir', path: path.join(projectRoot, '.codex', 'prompts') });
      checks.push({ name: 'Hermes (Codex)', path: path.join(projectRoot, '.codex', 'prompts', 'hermes.md') });
    }
    if (manualPlatformList.includes('claude')) {
      checks.push(
        { name: 'Claude CLAUDE.md', path: path.join(projectRoot, '.claude', 'CLAUDE.md') },
        { name: 'Claude rules/', path: path.join(projectRoot, '.claude', 'rules') },
        { name: 'Hermes dispatcher rule', path: path.join(projectRoot, '.claude', 'rules', 'hermes-dispatcher.md') }
      );
    }
  } else {
    checks.push({ name: 'GitHub agents dir', path: githubAgentsDir });
    
    // Add Claude Code checks if installed
    if (needsClaude) {
      checks.push(
        { name: 'Claude CLAUDE.md', path: path.join(projectRoot, '.claude', 'CLAUDE.md') },
        { name: 'Claude rules/', path: path.join(projectRoot, '.claude', 'rules') },
        { name: 'Hermes dispatcher rule', path: path.join(projectRoot, '.claude', 'rules', 'hermes-dispatcher.md') }
      );
    }
  }
  
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
  console.log(`  • Mode: ${chalk.cyan(installMode.toUpperCase())}`);
  console.log(`  • Platform: ${chalk.cyan(isManual ? manualSelection.platforms.join(', ') : platform)}`);
  console.log(`  • Version: ${chalk.cyan(v2Installed ? 'v2.2.0 (Runtime + Platform + Model Selector)' : 'v2.2.0 (Platform only)')}`);
  console.log(`  • Installation Directory: ${chalk.cyan(bmbDir)}`);
  console.log(`  • Configuration: ${chalk.cyan(configPath)}`);
  console.log(`  • User: ${chalk.cyan(config.userName)}`);
  console.log(`  • Language: ${chalk.cyan(config.language)}`);
  console.log(`  • Turbo Whisper: ${chalk.cyan(turboWhisperInstalled ? `Installed (${turboWhisperMode} mode)` : 'Not installed')}`);
  console.log(`  • Soul System: ${chalk.cyan(soulMode === 'skip' ? 'Not installed' : `${soulMode} mode`)}`);
  console.log(`  • Model Selector: ${chalk.cyan('Integrated (Auto cost optimization)')}`);
  
  if (isManual && manualSelection) {
    console.log(chalk.cyan(`\n  Agents Installed (${manualSelection.agents.length}):`));
    console.log(chalk.cyan(`  ✓ Dispatcher: hermes (always installed)`));
    const otherAgents = manualSelection.agents.filter(a => a !== 'hermes');
    if (otherAgents.length > 0) {
      console.log(chalk.cyan(`  ✓ Selected: ${otherAgents.join(', ')}`));
    }
  }
  if (v2Installed) {
    console.log(chalk.cyan('\n  v2.2 Components Installed:'));
    console.log(chalk.cyan('  ✓ Core: Context, Cache, Dispatcher, Worker Pool, Workflow'));
    console.log(chalk.cyan('  ✓ Model Selector: Intelligent model selection'));
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
    console.log(`   ${chalk.blue('claude')}`);
    console.log(`   Hermes est integre via ${chalk.cyan('.claude/CLAUDE.md')}`);
    console.log(`   Demande: ${chalk.cyan('"quel agent pour mon projet?"')} → Hermes repond`);
    console.log(`   Regles: ${chalk.cyan('.claude/rules/')} (hermes, agents, methodologie)`);
  } else {
    console.log('   Follow your platform\'s agent activation procedure');
  }
  
  // Turbo Whisper instructions
  if (turboWhisperInstalled) {
    console.log('');
    console.log(chalk.yellow('🎤 Turbo Whisper Voice Dictation:'));
    console.log('');
    
    if (turboWhisperMode === 'local' || turboWhisperMode === 'docker') {
      console.log(chalk.gray('  Lancement simplifié (1 commande):'));
      console.log(`   ${chalk.blue('./scripts/launch-turbo-whisper.sh')}`);
      console.log(chalk.gray('   → Démarre automatiquement le serveur si nécessaire'));
      console.log('');
    }
    
    console.log(chalk.gray('  Hotkey: Ctrl+Alt+R (start/stop recording)'));
    console.log(chalk.gray('  Documentation: TURBO-WHISPER-SETUP.md'));
  }
  
  console.log('');
  console.log(chalk.gray('Need help? Type \'/bmad-help\' when BYAN is active'));
  console.log('');
  console.log(chalk.blue('Happy agent building! 🏗️'));
}

// CLI Program
program
  .name('create-byan-agent')
  .description('Install BYAN v2.2.0 - Builder of YAN with Model Selector and multi-platform support')
  .version(BYAN_VERSION)
  .action(install);

// Update Command (Yanstaller v3)
program
  .command('update')
  .description('Update BYAN to the latest npm version')
  .option('--preview', 'Show what would change without applying')
  .option('--force', 'Force update even if already up to date')
  .action(async (options) => {
    const yanstaller = require('../lib/yanstaller');
    const projectRoot = process.cwd();

    try {
      if (options.preview) {
        const spinner = ora('Analyzing update...').start();
        const { diff, userModified, installed, latest } = await yanstaller.updater.preview(projectRoot);
        spinner.succeed('Analysis complete');

        console.log('');
        console.log(chalk.bold(`Version: ${installed} -> ${latest}`));
        console.log('');

        if (diff.toUpdate.length) {
          console.log(chalk.yellow(`  Updated files (${diff.toUpdate.length}):`));
          diff.toUpdate.forEach(f => {
            const tag = userModified.includes(f) ? chalk.red(' [user-modified, will skip]') : '';
            console.log(chalk.gray(`    ~ ${f}${tag}`));
          });
        }
        if (diff.toAdd.length) {
          console.log(chalk.green(`  New files (${diff.toAdd.length}):`));
          diff.toAdd.forEach(f => console.log(chalk.gray(`    + ${f}`)));
        }
        if (diff.toKeep.length) {
          console.log(chalk.blue(`  User files kept (${diff.toKeep.length}):`));
          diff.toKeep.forEach(f => console.log(chalk.gray(`    = ${f}`)));
        }
        if (diff.toSkip.length) {
          console.log(chalk.gray(`  Unchanged: ${diff.toSkip.length} files`));
        }
        console.log('');
        return;
      }

      const checkSpinner = ora('Checking for updates...').start();
      const check = await yanstaller.updater.checkForUpdate(projectRoot);

      if (!check.updateAvailable && !options.force) {
        checkSpinner.succeed(`Already up to date (${check.installed})`);
        return;
      }
      checkSpinner.succeed(`Update available: ${check.installed} -> ${check.latest}`);

      const updateSpinner = ora('Updating BYAN...').start();
      const result = await yanstaller.update(projectRoot, { force: options.force });
      updateSpinner.succeed('Update complete');

      console.log('');
      console.log(chalk.green.bold(`Updated: ${result.previousVersion} -> ${result.newVersion}`));
      console.log(chalk.gray(`  Files updated: ${result.filesUpdated}`));
      console.log(chalk.gray(`  Files added:   ${result.filesAdded}`));
      if (result.filesSkipped > 0) {
        console.log(chalk.yellow(`  Files skipped: ${result.filesSkipped} (user-modified)`));
      }
      if (result.backupPath) {
        console.log(chalk.gray(`  Backup: ${path.basename(result.backupPath)}`));
      }
      console.log('');
    } catch (error) {
      console.error('');
      console.error(chalk.red.bold('Update failed:'));
      console.error(chalk.red(`  ${error.message}`));
      console.error('');
      console.error(chalk.yellow('Restore with: npx create-byan-agent rollback'));
      process.exit(1);
    }
  });

// Rollback Command (Yanstaller v3)
program
  .command('rollback')
  .description('Restore BYAN from the most recent backup')
  .action(async () => {
    const yanstaller = require('../lib/yanstaller');
    const projectRoot = process.cwd();
    const spinner = ora('Restoring from backup...').start();

    try {
      await yanstaller.rollback(projectRoot);
      spinner.succeed('Rollback complete');
      console.log(chalk.green('\nBYAN restored from latest backup'));
    } catch (error) {
      spinner.fail('Rollback failed');
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

// Backups Command (Yanstaller v3)
program
  .command('backups')
  .description('List available BYAN backups')
  .action(async () => {
    const yanstaller = require('../lib/yanstaller');
    const projectRoot = process.cwd();

    try {
      const backups = await yanstaller.listBackups(projectRoot);

      if (backups.length === 0) {
        console.log(chalk.yellow('No backups found.'));
        return;
      }

      console.log(chalk.bold(`\nAvailable backups (${backups.length}):\n`));
      for (const backupPath of backups) {
        const name = path.basename(backupPath);
        const timestamp = parseInt(name.replace('_byan.backup-', ''), 10);
        const date = new Date(timestamp).toLocaleString();
        const size = await yanstaller.backuper.getBackupSize(backupPath);
        const sizeKB = (size / 1024).toFixed(1);
        console.log(chalk.gray(`  ${name}  ${date}  (${sizeKB} KB)`));
      }
      console.log('');
    } catch (error) {
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

// Check Version Command (Yanstaller v3)
program
  .command('check')
  .description('Check installed version vs latest npm version')
  .action(async () => {
    const yanstaller = require('../lib/yanstaller');
    const projectRoot = process.cwd();
    const spinner = ora('Checking BYAN version...').start();

    try {
      const check = await yanstaller.updater.checkForUpdate(projectRoot);
      spinner.succeed('Check complete');

      console.log('');
      console.log(chalk.bold('Version info:'));
      console.log(chalk.gray('  Installed: ') + chalk.cyan(check.installed));
      console.log(chalk.gray('  Latest:    ') + chalk.cyan(check.latest));
      console.log('');

      if (check.updateAvailable) {
        console.log(chalk.yellow(`  Update available (${check.changes.length} files changed)`));
        console.log(chalk.gray('  Run: npx create-byan-agent update'));
      } else {
        console.log(chalk.green('  Up to date'));
      }
      console.log('');
    } catch (error) {
      spinner.fail('Version check failed');
      console.error(chalk.red(`  ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('web')
  .description('Launch BYAN WebUI installer in the browser')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(async (options) => {
    const ByanWebUI = require('../src/webui/server');
    const port = parseInt(options.port, 10);
    const projectRoot = process.cwd();

    console.log(chalk.cyan.bold('\n  BYAN WebUI\n'));
    const server = new ByanWebUI({ port, projectRoot });
    server.start();
    console.log(chalk.green(`  Server running at http://localhost:${port}`));
    console.log(chalk.gray('  Press Ctrl+C to stop\n'));
  });

program.parse(process.argv);
