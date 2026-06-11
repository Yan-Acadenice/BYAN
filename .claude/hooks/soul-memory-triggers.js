#!/usr/bin/env node
/**
 * UserPromptSubmit hook — detects resonance / tension / shift / red-line
 * signals in the user message and suggests a mid-session soul-memory entry.
 *
 * Non-blocking: never rejects the prompt. Emits a short nudge when a
 * trigger keyword matches. One nudge per session is enforced via a file
 * marker; the marker is reset at SessionStart by inject-soul.js so the
 * one-shot is per-session, not per-lifetime.
 *
 * The nudge names the byan_soul_memory_append MCP tool explicitly so the
 * reflect -> append loop actually closes (the agent knows HOW to persist
 * the entry, after the user validates it).
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// State marker lives under the memory dir: Gen3 _byan/memoire/ first, Gen2
// _byan/_memory/ fallback (whichever dir exists; default Gen2). MUST resolve
// identically to inject-soul.js nudgeMarkerPath (it resets this marker at
// SessionStart) — the soul-hooks parity test pins that invariant.
function markerPathFor(dir) {
  const memoireDir = path.join(dir, '_byan', 'memoire');
  const memoryDir = fs.existsSync(memoireDir) ? memoireDir : path.join(dir, '_byan', '_memory');
  return path.join(memoryDir, '.soul-memory-nudge-sent');
}
const markerPath = markerPathFor(projectDir);

const TRIGGERS = {
  resonance: ['resonne', 'ca me parle', 'exactement', 'c\'est ca', 'that resonates'],
  tension: ['pas d\'accord', 'disagree', 'non mais', 'pourquoi tu', 'tu te trompes'],
  shift: ['je change d\'avis', 'autrement', 'en fait', 'je realise', 'i realize'],
  redLine: ['ligne rouge', 'jamais', 'je refuse', 'red line', 'never acceptable'],
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

function findTrigger(text) {
  const lower = (text || '').toLowerCase();
  for (const [category, patterns] of Object.entries(TRIGGERS)) {
    for (const p of patterns) {
      if (lower.includes(p)) return { category, pattern: p };
    }
  }
  return null;
}

// Build the nudge text. It names the byan_soul_memory_append MCP tool so the
// reflect -> append loop closes instead of dead-ending at "consider offering".
function buildNudge(hit) {
  return `BYAN soul-memory trigger detected (${hit.category}): "${hit.pattern}". Per soul-memory protocol, offer the user a mid-session introspection entry; if they validate it, persist it by calling the byan_soul_memory_append MCP tool (entry = the insight, category = ${hit.category}). One nudge per session, always validated by the user first.`;
}

if (require.main === module) (async () => {
  let additionalContext = '';

  try {
    const raw = await readStdin();
    let prompt = '';
    try {
      const parsed = JSON.parse(raw);
      prompt = parsed.prompt || parsed.userPrompt || parsed.message || '';
    } catch {
      prompt = raw;
    }

    if (!fs.existsSync(markerPath)) {
      const hit = findTrigger(prompt);
      if (hit) {
        additionalContext = buildNudge(hit);
        try {
          fs.mkdirSync(path.dirname(markerPath), { recursive: true });
          fs.writeFileSync(markerPath, new Date().toISOString());
        } catch {
          // keep going
        }
      }
    }
  } catch {
    // never block
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: additionalContext || '',
      },
    })
  );
})();

module.exports = { findTrigger, buildNudge, markerPathFor, TRIGGERS };
