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

// Gen3 puts BYAN's soul files under _byan/agent/byan/; Gen2 keeps them at the
// _byan/ root. Prefer Gen3 when present, fall back to Gen2 (self-contained so
// the hook never depends on a require that could fail).
function soulFile(label) {
  const g3 = path.join(projectDir, '_byan', 'agent', 'byan', `${label}.md`);
  const g2 = path.join(projectDir, '_byan', `${label}.md`);
  return fs.existsSync(g3) ? g3 : g2;
}

const files = [
  { label: 'soul', path: soulFile('soul') },
  { label: 'tao', path: soulFile('tao') },
  { label: 'soul-memory', path: soulFile('soul-memory') },
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
