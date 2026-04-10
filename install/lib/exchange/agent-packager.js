const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const zlib = require('zlib');

const BYAN_MIN_VERSION = '2.8.0';
const FORMAT_VERSION = '1.0';
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_\-]+\.md$/;

class AgentPackager {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async exportAgent(agentName, options = {}) {
    const sanitized = sanitizeName(agentName);
    const agentFile = await this._findAgentFile(sanitized);
    if (!agentFile) {
      throw new Error(`Agent "${sanitized}" not found in project`);
    }

    const agentContent = await fs.readFile(agentFile, 'utf8');
    const metadata = this._parseMetadata(agentContent, sanitized, options);
    const files = { 'agent.md': toBase64(agentContent) };

    const associated = await this._findAssociatedFiles(agentFile, sanitized);
    for (const [key, filePath] of Object.entries(associated)) {
      const content = await fs.readFile(filePath, 'utf8');
      files[key] = toBase64(content);
    }

    metadata.checksum = this._computeChecksum(files);

    const pkg = {
      format: 'byan-agent',
      version: FORMAT_VERSION,
      metadata,
      files
    };

    const jsonStr = JSON.stringify(pkg, null, 2);
    if (options.compress) {
      return gzipBuffer(Buffer.from(jsonStr, 'utf8'));
    }
    return Buffer.from(jsonStr, 'utf8');
  }

  async importAgent(data, options = {}) {
    const pkg = await this._parsePackage(data);
    const validation = this._validateStructure(pkg);
    if (!validation.valid) {
      throw new Error(`Invalid package: ${validation.errors.join(', ')}`);
    }

    if (!this._verifyChecksum(pkg)) {
      throw new Error('Checksum verification failed — package may be corrupted');
    }

    const agentName = sanitizeName(pkg.metadata.name);
    const targetDir = this._resolveTargetDir(agentName, options.targetModule);
    await fs.ensureDir(targetDir);

    const installedFiles = [];

    const agentContent = fromBase64(pkg.files['agent.md']);
    const agentPath = path.join(targetDir, `${agentName}.md`);
    if (!options.overwrite && await fs.pathExists(agentPath)) {
      throw new Error(`Agent "${agentName}" already exists at ${agentPath}. Use overwrite option.`);
    }
    await fs.writeFile(agentPath, agentContent, 'utf8');
    installedFiles.push(agentPath);

    const optionalFiles = {
      'soul.md': `${agentName}-soul.md`,
      'tao.md': `${agentName}-tao.md`,
      'soul-memory.md': `${agentName}-soul-memory.md`
    };

    for (const [pkgKey, diskName] of Object.entries(optionalFiles)) {
      if (pkg.files[pkgKey]) {
        const content = fromBase64(pkg.files[pkgKey]);
        const filePath = path.join(targetDir, diskName);
        await fs.writeFile(filePath, content, 'utf8');
        installedFiles.push(filePath);
      }
    }

    if (pkg.files['config-snippet.yaml']) {
      const snippetPath = path.join(targetDir, 'config-snippet.yaml');
      await fs.writeFile(snippetPath, fromBase64(pkg.files['config-snippet.yaml']), 'utf8');
      installedFiles.push(snippetPath);
    }

    const stubFiles = await this._generateStubs(agentName, pkg.metadata);
    installedFiles.push(...stubFiles);

    return { success: true, agentName, installedFiles };
  }

  async listExportableAgents() {
    const agents = [];
    const scanDirs = await this._getAgentDirectories();

    for (const { dir, module: mod } of scanDirs) {
      if (!await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        if (file.includes('.backup.') || file.includes('.optimized')) continue;
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;

        const name = file.replace(/\.md$/, '');
        const content = await fs.readFile(fullPath, 'utf8');
        const fm = parseFrontmatter(content);

        const hasSoul = await this._hasSoulFile(dir, name);
        const hasTao = await this._hasTaoFile(dir, name);

        agents.push({
          name,
          displayName: fm.description || fm.name || name,
          module: mod,
          path: path.relative(this.projectRoot, fullPath),
          hasSoul,
          hasTao
        });
      }
    }

    return agents;
  }

