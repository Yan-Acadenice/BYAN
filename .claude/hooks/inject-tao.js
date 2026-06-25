#!/usr/bin/env node
/**
 * SessionStart hook — injects BYAN's FULL tao (voice directives) ONCE into the
 * session's initial context, so it lands in the stable, cacheable prefix instead
 * of being re-sent on every turn.
 *
 * Cache rationale: a UserPromptSubmit injection is appended at the growing edge
 * each turn, so the full ~3.6k-token tao was re-billed N times over a session.
 * Loaded once at SessionStart it sits in the stable prefix (cache read at 10%).
 * The per-turn voice freshness is carried by the tiny inject-voice-anchor.js
 * (UserPromptSubmit): full tao here, compact anchor there. The voice stays 100%
 * present every turn — nothing about it becomes conditional.
 *
 * Reads _byan/agent/byan/tao.md (Gen3) then _byan/tao.md (Gen2). Missing/empty ->
 * empty additionalContext (no-op). Always exits 0.
 */

const fs = require('fs');
const path = require('path');

// Gen3 puts tao under _byan/agent/byan/; Gen2 keeps it at the _byan/ root.
function taoFile(projectDir) {
  const g3 = path.join(projectDir, '_byan', 'agent', 'byan', 'tao.md');
  const g2 = path.join(projectDir, '_byan', 'tao.md');
  return fs.existsSync(g3) ? g3 : g2;
}

function buildTaoContext(projectDir) {
  try {
    const p = taoFile(projectDir);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8').trim();
      if (content.length > 0) {
        return `BYAN tao (voice directives, loaded once at session start — register, signatures, forbidden vocabulary):\n\n${content}`;
      }
    }
  } catch {
    // Hook must never block session start.
  }
  return '';
}

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const additionalContext = buildTaoContext(projectDir);
  if (additionalContext) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
      })
    );
  } else {
    process.stdout.write('{}');
  }
}

module.exports = { taoFile, buildTaoContext };
