/**
 * TROUBLESHOOTER Module
 * 
 * Diagnoses and fixes common installation errors.
 * 
 * Phase 5: 40h development
 * 
 * @module yanstaller/troubleshooter
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const fileUtils = require('../utils/file-utils');
const detector = require('./detector');
const validator = require('./validator');

/**
 * @typedef {Object} DiagnosticResult
 * @property {string} error - Error type
 * @property {string} cause - Root cause
 * @property {string} solution - Recommended solution
 * @property {boolean} canAutoFix - Whether auto-fix is available
 * @property {Function} [autoFix] - Auto-fix function
 * @property {string} errorCode - Unique error code
 * @property {string} severity - 'critical' | 'warning' | 'info'
 */

/**
 * @typedef {Object} TroubleshootResult
 * @property {boolean} success - All issues fixed
 * @property {DiagnosticResult[]} diagnostics - Detected issues
 * @property {string[]} fixed - Successfully fixed issues
 * @property {string[]} pending - Issues requiring manual fix
 */

// Error code patterns
const ERROR_PATTERNS = {
  NODE_VERSION: /node.*version|unsupported.*node/i,
  PERMISSION: /EACCES|EPERM|permission denied/i,
  NOT_FOUND: /ENOENT|not found|cannot find/i,
  GIT_MISSING: /git.*not found|git.*command/i,
  DISK_SPACE: /ENOSPC|no space left/i,
  NETWORK: /ETIMEDOUT|ECONNREFUSED|network/i,
  CORRUPTED: /corrupted|invalid.*format|parse error/i,
  MISSING_DEP: /cannot find module|module not found/i
};

/**
 * Diagnostic functions for specific error types
 */

async function diagnoseNodeVersion(error, context) {
  const detectionResult = await detector.detect();
  const currentVersion = detectionResult.node.version;
  const requiredVersion = '16.0.0';
  
  return {
    error: error.message,
    errorCode: 'NODE_VERSION',
    cause: `Node.js version ${currentVersion} is too old`,
    solution: suggestNodeUpgrade(currentVersion, requiredVersion),
    canAutoFix: false,
    severity: 'critical'
  };
}

async function diagnosePermission(error, context) {
  const projectRoot = context.projectRoot || process.cwd();
  
  return {
    error: error.message,
    errorCode: 'PERMISSION',
    cause: 'Insufficient file permissions',
    solution: `Run with elevated permissions or fix permissions on: ${projectRoot}`,
    canAutoFix: true,
    autoFix: async () => await fixPermissions(projectRoot),
    severity: 'critical'
  };
}

async function diagnoseNotFound(error, context) {
  // Extract file path from error if possible
  const match = error.message.match(/['"]([^'"]+)['"]/);
  const missingPath = match ? match[1] : 'unknown file';
  
  return {
    error: error.message,
    errorCode: 'NOT_FOUND',
    cause: `Required file or directory not found: ${missingPath}`,
    solution: 'Re-run installation or check file paths',
    canAutoFix: true,
    autoFix: async () => await repairStructure(context.projectRoot),
    severity: 'critical'
  };
}

async function diagnoseGitMissing(error, context) {
  return {
    error: error.message,
    errorCode: 'GIT_MISSING',
    cause: 'Git is not installed or not in PATH',
    solution: 'Install Git from https://git-scm.com/ and add to PATH',
    canAutoFix: false,
    severity: 'warning'
  };
}

async function diagnoseDiskSpace(error, context) {
  return {
    error: error.message,
    errorCode: 'DISK_SPACE',
    cause: 'Insufficient disk space',
    solution: 'Free up disk space and retry installation',
    canAutoFix: false,
    severity: 'critical'
  };
}

async function diagnoseNetwork(error, context) {
  return {
    error: error.message,
    errorCode: 'NETWORK',
    cause: 'Network connection failed',
    solution: 'Check internet connection and retry. If behind proxy, configure npm proxy settings',
    canAutoFix: false,
    severity: 'warning'
  };
}

async function diagnoseCorrupted(error, context) {
  return {
    error: error.message,
    errorCode: 'CORRUPTED',
    cause: 'Configuration file or installation is corrupted',
    solution: 'Delete corrupted files and reinstall',
    canAutoFix: true,
    autoFix: async () => await resetConfig(context.projectRoot),
    severity: 'critical'
  };
}

