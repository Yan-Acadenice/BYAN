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
const logger = require('../utils/logger');

/**
 * Show post-install wizard
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function show(config) {
  logger.success('\n✅ BYAN installed successfully!\n');
  
  const choices = [
    { name: '🎨 Create your first agent (BYAN interview)', value: 'create' },
    { name: '🧪 Test an installed agent', value: 'test' },
    { name: '🚪 Exit (start using BYAN)', value: 'exit' }
  ];
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do next?',
      choices
    }
  ]);
  
  switch (answer.action) {
    case 'create':
      await launchByanInterview();
      break;
    case 'test':
      await testAgent(config);
      break;
    case 'exit':
      showExitMessage(config);
      break;
  }
}

/**
 * Launch BYAN intelligent interview
 * 
 * @returns {Promise<void>}
 */
async function launchByanInterview() {
  logger.info('\nLaunching BYAN intelligent interview...');
  // TODO: Exec `@bmad-agent-byan` or similar
  logger.info('To create an agent, run: @bmad-agent-byan');
}

/**
 * Test installed agent
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function testAgent(config) {
  const agentChoices = config.agents.map(name => ({
    name: `@bmad-agent-${name}`,
    value: name
  }));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'agent',
      message: 'Which agent would you like to test?',
      choices: agentChoices
    }
  ]);
  
  logger.info(`\nTo activate ${answer.agent}, run: @bmad-agent-${answer.agent}`);
}

/**
 * Show exit message with next steps
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 */
function showExitMessage(config) {
  logger.info('\n🎉 You\'re all set! Here\'s how to get started:\n');
  logger.info('1. Activate an agent:');
  logger.info('   @bmad-agent-byan    (Create new agents)');
  logger.info('   @bmad-agent-bmm-pm  (Project management)');
  logger.info('   @bmad-agent-bmm-dev (Development)\n');
  logger.info('2. Get help anytime:');
  logger.info('   /bmad-help\n');
  logger.info('3. Documentation:');
  logger.info('   Check _bmad/README.md\n');
  logger.info('Happy building! 🚀\n');
}

module.exports = {
  show,
  launchByanInterview,
  testAgent,
  showExitMessage
};