  async validate(data) {
    try {
      const pkg = await this._parsePackage(data);
      const validation = this._validateStructure(pkg);
      if (!validation.valid) {
        return { valid: false, metadata: pkg.metadata || null, errors: validation.errors };
      }

      const checksumOk = this._verifyChecksum(pkg);
      if (!checksumOk) {
        return { valid: false, metadata: pkg.metadata, errors: ['Checksum mismatch'] };
      }

      return { valid: true, metadata: pkg.metadata, errors: [] };
    } catch (err) {
      return { valid: false, metadata: null, errors: [err.message] };
    }
  }

  async _findAgentFile(name) {
    const candidates = [
      path.join(this.projectRoot, '_byan', 'agents', `${name}.md`),
    ];

    const bmadModules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
    for (const mod of bmadModules) {
      candidates.push(path.join(this.projectRoot, '_bmad', mod, 'agents', `${name}.md`));
    }

    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) return candidate;
    }

    const githubDir = path.join(this.projectRoot, '.github', 'agents');
    if (await fs.pathExists(githubDir)) {
      const files = await fs.readdir(githubDir);
      const match = files.find(f => f.includes(name) && f.endsWith('.md'));
      if (match) return path.join(githubDir, match);
    }

    return null;
  }

  async _findAssociatedFiles(agentFile, name) {
    const dir = path.dirname(agentFile);
    const found = {};
    const checks = [
      { key: 'soul.md', patterns: [`${name}-soul.md`, 'soul.md'] },
      { key: 'tao.md', patterns: [`${name}-tao.md`, 'tao.md'] },
      { key: 'soul-memory.md', patterns: [`${name}-soul-memory.md`, 'soul-memory.md'] }
    ];

    for (const { key, patterns } of checks) {
      for (const pattern of patterns) {
        const candidate = path.join(dir, pattern);
        if (await fs.pathExists(candidate)) {
          found[key] = candidate;
          break;
        }
      }
    }

    return found;
  }

  _parseMetadata(content, name, options) {
    const fm = parseFrontmatter(content);
    let displayName = fm.description || fm.name || name;

    const titleMatch = content.match(/title="([^"]+)"/);
    if (titleMatch) {
      displayName = titleMatch[1];
    }

    return {
      name,
      displayName,
      description: fm.description || displayName,
      author: options.author || 'unknown',
      created: new Date().toISOString(),
      byanMinVersion: BYAN_MIN_VERSION,
      checksum: ''
    };
  }

  _computeChecksum(files) {
    const hash = crypto.createHash('sha256');
    const keys = Object.keys(files).sort();
    for (const key of keys) {
      hash.update(files[key]);
    }
    return hash.digest('hex');
  }

  _verifyChecksum(pkg) {
    const filesCopy = Object.assign({}, pkg.files);
    const expected = pkg.metadata.checksum;
    const actual = this._computeChecksum(filesCopy);
    return expected === actual;
  }

  _validateStructure(pkg) {
    const errors = [];

    if (!pkg || typeof pkg !== 'object') {
      return { valid: false, errors: ['Package is not a valid object'] };
    }
    if (pkg.format !== 'byan-agent') {
      errors.push(`Invalid format: expected "byan-agent", got "${pkg.format}"`);
    }
    if (!pkg.version) {
      errors.push('Missing version field');
    }
    if (!pkg.metadata || typeof pkg.metadata !== 'object') {
      errors.push('Missing or invalid metadata');
    } else {
      if (!pkg.metadata.name) errors.push('Missing metadata.name');
      if (!pkg.metadata.checksum) errors.push('Missing metadata.checksum');
    }
    if (!pkg.files || typeof pkg.files !== 'object') {
      errors.push('Missing or invalid files section');
    } else {
      if (!pkg.files['agent.md']) {
        errors.push('Missing required file: agent.md');
      }
      for (const key of Object.keys(pkg.files)) {
        if (!SAFE_FILENAME_RE.test(key) && key !== 'config-snippet.yaml') {
          errors.push(`Unsafe filename in package: "${key}"`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  _resolveTargetDir(agentName, targetModule) {
    if (targetModule) {
      const moduleDir = path.join(this.projectRoot, '_bmad', sanitizeName(targetModule), 'agents');
      assertInsideRoot(moduleDir, this.projectRoot);
      return moduleDir;
    }
    return path.join(this.projectRoot, '_bmad-output', 'bmb-creations', agentName);
  }

  async _generateStubs(agentName, metadata) {
    const stubs = [];
    const displayName = metadata.displayName || agentName;

    const githubDir = path.join(this.projectRoot, '.github', 'agents');
    if (await fs.pathExists(githubDir)) {
      const stubName = `bmad-agent-${agentName}.md`;
      const stubPath = path.join(githubDir, stubName);
      const stubContent = [
        '---',
        `name: '${agentName}'`,
        `description: '${escapeYamlString(displayName)}'`,
        '---',
        '',
        "You must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.",
        '',
        '<agent-activation CRITICAL="TRUE">',
        `1. LOAD the FULL agent file from {project-root}/_bmad-output/bmb-creations/${agentName}/${agentName}.md`,
        '2. READ its entire contents - this contains the complete agent persona, menu, and instructions',
        '3. LOAD the soul activation protocol from {project-root}/_byan/core/activation/soul-activation.md and EXECUTE it silently',
        '4. FOLLOW every step in the <activation> section precisely',
        '5. DISPLAY the welcome/greeting as instructed',
        '6. PRESENT the numbered menu exactly as defined in the file',
        '7. WAIT for user input before proceeding',
        '</agent-activation>',
        ''
      ].join('\n');
      await fs.writeFile(stubPath, stubContent, 'utf8');
      stubs.push(stubPath);
    }

    const codexDir = path.join(this.projectRoot, '.codex', 'prompts');
    if (await fs.pathExists(codexDir)) {
      const stubName = `bmad-agent-${agentName}.md`;
      const stubPath = path.join(codexDir, stubName);
      const stubContent = [
        '---',
        `name: '${agentName}'`,
        `description: '${escapeYamlString(displayName)}'`,
        'disable-model-invocation: true',
        '---',
        '',
        "You must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.",
        '',
        '<agent-activation CRITICAL="TRUE">',
        `1. LOAD the FULL agent file from @bmad-output/bmb-creations/${agentName}/${agentName}.md`,
        '2. READ its entire contents - this contains the complete agent persona, menu, and instructions',
        '3. LOAD the soul activation protocol from @bmad/core/activation/soul-activation.md and EXECUTE it silently',
        '4. Execute ALL activation steps exactly as written in the agent file',
        '5. Follow the agent\'s persona and menu system precisely',
        '6. Stay in character throughout the session',
        '</agent-activation>',
        ''
      ].join('\n');
      await fs.writeFile(stubPath, stubContent, 'utf8');
      stubs.push(stubPath);
    }

    return stubs;
  }

  async _getAgentDirectories() {
    const dirs = [
      { dir: path.join(this.projectRoot, '_byan', 'agents'), module: 'byan' }
    ];

    const bmadModules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
    for (const mod of bmadModules) {
      dirs.push({
        dir: path.join(this.projectRoot, '_bmad', mod, 'agents'),
        module: mod
      });
    }

    const bmadOutputDir = path.join(this.projectRoot, '_bmad-output', 'bmb-creations');
    if (await fs.pathExists(bmadOutputDir)) {
      const entries = await fs.readdir(bmadOutputDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push({
            dir: path.join(bmadOutputDir, entry.name),
            module: 'bmb-creations'
          });
        }
      }
    }

    return dirs;
  }

  async _hasSoulFile(dir, name) {
    return await fs.pathExists(path.join(dir, `${name}-soul.md`)) ||
           await fs.pathExists(path.join(dir, 'soul.md'));
  }

  async _hasTaoFile(dir, name) {
    return await fs.pathExists(path.join(dir, `${name}-tao.md`)) ||
           await fs.pathExists(path.join(dir, 'tao.md'));
  }

  async _parsePackage(data) {
    let buffer;
    if (typeof data === 'string') {
      if (await fs.pathExists(data)) {
        buffer = await fs.readFile(data);
      } else {
        buffer = Buffer.from(data, 'utf8');
      }
    } else if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      throw new Error('Invalid input: expected Buffer, string, or file path');
    }

    let jsonStr;
    if (isGzipped(buffer)) {
      jsonStr = (await gunzipBuffer(buffer)).toString('utf8');
    } else {
      jsonStr = buffer.toString('utf8');
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      throw new Error('Failed to parse package: invalid JSON');
    }
  }
}

function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 100);
}

function assertInsideRoot(targetPath, rootPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootPath)) {
    throw new Error('Path traversal detected: target is outside project root');
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

function escapeYamlString(str) {
  return String(str).replace(/'/g, "''");
}

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function fromBase64(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

function isGzipped(buffer) {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function gzipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    zlib.gzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function gunzipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

module.exports = AgentPackager;