async function diagnoseMissingDep(error, context) {
  // Extract module name from error
  const match = error.message.match(/module ['"]([^'"]+)['"]/i);
  const moduleName = match ? match[1] : 'unknown';
  
  return {
    error: error.message,
    errorCode: 'MISSING_DEP',
    cause: `Missing Node.js dependency: ${moduleName}`,
    solution: 'Run: npm install',
    canAutoFix: true,
    autoFix: async () => await reinstallDependencies(context.projectRoot),
    severity: 'critical'
  };
}

/**
 * Diagnose installation error
 * 
 * @param {Error} error - Installation error
 * @param {Object} context - Installation context
 * @returns {Promise<DiagnosticResult>}
 */
async function diagnose(error, context = {}) {
  const errorMsg = error.message || String(error);
  
  // Pattern match against known errors
  if (ERROR_PATTERNS.NODE_VERSION.test(errorMsg)) {
    return diagnoseNodeVersion(error, context);
  }
  
  if (ERROR_PATTERNS.PERMISSION.test(errorMsg)) {
    return diagnosePermission(error, context);
  }
  
  if (ERROR_PATTERNS.NOT_FOUND.test(errorMsg)) {
    return diagnoseNotFound(error, context);
  }
  
  if (ERROR_PATTERNS.GIT_MISSING.test(errorMsg)) {
    return diagnoseGitMissing(error, context);
  }
  
  if (ERROR_PATTERNS.DISK_SPACE.test(errorMsg)) {
    return diagnoseDiskSpace(error, context);
  }
  
  if (ERROR_PATTERNS.NETWORK.test(errorMsg)) {
    return diagnoseNetwork(error, context);
  }
  
  if (ERROR_PATTERNS.CORRUPTED.test(errorMsg)) {
    return diagnoseCorrupted(error, context);
  }
  
  if (ERROR_PATTERNS.MISSING_DEP.test(errorMsg)) {
    return diagnoseMissingDep(error, context);
  }
  
  // Unknown error
  return {
    error: errorMsg,
    errorCode: 'UNKNOWN',
    cause: 'Unknown error type',
    solution: 'Check error message and logs for details',
    canAutoFix: false,
    severity: 'warning'
  };
}

/**
 * Auto-fix permission error
 * 
 * @param {string} targetPath - File path with permission issue
 * @returns {Promise<void>}
 */
