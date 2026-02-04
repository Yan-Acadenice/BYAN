/**
 * VALIDATOR Module
 * 
 * Validates BYAN installation with 10 automated checks.
 * 
 * Phase 4: 32h development
 * 
 * @module yanstaller/validator
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');
const yamlUtils = require('../utils/yaml-utils');
const { execSync } = require('child_process');
const fs = require('fs-extra');

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} success - All checks passed
 * @property {CheckResult[]} checks - Individual check results
 * @property {string[]} errors - Critical errors
 * @property {string[]} warnings - Non-critical issues
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} id - Check identifier
 * @property {string} name - Human-readable check name
 * @property {boolean} passed
 * @property {string} [message] - Error/warning message if failed
 * @property {string} severity - 'critical' | 'warning'
 */

/**
 * Validate BYAN installation
 * 
 * @param {import('./installer').InstallConfig} config - Installation config
 * @returns {Promise<ValidationResult>}
 */
async function validate(config) {
  const checks = [];
  const errors = [];
  const warnings = [];
  
  // Run all 10 checks in sequence
  checks.push(await checkBmadStructure(config));
  checks.push(await checkAgentFiles(config));
  checks.push(await checkStubsYamlFrontmatter(config));
  checks.push(await checkConfigFiles(config));
  checks.push(await checkPlatformDetection(config));
  checks.push(await checkFilePermissions(config));
  checks.push(await checkManifests(config));
  checks.push(await checkWorkflows(config));
  checks.push(await checkTemplates(config));
  checks.push(await checkDependencies(config));
  
  // Collect errors and warnings
  for (const check of checks) {
    if (!check.passed) {
      if (check.severity === 'critical') {
        errors.push(`[${check.id}] ${check.message}`);
      } else {
        warnings.push(`[${check.id}] ${check.message}`);
      }
    }
  }
  
  const allPassed = checks.every(c => c.passed || c.severity === 'warning');
  
  return {
    success: allPassed,
    checks,
    errors,
    warnings
  };
}

/**
 * Check 1: _bmad/ structure exists
 */
async function checkBmadStructure(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const requiredDirs = [
    '_bmad',
    '_bmad/_config',
    '_bmad/_memory',
    '_bmad/_output',
    '_bmad/core/agents',
    '_bmad/bmm/agents',
    '_bmad/bmb/agents',
    '_bmad/tea/agents',
    '_bmad/cis/agents'
  ];
  
  const missingDirs = [];
  for (const dir of requiredDirs) {
    const dirPath = path.join(projectRoot, dir);
    if (!await fileUtils.exists(dirPath)) {
      missingDirs.push(dir);
    }
  }
  
  if (missingDirs.length > 0) {
    return {
      id: 'bmad-structure',
      name: '_bmad/ structure',
      passed: false,
      message: `Missing directories: ${missingDirs.join(', ')}`,
      severity: 'critical'
    };
  }
  
  return {
    id: 'bmad-structure',
    name: '_bmad/ structure',
    passed: true,
    severity: 'critical'
  };
}

/**
 * Check 2: Agent files copied correctly
 */
async function checkAgentFiles(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const agents = config.agents || [];
  
  if (agents.length === 0) {
    return {
      id: 'agent-files',
      name: 'Agent files',
      passed: true,
      message: 'No agents to check',
      severity: 'critical'
    };
  }
  
  const modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
  const missingAgents = [];
  
  for (const agentName of agents) {
    let found = false;
    for (const module of modules) {
      const agentPath = path.join(projectRoot, '_bmad', module, 'agents', `${agentName}.md`);
      if (await fileUtils.exists(agentPath)) {
        found = true;
        break;
      }
    }
    if (!found) {
      missingAgents.push(agentName);
    }
  }
  
  if (missingAgents.length > 0) {
    return {
      id: 'agent-files',
      name: 'Agent files',
      passed: false,
      message: `Missing agents: ${missingAgents.join(', ')}`,
      severity: 'critical'
    };
  }
  
  return {
    id: 'agent-files',
    name: 'Agent files',
    passed: true,
    severity: 'critical'
  };
}

/**
 * Check 3: Platform stubs have valid YAML frontmatter
 */
