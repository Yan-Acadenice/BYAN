/**
 * INTERVIEWER Module
 * 
 * Conducts quick interview (5-7 questions, <5 min) to personalize installation.
 * 
 * Phase 7: 16h development
 * 
 * @module yanstaller/interviewer
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const logger = require('../utils/logger');

function normalizePlatformName(name) {
  if (!name) return name;
  const lower = String(name).toLowerCase();
  if (lower === 'claude') return 'claude-code';
  return lower;
}

function buildDefaultPlatforms(options = {}) {
  const preferred = Array.isArray(options.preferredPlatforms)
    ? options.preferredPlatforms.map(normalizePlatformName).filter(Boolean)
    : [];
  
  if (preferred.length > 0) return preferred;
  
  const detected = (options.detection && Array.isArray(options.detection.platforms))
    ? options.detection.platforms
        .filter(p => p.detected)
        .map(p => normalizePlatformName(p.name))
        .filter(Boolean)
    : [];
  
  return detected;
}

/**
 * @typedef {Object} InterviewResult
 * @property {string} userName
 * @property {string} language - 'Francais' | 'English'
 * @property {string} mode - 'full' | 'minimal' | 'custom'
 * @property {string[]} agents - Selected agents (if custom mode)
 * @property {string[]} targetPlatforms - Platforms to install on
 * @property {boolean} createSampleAgent - Whether to create sample agent after install
 */

/**
 * Run quick interview
 * 
 * @param {import('./recommender').Recommendation} recommendation - Recommended config
 * @returns {Promise<InterviewResult>}
 */
async function ask(recommendation, options = {}) {
  logger.info(chalk.bold('\n🎙️  YANSTALLER Quick Interview\n'));
  logger.info('Just 5-7 questions to personalize your BYAN installation (<5 min)\n');
  
  // Q1: Your name
  const nameAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'What\'s your name?',
      default: 'Developer',
      validate: (input) => input.trim().length > 0 || 'Name cannot be empty'
    }
  ]);
  
  // Q2: Preferred language
  const langAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Preferred communication language?',
      choices: [
        { name: 'English', value: 'English' },
        { name: 'Français', value: 'Francais' }
      ],
      default: 'English'
    }
  ]);
  
  // Q3: Installation mode (with recommendation)
  const recommendedMode = recommendation ? recommendation.mode : 'recommended';
  const modeChoices = [
    {
      name: `Recommended - Based on your project (${recommendation ? recommendation.agents.length : 7} agents)`,
      value: 'recommended',
      description: 'Best for most users'
    },
    {
      name: 'Minimal - Essential agents only (4 agents)',
      value: 'minimal',
      description: 'Fastest installation'
    },
    {
      name: 'Full - All 29 agents',
      value: 'full',
      description: 'Complete BMAD platform'
    },
    {
      name: 'Custom - Choose specific agents',
      value: 'custom',
      description: 'Advanced users'
    }
  ];
  
  const modeAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Installation mode?',
      choices: modeChoices,
      default: recommendedMode
    }
  ]);
  
  // Q4: Agent selection (if custom mode)
  let selectedAgents = [];
  if (modeAnswer.mode === 'custom') {
    const agentAnswer = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'agents',
        message: 'Select agents to install:',
        choices: getAgentChoices(),
        pageSize: 15,
        validate: (input) => input.length > 0 || 'Select at least one agent'
      }
    ]);
    selectedAgents = agentAnswer.agents;
  } else if (modeAnswer.mode === 'recommended' && recommendation) {
    selectedAgents = recommendation.agents;
  } else if (modeAnswer.mode === 'minimal') {
    selectedAgents = ['byan', 'rachid', 'dev', 'tech-writer'];
  } else if (modeAnswer.mode === 'full') {
    selectedAgents = getAllAgents();
  }
  
  // Q5: Target platforms
  const defaultPlatforms = buildDefaultPlatforms(options);
  const useDefaultPlatforms = defaultPlatforms.length > 0;
  const isDefault = (value, fallback) => useDefaultPlatforms ? defaultPlatforms.includes(value) : fallback;
  
  const platformAnswer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'platforms',
      message: 'Which platforms to install on?',
      choices: [
        { name: 'All detected platforms', value: '__all_detected__', checked: false },
        { name: 'GitHub Copilot CLI (.github/agents/)', value: 'copilot-cli', checked: isDefault('copilot-cli', true) },
        { name: 'VSCode Copilot Extension', value: 'vscode', checked: isDefault('vscode', true) },
        { name: 'Codex (.codex/prompts/)', value: 'codex', checked: isDefault('codex', false) },
        { name: 'Claude Code (MCP server)', value: 'claude-code', checked: isDefault('claude-code', false) }
      ],
      validate: (input) => input.length > 0 || 'Select at least one platform'
    }
  ]);

  let selectedPlatforms = platformAnswer.platforms;
  if (selectedPlatforms.includes('__all_detected__')) {
    const detected = buildDefaultPlatforms(options);
    selectedPlatforms = detected.length > 0
      ? detected
      : ['copilot-cli', 'vscode', 'codex', 'claude-code'];
  }
  
  const isFrench = langAnswer.language === 'Francais';
  const platformSummary = selectedPlatforms.join(', ');
  if (isFrench) {
    logger.info(`Plateformes retenues: ${platformSummary}`);
  } else {
    logger.info(`Selected platforms: ${platformSummary}`);
  }
  
  // Q6: Create sample agent
  const sampleAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createSample',
      message: 'Launch BYAN agent creator after installation?',
      default: false
    }
  ]);
  
  // Q7: Create backup (optional)
  const backupAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createBackup',
      message: 'Create backup of existing _bmad/ directory? (if exists)',
      default: true
    }
  ]);
  
  logger.info('');
  
  return {
    userName: nameAnswer.userName,
    language: langAnswer.language,
    mode: modeAnswer.mode,
    agents: selectedAgents,
    targetPlatforms: selectedPlatforms,
    createSampleAgent: sampleAnswer.createSample,
    createBackup: backupAnswer.createBackup
  };
}

