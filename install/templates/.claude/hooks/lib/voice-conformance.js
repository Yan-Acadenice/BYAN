'use strict';

// WI-2 core — the reactive net for BYAN voice conformance (soul/tao).
//
// The tao is injected as context (inject-tao / voice-anchor) but nothing checks
// that a reply actually holds the voice : it is prose Claude can drift from. This
// net scans the finished reply for the OBJECTIVE, low-false-positive voice
// signals and flags a slip carried to the next turn — the same forward-net
// mechanics as plain-language / agent-gate. It is NON-BLOCKING by design : the
// register/timbre of the tao is semantic and cannot be a hard wall without
// constant false positives (honest ceiling ; deep audit stays byan-mantra-audit).
//
// Two objective signals only :
//   1. emoji in the reply (Mantra IA-23 : zero emoji — hard, unambiguous).
//   2. vouvoiement (BYAN tutoies always, per tao) — flagged only on a CLUSTER
//      (>= 2 occurrences) so a single quoted "vous" does not trip it.
//
// Pure (no I/O beyond the slip flag). Code spans are stripped before scanning so
// a quoted `vous` variable or an emoji inside a code sample is not policed.

const fs = require('fs');
const path = require('path');
const { stripCode } = require('./plain-language');

// True pictographic emoji (Mantra IA-23). Excludes plain arrows (U+2190-21FF)
// which BYAN uses legitimately in prose ("->", "→").
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

// Second-person-plural address. French-aware boundaries so "nous"/"vousXYZ" and
// accented neighbours do not false-match.
const VOUS_RE = /(?<![A-Za-zÀ-ÿ0-9_])(vous|votre|vos|vôtre|vôtres)(?![A-Za-zÀ-ÿ0-9_])/gi;

// scanVoice(text) -> [{ kind, good }]. Empty when the reply holds the voice.
function scanVoice(text) {
  const prose = stripCode(text);
  if (!prose) return [];
  const hits = [];
  if (EMOJI_RE.test(prose)) {
    hits.push({ kind: 'emoji', good: 'zero emoji (Mantra IA-23) — retire-les' });
  }
  const vousCount = (prose.match(VOUS_RE) || []).length;
  if (vousCount >= 2) {
    hits.push({ kind: 'vouvoiement', good: 'BYAN tutoie toujours (tao) — dis "tu", pas "vous"' });
  }
  return hits;
}

function formatReminder(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return '';
  const shown = hits.map((h) => `${h.kind} (${h.good})`).join(' ; ');
  return [
    'Rappel voix (tao / soul) : au dernier tour la voix BYAN a glisse ->', `${shown}.`,
    'Reformule ce tour-ci dans la voix BYAN (tutoiement, zero emoji), sans refaire',
    'la reponse precedente.',
  ].join(' ');
}

// --- slip flag (isolated I/O, same family as the other forward nets) ----------

function slipPath(projectDir) {
  return path.join(projectDir, '_byan-output', '.voice-slip.json');
}

function writeSlip(projectDir, hits) {
  try {
    const p = slipPath(projectDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ hits }));
    return true;
  } catch {
    return false;
  }
}

function readSlip(projectDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(slipPath(projectDir), 'utf8'));
    return Array.isArray(parsed.hits) ? parsed.hits : null;
  } catch {
    return null;
  }
}

function clearSlip(projectDir) {
  try { fs.rmSync(slipPath(projectDir), { force: true }); } catch { /* never block */ }
}

module.exports = {
  EMOJI_RE,
  VOUS_RE,
  scanVoice,
  formatReminder,
  slipPath,
  writeSlip,
  readSlip,
  clearSlip,
};
