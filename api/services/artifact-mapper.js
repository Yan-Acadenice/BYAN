'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT_RULES = [
  { pattern: /prd/i, nodeType: 'project_root', category: 'prd' },
  { pattern: /architect/i, nodeType: 'project_root', category: 'architecture' },
  { pattern: /tech[_-]?spec/i, nodeType: 'project_root', category: 'tech-spec' },
  { pattern: /epic/i, nodeType: 'epic', category: 'epic' },
  { pattern: /stor(y|ies)/i, nodeType: 'story', category: 'story' },
  { pattern: /user[_-]?stor/i, nodeType: 'story', category: 'story' },
  { pattern: /sprint/i, nodeType: 'story', category: 'sprint' },
  { pattern: /cours/i, nodeType: 'module', category: 'course' },
  { pattern: /module/i, nodeType: 'module', category: 'module' },
  { pattern: /bloc/i, nodeType: 'bloc', category: 'bloc' },
  { pattern: /competence/i, nodeType: 'competence', category: 'competence' },
  { pattern: /rncp/i, nodeType: 'competence', category: 'rncp' }
];

function mapArtifactToNode(artifact) {
  const basename = path.basename(artifact.path).toLowerCase();

  for (const rule of ARTIFACT_RULES) {
    if (rule.pattern.test(basename)) {
      return {
        nodeType: artifact.projectType === 'training'
          ? mapToTrainingType(rule.nodeType)
          : mapToDevType(rule.nodeType),
        category: rule.category,
        name: extractNameFromPath(artifact.path),
        isProjectContext: rule.nodeType === 'project_root'
      };
    }
  }

  return {
    nodeType: 'project_root',
    category: 'knowledge',
    name: extractNameFromPath(artifact.path),
    isProjectContext: true
  };
}

function mapToDevType(nodeType) {
  const devTypes = ['project_root', 'epic', 'story'];
  if (devTypes.includes(nodeType)) return nodeType;
  return 'project_root';
}

function mapToTrainingType(nodeType) {
  const trainingTypes = ['project_root', 'bloc', 'module', 'competence'];
  if (trainingTypes.includes(nodeType)) return nodeType;
  if (nodeType === 'epic') return 'bloc';
  if (nodeType === 'story') return 'module';
  return 'project_root';
}

function extractNameFromPath(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function parseArtifactContent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (frontmatterMatch) {
    const frontmatter = parseFrontmatter(frontmatterMatch[1]);
    return {
      frontmatter,
      content: frontmatterMatch[2].trim(),
      raw
    };
  }

  return { frontmatter: null, content: raw.trim(), raw };
}

function parseFrontmatter(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

module.exports = { mapArtifactToNode, parseArtifactContent, extractNameFromPath };
