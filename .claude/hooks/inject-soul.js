#!/usr/bin/env node
/**
 * SessionStart hook — loads BYAN soul + soul-memory and injects them into
 * the session's initial context via additionalContext. Tao is intentionally
 * NOT bundled here: inject-tao.js is its own SessionStart hook that injects the
 * full tao once into the cacheable prefix, and inject-voice-anchor.js carries a
 * compact per-turn voice reminder. Keeping them separate avoids double-spending
 * the tao payload while leaving each hook single-purpose and testable.
 *
 * Also resets the per-session mid-session-nudge one-shot marker so the
 * soul-memory-triggers nudge is per-session (not per-lifetime). Without
 * this reset the one-shot marker, once written, silences the nudge forever.
 *
 * Safe: missing files are skipped silently, script always exits 0.
 */

const fs = require('fs');
const path = require('path');

// Gen3 puts BYAN's soul files under _byan/agent/byan/; Gen2 keeps them at the
// _byan/ root. Prefer Gen3 when present, fall back to Gen2 (self-contained so
// the hook never depends on a require that could fail).
function soulFile(projectDir, label) {
  const g3 = path.join(projectDir, '_byan', 'agent', 'byan', `${label}.md`);
  const g2 = path.join(projectDir, '_byan', `${label}.md`);
  return fs.existsSync(g3) ? g3 : g2;
}

// Same resolution as soul-memory-triggers.js: Gen3 _byan/memoire/ first, Gen2
// _byan/_memory/ fallback. Kept in sync by hand (hooks avoid shared requires).
function nudgeMarkerPath(projectDir) {
  const memoireDir = path.join(projectDir, '_byan', 'memoire');
  const memoryDir = fs.existsSync(memoireDir)
    ? memoireDir
    : path.join(projectDir, '_byan', '_memory');
  return path.join(memoryDir, '.soul-memory-nudge-sent');
}

// Reset the one-shot nudge marker at session start so the mid-session
// soul-memory nudge can fire once per session instead of once per lifetime.
function resetNudgeMarker(projectDir) {
  try {
    fs.rmSync(nudgeMarkerPath(projectDir), { force: true });
    return true;
  } catch {
    return false;
  }
}

function buildAdditionalContext(projectDir) {
  const files = [
    { label: 'soul', path: soulFile(projectDir, 'soul') },
    { label: 'soul-memory', path: soulFile(projectDir, 'soul-memory') },
  ];

  const chunks = [];
  for (const f of files) {
    try {
      if (fs.existsSync(f.path)) {
        const content = fs.readFileSync(f.path, 'utf8').trim();
        if (content.length > 0) {
          chunks.push(
            `=== BYAN ${f.label.toUpperCase()} (${path.relative(projectDir, f.path)}) ===\n${content}`
          );
        }
      }
    } catch {
      // Ignore read errors — hook must never block session start.
    }
  }

  return chunks.length > 0
    ? `BYAN Soul System (loaded at session start):\n\n${chunks.join('\n\n')}`
    : '';
}

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  resetNudgeMarker(projectDir);
  const additionalContext = buildAdditionalContext(projectDir);
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

module.exports = { soulFile, nudgeMarkerPath, resetNudgeMarker, buildAdditionalContext };
