'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db');
const bspTree = require('./bsp-tree');
const { mapArtifactToNode, parseArtifactContent } = require('./artifact-mapper');

const SCAN_DIRS = [
  { rel: '_bmad-output/planning-artifacts', artifactType: 'planning' },
  { rel: '_bmad-output/implementation-artifacts', artifactType: 'implementation' },
  { rel: 'docs', artifactType: 'documentation' },
  { rel: '_bmad/_memory', artifactType: 'memory' }
];

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.yaml', '.yml']);

function scanProject(projectPath) {
  const absPath = path.resolve(projectPath);
  if (!fs.existsSync(absPath)) {
    throw Object.assign(new Error(`Path not found: ${absPath}`), { code: 'PATH_NOT_FOUND' });
  }

  const type = detectProjectType(absPath);
  const name = path.basename(absPath);
  const artifacts = [];

  for (const scanDir of SCAN_DIRS) {
    const dirPath = path.join(absPath, scanDir.rel);
    if (!fs.existsSync(dirPath)) continue;

    const files = collectFiles(dirPath);
    for (const filePath of files) {
      if (!MD_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;

      const relPath = path.relative(absPath, filePath);
      const stat = fs.statSync(filePath);

      artifacts.push({
        path: relPath,
        absolutePath: filePath,
        type: scanDir.artifactType,
        size: stat.size,
        modified: stat.mtime.toISOString()
      });
    }
  }

  return { name, type, path: absPath, artifacts };
}

function detectProjectType(absPath) {
  const implDir = path.join(absPath, '_bmad-output', 'implementation-artifacts');
  if (fs.existsSync(implDir)) {
    const files = collectFiles(implDir);
    for (const f of files) {
      const base = path.basename(f).toLowerCase();
      if (/bloc|competence|rncp|cours|module/.test(base)) return 'training';
    }
  }

  const planDir = path.join(absPath, '_bmad-output', 'planning-artifacts');
  if (fs.existsSync(planDir)) {
    const files = collectFiles(planDir);
    for (const f of files) {
      const base = path.basename(f).toLowerCase();
      if (/bloc|competence|rncp/.test(base)) return 'training';
    }
  }

  return 'dev';
}

function collectFiles(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function importProject(projectPath, userId, options = {}) {
  const scan = scanProject(projectPath);
  const projectName = options.name || scan.name;
  const projectType = options.type || scan.type;

  const project = bspTree.createProject({
    name: projectName,
    type: projectType,
    description: `Imported from ${scan.path}`,
    metadata: { importedFrom: scan.path, importedAt: new Date().toISOString() }
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

  for (const artifact of scan.artifacts) {
    const parsed = parseArtifactContent(artifact.absolutePath);
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
    const result = bspTree.addNode(project.id, parentId, {
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

function dryRun(projectPath, options = {}) {
  const scan = scanProject(projectPath);
  const projectType = options.type || scan.type;

  const preview = {
    projectName: options.name || scan.name,
    projectType,
    totalArtifacts: scan.artifacts.length,
    nodes: []
  };

  for (const artifact of scan.artifacts) {
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

module.exports = { scanProject, importProject, dryRun, importSoul };