/**
 * Ask single question
 * 
 * @param {string} question - Question text
 * @param {string} type - 'input' | 'list' | 'confirm' | 'checkbox'
 * @param {Array} [choices] - Choices for list/checkbox
 * @returns {Promise<any>}
 */
async function askQuestion(question, type, choices = []) {
  // TODO: Use inquirer
  const answer = await inquirer.prompt([
    {
      type,
      name: 'answer',
      message: question,
      choices
    }
  ]);
  
  return answer.answer;
}

/**
 * Get available agents list for custom selection
 * 
 * @returns {Array<{name: string, value: string, checked: boolean}>}
 */
function getAgentChoices() {
  return [
    // BMB Module - Builders
    { name: '🏗️  BYAN - Agent Creator & Intelligent Interview', value: 'byan', checked: true },
    { name: '📦 RACHID - NPM/NPX Deployment Specialist', value: 'rachid', checked: true },
    { name: '🔧 Agent Builder - Direct agent creation', value: 'agent-builder', checked: false },
    { name: '📋 Module Builder - Module scaffolding', value: 'module-builder', checked: false },
    { name: '🔄 Workflow Builder - Workflow creation', value: 'workflow-builder', checked: false },
    
    // BMM Module - Development Team
    { name: '🔍 MARY (Analyst) - Requirements & Domain Expert', value: 'analyst', checked: false },
    { name: '📊 JOHN (PM) - Product Management', value: 'pm', checked: false },
    { name: '🏛️  WINSTON (Architect) - System Architecture', value: 'architect', checked: false },
    { name: '💻 AMELIA (Dev) - Implementation Specialist', value: 'dev', checked: true },
    { name: '📋 BOB (SM) - Scrum Master', value: 'sm', checked: false },
    { name: '🧪 QUINN (QA) - Quality Assurance', value: 'quinn', checked: false },
    { name: '🎨 SALLY (UX) - UX/UI Design', value: 'ux-designer', checked: false },
    { name: '📝 PAIGE (Tech Writer) - Documentation', value: 'tech-writer', checked: true },
    
    // TEA Module - Testing
    { name: '🧬 MURAT (TEA) - Test Architecture Expert', value: 'tea', checked: false },
    
    // CIS Module - Innovation
    { name: '💡 CARSON - Brainstorming Coach', value: 'brainstorming-coach', checked: false },
    { name: '🎯 DR. QUINN - Design Thinking Coach', value: 'design-thinking-coach', checked: false },
    { name: '🧩 MAYA - Creative Problem Solver', value: 'creative-problem-solver', checked: false },
    { name: '🚀 VICTOR - Innovation Strategist', value: 'innovation-strategist', checked: false },
    { name: '📽️  Presentation Master', value: 'presentation-master', checked: false },
    { name: '📖 Storyteller', value: 'storyteller', checked: false },
    
    // Core Module
    { name: '🎭 Party Mode - Multi-agent orchestration', value: 'party-mode', checked: false },
    { name: '🧠 BMAD Master - Platform orchestrator', value: 'bmad-master', checked: false },
    
    // Specialized
    { name: '🔌 MARC - GitHub Copilot CLI Integration', value: 'marc', checked: false },
    { name: '📌 PATNOTE - Update Manager', value: 'patnote', checked: false },
    
    // Quick Flow Variants
    { name: '⚡ Quick Flow Solo Dev', value: 'quick-flow-solo-dev', checked: false }
  ];
}

/**
 * Get all agent names
 * 
 * @returns {string[]}
 */
function getAllAgents() {
  return getAgentChoices().map(choice => choice.value);
}

module.exports = {
  ask,
  askQuestion,
  getAgentChoices,
  getAllAgents
};
