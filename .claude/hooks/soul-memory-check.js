#!/usr/bin/env node
/**
 * SessionStart hook — checks soul-memory last-revision and reminds the
 * agent when > 14 days since last introspection.
 *
 * Parses the soul-memory file looking for a "last-revision: YYYY-MM-DD"
 * marker (tolerant of markdown bold, e.g. "**last-revision:** 2026-02-21").
 * If missing or stale, emits a reminder as additionalContext so the agent
 * (not just the user) sees it. Never blocks, always exits 0.
 */

const fs = require('fs');
const path = require('path');

const STALE_DAYS = 14;
const SOUL_REVISION_WORKFLOW = '_byan/workflow/simple/byan/soul-revision.md';

function memoryPathFor(projectDir) {
  // Gen3 _byan/agent/byan/soul-memory.md first, Gen2 _byan/soul-memory.md fallback.
  const gen3 = path.join(projectDir, '_byan', 'agent', 'byan', 'soul-memory.md');
  return fs.existsSync(gen3) ? gen3 : path.join(projectDir, '_byan', 'soul-memory.md');
}

function findLastRevision(content) {
  // [^\d]{0,8} tolerates markdown punctuation between the label and the date
  // (e.g. "**last-revision:** 2026-02-21" or "last_revision = 2026-02-21")
  // while forbidding any digit in the gap, so a stray earlier year cannot be
  // captured instead of the real date.
  const m = (content || '').match(/last[-_ ]revision[^\d]{0,8}(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

function daysSince(dateStr, now = new Date()) {
  const then = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(then.getTime())) return null;
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// Pure reminder builder — returns the additionalContext string (or '').
function buildReminder(content, memoryRel, now = new Date()) {
  const last = findLastRevision(content);
  const age = last ? daysSince(last, now) : null;

  if (last == null) {
    return `BYAN soul-memory reminder: no last-revision marker found in ${memoryRel}. Consider running the soul-revision workflow (${SOUL_REVISION_WORKFLOW}) early this session.`;
  }
  if (age != null && age > STALE_DAYS) {
    return `BYAN soul-memory reminder: last revision of ${memoryRel} was ${last} (${age} days ago, threshold ${STALE_DAYS}). Per soul-activation protocol, offer to run ${SOUL_REVISION_WORKFLOW} after greeting. User can postpone with "pas maintenant" (+7 days).`;
  }
  return '';
}

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const memoryPath = memoryPathFor(projectDir);
  let additionalContext = '';

  try {
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf8');
      additionalContext = buildReminder(content, path.relative(projectDir, memoryPath));
    }
  } catch {
    // never block
  }

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

module.exports = { findLastRevision, daysSince, buildReminder, memoryPathFor, SOUL_REVISION_WORKFLOW };
