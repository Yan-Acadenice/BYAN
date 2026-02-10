/**
 * PLATFORM SELECTOR Module
 * 
 * Interactive platform selection for BYAN installation.
 * Detects available platforms and lets user choose target(s).
 * 
 * @module yanstaller/platform-selector
 */

const inquirer = require('inquirer');
const logger = require('../utils/logger');
const platforms = require('../platforms');

/**
 * @typedef {Object} PlatformChoice
 * @property {string} name - Display name
 * @property {string} id - Platform ID ('copilot-cli' | 'vscode' | 'claude' | 'codex')
 * @property {boolean} detected - Is platform installed?
 * @property {string} [path] - Installation path if detected
 * @property {boolean} native - Native integration available?
 * @property {string} [agentSpecialist] - Agent specialist for this platform
 */

/**
 * @typedef {Object} PlatformSelectionResult
 * @property {string[]} platforms - Selected platform IDs
 * @property {string} mode - 'native' | 'conversational' | 'auto'
 * @property {string} [specialist] - Agent specialist to use
 */

const PLATFORM_INFO = {
  'copilot-cli': {
    displayName: 'GitHub Copilot CLI',
    native: true,
    specialist: 'marc',
    icon: '🤖'
  },
  'claude': {
    displayName: 'Claude Code',
    native: true,
    specialist: 'claude',
    icon: '🎭'
  },
  'codex': {
    displayName: 'OpenCode/Codex',
    native: true, // NOW NATIVE!
    specialist: 'codex',
    icon: '📝'
  },
  'vscode': {
    displayName: 'VS Code',
    native: false,
    specialist: null,
    icon: '💻'
  }
};

/**
 * Detect and select platforms interactively
 * 
 * @param {Object} detectionResult - Result from detector.detect()
 * @returns {Promise<PlatformSelectionResult>}
 */
async function select(detectionResult) {
  logger.info('\n🎯 Platform Selection\n');
  
  // Build platform choices from detection
  const choices = buildChoices(detectionResult.platforms);
  
  // Check if any native integration available
  const hasNative = choices.some(c => c.native && c.detected);
  
  if (choices.length === 0) {
    logger.warn('No platforms detected. Will create _byan/ structure only.');
    return {
      platforms: [],
      mode: 'manual'
    };
  }
  
  // Show primary platform selection first
  const nativePlatforms = choices.filter(c => c.native && c.detected);
  
  // Step 1: Choose primary platform (if native available)
  if (nativePlatforms.length > 0) {
    const primaryAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'primary',
        message: '🎯 Choose your PRIMARY platform for native agent invocation:',
        choices: [
          ...nativePlatforms.map(c => ({
            name: `${c.icon} ${c.name} - ${c.agentSpecialist ? `@bmad-agent-${c.agentSpecialist}` : 'No specialist'}`,
            value: c.id,
            short: c.name
          })),
          new inquirer.Separator(),
          {
            name: '🔧 Advanced: Install on multiple platforms',
            value: 'multi'
          },
          {
            name: '⏭️  Skip native integration (manual install only)',
            value: 'skip'
          }
        ]
      }
    ]);
    
    // If user chose single platform, return immediately
    if (primaryAnswer.primary !== 'multi' && primaryAnswer.primary !== 'skip') {
      const platform = nativePlatforms.find(c => c.id === primaryAnswer.primary);
      return {
        platforms: [primaryAnswer.primary],
        mode: 'native',
        specialist: platform.agentSpecialist,
        primary: primaryAnswer.primary
      };
    }
    
    // If skip, fall through to conversational mode
    if (primaryAnswer.primary === 'skip') {
      return {
        platforms: choices.map(c => c.id),
        mode: 'conversational'
      };
    }
    
    // If multi, show full menu
  }
  
  // Step 2: Full menu (multi-platform or no native available)
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'selection',
      message: 'Choose installation target:',
      choices: [
        {
          name: `🚀 Auto (detect & install all available) - ${choices.length} platform(s)`,
          value: 'auto'
        },
        ...choices.map(c => ({
          name: formatPlatformChoice(c),
          value: `single:${c.id}`
        })),
        {
          name: '🔧 Custom (select multiple)',
          value: 'custom'
        }
      ]
    }
  ]);
  
  if (answer.selection === 'auto') {
    return handleAutoMode(choices);
  }
  
  if (answer.selection === 'custom') {
    return handleCustomMode(choices);
  }
  
  // Single platform selection
  const platformId = answer.selection.replace('single:', '');
  return handleSinglePlatform(platformId, choices);
}

