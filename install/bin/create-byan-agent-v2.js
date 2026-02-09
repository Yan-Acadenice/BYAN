#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');

// Phase 2 modules
const { getDomainQuestions, buildPhase2Prompt } = require('../lib/domain-questions');
const { generateProjectAgentsDoc } = require('../lib/project-agents-generator');

const BYAN_VERSION = '2.2.1';

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
  const { installMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'installMode',
      message: 'Choose installation mode:',
      choices: [
        { name: '🚀 AUTO - Quick install with smart defaults (Recommended)', value: 'auto' },
        { name: '🎯 CUSTOM - Guided interview with personalized recommendations', value: 'custom' }
      ],
      default: 'auto'
    }
  ]);

  let interviewResults = null;
  let interviewAnswers = null;

  // Step 2.9: Intelligent Interview (if CUSTOM mode) - Delegate to Yanstaller Agent
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
    
    // Detect which CLI to use (non-interactive mode)
    // Copilot: --agent loads from .github/agents/, -p for non-interactive, -s for silent
    // Codex: exec subcommand for non-interactive, -m for model
    // Claude: -p for non-interactive prompt
    let agentCommand = null;
    if (detectedPlatforms.copilot) {
      agentCommand = `copilot --agent=bmad-agent-yanstaller-interview -p "$(cat '${promptFile}')" --model ${interviewComplexity} -s`;
    } else if (detectedPlatforms.codex) {
      agentCommand = `codex exec "$(cat '${promptFile}')"`;
    } else if (detectedPlatforms.claude) {
      agentCommand = `claude -p "$(cat '${promptFile}')"`;
    }
    
    if (agentCommand) {
      const agentSpinner = ora(`Analysing with yanstaller agent (${interviewComplexity})...`).start();
      
      try {
        const result = execSync(agentCommand, {
          encoding: 'utf8',
          cwd: projectRoot,
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
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
              console.log(chalk.green(`  Essential agents: ${interviewResults.agents.essential?.join(', ')}`));
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
    } else {
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
      if (interviewResults.agents.optional?.length > 0) {
        console.log(chalk.gray(`  📦 Agents optionnels: ${interviewResults.agents.optional.join(', ')}`));
      }
    }
    
    // Model recommendation
    if (interviewResults.recommended_model) {
      console.log(chalk.cyan(`  🧠 Model recommandé: ${interviewResults.recommended_model} (score: ${interviewResults.complexity_score || 'N/A'})`));
    }
    
    console.log('');
    
    // Phase 2: Domain-specific questions
    const domainQuestions = getDomainQuestions(interviewAnswers.domain);
    if (domainQuestions.length > 0) {
      console.log(chalk.blue('╔════════════════════════════════════════════════════════════╗'));
      console.log(chalk.blue('║') + '                                                            ' + chalk.blue('║'));
      console.log(chalk.blue('║') + `   ${chalk.bold('🔍 PHASE 2 - Questions Spécifiques')}                         ` + chalk.blue('║'));
      console.log(chalk.blue('║') + `   ${chalk.gray(`Domaine: ${interviewAnswers.domain}`)}                                        ` + chalk.blue('║'));
      console.log(chalk.blue('║') + '                                                            ' + chalk.blue('║'));
      console.log(chalk.blue('╚════════════════════════════════════════════════════════════╝'));
      console.log('');
      
      const domainAnswers = await inquirer.prompt(domainQuestions);
      
      // Phase 2 Agent Call - Deep analysis
      const phase2Spinner = ora('Generating agent configuration...').start();
      
      // Pre-copy phase2 agent stub
      const phase2AgentSource = path.join(templateDir, '.github', 'agents', 'bmad-agent-yanstaller-phase2.md');
      const earlyGithubDir = path.join(projectRoot, '.github', 'agents');
      if (await fs.pathExists(phase2AgentSource)) {
        await fs.ensureDir(earlyGithubDir);
        await fs.copy(phase2AgentSource, path.join(earlyGithubDir, 'bmad-agent-yanstaller-phase2.md'), { overwrite: true });
      }
      
      // Build Phase 2 prompt
      const phase2Prompt = buildPhase2Prompt(interviewAnswers, domainAnswers, detectedPlatforms);
      const phase2PromptFile = path.join(projectRoot, '.yanstaller-phase2-prompt.tmp');
      await fs.writeFile(phase2PromptFile, phase2Prompt, 'utf8');
      
      // Use more capable model for complex analysis
      const phase2Model = interviewAnswers.quality === 'critical' ? 'claude-sonnet-4' : 'gpt-5.1-codex-mini';
      
      let phase2Results = null;
      let phase2Command = null;
      
      if (detectedPlatforms.copilot) {
        phase2Command = `copilot --agent=bmad-agent-yanstaller-phase2 -p "$(cat '${phase2PromptFile}')" --model ${phase2Model} -s`;
      } else if (detectedPlatforms.codex) {
        phase2Command = `codex exec "$(cat '${phase2PromptFile}')"`;
      }
      
      if (phase2Command) {
        try {
          const result = execSync(phase2Command, {
            encoding: 'utf8',
            cwd: projectRoot,
            timeout: 180000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          // Parse JSON
          const lines = result.split('\n');
          let jsonStr = null;
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.includes('"coreAgents"')) {
              try {
                JSON.parse(trimmed);
                jsonStr = trimmed;
              } catch (e) { /* not valid */ }
            }
          }
          if (!jsonStr) {
            const jsonMatch = result.match(/\{[\s\S]*"coreAgents"[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];
          }
          
          if (jsonStr) {
            phase2Results = JSON.parse(jsonStr);
            phase2Spinner.succeed('Agent configuration generated');
            
            // Display Phase 2 results
            console.log('');
            console.log(chalk.cyan('📋 Configuration Agents:'));
            if (phase2Results.coreAgents) {
              console.log(chalk.green(`  Core: ${phase2Results.coreAgents.map(a => a.name).join(', ')}`));
            }
            if (phase2Results.agentRelationships?.length > 0) {
              console.log(chalk.gray(`  Relations: ${phase2Results.agentRelationships.length} defined`));
            }
            if (phase2Results.customAgentsToCreate?.length > 0) {
              console.log(chalk.yellow(`  À créer: ${phase2Results.customAgentsToCreate.map(a => a.name).join(', ')}`));
            }
            console.log('');
          } else {
            phase2Spinner.warn('Could not parse agent configuration');
          }
        } catch (error) {
          phase2Spinner.warn('Phase 2 analysis unavailable');
        }
      }
      
      // Cleanup
      await fs.remove(phase2PromptFile).catch(() => {});
      
      // Generate project-agents.md if we have results
      if (phase2Results) {
        try {
          const outputDir = path.join(projectRoot, '_byan-output');
          const docPath = await generateProjectAgentsDoc(phase2Results, interviewAnswers, domainAnswers, outputDir);
          console.log(chalk.green(`  ✓ Généré: ${path.relative(projectRoot, docPath)}`));
          console.log('');
        } catch (error) {
          // Silent fail - document generation is optional
        }
      }
    }
    
    autoSelectPlatform = recommendedPlatforms[0] || 'copilot';
  }
  
  // Step 3: Platform selection (pre-select detected platforms)
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
  
  const { platform } = await inquirer.prompt([
    {
      type: 'list',
      name: 'platform',
      message: installMode === 'custom' ? 'Confirmer la plateforme (recommandation ci-dessus):' : 'Select platform to install for:',
      choices: platformChoices,
      default: defaultPlatform
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
      default: installMode === 'custom' && interviewResults ? 'Francais' : 'English'
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
  
  await fs.ensureDir(path.join(byanDir, 'bmb', 'agents'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'steps'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'templates'));
  await fs.ensureDir(path.join(byanDir, 'bmb', 'workflows', 'byan', 'data'));
  await fs.ensureDir(path.join(byanDir, 'core'));
  await fs.ensureDir(path.join(byanDir, '_config'));
  await fs.ensureDir(path.join(byanDir, '_memory'));
  await fs.ensureDir(path.join(byanDir, '_output'));
  await fs.ensureDir(githubAgentsDir);
  
  installSpinner.succeed('Directory structure created');
  
  // Step 7: Copy BYAN platform files from template
  const copySpinner = ora('Installing BYAN platform files...').start();
  
  try {
    // Copy agent files
    const agentsSource = path.join(templateDir, '_byan', 'bmb', 'agents');
    const agentsDest = path.join(bmbDir, 'agents');
    
    if (await fs.pathExists(agentsSource)) {
      await fs.copy(agentsSource, agentsDest, { overwrite: true });
      copySpinner.text = 'Copied agent files...';
      console.log(chalk.green(`  ✓ Agents: ${agentsSource} → ${agentsDest}`));
    } else {
      copySpinner.warn(`⚠ Agent source not found: ${agentsSource}`);
    }
    
    // Copy workflow files
    const workflowsSource = path.join(templateDir, '_byan', 'bmb', 'workflows', 'byan');
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
    bmb_creations_output_folder: "{project-root}/_byan-output/bmb-creations",
    user_name: config.userName,
    communication_language: config.language,
    document_output_language: config.language,
    output_folder: "{project-root}/_byan-output",
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
  console.log(`  • Version: ${chalk.cyan(v2Installed ? 'v2.2.0 (Runtime + Platform + Model Selector)' : 'v2.2.0 (Platform only)')}`);
  console.log(`  • Installation Directory: ${chalk.cyan(bmbDir)}`);
  console.log(`  • Configuration: ${chalk.cyan(configPath)}`);
  console.log(`  • User: ${chalk.cyan(config.userName)}`);
  console.log(`  • Language: ${chalk.cyan(config.language)}`);
  console.log(`  • Turbo Whisper: ${chalk.cyan(turboWhisperInstalled ? `Installed (${turboWhisperMode} mode)` : 'Not installed')}`);
  console.log(`  • Model Selector: ${chalk.cyan('Integrated (Auto cost optimization)')}`);
  
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
    console.log(`   ${chalk.blue('claude chat --agent byan')}`);
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

program.parse(process.argv);
