#!/usr/bin/env node

const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');

// YANSTALLER Modules
const detector = require('../lib/yanstaller/detector');
const recommender = require('../lib/yanstaller/recommender');
const interviewer = require('../lib/yanstaller/interviewer');
const installer = require('../lib/yanstaller/installer');
const validator = require('../lib/yanstaller/validator');
const wizard = require('../lib/yanstaller/wizard');
const backuper = require('../lib/yanstaller/backuper');
const logger = require('../lib/utils/logger');

const YANSTALLER_VERSION = '1.2.3';

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizePlatformName(name) {
  if (!name) return name;
  const lower = String(name).toLowerCase();
  if (lower === 'claude') return 'claude-code';
  return lower;
}

function normalizePlatforms(list) {
  return list.map(normalizePlatformName).filter(Boolean);
}

function expandAllPlatforms(list) {
  if (list.includes('all')) {
    return ['copilot-cli', 'vscode', 'codex', 'claude-code'];
  }
  return list;
}

// ASCII Art Banner
const banner = `
${chalk.blue('╔════════════════════════════════════════════════════════════╗')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.bold('🏗️  YANSTALLER v' + YANSTALLER_VERSION)}                        ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Intelligent BYAN Installer')}                              ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('Methodology: Merise Agile + TDD + 64 Mantras')}           ${chalk.blue('║')}
${chalk.blue('║')}   ${chalk.gray('29 Agents • Multi-Platform • Auto-Fix')}                  ${chalk.blue('║')}
${chalk.blue('║')}                                                            ${chalk.blue('║')}
${chalk.blue('╚════════════════════════════════════════════════════════════╝')}
`;

/**
 * Main YANSTALLER Installation Flow
 * 
 * Orchestrates the 7-step intelligent installation:
 * 1. DETECT - Platform & project analysis
 * 2. RECOMMEND - Intelligent agent recommendations
 * 3. INTERVIEW - 7-question personalization
 * 4. BACKUP - Pre-install safety (optional)
 * 5. INSTALL - Core installation
 * 6. VALIDATE - 10 automated checks
 * 7. WIZARD - Post-install actions
 */