/**
 * Build platform choices from detection result
 * 
 * @param {Array} detectedPlatforms - From detector
 * @returns {PlatformChoice[]}
 */
function buildChoices(detectedPlatforms) {
  return detectedPlatforms
    .filter(p => p.detected)
    .map(p => {
      const info = PLATFORM_INFO[p.name] || {
        displayName: p.name,
        native: false,
        specialist: null,
        icon: '❓'
      };
      
      return {
        name: info.displayName,
        id: p.name,
        detected: p.detected,
        path: p.path,
        native: info.native,
        agentSpecialist: info.specialist,
        icon: info.icon
      };
    });
}

/**
 * Format platform choice for display
 * 
 * @param {PlatformChoice} choice
 * @returns {string}
 */
function formatPlatformChoice(choice) {
  const nativeBadge = choice.native ? '✨ Native' : '💬 Conversational';
  const statusBadge = choice.detected ? '✓' : '✗';
  
  return `${choice.icon} ${choice.name} (${nativeBadge}) ${statusBadge}`;
}

/**
 * Handle auto mode - install on all detected platforms
 * 
 * @param {PlatformChoice[]} choices
 * @returns {Promise<PlatformSelectionResult>}
 */
async function handleAutoMode(choices) {
  const nativePlatforms = choices.filter(c => c.native);
  
  if (nativePlatforms.length > 0) {
    // Use native integration for first platform (or all?)
    return {
      platforms: choices.map(c => c.id),
      mode: 'native',
      specialist: nativePlatforms[0].agentSpecialist
    };
  }
  
  return {
    platforms: choices.map(c => c.id),
    mode: 'conversational'
  };
}

/**
 * Handle custom mode - user selects multiple platforms
 * 
 * @param {PlatformChoice[]} choices
 * @returns {Promise<PlatformSelectionResult>}
 */
async function handleCustomMode(choices) {
  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'platforms',
      message: 'Select platforms to install on:',
      choices: choices.map(c => ({
        name: formatPlatformChoice(c),
        value: c.id,
        checked: c.detected
      }))
    }
  ]);
  
  if (answer.platforms.length === 0) {
    logger.warn('No platforms selected. Installation cancelled.');
    return {
      platforms: [],
      mode: 'manual'
    };
  }
  
  // Check if any selected platform has native integration
  const selectedChoices = choices.filter(c => answer.platforms.includes(c.id));
  const nativePlatform = selectedChoices.find(c => c.native);
  
  if (nativePlatform) {
    return {
      platforms: answer.platforms,
      mode: 'native',
      specialist: nativePlatform.agentSpecialist
    };
  }
  
  return {
    platforms: answer.platforms,
    mode: 'conversational'
  };
}

/**
 * Handle single platform selection
 * 
 * @param {string} platformId
 * @param {PlatformChoice[]} choices
 * @returns {PlatformSelectionResult}
 */
function handleSinglePlatform(platformId, choices) {
  const choice = choices.find(c => c.id === platformId);
  
  if (!choice) {
    throw new Error(`Platform ${platformId} not found`);
  }
  
  return {
    platforms: [platformId],
    mode: choice.native ? 'native' : 'conversational',
    specialist: choice.agentSpecialist
  };
}

/**
 * Get specialist agent for platform
 * 
 * @param {string} platformId
 * @returns {string|null}
 */
function getSpecialist(platformId) {
  const info = PLATFORM_INFO[platformId];
  return info?.specialist || null;
}

/**
 * Check if platform has native integration
 * 
 * @param {string} platformId
 * @returns {boolean}
 */
function hasNativeIntegration(platformId) {
  const info = PLATFORM_INFO[platformId];
  return info?.native || false;
}

module.exports = {
  select,
  getSpecialist,
  hasNativeIntegration,
  PLATFORM_INFO
};
