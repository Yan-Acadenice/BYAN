/**
 * Config Loader Utility
 * 
 * Loads configuration files with variable resolution.
 * 
 * @module utils/config-loader
 */

const path = require('path');
const yamlUtils = require('./yaml-utils');

/**
 * Load config file and resolve variables
 * 
 * @param {string} configPath - Path to config.yaml
 * @param {Object} context - Context for variable resolution
 * @returns {Promise<Object>}
 */
async function loadConfig(configPath, context = {}) {
  const config = await yamlUtils.readYAML(configPath);
  return resolveVariables(config, context);
}

/**
 * Resolve variables in config object
 * 
 * @param {Object} config - Config object
 * @param {Object} context - Context for variable resolution
 * @returns {Object}
 */
function resolveVariables(config, context) {
  const resolved = {};
  
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      resolved[key] = resolveVariable(value, context);
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveVariables(value, context);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Resolve single variable string
 * 
 * @param {string} value - Value with potential variables
 * @param {Object} context - Context for variable resolution
 * @returns {string}
 */
function resolveVariable(value, context) {
  let resolved = value;
  
  // Replace {project-root}
  if (context.projectRoot) {
    resolved = resolved.replace(/\{project-root\}/g, context.projectRoot);
  }
  
  // Replace {output_folder}
  if (context.outputFolder) {
    resolved = resolved.replace(/\{output_folder\}/g, context.outputFolder);
  }
  
  // Replace {user_name}
  if (context.userName) {
    resolved = resolved.replace(/\{user_name\}/g, context.userName);
  }
  
  return resolved;
}

module.exports = {
  loadConfig,
  resolveVariables,
  resolveVariable
};
