/**
 * RECOMMENDER Module
 * 
 * Analyzes project and recommends optimal BYAN configuration.
 * 
 * Phase 2: 24h development
 * 
 * @module yanstaller/recommender
 */

/**
 * @typedef {Object} Recommendation
 * @property {string} mode - 'full' | 'minimal' | 'custom'
 * @property {string[]} agents - Recommended agent names
 * @property {string} reason - Why this recommendation
 * @property {string} projectType - 'frontend' | 'backend' | 'fullstack' | 'library' | 'unknown'
 */

/**
 * Analyze project and recommend configuration
 * 
 * @param {import('./detector').DetectionResult} detection - Detection results
 * @returns {Promise<Recommendation>}
 */
async function recommend(detection) {
  // TODO: Implement recommendation logic
  // - Analyze package.json, requirements.txt, go.mod, etc.
  // - Detect project type (frontend/backend/fullstack)
  // - Recommend agents based on stack
  
  return {
    mode: 'minimal',
    agents: ['byan', 'rachid', 'marc', 'patnote', 'carmack'],
    reason: 'Default minimal installation for new users',
    projectType: 'unknown'
  };
}

/**
 * Analyze package.json to detect stack
 * 
 * @param {string} packageJsonPath - Path to package.json
 * @returns {Promise<{isFrontend: boolean, isBackend: boolean, framework: string}>}
 */
async function analyzePackageJson(packageJsonPath) {
  // TODO: Read package.json, check dependencies
  // - React/Vue/Angular → frontend
  // - Express/Fastify/Nest → backend
  
  return {
    isFrontend: false,
    isBackend: false,
    framework: 'unknown'
  };
}

/**
 * Get agent list for installation mode
 * 
 * @param {string} mode - 'full' | 'minimal' | 'custom'
 * @param {string[]} [customAgents] - Custom agent selection
 * @returns {string[]}
 */
function getAgentList(mode, customAgents = []) {
  const MINIMAL_AGENTS = ['byan', 'rachid', 'marc', 'patnote', 'carmack'];
  const FULL_AGENTS = [
    // Core (5)
    'byan', 'rachid', 'marc', 'patnote', 'carmack',
    // BMM (9)
    'analyst', 'pm', 'architect', 'dev', 'sm', 'quinn', 'ux-designer', 'tech-writer', 'quick-flow-solo-dev',
    // BMB (3)
    'agent-builder', 'module-builder', 'workflow-builder',
    // TEA (1)
    'tea',
    // CIS (6)
    'brainstorming-coach', 'creative-problem-solver', 'design-thinking-coach', 
    'innovation-strategist', 'presentation-master', 'storyteller',
    // BYAN Test (1)
    'byan-test'
  ];
  
  switch (mode) {
    case 'full':
      return FULL_AGENTS;
    case 'minimal':
      return MINIMAL_AGENTS;
    case 'custom':
      return customAgents;
    default:
      return MINIMAL_AGENTS;
  }
}

module.exports = {
  recommend,
  analyzePackageJson,
  getAgentList
};
