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
const layoutResolver = require('../../src/byan-v2/lib/layout-resolver');

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
  // Layout resolver: Gen3 _byan/agent/byan/ first, Gen2 fallback.
  const agentHit = layoutResolver.resolveAgent('byan', { projectRoot: ROOT });
  const agentContent = agentHit ? readFile(agentHit.path) : null;
  if (!agentContent) {
    console.error('Cannot find the byan agent file (looked in Gen3 _byan/agent/byan/ and Gen2 layouts)');
    process.exit(1);
  }

  const soulHit = layoutResolver.resolveSoul('soul', { projectRoot: ROOT });
  const taoHit = layoutResolver.resolveSoul('tao', { projectRoot: ROOT });
  const soulContent = soulHit ? readFile(soulHit.path) : null;
  const taoContent = taoHit ? readFile(taoHit.path) : null;
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
  // Resolve the agent across layouts (Gen3 _byan/agent/<name>/, Gen2 flat +
  // per-module); fall back to the explicit module path passed on the CLI.
  const agentHit = layoutResolver.resolveAgent(agentName, { projectRoot: ROOT });
  const agentPath = agentHit ? agentHit.path : path.join(BYAN_DIR, moduleName, 'agents', `${agentName}.md`);
  const agentContent = readFile(agentPath);
  if (!agentContent) {
    console.error(`Cannot read agent ${agentName} (looked via resolver and ${path.relative(ROOT, agentPath)})`);
    return null;
  }

  const agentBody = stripFrontmatter(agentContent);

  // Soul sibling lives next to the resolved agent file.
  const soulPath = path.join(path.dirname(agentPath), `${agentName}-soul.md`);
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
