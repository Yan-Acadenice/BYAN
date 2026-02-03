/**
 * WIZARD Module
 * 
 * Post-installation wizard with 3 options: Create agent / Test / Exit.
 * 
 * Phase 7: 16h development
 * 
 * @module yanstaller/wizard
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const logger = require('../utils/logger');

/**
 * Show post-install wizard
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function show(config) {
  logger.info('');
  logger.info(chalk.green.bold('✅ BYAN INSTALLATION COMPLETE!'));
  logger.info('');
  logger.info(chalk.gray('═'.repeat(60)));
  logger.info('');
  
  // Show installation summary
  logger.info(chalk.bold('📊 Installation Summary:'));
  logger.info(`   • Agents installed: ${chalk.cyan(config.agents.length)}`);
  logger.info(`   • Platforms: ${chalk.cyan(config.targetPlatforms.join(', '))}`);
  logger.info(`   • Mode: ${chalk.cyan(config.mode)}`);
  logger.info(`   • Location: ${chalk.gray(config.projectRoot)}`);
  logger.info('');
  
  const choices = [
    { 
      name: '🎨 Create your first agent (BYAN intelligent interview)', 
      value: 'create',
      description: 'Launch BYAN to create a custom agent'
    },
    { 
      name: '🧪 Test an installed agent', 
      value: 'test',
      description: 'Verify agent activation'
    },
    { 
      name: '📚 View documentation', 
      value: 'docs',
      description: 'Open README and guides'
    },
    { 
      name: '🚪 Exit (start using BYAN)', 
      value: 'exit',
      description: 'Show quick start guide and exit'
    }
  ];
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do next?',
      choices,
      pageSize: 5
    }
  ]);
  
  logger.info('');
  
  switch (answer.action) {
    case 'create':
      await launchByanInterview(config);
      break;
    case 'test':
      await testAgent(config);
      break;
    case 'docs':
      showDocumentation(config);
      break;
    case 'exit':
      showExitMessage(config);
      break;
  }
}

/**
 * Launch BYAN intelligent interview
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function launchByanInterview(config) {
  logger.info(chalk.bold('🏗️  Launching BYAN Agent Creator...\n'));
  
  logger.info('BYAN will guide you through creating a custom agent.');
  logger.info('The interview takes 30-45 minutes and covers:\n');
  logger.info('  1️⃣  Project context & goals');
  logger.info('  2️⃣  Business domain & glossary');
  logger.info('  3️⃣  Agent capabilities & style');
  logger.info('  4️⃣  Validation & refinement\n');
  
  logger.info(chalk.cyan('To start, run:'));
  logger.info(chalk.bold('  @bmad-agent-byan\n'));
  
  logger.info(chalk.gray('Press any key to continue...'));
}

/**
 * Test installed agent
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function testAgent(config) {
  if (!config.agents || config.agents.length === 0) {
    logger.warn('No agents installed. Install agents first.\n');
    return;
  }
  
  const agentChoices = config.agents.map(name => ({
    name: `@bmad-agent-${name}`,
    value: name
  }));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'agent',
      message: 'Which agent would you like to test?',
      choices: agentChoices,
      pageSize: 10
    }
  ]);
  
  logger.info('');
  logger.info(chalk.bold(`🧪 Testing: @bmad-agent-${answer.agent}\n`));
  logger.info(chalk.cyan('To activate this agent, run:'));
  logger.info(chalk.bold(`  @bmad-agent-${answer.agent}\n`));
  
  logger.info(chalk.gray('The agent should:'));
  logger.info(chalk.gray('  ✓ Display welcome message'));
  logger.info(chalk.gray('  ✓ Show menu with options'));
  logger.info(chalk.gray('  ✓ Wait for your input\n'));
}

/**
 * Show documentation guide
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 */
function showDocumentation(config) {
  logger.info(chalk.bold('📚 BYAN Documentation\n'));
  
  logger.info(chalk.cyan('Core Documentation:'));
  logger.info(`  • README: ${chalk.gray('_bmad/README.md')}`);
  logger.info(`  • Quick Start: ${chalk.gray('_bmad/QUICK-START.md')}`);
  logger.info(`  • Module Help: ${chalk.gray('_bmad/{module}/module-help.csv')}\n`);
  
  logger.info(chalk.cyan('Module Guides:'));
  logger.info(`  • BMB (Builders): ${chalk.gray('_bmad/bmb/README.md')}`);
  logger.info(`  • BMM (Development): ${chalk.gray('_bmad/bmm/README.md')}`);
  logger.info(`  • TEA (Testing): ${chalk.gray('_bmad/tea/README.md')}`);
  logger.info(`  • CIS (Innovation): ${chalk.gray('_bmad/cis/README.md')}\n`);
  
  logger.info(chalk.cyan('Online Resources:'));
  logger.info(`  • GitHub: ${chalk.gray('https://github.com/byan-platform')}`);
  logger.info(`  • Docs: ${chalk.gray('https://byan.dev/docs')}\n`);
  
  logger.info(chalk.cyan('Get Help:'));
  logger.info('  • Type /bmad-help in any conversation');
  logger.info('  • Activate @bmad-agent-bmad-master for guidance\n');
}

/**
 * Show exit message with next steps
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 */
function showExitMessage(config) {
  logger.info(chalk.green.bold('🎉 You\'re all set!\n'));
  logger.info(chalk.bold('Quick Start Guide:\n'));
  
  logger.info(chalk.cyan('1. Activate an agent:'));
  logger.info('   ' + chalk.bold('@bmad-agent-byan') + '     Create new agents');
  logger.info('   ' + chalk.bold('@bmad-agent-bmm-pm') + '   Project management');
  logger.info('   ' + chalk.bold('@bmad-agent-bmm-dev') + '  Development\n');
  
  logger.info(chalk.cyan('2. Get help anytime:'));
  logger.info('   ' + chalk.bold('/bmad-help') + '           Contextual advice\n');
  
  logger.info(chalk.cyan('3. Explore workflows:'));
  logger.info('   ' + chalk.bold('@bmad-bmm-create-prd') + '  Start a new project\n');
  
  logger.info(chalk.cyan('4. Documentation:'));
  logger.info('   Check ' + chalk.gray('_bmad/README.md') + ' for details\n');
  
  logger.info(chalk.gray('═'.repeat(60)));
  logger.info(chalk.yellow('💡 Tip: Use @bmad-party-mode for multi-agent brainstorming!'));
  logger.info(chalk.gray('═'.repeat(60)));
  logger.info('');
  logger.info(chalk.bold('Happy building! 🚀\n'));
}

module.exports = {
  show,
  launchByanInterview,
  testAgent,
  showDocumentation,
  showExitMessage
};