async function fixPermissions(targetPath) {
  const platform = os.platform();
  
  try {
    if (platform === 'win32') {
      // Windows: Use icacls to grant full control
      execSync(`icacls "${targetPath}" /grant ${os.userInfo().username}:F /T`, {
        stdio: 'ignore'
      });
    } else {
      // Unix/macOS: Use chmod
      await fs.chmod(targetPath, 0o755);
      
      // Recursively fix subdirectories
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        const items = await fs.readdir(targetPath);
        for (const item of items) {
          await fixPermissions(path.join(targetPath, item));
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to fix permissions: ${error.message}`);
  }
}

/**
 * Suggest Node.js upgrade
 * 
 * @param {string} currentVersion - Current Node version
 * @param {string} requiredVersion - Required Node version
 * @returns {string} - Upgrade instructions
 */
function suggestNodeUpgrade(currentVersion, requiredVersion) {
  const platform = os.platform();
  
  let instructions = `Current Node.js: ${currentVersion}, Required: ${requiredVersion}+\n\n`;
  
  switch (platform) {
    case 'win32':
      instructions += 'Windows: Download from https://nodejs.org/ or use:\n';
      instructions += '  winget install OpenJS.NodeJS.LTS';
      break;
    case 'darwin':
      instructions += 'macOS:\n';
      instructions += '  brew upgrade node\n';
      instructions += '  Or download from https://nodejs.org/';
      break;
    case 'linux':
      instructions += 'Linux:\n';
      instructions += '  # Using nvm (recommended):\n';
      instructions += '  nvm install --lts\n';
      instructions += '  # Or using apt:\n';
      instructions += '  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -\n';
      instructions += '  sudo apt-get install -y nodejs';
      break;
    default:
      instructions += 'Download from https://nodejs.org/';
  }
  
  return instructions;
}

/**
 * Check common issues
 * 
 * @param {Object} config - Installation config
 * @returns {Promise<string[]>} - List of detected issues
 */
async function checkCommonIssues(config = {}) {
  const issues = [];
  
  try {
    // Check 1: Node.js version
    const detectionResult = await detector.detect();
    const nodeVersion = detectionResult.node.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0]);
    
    if (majorVersion < 16) {
      issues.push(`Node.js ${nodeVersion} is outdated (require 16+)`);
    }
    
    // Check 2: Git availability
    if (!detectionResult.git.detected) {
      issues.push('Git is not installed');
    }
    
    // Check 3: Write permission
    const projectRoot = config.projectRoot || process.cwd();
    try {
      await fs.access(projectRoot, fs.constants.W_OK);
    } catch {
      issues.push(`No write permission in ${projectRoot}`);
    }
    
    // Check 4: Disk space (at least 100MB)
    try {
      const stats = await fs.statfs || await fs.stat(projectRoot);
      // This is a rough check, might not work on all platforms
      if (stats.bavail && stats.bsize) {
        const availableSpace = stats.bavail * stats.bsize;
        if (availableSpace < 100 * 1024 * 1024) {
          issues.push('Low disk space (< 100MB available)');
        }
      }
    } catch {
      // Disk space check failed, skip
    }
    
    // Check 5: Network connectivity (optional check)
    try {
      // Simple check: try to resolve nodejs.org
      require('dns').resolve('nodejs.org', (err) => {
        if (err) {
          issues.push('Network connectivity issue');
        }
      });
    } catch {
      // Network check failed, skip
    }
    
    // Check 6: Dependencies installed
    const requiredDeps = ['fs-extra', 'js-yaml', 'chalk'];
    for (const dep of requiredDeps) {
      try {
        require.resolve(dep);
      } catch {
        issues.push(`Missing dependency: ${dep}`);
      }
    }
    
  } catch (error) {
    issues.push(`Health check error: ${error.message}`);
  }
  
  return issues;
}

/**
 * Repair _bmad/ directory structure
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function repairStructure(projectRoot) {
  const installer = require('./installer');
  
  try {
    await installer.createBmadStructure(projectRoot);
  } catch (error) {
    throw new Error(`Failed to repair structure: ${error.message}`);
  }
}

/**
 * Reset corrupted config files
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function resetConfig(projectRoot) {
  const installer = require('./installer');
  
  try {
    // Recreate default config
    const defaultConfig = {
      userName: 'User',
      language: 'English',
      mode: 'minimal',
      agents: []
    };
    
    await installer.createModuleConfig('bmb', defaultConfig, projectRoot);
  } catch (error) {
    throw new Error(`Failed to reset config: ${error.message}`);
  }
}

/**
 * Reinstall npm dependencies
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function reinstallDependencies(projectRoot) {
  try {
    execSync('npm install', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  } catch (error) {
    throw new Error(`Failed to reinstall dependencies: ${error.message}`);
  }
}

/**
 * Reinstall missing agents
 * 
 * @param {string[]} agents - Agent names to reinstall
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function reinstallAgents(agents, projectRoot) {
  const installer = require('./installer');
  
  for (const agentName of agents) {
    try {
      await installer.copyAgentFile(agentName, projectRoot);
    } catch (error) {
      // Continue with other agents even if one fails
      console.warn(`Failed to reinstall ${agentName}: ${error.message}`);
    }
  }
}

/**
 * Run full troubleshooting with auto-fixes
 * 
 * @param {Object} config - Installation config
 * @returns {Promise<TroubleshootResult>}
 */
async function troubleshoot(config) {
  const diagnostics = [];
  const fixed = [];
  const pending = [];
  
  // Run validation first
  const validationResult = await validator.validate(config);
  
  if (validationResult.success) {
    return {
      success: true,
      diagnostics: [],
      fixed: [],
      pending: []
    };
  }
  
  // Diagnose each error
  for (const check of validationResult.checks) {
    if (!check.passed) {
      const error = new Error(check.message || `${check.name} failed`);
      const diagnostic = await diagnose(error, config);
      diagnostics.push(diagnostic);
      
      // Try auto-fix if available
      if (diagnostic.canAutoFix && diagnostic.autoFix) {
        try {
          await diagnostic.autoFix();
          fixed.push(diagnostic.errorCode);
        } catch (fixError) {
          pending.push(`${diagnostic.errorCode}: ${fixError.message}`);
        }
      } else {
        pending.push(diagnostic.errorCode);
      }
    }
  }
  
  return {
    success: pending.length === 0,
    diagnostics,
    fixed,
    pending
  };
}

module.exports = {
  diagnose,
  fixPermissions,
  suggestNodeUpgrade,
  checkCommonIssues,
  repairStructure,
  resetConfig,
  reinstallDependencies,
  reinstallAgents,
  troubleshoot
};
