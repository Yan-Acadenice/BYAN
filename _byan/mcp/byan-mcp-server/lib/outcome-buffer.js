// Outcome buffer — the append-only capture file the advisory auto-feed drains.
//
// byan_outcome_log appends one validated outcome per line here during a turn; the
// drain-advisory Stop hook reads it at end of turn and records each new line into
// the advisory ledgers, advancing a line cursor for idempotency. Both sides take an
// injected `io` so the logic is testable without touching the real filesystem, and
// every operation is best-effort: a capture buffer must never break a turn.

import fs from 'node:fs';
import path from 'node:path';

export const BUFFER_REL = path.join('_byan-output', 'pending-outcomes.jsonl');
export const CURSOR_REL = path.join('_byan-output', '.advisory-cursor.json');

function bufferPath(rootDir) {
  return path.join(rootDir, BUFFER_REL);
}
function cursorPath(rootDir) {
  return path.join(rootDir, CURSOR_REL);
}

// Append one outcome object as a jsonl line. Best-effort: returns true on write,
// false if the write threw (the caller stays safe).
export function appendOutcome(outcome, { rootDir, io = fs } = {}) {
  try {
    const p = bufferPath(rootDir);
    io.mkdirSync(path.dirname(p), { recursive: true });
    io.appendFileSync(p, JSON.stringify(outcome) + '\n');
    return true;
  } catch {
    return false;
  }
}

// Read the raw buffer text, or '' if absent/unreadable.
export function readBuffer({ rootDir, io = fs } = {}) {
  try {
    return io.readFileSync(bufferPath(rootDir), 'utf8');
  } catch {
    return '';
  }
}

// Read the drain cursor (number of buffer lines already recorded), or 0.
export function readCursor({ rootDir, io = fs } = {}) {
  try {
    const obj = JSON.parse(io.readFileSync(cursorPath(rootDir), 'utf8'));
    return Number.isInteger(obj && obj.drained) && obj.drained >= 0 ? obj.drained : 0;
  } catch {
    return 0;
  }
}

// Persist the drain cursor. Best-effort.
export function writeCursor(drained, { rootDir, io = fs } = {}) {
  try {
    const p = cursorPath(rootDir);
    io.mkdirSync(path.dirname(p), { recursive: true });
    io.writeFileSync(p, JSON.stringify({ drained }) + '\n');
    return true;
  } catch {
    return false;
  }
}
