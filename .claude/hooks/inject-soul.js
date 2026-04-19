#!/usr/bin/env node
/**
 * SessionStart hook — loads BYAN soul/tao/soul-memory and injects them
 * into the session's initial context via additionalContext.
 *
 * Safe: missing files are skipped silently, script always exits 0.
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const files = [
  { label: 'soul', path: path.join(projectDir, '_byan', 'soul.md') },
  { label: 'tao', path: path.join(projectDir, '_byan', 'tao.md') },
  { label: 'soul-memory', path: path.join(projectDir, '_byan', 'soul-memory.md') },
];

const chunks = [];
for (const f of files) {
  try {
    if (fs.existsSync(f.path)) {
      const content = fs.readFileSync(f.path, 'utf8').trim();
      if (content.length > 0) {
        chunks.push(`=== BYAN ${f.label.toUpperCase()} (${path.relative(projectDir, f.path)}) ===\n${content}`);
      }
    }
  } catch {
    // Ignore read errors — hook must never block session start.
  }
}

const additionalContext =
  chunks.length > 0
    ? `BYAN Soul System (loaded at session start):\n\n${chunks.join('\n\n')}`
    : '';

if (additionalContext) {
  process.stdout.write(JSON.stringify({ systemMessage: additionalContext }));
} else {
  process.stdout.write('{}');
}
