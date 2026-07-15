#!/usr/bin/env node
'use strict';

// Stop hook — the FORWARD net for the "parler reel" rule (Mantra IA-26).
//
// It reads the assistant reply that just finished, looks for the known
// jargon/anglais repeat-offenders, and — if it finds any — writes a one-turn
// slip flag under _byan-output/. It NEVER blocks the turn: there is no re-answer,
// no regen. The next-turn voice anchor (inject-voice-anchor.js) reads the flag,
// reminds the agent in plain French, and clears it. Carrying the correction
// FORWARD is deliberate: a blocking guard would force a costly regen AND the user
// has already read the slip anyway (no pre-display hook exists).
//
// Always exits 0. A read/scan/write failure degrades to a no-op.

const fs = require('fs');
const { extractLastAssistantText } = require('./lib/transcript-read');
const pl = require('./lib/plain-language');

// Testable core: scan the finished reply, flag a slip if any. Returns the hits.
function detectAndFlag(payload, projectDir) {
  const text = extractLastAssistantText(payload);
  const hits = pl.scanText(text);
  if (hits.length > 0) pl.writeSlip(projectDir, hits);
  return hits;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let payload = {};
  try {
    const raw = readStdin();
    if (raw && raw.trim()) payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  try {
    detectAndFlag(payload, projectDir);
  } catch {
    // never block end-of-turn
  }
  process.stdout.write('{}');
}

module.exports = { detectAndFlag };
