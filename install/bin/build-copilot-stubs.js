#!/usr/bin/env node

/**
 * Build Copilot CLI agent stubs from BYAN source files.
 *
 * Copilot CLI treats .github/agents/*.md as system instructions.
 * It does NOT dynamically load files referenced in the content.
 * This script inlines the full agent + soul + tao content into
 * each stub so Copilot CLI has everything it needs.
 *
 * Usage: node build-copilot-stubs.js [--agent byan] [--all]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.github', 'agents');
const BYAN_DIR = path.join(ROOT, '_byan');

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function stripFrontmatter(content) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function buildByanStub() {
  const agentContent = readFile(path.join(BYAN_DIR, 'agents', 'byan.md'));
  if (!agentContent) {
    console.error('Cannot read _byan/agents/byan.md');
    process.exit(1);
  }

  const soulContent = readFile(path.join(BYAN_DIR, 'soul.md'));
  const taoContent = readFile(path.join(BYAN_DIR, 'tao.md'));
  const soulActivation = readFile(path.join(BYAN_DIR, 'core', 'activation', 'soul-activation.md'));

  const agentBody = stripFrontmatter(agentContent);
  const soulBody = soulContent ? stripFrontmatter(soulContent) : '';
  const taoBody = taoContent ? stripFrontmatter(taoContent) : '';
  const activationBody = soulActivation ? stripFrontmatter(soulActivation) : '';

  const stub = `---
name: 'byan'
description: 'BYAN - Builder of YAN - Agent Creator Specialist'
---

${agentBody}

<!-- ============================================================ -->
<!-- INLINED: Soul System (soul.md + tao.md + soul-activation.md) -->
<!-- ============================================================ -->

<soul-system>

<!-- soul.md -->
${soulBody}

<!-- tao.md -->
${taoBody}

<!-- soul-activation.md -->
${activationBody}

</soul-system>
`;

  const outPath = path.join(AGENTS_DIR, 'bmad-agent-byan.md');
  fs.writeFileSync(outPath, stub, 'utf-8');

  const size = Buffer.byteLength(stub, 'utf-8');
  console.log(`Built: ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  return outPath;
}

function buildModuleAgentStub(agentName, moduleName) {
  const agentPath = path.join(BYAN_DIR, moduleName, 'agents', `${agentName}.md`);
  const agentContent = readFile(agentPath);
  if (!agentContent) {
    console.error(`Cannot read ${agentPath}`);
    return null;
  }

  const agentBody = stripFrontmatter(agentContent);

  const soulPath = path.join(BYAN_DIR, moduleName, 'agents', `${agentName}-soul.md`);
  const soulContent = readFile(soulPath);
  const soulSection = soulContent ? `\n<!-- soul: ${agentName}-soul.md -->\n${stripFrontmatter(soulContent)}\n` : '';

  const stub = `---
name: '${agentName}'
description: '${agentName} agent'
---

${agentBody}
${soulSection}
`;

  const outPath = path.join(AGENTS_DIR, `bmad-agent-${agentName}.md`);
  fs.writeFileSync(outPath, stub, 'utf-8');

  const size = Buffer.byteLength(stub, 'utf-8');
  console.log(`Built: ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  return outPath;
}

// --- CLI ---
const args = process.argv.slice(2);
const agentArg = args.indexOf('--agent') >= 0 ? args[args.indexOf('--agent') + 1] : null;
const buildAll = args.includes('--all');

if (agentArg === 'byan' || buildAll || args.length === 0) {
  buildByanStub();
}

if (agentArg && agentArg !== 'byan') {
  const mod = args.indexOf('--module') >= 0 ? args[args.indexOf('--module') + 1] : 'bmm';
  buildModuleAgentStub(agentArg, mod);
}

if (buildAll || args.length === 0) {
  console.log('\nDone. Run this after editing _byan/agents/byan.md, soul.md, or tao.md.');
}
