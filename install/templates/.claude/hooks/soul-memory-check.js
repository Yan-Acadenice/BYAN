#!/usr/bin/env node
/**
 * SessionStart hook — checks soul-memory last-revision and reminds the
 * agent when > 14 days since last introspection.
 *
 * Parses _byan/soul-memory.md looking for "last-revision: YYYY-MM-DD"
 * (common soul-memory protocol). If missing or stale, emits a reminder
 * as additionalContext. Never blocks, always exits 0.
 */

const fs = require('fs');
const path = require('path');

const STALE_DAYS = 14;

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const memoryPath = path.join(projectDir, '_byan', 'soul-memory.md');

function findLastRevision(content) {
  const m = content.match(/last[-_ ]revision\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

function daysSince(dateStr, now = new Date()) {
  const then = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(then.getTime())) return null;
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

let additionalContext = '';

try {
  if (fs.existsSync(memoryPath)) {
    const content = fs.readFileSync(memoryPath, 'utf8');
    const last = findLastRevision(content);
    const age = last ? daysSince(last) : null;

    if (last == null) {
      additionalContext = `BYAN soul-memory reminder: no last-revision marker found in _byan/soul-memory.md. Consider running the soul-revision workflow early this session.`;
    } else if (age != null && age > STALE_DAYS) {
      additionalContext = `BYAN soul-memory reminder: last revision was ${last} (${age} days ago, threshold ${STALE_DAYS}). Per soul-activation protocol, offer to run _byan/workflows/byan/soul-revision.md after greeting. User can postpone with "pas maintenant" (+7 days).`;
    }
  }
} catch {
  // never block
}

process.stdout.write(JSON.stringify({ hookSpecificOutput: { additionalContext } }));
