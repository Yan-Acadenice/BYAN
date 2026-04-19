#!/usr/bin/env node
/**
 * UserPromptSubmit hook — detects resonance / tension / shift / red-line
 * signals in the user message and suggests a mid-session soul-memory entry.
 *
 * Non-blocking: never rejects the prompt. Emits a short nudge when a
 * trigger keyword matches. Max one nudge per session is enforced via a
 * file marker under _byan/_memory/.
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const markerPath = path.join(projectDir, '_byan', '_memory', '.soul-memory-nudge-sent');

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

(async () => {
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
        additionalContext = `BYAN soul-memory trigger detected (${hit.category}): "${hit.pattern}". Per soul-memory protocol, consider offering the user a mid-session introspection entry. Maximum 2 entries per session, always validated by user.`;
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
