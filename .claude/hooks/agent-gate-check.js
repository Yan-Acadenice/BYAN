#!/usr/bin/env node
'use strict';

// Stop hook — the reactive net for BYAN's mandatory agent entry gate (F4).
//
// At end of turn it asks: was a task handled DIRECTLY (files written) without any
// agent proposal and outside an active FD cycle ? If so it writes a one-turn flag
// under _byan-output/ ; the next-turn voice reminder surfaces it in plain French.
// It NEVER blocks the turn (the user asked to signal, not trap) — always exits 0.
//
// The judgment lives in lib/agent-gate.js (pure) ; this shell only extracts the
// signals from the transcript + fd-state.

const fs = require('fs');
const { extractLastAssistantText, extractRecentMessages } = require('./lib/transcript-read');
const gate = require('./lib/agent-gate');

// detect(payload, projectDir) — testable core. Returns the assessment and writes
// the flag on a slip.
function detect(payload, projectDir) {
  const text = extractLastAssistantText(payload);
  const messages = extractRecentMessages(payload, 8) || [];
  const assessment = gate.assessTurn({
    wroteFiles: gate.hasWriteActivity(messages),
    proposedAgent: gate.hasProposalMarker(text),
    fdActive: gate.fdIsActive(projectDir),
  });
  if (assessment.slip) gate.writeSlip(projectDir, assessment.reason);
  return assessment;
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
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
    detect(payload, projectDir);
  } catch {
    // never block end-of-turn
  }
  process.stdout.write('{}');
}

module.exports = { detect };
