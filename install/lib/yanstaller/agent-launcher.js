/**
 * AGENT LAUNCHER Module
 * 
 * Launches specialist agents using native platform commands.
 * Each platform has its own invocation syntax.
 * 
 * @module yanstaller/agent-launcher
 */

const { execSync, spawn } = require('child_process');
const logger = require('../utils/logger');

/**
 * @typedef {Object} LaunchOptions
 * @property {string} agent - Agent name (e.g., 'claude', 'marc')
 * @property {string} platform - Platform ID (e.g., 'copilot-cli', 'claude')
 * @property {string} [prompt] - Initial prompt/action
 * @property {string} [model] - Model to use
 * @property {Object} [config] - Additional config
 */

/**
 * @typedef {Object} LaunchResult
 * @property {boolean} success
 * @property {string} method - How agent was launched
 * @property {string} [output] - Command output
 * @property {string} [error] - Error message if failed
 */

/**
 * Platform-specific launch configurations
 */
const LAUNCH_CONFIGS = {
  'copilot-cli': {
    command: 'gh',
    args: (agent, options) => {
      const args = ['copilot'];
      
      // Use @agent syntax if available
      if (agent) {
        args.push(`@bmad-agent-${agent}`);
      }
      
      if (options.prompt) {
        args.push(options.prompt);
      }
      
      return args;
    },
    checkAvailable: () => {
      try {
        execSync('which gh', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  },
  
  'claude': {
    command: 'claude',
    args: (agent, options = {}) => {
      const args = [];
      
      // Agent specification
      if (agent) {
        args.push('--agent', agent);
      }
      
      // Model selection
      if (options.model) {
        args.push('--model', options.model);
      }
      
      // System prompt for context (before positional prompt)
      if (options.systemPrompt) {
        args.push('--system-prompt', options.systemPrompt);
      }
      
      // MCP config if needed
      if (options.mcpConfig) {
        args.push('--mcp-config', options.mcpConfig);
      }
      
      // Prompt as POSITIONAL argument (not --prompt)
      // Must come AFTER all flags
      if (options.prompt) {
        args.push(options.prompt);
      }
      
      return args;
    },
    checkAvailable: () => {
      try {
        execSync('which claude', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  },
  
  'codex': {
    command: 'codex',
    args: (agent, options) => {
      // TODO: Implement when Codex integration is ready
      return [];
    },
    checkAvailable: () => {
      try {
        execSync('which codex', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  }
};

/**
 * Launch agent using native platform command
 * 
 * @param {LaunchOptions} options - Launch options
 * @returns {Promise<LaunchResult>}
 */
async function launch(options) {
  const { agent, platform, prompt, model, config } = options;
  
  const platformConfig = LAUNCH_CONFIGS[platform];
  
  if (!platformConfig) {
    return {
      success: false,
      method: 'unsupported',
      error: `Platform ${platform} not supported for native launch`
    };
  }
  
  // Check if platform command is available
  if (!platformConfig.checkAvailable()) {
    return {
      success: false,
      method: 'command-not-found',
      error: `Command '${platformConfig.command}' not found in PATH`
    };
  }
  
  // Build command arguments
  const args = platformConfig.args(agent, {
    prompt,
    model,
    systemPrompt: config?.systemPrompt,
    mcpConfig: config?.mcpConfig
  });
  
  const fullCommand = `${platformConfig.command} ${args.join(' ')}`;
  
  logger.info(`Launching agent via: ${fullCommand}`);
  
  try {
    // Launch in interactive mode (inherit stdio)
    const result = spawn(platformConfig.command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    return new Promise((resolve) => {
      result.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            method: 'native-interactive',
            output: `Agent launched successfully via ${platform}`
          });
        } else {
          resolve({
            success: false,
            method: 'native-interactive',
            error: `Agent exited with code ${code}`
          });
        }
      });
      
      result.on('error', (error) => {
        resolve({
          success: false,
          method: 'native-interactive',
          error: error.message
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      method: 'native-interactive',
      error: error.message
    };
  }
}

/**
 * Launch agent with specific prompt (non-interactive)
 * 
 * Useful for automation or scripted workflows.
 * 
 * @param {LaunchOptions} options - Launch options
 * @returns {Promise<LaunchResult>}
 */
async function launchWithPrompt(options) {
  const { agent, platform, prompt, model, config } = options;
  
  if (!prompt) {
    throw new Error('Prompt required for non-interactive launch');
  }
  
  const platformConfig = LAUNCH_CONFIGS[platform];
  
  if (!platformConfig) {
    return {
      success: false,
      method: 'unsupported',
      error: `Platform ${platform} not supported`
    };
  }
  
  if (!platformConfig.checkAvailable()) {
    return {
      success: false,
      method: 'command-not-found',
      error: `Command '${platformConfig.command}' not found`
    };
  }
  
  const args = platformConfig.args(agent, {
    prompt,
    model,
    systemPrompt: config?.systemPrompt
  });
  
  // Add --print flag for Claude to get output
  if (platform === 'claude') {
    args.unshift('--print');
  }
  
  const fullCommand = `${platformConfig.command} ${args.join(' ')}`;
  
  logger.info(`Executing: ${fullCommand}`);
  
  try {
    const output = execSync(fullCommand, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    return {
      success: true,
      method: 'native-print',
      output: output.trim()
    };
  } catch (error) {
    return {
      success: false,
      method: 'native-print',
      error: error.message
    };
  }
}

/**
 * Generate launch instructions for manual invocation
 * 
 * Used as fallback when native launch isn't possible.
 * 
 * @param {LaunchOptions} options - Launch options
 * @returns {string} - Human-readable instructions
 */
function getLaunchInstructions(options) {
  const { agent, platform, prompt, model } = options;
  
  const platformConfig = LAUNCH_CONFIGS[platform];
  
  if (!platformConfig) {
    return `Platform ${platform} not yet supported for automated launch.\nPlease activate the agent manually.`;
  }
  
  const args = platformConfig.args(agent, { prompt, model });
  const command = `${platformConfig.command} ${args.join(' ')}`;
  
  return `
To activate the agent, run:

  ${command}

Or in interactive mode:
  ${platformConfig.command}
  Then: @bmad-agent-${agent}
`;
}

/**
 * Check if platform supports native agent launch
 * 
 * @param {string} platform - Platform ID
 * @returns {boolean}
 */
function supportsNativeLaunch(platform) {
  const config = LAUNCH_CONFIGS[platform];
  if (!config) return false;
  return config.checkAvailable();
}

/**
 * Get available platforms for native launch
 * 
 * @returns {string[]} - List of platform IDs
 */
function getAvailablePlatforms() {
  return Object.keys(LAUNCH_CONFIGS).filter(platform => {
    const config = LAUNCH_CONFIGS[platform];
    return config.checkAvailable();
  });
}

module.exports = {
  launch,
  launchWithPrompt,
  getLaunchInstructions,
  supportsNativeLaunch,
  getAvailablePlatforms
};
