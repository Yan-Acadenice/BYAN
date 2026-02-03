/**
 * INTERVIEWER Module
 * 
 * Conducts quick interview (5-7 questions, <5 min) to personalize installation.
 * 
 * Phase 6 (part of 7): 16h development
 * 
 * @module yanstaller/interviewer
 */

const inquirer = require('inquirer');

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
async function ask(recommendation) {
  // TODO: Implement inquirer prompts
  // Q1: Your name?
  // Q2: Preferred language?
  // Q3: Installation mode? (with recommendation)
  // Q4: (if custom) Which agents?
  // Q5: Which platforms to install on?
  // Q6: Create sample agent after install?
  
  return {
    userName: 'User',
    language: 'English',
    mode: recommendation.mode,
    agents: recommendation.agents,
    targetPlatforms: ['copilot-cli'],
    createSampleAgent: false
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
  // TODO: Return all 29 agents with descriptions
  return [
    { name: 'BYAN - Agent Creator', value: 'byan', checked: true },
    { name: 'RACHID - NPM Deployment', value: 'rachid', checked: true },
    // ... 27 more
  ];
}

module.exports = {
  ask,
  askQuestion,
  getAgentChoices
};
