/**
 * CLI auto-detection and BMAD agent scanner.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLI_DEFINITIONS = [
  { name: 'claude', command: 'claude', versionArg: '--version' },
  { name: 'copilot', command: 'copilot', versionArg: '--version' },
  { name: 'codex', command: 'codex', versionArg: '--version' },
];

function execPromise(cmd, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const proc = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, output: '' });
          return;
        }
        resolve({ ok: true, output: (stdout || stderr || '').trim() });
      });
      proc.on('error', () => resolve({ ok: false, output: '' }));
    } catch {
      resolve({ ok: false, output: '' });
    }
  });
}

function parseVersion(output) {
  const match = output.match(/(\d+\.\d+[\w.-]*)/);
  return match ? match[1] : null;
}

function whichSync(cmd) {
  try {
    const { execFileSync } = require('child_process');
    return execFileSync('which', [cmd], { encoding: 'utf8', timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

async function detectCLIs() {
  const results = [];

  for (const def of CLI_DEFINITIONS) {
    const cmdPath = whichSync(def.command);
    if (!cmdPath) {
      results.push({
        id: def.name,
        name: def.name,
        path: null,
        version: null,
        available: false,
        preferred: false,
      });
      continue;
    }

    const versionResult = await execPromise(def.command, [def.versionArg]);
    const version = versionResult.ok ? parseVersion(versionResult.output) : null;

    results.push({
      id: def.name,
      name: def.name,
      path: cmdPath,
      version,
      available: true,
      preferred: false,
    });
  }

  const firstAvailable = results.find((r) => r.available);
  if (firstAvailable) firstAvailable.preferred = true;

  return results;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().replace(/^['"]|['"]$/g, '');
    const val = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && val) fm[key] = val;
  }
  return fm;
}

function scanDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

async function detectAgents(projectRoot) {
  const agents = [];
  const seen = new Set();

  const locations = [
    { dir: path.join(projectRoot, '.github', 'agents'), source: 'copilot' },
    { dir: path.join(projectRoot, '_byan', 'agents'), source: 'byan' },
  ];

  const bmadModules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
  for (const mod of bmadModules) {
    locations.push({
      dir: path.join(projectRoot, '_bmad', mod, 'agents'),
      source: `bmad-${mod}`,
    });
  }

  for (const loc of locations) {
    const files = scanDir(loc.dir);
    for (const file of files) {
      const filePath = path.join(loc.dir, file);
      const baseName = file.replace(/\.md$/, '');

      const id = baseName
        .replace(/^bmad-agent-/, '')
        .replace(/\.backup\.\d+.*$/, '')
        .replace(/\.optimized.*$/, '');

      if (seen.has(id)) continue;
      seen.add(id);

      let fm = {};
      try {
        const content = fs.readFileSync(filePath, 'utf8').slice(0, 2000);
        fm = parseFrontmatter(content);
      } catch { /* skip unparseable */ }

      agents.push({
        id,
        name: fm.name || id,
        description: fm.description || '',
        icon: fm.icon || null,
        source: loc.source,
        path: filePath,
      });
    }
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

module.exports = { detectCLIs, detectAgents };
