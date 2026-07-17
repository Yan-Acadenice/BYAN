#!/usr/bin/env node
'use strict';

// Stop hook — WI-2, the reactive net for BYAN voice conformance (soul/tao).
//
// At end of turn it scans the finished reply for the objective voice slips (emoji,
// vouvoiement cluster) and, on a slip, writes a one-turn flag under _byan-output/.
// The next-turn voice anchor surfaces it in plain French. It NEVER blocks the turn
// (the register is semantic — a hard wall would false-positive) : always exits 0.
//
// The judgment lives in lib/voice-conformance.js (pure) ; this shell only pulls
// the reply text from the transcript.

const { extractLastAssistantText } = require('./lib/transcript-read');
const voice = require('./lib/voice-conformance');

function detect(payload, projectDir) {
  const text = extractLastAssistantText(payload);
  const hits = voice.scanVoice(text);
  if (hits.length) voice.writeSlip(projectDir, hits);
  return hits;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

if (require.main === module) {
  (async () => {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    let payload = {};
    try {
      const raw = await readStdin();
      if (raw && raw.trim()) payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
    try {
      detect(payload, projectDir);
    } catch {
      // never block end-of-turn
    }
    process.stdout.write('{}');
    process.exit(0);
  })();
}

module.exports = { detect };