async function main(options = {}) {
  try {
    console.clear();
    console.log(banner);
    
    const projectRoot = process.cwd();
    
    // STEP 1: DETECT - Platform & Project Analysis
    logger.info(chalk.bold('\n🔍 STEP 1/7: Detection\n'));
    const detection = await detector.detect({ projectRoot });
    
    const platformNames = detection.platforms ? detection.platforms.map(p => p.name).join(', ') : 'none';
    logger.info(`✓ Platforms detected: ${chalk.cyan(platformNames)}`);
    if (detection.projectType) {
      logger.info(`✓ Project type: ${chalk.cyan(detection.projectType)}`);
    }
    if (detection.framework) {
      logger.info(`✓ Framework: ${chalk.cyan(detection.framework)}`);
    }
    
    // STEP 2: RECOMMEND - Intelligent Agent Selection
    logger.info(chalk.bold('\n🎯 STEP 2/7: Recommendations\n'));
    const recommendations = await recommender.recommend({
      projectRoot,
      detection
    });
    
    if (recommendations.agents && recommendations.agents.length > 0) {
      logger.info(`✓ Recommended agents: ${chalk.cyan(recommendations.agents.join(', '))}`);
    }
    
    // STEP 3: INTERVIEW - 7-Question Personalization
    const isSilent = !!options.silent;
    const forceInteractive = !!options.interactive;
    const hasTty = !!process.stdin.isTTY;
    const forceSilent = !hasTty && !isSilent && !forceInteractive;
    
    if (forceSilent) {
      logger.warn('No interactive TTY detected. Falling back to silent mode.');
    }
    if (!hasTty && forceInteractive) {
      logger.warn('Interactive mode forced without TTY. Prompts may not render correctly.');
    }
    
    let answers;
    
    if (isSilent || forceSilent) {
      logger.info(chalk.bold('\nSTEP 3/7: Interview (skipped - silent)\n'));
      
      const parsedAgents = parseList(options.agents);
      const parsedPlatforms = expandAllPlatforms(normalizePlatforms(parseList(options.platforms)));
      
      let mode = options.mode || (parsedAgents.length > 0 ? 'custom' : (recommendations.mode || 'minimal'));
      let agents = parsedAgents;
      
      if (agents.length === 0) {
        if (mode === 'recommended' && recommendations && recommendations.agents) {
          agents = recommendations.agents;
        } else if (mode === 'minimal' || mode === 'full') {
          agents = recommender.getAgentList(mode);
        } else if (mode === 'custom') {
          logger.warn('Custom mode selected without agents. Falling back to recommendations.');
          agents = recommendations.agents || ['byan'];
          mode = 'recommended';
        } else {
          agents = recommendations.agents || ['byan'];
          mode = recommendations.mode || 'minimal';
        }
      }
      
      let targetPlatforms = parsedPlatforms;
      if (targetPlatforms.length === 0) {
        targetPlatforms = (detection.platforms || [])
          .filter(p => p.detected)
          .map(p => normalizePlatformName(p.name));
      }
      
      answers = {
        userName: 'Developer',
        language: 'English',
        mode,
        agents,
        targetPlatforms,
        createSampleAgent: false,
        createBackup: options.backup !== false
      };
    } else {
      logger.info(chalk.bold('\nSTEP 3/7: Interview\n'));
      const preferredPlatforms = expandAllPlatforms(normalizePlatforms(parseList(options.platforms)));
      answers = await interviewer.ask(recommendations, {
        detection,
        preferredPlatforms
      });
      
      if (options.backup === false) {
        answers.createBackup = false;
      }
    }
    
    // STEP 4: BACKUP (optional)
    if (answers.createBackup) {
      logger.info(chalk.bold('\n💾 STEP 4/7: Backup\n'));
      try {
        const bmadPath = path.join(projectRoot, '_bmad');
        const backup = await backuper.backup(bmadPath);
        logger.info(`✓ Backup created: ${chalk.cyan(backup.backupPath)}`);
      } catch (error) {
        logger.warn(`⚠ Backup failed (non-critical): ${error.message}`);
      }
    } else {
      logger.info(chalk.bold('\n⏭️  STEP 4/7: Backup (skipped)\n'));
    }
    
    // STEP 5: INSTALL - Core Installation
    logger.info(chalk.bold('\n🚀 STEP 5/7: Installation\n'));
    const installResult = await installer.install({
      projectRoot,
      agents: answers.agents,
      targetPlatforms: answers.targetPlatforms,
      userName: answers.userName,
      language: answers.language,
      mode: answers.mode
    });
    
    logger.info(`✓ Installed ${chalk.cyan(installResult.agentsInstalled)} agents`);
    if (installResult.errors && installResult.errors.length > 0) {
      logger.warn(`⚠ ${installResult.errors.length} installation errors`);
    }
    
    // STEP 6: VALIDATE - 10 Automated Checks
    logger.info(chalk.bold('\n✅ STEP 6/7: Validation\n'));
    const validation = await validator.validate({ projectRoot });
    
    if (validation.valid) {
      logger.info(chalk.green('✓ All validation checks passed!'));
    } else {
      logger.warn(chalk.yellow(`⚠ ${validation.errors.length} errors, ${validation.warnings.length} warnings`));
      if (validation.errors.length > 0) {
        validation.errors.forEach(err => logger.error(`  ✗ ${err}`));
      }
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warn => logger.warn(`  ⚠ ${warn}`));
      }
    }
    
    // STEP 7: WIZARD - Post-Install Actions
    if (isSilent || forceSilent) {
      logger.info(chalk.bold('\nSTEP 7/7: Post-Install Wizard (skipped - silent)\n'));
    } else {
      logger.info(chalk.bold('\nSTEP 7/7: Post-Install Wizard\n'));
      await wizard.show({
        agents: answers.agents,
        targetPlatforms: answers.targetPlatforms,
        mode: answers.mode,
        projectRoot,
        userName: answers.userName,
        language: answers.language
      });
    }
    
  } catch (error) {
    logger.error(chalk.red('\n❌ Installation failed:\n'));
    logger.error(error.message);
    if (error.stack) {
      logger.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// CLI Program
program
  .name('create-byan-agent')
  .description('YANSTALLER - Intelligent installer for BYAN ecosystem (29 agents, multi-platform)')
  .version(YANSTALLER_VERSION)
  .option('--silent', 'Silent installation (no prompts)')
  .option('--interactive', 'Force interactive prompts even without TTY')
  .option('--agents <agents>', 'Comma-separated list of agents to install')
  .option('--platforms <platforms>', 'Comma-separated list of platforms (copilot-cli,vscode,claude-code,codex)')
  .option('--mode <mode>', 'Installation mode: recommended, custom, minimal, full')
  .option('--no-backup', 'Skip pre-install backup')
  .option('--dry-run', 'Simulate installation without making changes')
  .option('--verbose', 'Verbose logging')
  .action((opts) => main(opts));

program.parse(process.argv);
