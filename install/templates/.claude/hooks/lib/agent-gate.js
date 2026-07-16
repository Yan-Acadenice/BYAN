'use strict';

// F4 core — the reactive net for the mandatory agent entry gate.
//
// BYAN's philosophy: every non-conversational task passes through Hermes+BYAN
// PROPOSING a suited agent (or an interview to create one), validated by the
// user, BEFORE any work. No pre-display hook exists, so this net is post-hoc: at
// end of turn it detects a task done DIRECTLY (files written) without any agent
// proposal and without an active FD cycle, writes a one-turn flag, and the
// next-turn reminder surfaces it. Non-blocking by design (the user asked to
// "signal", not to trap the turn) — the correction lands on the next turn.
//
// Pure: assessTurn + the marker/write detectors take plain inputs. The flag I/O
// is isolated. The hook shell feeds it transcript + fd-state signals.

const fs = require('fs');
const path = require('path');

// Text signals that the entry gate WAS engaged this turn (an agent was proposed,
// an FD phase is being narrated, a specialist was addressed, or the interview /
// no-fit path was surfaced). Any of these means "not a silent direct-do".
const PROPOSAL_MARKERS = [
  '[fd:', '@hermes', 'agent adapte', 'aucun agent', 'je propose', 'proposition d\'agent',
  'interview', 'byan-hermes-dispatch', 'dispatch d\'agent', 'quel agent',
];

// Tool names that count as "did real work on the repo" this turn.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function hasProposalMarker(text) {
  const t = String(text == null ? '' : text).toLowerCase();
  return PROPOSAL_MARKERS.some((m) => t.includes(m));
}

// hasWriteActivity(messages) — true if any recent assistant message carried a
// tool_use block that writes to the repo. `messages` is an array of
// { role, content } where content is a string or a block array.
function hasWriteActivity(messages) {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block && block.type === 'tool_use' && WRITE_TOOLS.has(block.name)) return true;
    }
  }
  return false;
}

// assessTurn — the decision. A slip is a task done directly (files written) with
// no agent proposal AND no active FD cycle. When an FD is engaged, the gate is
// already in play (DISPATCH is part of it), so it is never a slip.
function assessTurn({ wroteFiles = false, proposedAgent = false, fdActive = false } = {}) {
  const slip = Boolean(wroteFiles && !proposedAgent && !fdActive);
  return {
    slip,
    reason: slip
      ? 'files written directly without an agent proposal and no active FD cycle'
      : 'ok',
  };
}

// --- slip flag (isolated I/O, mirrors the plain-language forward net) ------

function slipPath(projectDir) {
  return path.join(projectDir, '_byan-output', '.agent-gate-slip.json');
}

function writeSlip(projectDir, detail) {
  try {
    const p = slipPath(projectDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ detail: String(detail || '') }));
    return true;
  } catch {
    return false;
  }
}

function readSlip(projectDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(slipPath(projectDir), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clearSlip(projectDir) {
  try { fs.rmSync(slipPath(projectDir), { force: true }); } catch { /* never block */ }
}

// formatReminder — the plain-French note injected next turn. Empty when no slip.
function formatReminder(slip) {
  if (!slip) return '';
  return [
    'Rappel dispatch (porte d\'entree BYAN) : au dernier tour une tache a ete',
    'traitee en direct sans proposer d\'agent adapte. La base de BYAN, c\'est de',
    'passer par Hermes : proposer l\'agent qui colle (ou une interview pour en',
    'creer un), l\'utilisateur valide, PUIS on lance le travail. Applique-le ce tour-ci.',
  ].join(' ');
}

// fdIsActive(projectDir) — reads _byan-output/fd-state.json ; active means a live
// phase (not COMPLETED / ABORTED / absent). Read-only, best-effort.
function fdIsActive(projectDir) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '_byan-output', 'fd-state.json'), 'utf8'));
    const phase = state && state.phase;
    return Boolean(phase) && phase !== 'COMPLETED' && phase !== 'ABORTED';
  } catch {
    return false;
  }
}

module.exports = {
  PROPOSAL_MARKERS,
  WRITE_TOOLS,
  hasProposalMarker,
  hasWriteActivity,
  assessTurn,
  slipPath,
  writeSlip,
  readSlip,
  clearSlip,
  formatReminder,
  fdIsActive,
};
