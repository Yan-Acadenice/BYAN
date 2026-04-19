#!/usr/bin/env node
/**
 * UserPromptSubmit hook — injects BYAN tao voice directives into every
 * user prompt so Claude's response respects the register even when BYAN
 * agent isn't explicitly invoked.
 *
 * Reads _byan/tao.md. If absent or empty, emits empty additionalContext
 * (no-op). Always exits 0.
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const taoPath = path.join(projectDir, '_byan', 'tao.md');

let additionalContext = '';
try {
  if (fs.existsSync(taoPath)) {
    const content = fs.readFileSync(taoPath, 'utf8').trim();
    if (content.length > 0) {
      additionalContext = `BYAN tao directives (active for this turn — follow register, signatures, forbidden vocabulary):\n\n${content}`;
    }
  }
} catch {
  // Hook must never block prompt submission.
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: additionalContext || '',
    },
  })
);
