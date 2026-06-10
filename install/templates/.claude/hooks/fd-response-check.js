#!/usr/bin/env node
/**
 * Stop hook — FD response check.
 *
 * When an FD cycle is active, verify my most recent assistant response
 * starts with a `[FD:<PHASE>]` header matching the current phase. If
 * missing, return decision=block with a reason, forcing me to
 * reformulate with the correct phase marker.
 *
 * When no FD is active, do nothing.
 *
 * Non-blocking on any IO/parse error — the hook never prevents Stop
 * when it can't tell.
 */

const fs = require('fs');
const path = require('path');
// Shared transcript reader — the real Stop payload has no inline transcript
// (last_assistant_message + transcript_path JSONL). Without it this hook read an
// empty turn and never enforced the [FD:PHASE] header live.
const { extractLastAssistantText } = require('./lib/transcript-read');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const statePath = path.join(projectDir, '_byan-output', 'fd-state.json');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function readState() {
  try {
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

// Pure decision : returns { block, reason? }. No IO — unit-testable.
function decideFdResponse({ state, lastAssistantText }) {
  if (!state || ['COMPLETED', 'ABORTED'].includes(state.phase)) return { block: false };

  const expected = `[FD:${state.phase}]`;
  const text = lastAssistantText || '';
  // Empty text (cannot read the turn) degrades to allow — never trap a turn we
  // cannot inspect. A present header satisfies.
  if (!text || text.includes(expected)) return { block: false };

  const reason = `FD active (phase=${state.phase}) but your last response did not include the required header "${expected}". Reformulate your answer starting with ${expected} to confirm you are operating in the correct phase. If you wanted to exit or change phase, call byan_fd_advance first.`;
  return { block: true, reason };
}

if (require.main === module) {
  (async () => {
    const state = readState();
    const raw = await readStdin();
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const decision = decideFdResponse({ state, lastAssistantText: extractLastAssistantText(payload) });
    if (!decision.block) {
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }

    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: decision.reason, systemMessage: decision.reason })
    );
    process.exit(2);
  })();
}

module.exports = { decideFdResponse, extractLastAssistantText };