async function checkStubsYamlFrontmatter(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const targetPlatforms = config.targetPlatforms || [];
  
  if (targetPlatforms.length === 0) {
    return {
      id: 'yaml-frontmatter',
      name: 'YAML frontmatter',
      passed: true,
      message: 'No platforms to check',
      severity: 'critical'
    };
  }
  
  const invalidStubs = [];
  
  // Check Copilot CLI / VSCode stubs
  if (targetPlatforms.includes('copilot-cli') || targetPlatforms.includes('vscode')) {
    const stubsDir = path.join(projectRoot, '.github', 'agents');
    if (await fileUtils.exists(stubsDir)) {
      const files = await fileUtils.readDir(stubsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fileUtils.readFile(path.join(stubsDir, file), 'utf8');
          if (!content.startsWith('---')) {
            invalidStubs.push(`.github/agents/${file}`);
          }
        }
      }
    }
  }
  
  // Check Codex stubs
  if (targetPlatforms.includes('codex')) {
    const stubsDir = path.join(projectRoot, '.codex', 'prompts');
    if (await fileUtils.exists(stubsDir)) {
      const files = await fileUtils.readDir(stubsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fileUtils.readFile(path.join(stubsDir, file), 'utf8');
          if (!content.includes('<agent-activation')) {
            invalidStubs.push(`.codex/prompts/${file}`);
          }
        }
      }
    }
  }
  
  if (invalidStubs.length > 0) {
    return {
      id: 'yaml-frontmatter',
      name: 'YAML frontmatter',
      passed: false,
      message: `Invalid stubs: ${invalidStubs.join(', ')}`,
      severity: 'critical'
    };
  }
  
  return {
    id: 'yaml-frontmatter',
    name: 'YAML frontmatter',
    passed: true,
    severity: 'critical'
  };
}

/**
 * Check 4: Module config files valid
 */
async function checkConfigFiles(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const modules = ['bmb']; // For now only bmb has config
  
  const invalidConfigs = [];
  
  for (const module of modules) {
    const configPath = path.join(projectRoot, '_bmad', module, 'config.yaml');
    if (await fileUtils.exists(configPath)) {
      try {
        const configContent = await fileUtils.readFile(configPath, 'utf8');
        const parsedConfig = yamlUtils.parse(configContent);
        
        // Validate required fields
        if (!parsedConfig.user_name) {
          invalidConfigs.push(`${module}/config.yaml: missing user_name`);
        }
        if (!parsedConfig.communication_language) {
          invalidConfigs.push(`${module}/config.yaml: missing communication_language`);
        }
      } catch (error) {
        invalidConfigs.push(`${module}/config.yaml: parse error - ${error.message}`);
      }
    } else {
      invalidConfigs.push(`${module}/config.yaml: file not found`);
    }
  }
  
  if (invalidConfigs.length > 0) {
    return {
      id: 'config-files',
      name: 'Config files',
      passed: false,
      message: invalidConfigs.join(', '),
      severity: 'critical'
    };
  }
  
  return {
    id: 'config-files',
    name: 'Config files',
    passed: true,
    severity: 'critical'
  };
}

/**
 * Check 5: Platform detection works
 */
async function checkPlatformDetection(config) {
  const targetPlatforms = config.targetPlatforms || [];
  
  if (targetPlatforms.length === 0) {
    return {
      id: 'platform-detection',
      name: 'Platform detection',
      passed: true,
      message: 'No platforms configured',
      severity: 'critical'
    };
  }
  
  const failedPlatforms = [];
  
  for (const platformName of targetPlatforms) {
    try {
      const platform = require(`../platforms/${platformName}`);
      const detected = await platform.detect();
      
      // If detection failed or returned error object
      if (!detected || (typeof detected === 'object' && !detected.detected)) {
        failedPlatforms.push(platformName);
      }
    } catch (error) {
      failedPlatforms.push(`${platformName} (${error.message})`);
    }
  }
  
  if (failedPlatforms.length > 0) {
    return {
      id: 'platform-detection',
      name: 'Platform detection',
      passed: false,
      message: `Failed platforms: ${failedPlatforms.join(', ')}`,
      severity: 'warning' // Warning because platform may be installed but not detected
    };
  }
  
  return {
    id: 'platform-detection',
    name: 'Platform detection',
    passed: true,
    severity: 'critical'
  };
}

/**
 * Check 6: File permissions correct
 */
async function checkFilePermissions(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const testPaths = [
    '_bmad',
    '_bmad/_config',
    '_bmad/bmb/config.yaml'
  ];
  
  const permissionIssues = [];
  
  for (const testPath of testPaths) {
    const fullPath = path.join(projectRoot, testPath);
    if (await fileUtils.exists(fullPath)) {
      try {
        // Test read permission
        await fileUtils.access(fullPath, fileUtils.constants.R_OK);
        
        // Test write permission (only for directories and config files)
        await fileUtils.access(fullPath, fileUtils.constants.W_OK);
      } catch (error) {
        permissionIssues.push(testPath);
      }
    }
  }
  
  if (permissionIssues.length > 0) {
    return {
      id: 'file-permissions',
      name: 'File permissions',
      passed: false,
      message: `Permission issues: ${permissionIssues.join(', ')}`,
      severity: 'warning'
    };
  }
  
  return {
    id: 'file-permissions',
    name: 'File permissions',
    passed: true,
    severity: 'warning'
  };
}

