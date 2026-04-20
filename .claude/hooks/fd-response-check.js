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

function extractLastAssistantText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const tx = payload.transcript || payload.messages || [];
  if (!Array.isArray(tx)) return '';
  for (let i = tx.length - 1; i >= 0; i--) {
    const m = tx[i];
    if (m && m.role === 'assistant') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((c) => (typeof c === 'object' && c.text ? c.text : ''))
          .join(' ');
      }
    }
  }
  return '';
}

(async () => {
  const state = readState();
  if (!state || ['COMPLETED', 'ABORTED'].includes(state.phase)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const text = extractLastAssistantText(payload);
  const expected = `[FD:${state.phase}]`;

  if (!text || text.includes(expected)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const reason = `FD active (phase=${state.phase}) but your last response did not include the required header "${expected}". Reformulate your answer starting with ${expected} to confirm you are operating in the correct phase. If you wanted to exit or change phase, call byan_fd_advance first.`;

  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason,
      systemMessage: reason,
    })
  );
  process.exit(2);
})();
