'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db');
const bspTree = require('./bsp-tree');
const { mapArtifactToNode, parseArtifactContentString } = require('./artifact-mapper');

const SCAN_DIRS = [
  { rel: '_bmad-output/planning-artifacts', artifactType: 'planning' },
  { rel: '_bmad-output/implementation-artifacts', artifactType: 'implementation' },
  { rel: 'docs', artifactType: 'documentation' },
  { rel: '_bmad/_memory', artifactType: 'memory' }
];

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.yaml', '.yml']);

const DEFAULT_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.turbo'
]);

const DEFAULT_SKIP_FILE_PATTERNS = [
  /\.log$/i,
  /\.sqlite$/i,
  /\.sqlite-journal$/i,
  /\.sqlite-wal$/i,
  /\.sqlite-shm$/i,
  /^\.DS_Store$/
];

const DEFAULT_SKIP_REL_PREFIXES = [
  '_bmad-output/tmp/'
];

function shouldSkipDir(name) {
  return DEFAULT_SKIP_DIRS.has(name);
}

function shouldSkipFile(name, relPath) {
  for (const p of DEFAULT_SKIP_FILE_PATTERNS) {
    if (p.test(name)) return true;
  }
  const norm = relPath.split(path.sep).join('/');
  for (const prefix of DEFAULT_SKIP_REL_PREFIXES) {
    if (norm.startsWith(prefix)) return true;
  }
  return false;
}

// --- I/O layer : fs walker ---

function readFilesystemToMap(absolutePath, opts = {}) {
  const { maxFiles = 10000, maxTotalBytes = 100 * 1024 * 1024 } = opts;

  const root = path.resolve(absolutePath);
  if (!fs.existsSync(root)) {
    throw Object.assign(new Error(`Path not found: ${root}`), { code: 'PATH_NOT_FOUND' });
  }

  const stat = fs.statSync(root);
  if (!stat.isDirectory()) {
    throw Object.assign(new Error(`Path is not a directory: ${root}`), { code: 'PATH_NOT_FOUND' });
  }

  const fileMap = new Map();
  let totalBytes = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        if (shouldSkipFile(entry.name, rel)) continue;

        const fstat = fs.statSync(full);
        if (fileMap.size >= maxFiles) {
          throw Object.assign(
            new Error(`Too many files (> ${maxFiles})`),
            { code: 'TOO_MANY_FILES' }
          );
        }
        if (totalBytes + fstat.size > maxTotalBytes) {
          throw Object.assign(
            new Error(`Total size exceeds ${maxTotalBytes} bytes`),
            { code: 'PAYLOAD_TOO_LARGE' }
          );
        }

        const content = fs.readFileSync(full);
        totalBytes += fstat.size;
        const relNorm = rel.split(path.sep).join('/');
        fileMap.set(relNorm, { content, size: fstat.size });
      }
    }
  }

  walk(root);
  return fileMap;
}

// --- Pure logic layer ---

function detectProjectTypeFromFiles(fileMap) {
  const planPrefix = '_bmad-output/planning-artifacts/';
  const implPrefix = '_bmad-output/implementation-artifacts/';

  for (const rel of fileMap.keys()) {
    if (!rel.startsWith(implPrefix)) continue;
    const base = path.basename(rel).toLowerCase();
    if (/bloc|competence|rncp|cours|module/.test(base)) return 'training';
  }

  for (const rel of fileMap.keys()) {
    if (!rel.startsWith(planPrefix)) continue;
    const base = path.basename(rel).toLowerCase();
    if (/bloc|competence|rncp/.test(base)) return 'training';
  }

  return 'dev';
}

function collectArtifactsFromFiles(fileMap) {
  const artifacts = [];
  for (const scanDir of SCAN_DIRS) {
    const prefix = `${scanDir.rel}/`;
    for (const [rel, entry] of fileMap.entries()) {
      if (!rel.startsWith(prefix)) continue;
      const ext = path.extname(rel).toLowerCase();
      if (!MD_EXTENSIONS.has(ext)) continue;

      artifacts.push({
        path: rel,
        type: scanDir.artifactType,
        size: entry.size,
        content: entry.content
      });
    }
  }
  return artifacts;
}

function scanFromFiles(fileMap, opts = {}) {
  const type = opts.type || detectProjectTypeFromFiles(fileMap);
  const name = opts.name || opts.projectName || 'imported-project';
  const artifacts = collectArtifactsFromFiles(fileMap).map(a => ({
    path: a.path,
    type: a.type,
    size: a.size
  }));

  return { name, type, path: opts.sourcePath || null, artifacts };
}

