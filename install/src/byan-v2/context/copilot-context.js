const fs = require('fs');
const os = require('os');
const path = require('path');

function getCopilotContext() {
  const context = {
    projectRoot: getProjectRoot(),
    userName: getUserName(),
    workingDir: getWorkingDir(),
    gitBranch: getGitBranch()
  };

  return context;
}

function getProjectRoot() {
  if (process.env.GITHUB_WORKSPACE) {
    return process.env.GITHUB_WORKSPACE;
  }
  
  if (process.env.PWD) {
    return process.env.PWD;
  }
  
  return process.cwd();
}

function getUserName() {
  if (process.env.COPILOT_USER_NAME) {
    return process.env.COPILOT_USER_NAME;
  }

  const projectRoot = getProjectRoot();
  const configPath = path.join(projectRoot, '.github', 'copilot', 'config.yaml');
  
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const userNameMatch = configContent.match(/user_name:\s*(.+)/);
      if (userNameMatch && userNameMatch[1]) {
        return userNameMatch[1].trim();
      }
    } catch (error) {
      // Fallback to next option
    }
  }

  if (process.env.USER) {
    return process.env.USER;
  }

  try {
    return os.userInfo().username;
  } catch (error) {
    return 'unknown';
  }
}

function getWorkingDir() {
  if (process.env.PWD) {
    return process.env.PWD;
  }
  
  return process.cwd();
}

function getGitBranch() {
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }
  
  if (process.env.GIT_BRANCH) {
    return process.env.GIT_BRANCH;
  }
  
  return '';
}

module.exports = getCopilotContext;
