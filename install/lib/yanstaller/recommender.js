/**
 * RECOMMENDER Module
 * 
 * Analyzes project and recommends optimal BYAN configuration.
 * 
 * Phase 2: 24h development
 * 
 * @module yanstaller/recommender
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');

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
  const projectRoot = process.cwd();
  
  // 1. Analyze project type
  let projectType = 'unknown';
  let framework = 'unknown';
  
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (await fileUtils.exists(packageJsonPath)) {
    const analysis = await analyzePackageJson(packageJsonPath);
    projectType = detectProjectType(analysis);
    framework = analysis.framework;
  }
  
  // 2. Recommend agents based on type + platforms
  const agents = getRecommendedAgents(projectType, detection.platforms);
  
  // 3. Determine mode
  const mode = agents.length > 10 ? 'full' : 'minimal';
  
  // 4. Generate rationale
  const reason = generateRationale(projectType, framework, agents, detection);
  
  return {
    mode,
    agents,
    reason,
    projectType
  };
}

/**
 * Analyze package.json to detect stack
 * 
 * @param {string} packageJsonPath - Path to package.json
 * @returns {Promise<{isFrontend: boolean, isBackend: boolean, framework: string, deps: Object}>}
 */
async function analyzePackageJson(packageJsonPath) {
  try {
    const pkg = await fileUtils.readJSON(packageJsonPath);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    const isFrontend = hasAny(deps, [
      'react', 'react-dom', 
      'vue', '@vue/cli',
      'angular', '@angular/core',
      'svelte', '@sveltejs/kit',
      'next', 'nuxt',
      'gatsby', 'astro'
    ]);
    
    const isBackend = hasAny(deps, [
      'express', 'fastify', 'koa', 'hapi',
      'nestjs', '@nestjs/core',
      'apollo-server', 'graphql',
      'prisma', 'typeorm', 'sequelize',
      'mongoose'
    ]);
    
    const framework = detectFramework(deps);
    
    return {
      isFrontend,
      isBackend,
      framework,
      deps
    };
  } catch (error) {
    // File read error or invalid JSON
    return {
      isFrontend: false,
      isBackend: false,
      framework: 'unknown',
      deps: {}
    };
  }
}

/**
 * Detect project type from analysis
 * 
 * @param {Object} analysis - Package.json analysis
 * @returns {string} - 'frontend' | 'backend' | 'fullstack' | 'library' | 'unknown'
 */
function detectProjectType(analysis) {
  if (analysis.isFrontend && analysis.isBackend) {
    return 'fullstack';
  }
  if (analysis.isFrontend) {
    return 'frontend';
  }
  if (analysis.isBackend) {
    return 'backend';
  }
  
  // Check if it's a library (no UI dependencies, has build tools)
  if (hasAny(analysis.deps, ['typescript', 'rollup', 'webpack', 'vite', 'tsup'])) {
    return 'library';
  }
  
  return 'unknown';
}

/**
 * Detect framework from dependencies
 * 
 * @param {Object} deps - Package dependencies
 * @returns {string} - Framework name or 'unknown'
 */
function detectFramework(deps) {
  const frameworks = {
    'react': 'React',
    'react-dom': 'React',
    'next': 'Next.js',
    'vue': 'Vue',
    '@vue/cli': 'Vue',
    'nuxt': 'Nuxt',
    'angular': 'Angular',
    '@angular/core': 'Angular',
    'svelte': 'Svelte',
    '@sveltejs/kit': 'SvelteKit',
    'express': 'Express',
    'fastify': 'Fastify',
    'nestjs': 'NestJS',
    '@nestjs/core': 'NestJS',
    'gatsby': 'Gatsby',
    'astro': 'Astro'
  };
  
  for (const [dep, framework] of Object.entries(frameworks)) {
    if (deps[dep]) {
      return framework;
    }
  }
  
  return 'unknown';
}

/**
 * Get recommended agents based on project type
 * 
 * @param {string} projectType - Project type
 * @param {Array} platforms - Detected platforms
 * @returns {string[]} - Agent names
 */
function getRecommendedAgents(projectType, platforms) {
  const baseAgents = ['byan', 'rachid', 'patnote', 'carmack'];
  
  // Add MARC if Copilot CLI detected
  if (platforms.some(p => p.name === 'copilot-cli' && p.detected)) {
    baseAgents.push('marc');
  }
  
  const recommendations = {
    frontend: [...baseAgents, 'ux-designer', 'dev', 'quinn'],
    backend: [...baseAgents, 'architect', 'dev', 'quinn'],
    fullstack: [...baseAgents, 'architect', 'dev', 'ux-designer', 'quinn', 'pm'],
    library: [...baseAgents, 'dev', 'tech-writer', 'quinn'],
    unknown: baseAgents
  };
  
  return recommendations[projectType] || baseAgents;
}

/**
 * Generate rationale for recommendation
 * 
 * @param {string} projectType - Project type
 * @param {string} framework - Framework name
 * @param {string[]} agents - Recommended agents
 * @param {Object} detection - Detection results
 * @returns {string} - Rationale text
 */
function generateRationale(projectType, framework, agents, detection) {
  const reasons = [];
  
  // Project type specific
  switch (projectType) {
    case 'frontend':
      reasons.push(`Frontend project${framework !== 'unknown' ? ` (${framework})` : ''} benefits from UX design guidance`);
      break;
    case 'backend':
      reasons.push(`Backend project${framework !== 'unknown' ? ` (${framework})` : ''} benefits from architecture patterns`);
      break;
    case 'fullstack':
      reasons.push(`Fullstack project${framework !== 'unknown' ? ` (${framework})` : ''} needs both frontend and backend expertise`);
      break;
    case 'library':
      reasons.push('Library project benefits from documentation and testing focus');
      break;
    default:
      reasons.push('Default configuration for general projects');
  }
  
  // Platform specific
  const copilotDetected = detection.platforms.some(p => p.name === 'copilot-cli' && p.detected);
  if (copilotDetected) {
    reasons.push('MARC agent included for Copilot CLI integration');
  }
  
  // Agent specific
  if (agents.includes('dev')) {
    reasons.push('DEV agent accelerates implementation with code generation');
  }
  if (agents.includes('quinn')) {
    reasons.push('QUINN ensures test coverage and quality assurance');
  }
  if (agents.includes('architect')) {
    reasons.push('ARCHITECT provides design patterns and system architecture');
  }
  
  return reasons.join('. ') + '.';
}

/**
 * Check if any of the keys exist in object
 * 
 * @param {Object} obj - Object to check
 * @param {string[]} keys - Keys to look for
 * @returns {boolean}
 */
function hasAny(obj, keys) {
  return keys.some(key => obj[key]);
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
  getAgentList,
  detectProjectType,
  detectFramework,
  getRecommendedAgents,
  generateRationale
};