function importFromFiles(fileMap, userId, options = {}) {
  const detectedType = detectProjectTypeFromFiles(fileMap);
  const projectName = options.name || options.projectName || 'imported-project';
  const projectType = options.type || detectedType;
  const sourceLabel = options.sourcePath || options.projectName || projectName;

  const artifacts = collectArtifactsFromFiles(fileMap);

  const project = bspTree.createProject({
    name: projectName,
    type: projectType,
    description: `Imported from ${sourceLabel}`,
    metadata: { importedFrom: sourceLabel, importedAt: new Date().toISOString() }
  });

  if (userId) {
    const db = getDb();
    db.prepare(
      'INSERT INTO project_roles (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)'
    ).run(project.id, userId, 'owner', new Date().toISOString());
  }

  const nodeMap = new Map();
  let nodesCreated = 0;
  let artifactsImported = 0;

  const projectContext = [];
  const epicNodes = [];
  const storyNodes = [];

  for (const artifact of artifacts) {
    const parsed = parseArtifactContentString(artifact.content.toString('utf8'));
    const mapping = mapArtifactToNode({ ...artifact, projectType });

    if (mapping.isProjectContext) {
      projectContext.push({ artifact, parsed, mapping });
    } else if (mapping.nodeType === 'epic' || mapping.nodeType === 'bloc') {
      epicNodes.push({ artifact, parsed, mapping });
    } else {
      storyNodes.push({ artifact, parsed, mapping });
    }
    artifactsImported++;
  }

  if (projectContext.length > 0) {
    const contextParts = projectContext.map(
      pc => `## ${pc.mapping.name} (${pc.mapping.category})\n\n${pc.parsed.content}`
    );
    bspTree.updateNode(project.rootNodeId, { context: contextParts.join('\n\n---\n\n') });
  }

  for (const epic of epicNodes) {
    const result = bspTree.addNode(project.id, project.rootNodeId, {
      nodeType: epic.mapping.nodeType,
      name: epic.mapping.name,
      description: epic.parsed.frontmatter?.description || null,
      context: epic.parsed.content,
      metadata: { importedFrom: epic.artifact.path, category: epic.mapping.category }
    });
    nodeMap.set(epic.artifact.path, result.id);
    nodesCreated++;
  }

  for (const story of storyNodes) {
    const parentId = findParentNode(story, epicNodes, nodeMap) || project.rootNodeId;
    bspTree.addNode(project.id, parentId, {
      nodeType: story.mapping.nodeType,
      name: story.mapping.name,
      description: story.parsed.frontmatter?.description || null,
      context: story.parsed.content,
      metadata: { importedFrom: story.artifact.path, category: story.mapping.category }
    });
    nodesCreated++;
  }

  return { projectId: project.id, rootNodeId: project.rootNodeId, nodesCreated, artifactsImported };
}

function dryRunFromFiles(fileMap, options = {}) {
  const detectedType = detectProjectTypeFromFiles(fileMap);
  const projectType = options.type || detectedType;
  const artifacts = collectArtifactsFromFiles(fileMap);

  const preview = {
    projectName: options.name || options.projectName || 'imported-project',
    projectType,
    totalArtifacts: artifacts.length,
    nodes: []
  };

  for (const artifact of artifacts) {
    const mapping = mapArtifactToNode({ ...artifact, projectType });
    preview.nodes.push({
      name: mapping.name,
      nodeType: mapping.nodeType,
      category: mapping.category,
      isProjectContext: mapping.isProjectContext,
      sourcePath: artifact.path,
      sourceType: artifact.type,
      size: artifact.size
    });
  }

  return preview;
}

function findParentNode(story, epics, nodeMap) {
  const storyDir = path.dirname(story.artifact.path);
  for (const epic of epics) {
    const epicDir = path.dirname(epic.artifact.path);
    if (storyDir.startsWith(epicDir) && nodeMap.has(epic.artifact.path)) {
      return nodeMap.get(epic.artifact.path);
    }
  }
  return null;
}

// --- Backward-compat wrappers (path-based) ---

function scanProject(projectPath, options = {}) {
  const absPath = path.resolve(projectPath);
  const fileMap = readFilesystemToMap(absPath);
  const scan = scanFromFiles(fileMap, {
    ...options,
    name: options.name || path.basename(absPath),
    sourcePath: absPath
  });
  return { ...scan, path: absPath };
}

function importProject(projectPath, userId, options = {}) {
  const absPath = path.resolve(projectPath);
  const fileMap = readFilesystemToMap(absPath);
  return importFromFiles(fileMap, userId, {
    ...options,
    name: options.name || path.basename(absPath),
    sourcePath: absPath
  });
}

function dryRun(projectPath, options = {}) {
  const absPath = path.resolve(projectPath);
  const fileMap = readFilesystemToMap(absPath);
  return dryRunFromFiles(fileMap, {
    ...options,
    name: options.name || path.basename(absPath),
    sourcePath: absPath
  });
}

function importSoul(agentPath) {
  const absPath = path.resolve(agentPath);
  if (!fs.existsSync(absPath)) {
    throw Object.assign(new Error(`Agent path not found: ${absPath}`), { code: 'PATH_NOT_FOUND' });
  }

  const soulFiles = ['soul.md', 'tao.md', 'soul-memory.md'];
  const imported = [];

  for (const file of soulFiles) {
    const filePath = path.join(absPath, file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO knowledge (id, title, content, category, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      `Agent Soul: ${path.basename(absPath)} / ${file}`,
      content,
      'agent-soul',
      JSON.stringify(['soul', 'agent', path.basename(absPath)]),
      now,
      now
    );

    imported.push({ id, file, size: content.length });
  }

  return { agentPath: absPath, imported };
}

module.exports = {
  // Pure (fileMap-based)
  scanFromFiles,
  importFromFiles,
  dryRunFromFiles,
  // I/O
  readFilesystemToMap,
  // Backward-compat wrappers
  scanProject,
  importProject,
  dryRun,
  importSoul
};
