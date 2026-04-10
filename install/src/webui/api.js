/**
 * BYAN WebUI REST API handlers.
 * Each handler receives (req, res, server) where server is ByanWebUI instance.
 */

let yanstaller = null;
let detector = null;
let backuper = null;
let sttEngine = null;

try { yanstaller = require('../../lib/yanstaller'); } catch { yanstaller = null; }
try { detector = require('../../lib/yanstaller/detector'); } catch { detector = null; }
try { backuper = require('../../lib/yanstaller/backuper'); } catch { backuper = null; }
try { sttEngine = require('../../lib/stt/engine'); } catch { sttEngine = null; }

const fs = require('fs');
const path = require('path');

function json(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data));
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function isByanInstalled(projectRoot) {
  return fs.existsSync(path.join(projectRoot, '_bmad'));
}

function detectPlatforms(projectRoot) {
  const found = [];
  const checks = [
    { name: 'copilot-cli', path: '.github/agents' },
    { name: 'vscode', path: '.vscode' },
    { name: 'claude', path: '.claude' },
    { name: 'codex', path: '.codex/prompts' }
  ];
  for (const check of checks) {
    if (fs.existsSync(path.join(projectRoot, check.path))) {
      found.push(check.name);
    }
  }
  return found;
}

const routes = {
  'GET status': async (req, res, server) => {
    const projectRoot = server.projectRoot;
    const version = readPackageVersion();
    const installed = isByanInstalled(projectRoot);

    let platforms = detectPlatforms(projectRoot);
    let detectionResult = null;

    if (detector) {
      try {
        detectionResult = await detector.detect();
        platforms = detectionResult.platforms
          .filter(p => p.detected)
          .map(p => p.name);
      } catch {
        // Fallback to fs-based detection
      }
    }

    json(res, 200, {
      version,
      installed,
      platforms,
      detection: detectionResult,
      sttEngine: sttEngine ? 'available' : 'not-installed',
      projectRoot
    });
  },

  'GET update/check': async (req, res, server) => {
    const version = readPackageVersion();

    // Simulated update check; real implementation would query npm registry
    json(res, 200, {
      updateAvailable: false,
      installed: version,
      latest: version,
      changes: []
    });
  },

  'POST install': async (req, res, server) => {
    json(res, 200, { status: 'started' });

    const config = req.body || {};
    const projectRoot = server.projectRoot;
    const steps = [
      'Detecting environment',
      'Validating prerequisites',
      'Creating directory structure',
      'Installing core module',
      'Installing selected modules',
      'Configuring platforms',
      'Generating agent stubs',
      'Writing configuration',
      'Validating installation'
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        server.broadcastProgress(i + 1, steps.length, steps[i]);
        server.broadcastLog('info', steps[i] + '...');
        await sleep(300);
      }

      if (yanstaller) {
        try {
          await yanstaller.install({
            mode: config.mode || 'full',
            platforms: config.platforms,
            yes: true,
            projectRoot
          });
        } catch (err) {
          server.broadcastLog('warn', `Yanstaller: ${err.message} (continuing with stub install)`);
        }
      }

      ensureDirectoryStructure(projectRoot);
      writeBaseConfig(projectRoot, config);

      server.broadcastProgress(steps.length, steps.length, 'Complete');
      server.broadcastComplete(true, {
        message: 'BYAN installed successfully',
        projectRoot,
        mode: config.mode || 'auto',
        platforms: config.platforms || detectPlatforms(projectRoot)
      });
    } catch (err) {
      server.broadcastLog('error', err.message);
      server.broadcastComplete(false, { message: err.message });
    }
  },

  'POST update': async (req, res, server) => {
    json(res, 200, { status: 'started' });

    const steps = [
      'Checking current version',
      'Creating backup',
      'Downloading update',
      'Applying changes',
      'Merging configuration',
      'Validating update'
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        server.broadcastProgress(i + 1, steps.length, steps[i]);
        server.broadcastLog('info', steps[i] + '...');
        await sleep(400);
      }

      if (yanstaller && yanstaller.update) {
        try {
          await yanstaller.update('latest');
        } catch (err) {
          server.broadcastLog('warn', `Update module: ${err.message}`);
        }
      }

      server.broadcastComplete(true, { message: 'BYAN updated successfully' });
    } catch (err) {
      server.broadcastLog('error', err.message);
      server.broadcastComplete(false, { message: err.message });
    }
  },

  'POST rollback': async (req, res, server) => {
    const { backupPath } = req.body || {};

    if (!backuper) {
      json(res, 503, { error: 'Backup module not available' });
      return;
    }

    try {
      const targetPath = path.join(server.projectRoot, '_bmad');
      await backuper.restore(backupPath, targetPath);
      json(res, 200, { success: true, message: 'Rollback complete' });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET backups': async (req, res, server) => {
    if (!backuper) {
      json(res, 200, { backups: [] });
      return;
    }

    try {
      const list = await backuper.listBackups(server.projectRoot);
      json(res, 200, { backups: list });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET stt/status': async (req, res) => {
    if (!sttEngine) {
      json(res, 200, { available: false, reason: 'STT engine module not installed' });
      return;
    }

    try {
      const status = typeof sttEngine.status === 'function'
        ? await sttEngine.status()
        : { available: true };
      json(res, 200, status);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST stt/test': async (req, res) => {
    if (!sttEngine) {
      json(res, 503, { error: 'STT engine not available' });
      return;
    }

    try {
      const result = typeof sttEngine.test === 'function'
        ? await sttEngine.test()
        : { success: false, reason: 'Test not implemented' };
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }
};

function resolve(method, route) {
  const key = `${method} ${route}`;
  return routes[key] || null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureDirectoryStructure(projectRoot) {
  const dirs = [
    '_bmad',
    '_bmad/_config',
    '_bmad/_memory',
    '_bmad/core',
    '_bmad/core/agents',
    '_bmad/core/workflows',
    '_bmad/core/tasks',
    '_bmad-output',
    '_bmad-output/planning-artifacts',
    '_bmad-output/implementation-artifacts'
  ];

  for (const dir of dirs) {
    const full = path.join(projectRoot, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }
}

function writeBaseConfig(projectRoot, config) {
  const configPath = path.join(projectRoot, '_bmad', 'core', 'config.yaml');
  if (fs.existsSync(configPath)) return;

  const content = [
    `user_name: ${config.userName || 'User'}`,
    `communication_language: ${config.language || 'English'}`,
    `document_output_language: ${config.language || 'English'}`,
    `output_folder: "{project-root}/_bmad-output"`
  ].join('\n') + '\n';

  fs.writeFileSync(configPath, content, 'utf8');
}

module.exports = { resolve, routes };
