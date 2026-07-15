// F3 — the shared BLACKBOARD: the turn-by-turn message log the agents use to
// exchange information (the honest substitute for a live peer chat). It is the
// analogue of the byan_web server holding the conversation: each agent reads the
// board at the start of its turn and appends to it at the end. The orchestrating
// loop (F4) owns the turn order; this module only stores and renders the exchange.
//
// A message is { turn, from, to, kind, content }. `to` may be a specific agent or
// '*' (broadcast). kind is one of KINDS. Pure functions build and render entries;
// I/O (append/read a JSONL sidecar under _byan-output/) is isolated so the pure
// core is unit-testable without the filesystem.

import fs from 'node:fs';
import path from 'node:path';

export const KINDS = Object.freeze({
  DESIGN: 'design',
  WORK: 'work',
  QUESTION: 'question',
  ANSWER: 'answer',
  RESULT: 'result',
  NOTE: 'note',
});

export const BROADCAST = '*';

// makeEntry — normalize a raw message into the stored shape. Pure. Coerces the
// turn to a non-negative integer and trims strings; an unknown kind becomes NOTE
// (never rejected, so a caller mistake degrades to a visible note rather than a
// throw mid-loop).
export function makeEntry({ turn = 0, from = '', to = BROADCAST, kind = KINDS.NOTE, content = '' } = {}) {
  const t = Number.isInteger(turn) && turn >= 0 ? turn : 0;
  const k = Object.values(KINDS).includes(kind) ? kind : KINDS.NOTE;
  return {
    turn: t,
    from: String(from).trim(),
    to: String(to).trim() || BROADCAST,
    kind: k,
    content: String(content == null ? '' : content).trim(),
  };
}

// entriesForAgent — the subset an agent should see: broadcasts plus anything
// addressed to it, plus its own messages (so it recalls what it already said).
// Pure.
export function entriesForAgent(entries, agentName) {
  const me = String(agentName || '').trim();
  return (Array.isArray(entries) ? entries : []).filter(
    (e) => e && (e.to === BROADCAST || e.to === me || e.from === me)
  );
}

// pendingQuestions — questions with no later ANSWER referencing the same asker.
// A question is answered when a later entry of kind ANSWER is sent to its `from`.
// Pure; lets the loop decide whether the exchange has converged.
export function pendingQuestions(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const questions = list.filter((e) => e && e.kind === KINDS.QUESTION);
  return questions.filter((q) => {
    return !list.some(
      (a) => a && a.kind === KINDS.ANSWER && a.to === q.from && a.turn > q.turn
    );
  });
}

// renderForAgent — the plain-text transcript an agent reads at the start of its
// turn. One line per relevant entry, in order, direction shown. Pure.
export function renderForAgent(entries, agentName) {
  const relevant = entriesForAgent(entries, agentName);
  if (!relevant.length) return 'Tableau partage : (vide - tu ouvres l echange)';
  const lines = relevant.map(
    (e) => `[t${e.turn} ${e.from} -> ${e.to}] ${e.kind}: ${e.content}`
  );
  return ['Tableau partage (echange en cours, lis avant de repondre) :', ...lines].join('\n');
}

// --- I/O (isolated) -------------------------------------------------------

// The board lives under _byan-output/ (gitignored), one JSONL file per dispatch
// session. Session id is caller-supplied (the loop passes the fd/dispatch id).
export function blackboardPath(projectDir, sessionId) {
  const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(projectDir, '_byan-output', 'dispatch', safe, 'blackboard.jsonl');
}

// appendEntry — normalize + append one line. Creates the session dir on first
// write. Returns the stored entry (best-effort: returns null on an I/O failure so
// the loop can note it without crashing).
export function appendEntry(projectDir, sessionId, raw) {
  const entry = makeEntry(raw);
  try {
    const p = blackboardPath(projectDir, sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
    return entry;
  } catch {
    return null;
  }
}

// readEntries — parse the JSONL board into an array, skipping malformed lines.
// Missing file -> []. Never throws.
export function readEntries(projectDir, sessionId) {
  try {
    const raw = fs.readFileSync(blackboardPath(projectDir, sessionId), 'utf8');
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip malformed line */ }
    }
    return out;
  } catch {
    return [];
  }
}
