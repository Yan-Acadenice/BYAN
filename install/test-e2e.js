#!/usr/bin/env node

/**
 * E2E TEST SCRIPT for YANSTALLER
 * 
 * Tests the complete installation flow in a temporary directory.
 * Catches critical bugs before npm publish.
 * 
 * Methodology: Merise Agile + TDD
 * 
 * Usage:
 *   node test-e2e.js
 *   npm run test:e2e
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logStep(step, msg) {
  log(`\n[${'='.repeat(60)}]`, 'cyan');
  log(`STEP ${step}: ${msg}`, 'cyan');
  log(`[${'='.repeat(60)}]\n`, 'cyan');
}

function logSuccess(msg) {
  log(`✓ ${msg}`, 'green');
}

function logError(msg) {
  log(`✗ ${msg}`, 'red');
}

function logWarn(msg) {
  log(`⚠ ${msg}`, 'yellow');
}

/**
 * Run command and return promise
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: true,
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    if (options.silent) {
      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.stderr.on('data', (data) => stderr += data.toString());
    }
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}\n${stderr}`));
      }
    });
    
    proc.on('error', reject);
  });
}

/**
 * Main E2E test function
 */
async function runE2ETest() {
  const startTime = Date.now();
  let tempDir = null;
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // STEP 1: Create temp directory
    logStep(1, 'Setup - Creating temporary test directory');
    tempDir = path.join(os.tmpdir(), `yanstaller-e2e-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    logSuccess(`Created temp dir: ${tempDir}`);
    
    // STEP 2: Initialize mock project
    logStep(2, 'Setup - Initializing mock Node.js project');
    const packageJson = {
      name: 'test-yanstaller-project',
      version: '1.0.0',
      description: 'E2E test project for YANSTALLER',
      dependencies: {
        express: '^4.18.0',
        react: '^18.2.0'
      }
    };
    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson, { spaces: 2 });
    logSuccess('Created package.json (Express + React)');
    
    // STEP 3: Run YANSTALLER in silent mode
    logStep(3, 'Test - Running YANSTALLER installation');
    
    const binPath = path.join(__dirname, 'bin', 'create-byan-agent.js');
    
    log('Starting installation with --silent --mode=minimal...', 'blue');
    
    try {
      await runCommand('node', [
        binPath,
        '--silent',
        '--mode=minimal',
        '--agents=byan,rachid,patnote',
        '--platforms=copilot-cli,codex'
      ], { 
        cwd: tempDir,
        silent: false // Show output for debugging
      });
      logSuccess('Installation completed without crash');
      testsPassed++;
    } catch (error) {
      logError(`Installation failed: ${error.message}`);
      testsFailed++;
      throw error;
    }
    
    // STEP 4: Validate installation
    logStep(4, 'Test - Validating installation results');
    
    const bmadDir = path.join(tempDir, '_bmad');
    
    // Test 4.1: _bmad directory exists
    if (await fs.pathExists(bmadDir)) {
      logSuccess('_bmad/ directory created');
      testsPassed++;
    } else {
      logError('_bmad/ directory NOT created');
      testsFailed++;
    }
    
    // Test 4.2: Core structure exists
    const coreDirs = ['bmb', 'core', '_config', '_memory'];
    for (const dir of coreDirs) {
      const dirPath = path.join(bmadDir, dir);
      if (await fs.pathExists(dirPath)) {
        logSuccess(`Directory exists: _bmad/${dir}/`);
        testsPassed++;
      } else {
        logError(`Directory MISSING: _bmad/${dir}/`);
        testsFailed++;
      }
    }
    
    // Test 4.3: Agent files exist
    const expectedAgents = ['byan', 'rachid', 'patnote'];
    for (const agent of expectedAgents) {
      const agentPath = path.join(bmadDir, 'bmb', 'agents', `${agent}.md`);
      if (await fs.pathExists(agentPath)) {
        logSuccess(`Agent installed: ${agent}.md`);
        testsPassed++;
      } else {
        logError(`Agent MISSING: ${agent}.md`);
        testsFailed++;
      }
    }
    
    // Test 4.4: Config file exists
    const configPath = path.join(bmadDir, 'bmb', 'config.yaml');
    if (await fs.pathExists(configPath)) {
      logSuccess('Config file created: bmb/config.yaml');
      testsPassed++;
      
      // Validate config content
      const configContent = await fs.readFile(configPath, 'utf-8');
      if (configContent.includes('user_name:') && configContent.includes('communication_language:')) {
        logSuccess('Config file has required fields');
        testsPassed++;
      } else {
        logError('Config file missing required fields');
        testsFailed++;
      }
    } else {
      logError('Config file NOT created');
      testsFailed++;
    }
    
    // Test 4.5: Platform stubs exist
    const platformDirs = ['.github/agents', '.codex/prompts'];
    for (const dir of platformDirs) {
      const platformPath = path.join(tempDir, dir);
      if (await fs.pathExists(platformPath)) {
        logSuccess(`Platform stub directory: ${dir}/`);
        testsPassed++;
        
        // Check for stub files
        const files = await fs.readdir(platformPath);
        if (files.length > 0) {
          logSuccess(`  └─ ${files.length} stub file(s) created`);
          testsPassed++;
        } else {
          logWarn(`  └─ Directory empty (may be expected)`);
        }
      } else {
        logWarn(`Platform stub MISSING: ${dir}/ (may be expected)`);
      }
    }
    
    // STEP 5: Test module imports (smoke test)
    logStep(5, 'Test - Module smoke tests');
    
    const modules = [
      'detector',
      'recommender',
      'installer',
      'validator',
      'troubleshooter',
      'backuper',
      'interviewer',
      'wizard'
    ];
    
    for (const module of modules) {
      try {
        const modulePath = path.join(__dirname, 'lib', 'yanstaller', `${module}.js`);
        const mod = require(modulePath);
        
        if (mod && typeof mod === 'object') {
          logSuccess(`Module loads: ${module}.js`);
          testsPassed++;
        } else {
          logError(`Module invalid: ${module}.js`);
          testsFailed++;
        }
      } catch (error) {
        logError(`Module failed to load: ${module}.js - ${error.message}`);
        testsFailed++;
      }
    }
    
    // STEP 6: Cleanup
    logStep(6, 'Cleanup - Removing temporary directory');
    await fs.remove(tempDir);
    logSuccess(`Removed: ${tempDir}`);
    
  } catch (error) {
    logError(`E2E Test failed: ${error.message}`);
    
    if (error.stack) {
      log('\nStack trace:', 'red');
      console.error(error.stack);
    }
    
    // Cleanup on error
    if (tempDir && await fs.pathExists(tempDir)) {
      logWarn('Cleaning up temp directory after error...');
      await fs.remove(tempDir);
    }
    
    process.exit(1);
  }
  
  // SUMMARY
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  log('\n' + '='.repeat(70), 'cyan');
  log('E2E TEST SUMMARY', 'cyan');
  log('='.repeat(70), 'cyan');
  
  log(`\nTests passed: ${testsPassed}`, testsPassed > 0 ? 'green' : 'reset');
  log(`Tests failed: ${testsFailed}`, testsFailed > 0 ? 'red' : 'reset');
  log(`Duration: ${duration}s`, 'blue');
  
  if (testsFailed === 0) {
    log('\n✅ ALL E2E TESTS PASSED!', 'green');
    log('YANSTALLER is ready for npm publish.', 'green');
    process.exit(0);
  } else {
    log('\n❌ E2E TESTS FAILED!', 'red');
    log('Fix issues before publishing to npm.', 'red');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  log('\n🧪 YANSTALLER E2E TEST SUITE', 'cyan');
  log('Testing complete installation flow...', 'cyan');
  
  runE2ETest().catch((error) => {
    logError(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runE2ETest };