/**
 * Check 7: Manifest files valid
 */
async function checkManifests(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const manifestFiles = [
    '_bmad/_config/agent-manifest.csv',
    '_bmad/_config/workflow-manifest.csv',
    '_bmad/_config/task-manifest.csv'
  ];
  
  const issues = [];
  
  for (const manifestFile of manifestFiles) {
    const manifestPath = path.join(projectRoot, manifestFile);
    if (await fileUtils.exists(manifestPath)) {
      try {
        const content = await fileUtils.readFile(manifestPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        
        // Check header exists
        if (lines.length === 0 || !lines[0].includes(',')) {
          issues.push(`${manifestFile}: invalid format`);
        }
      } catch (error) {
        issues.push(`${manifestFile}: ${error.message}`);
      }
    } else {
      // Manifests are optional, don't fail if missing
      // issues.push(`${manifestFile}: not found`);
    }
  }
  
  if (issues.length > 0) {
    return {
      id: 'manifests',
      name: 'Manifest files',
      passed: false,
      message: issues.join(', '),
      severity: 'warning'
    };
  }
  
  return {
    id: 'manifests',
    name: 'Manifest files',
    passed: true,
    severity: 'warning'
  };
}

/**
 * Check 8: Workflows accessible
 */
async function checkWorkflows(config) {
  const projectRoot = config.projectRoot || process.cwd();
  const workflowDirs = [
    '_bmad/core/workflows',
    '_bmad/bmm/workflows',
    '_bmad/bmb/workflows',
    '_bmad/tea/workflows',
    '_bmad/cis/workflows'
  ];
  
  let workflowCount = 0;
  const issues = [];
  
  for (const workflowDir of workflowDirs) {
    const dirPath = path.join(projectRoot, workflowDir);
    if (await fileUtils.exists(dirPath)) {
      try {
        const workflows = await fileUtils.readDir(dirPath);
        workflowCount += workflows.length;
      } catch (error) {
        issues.push(`${workflowDir}: ${error.message}`);
      }
    }
  }
  
  if (issues.length > 0) {
    return {
      id: 'workflows',
      name: 'Workflow files',
      passed: false,
      message: issues.join(', '),
      severity: 'warning'
    };
  }
  
  return {
    id: 'workflows',
    name: 'Workflow files',
    passed: true,
    message: `${workflowCount} workflows found`,
    severity: 'warning'
  };
}

/**
 * Check 9: Templates valid
 */
async function checkTemplates(config) {
  const templatesDir = path.join(__dirname, '..', '..', 'templates', '_bmad');
  
  if (!await fileUtils.exists(templatesDir)) {
    return {
      id: 'templates',
      name: 'Template files',
      passed: false,
      message: 'Templates directory not found',
      severity: 'warning'
    };
  }
  
  const entries = await fileUtils.readDir(templatesDir);
  const modules = [];
  for (const entry of entries) {
    const entryPath = path.join(templatesDir, entry);
    try {
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        modules.push(entry);
      }
    } catch {
      // Ignore unreadable entries
    }
  }
  
  if (modules.length === 0) {
    return {
      id: 'templates',
      name: 'Template files',
      passed: false,
      message: 'No template modules found',
      severity: 'warning'
    };
  }
  
  const issues = [];
  
  for (const module of modules) {
    const agentsDir = path.join(templatesDir, module, 'agents');
    if (!await fileUtils.exists(agentsDir)) {
      issues.push(`${module}/agents missing`);
    }
  }
  
  if (issues.length > 0) {
    return {
      id: 'templates',
      name: 'Template files',
      passed: false,
      message: issues.join(', '),
      severity: 'warning'
    };
  }
  
  return {
    id: 'templates',
    name: 'Template files',
    passed: true,
    severity: 'warning'
  };
}

/**
 * Check 10: Dependencies installed
 */
async function checkDependencies(config) {
  const requiredDeps = [
    'fs-extra',
    'js-yaml',
    'chalk'
  ];
  
  const missingDeps = [];
  
  for (const dep of requiredDeps) {
    try {
      require.resolve(dep);
    } catch {
      missingDeps.push(dep);
    }
  }
  
  if (missingDeps.length > 0) {
    return {
      id: 'dependencies',
      name: 'Dependencies',
      passed: false,
      message: `Missing: ${missingDeps.join(', ')}. Run: npm install`,
      severity: 'critical'
    };
  }
  
  return {
    id: 'dependencies',
    name: 'Dependencies',
    passed: true,
    severity: 'critical'
  };
}

module.exports = {
  validate,
  checkBmadStructure,
  checkAgentFiles,
  checkStubsYamlFrontmatter,
  checkConfigFiles,
  checkPlatformDetection,
  checkFilePermissions,
  checkManifests,
  checkWorkflows,
  checkTemplates,
  checkDependencies
};
