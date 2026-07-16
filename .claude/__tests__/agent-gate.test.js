'use strict';

// Tests for the agent entry-gate reactive net (F4): the pure assessment, the
// detectors, the slip flag, the Stop-hook detect(), the voice-anchor pickup, and
// the settings wiring (repo + template parity).

const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../hooks/lib/agent-gate');
const hook = require('../hooks/agent-gate-check');
const voiceAnchor = require('../hooks/inject-voice-anchor');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-gate-'));
  fs.mkdirSync(path.join(dir, '_byan-output'), { recursive: true });
  return dir;
}

// --- assessTurn (the truth table) -----------------------------------------

test('assessTurn: slip only when files were written, no proposal, no active FD', () => {
  assert_(gate.assessTurn({ wroteFiles: true, proposedAgent: false, fdActive: false }).slip === true);
  assert_(gate.assessTurn({ wroteFiles: true, proposedAgent: true, fdActive: false }).slip === false);
  assert_(gate.assessTurn({ wroteFiles: true, proposedAgent: false, fdActive: true }).slip === false);
  assert_(gate.assessTurn({ wroteFiles: false, proposedAgent: false, fdActive: false }).slip === false);
});

function assert_(cond) { expect(cond).toBe(true); }

// --- detectors ------------------------------------------------------------

test('hasProposalMarker catches the gate-engaged signals, ignores plain prose', () => {
  expect(gate.hasProposalMarker('[FD:BUILD] on avance')).toBe(true);
  expect(gate.hasProposalMarker('Aucun agent adapte, je propose une interview')).toBe(true);
  expect(gate.hasProposalMarker('@hermes route ca')).toBe(true);
  expect(gate.hasProposalMarker('voila le script, cree.')).toBe(false);
});

test('hasWriteActivity detects a tool_use write block, false on text-only', () => {
  const withWrite = [{ role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: {} }] }];
  const textOnly = [{ role: 'assistant', content: 'juste du texte' }];
  expect(gate.hasWriteActivity(withWrite)).toBe(true);
  expect(gate.hasWriteActivity(textOnly)).toBe(false);
  expect(gate.hasWriteActivity(null)).toBe(false);
});

// --- slip flag ------------------------------------------------------------

test('slip flag write/read/clear roundtrip', () => {
  const dir = tmpProject();
  expect(gate.readSlip(dir)).toBeNull();
  gate.writeSlip(dir, 'because');
  expect(gate.readSlip(dir).detail).toBe('because');
  gate.clearSlip(dir);
  expect(gate.readSlip(dir)).toBeNull();
});

test('formatReminder names the dispatch/Hermes rule, empty without a slip', () => {
  expect(gate.formatReminder(null)).toBe('');
  const r = gate.formatReminder({ detail: 'x' });
  expect(r.toLowerCase()).toContain('hermes');
  expect(r.toLowerCase()).toContain('agent');
});

// --- fdIsActive -----------------------------------------------------------

test('fdIsActive: true on a live phase, false on COMPLETED/absent', () => {
  const dir = tmpProject();
  expect(gate.fdIsActive(dir)).toBe(false); // no state file
  fs.writeFileSync(path.join(dir, '_byan-output', 'fd-state.json'), JSON.stringify({ phase: 'BUILD' }));
  expect(gate.fdIsActive(dir)).toBe(true);
  fs.writeFileSync(path.join(dir, '_byan-output', 'fd-state.json'), JSON.stringify({ phase: 'COMPLETED' }));
  expect(gate.fdIsActive(dir)).toBe(false);
});

// --- Stop-hook detect() ---------------------------------------------------

test('detect: a direct write with no proposal and no FD flags a slip', () => {
  const dir = tmpProject();
  const payload = {
    last_assistant_message: 'voila, le fichier est cree.',
    transcript: [{ role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: {} }] }],
  };
  const a = hook.detect(payload, dir);
  expect(a.slip).toBe(true);
  expect(gate.readSlip(dir)).not.toBeNull();
});

test('detect: a write WITH an agent proposal is not a slip', () => {
  const dir = tmpProject();
  const payload = {
    last_assistant_message: 'Aucun agent adapte, je propose une interview.',
    transcript: [{ role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: {} }] }],
  };
  expect(hook.detect(payload, dir).slip).toBe(false);
  expect(gate.readSlip(dir)).toBeNull();
});

test('detect: no writes -> no slip (conversational turn)', () => {
  const dir = tmpProject();
  expect(hook.detect({ last_assistant_message: 'juste une reponse' }, dir).slip).toBe(false);
});

// --- voice-anchor pickup --------------------------------------------------

test('withGateReminder appends on a slip, untouched otherwise', () => {
  const out = voiceAnchor.withGateReminder('BASE', { detail: 'x' });
  expect(out.startsWith('BASE')).toBe(true);
  expect(out.toLowerCase()).toContain('hermes');
  expect(voiceAnchor.withGateReminder('BASE', null)).toBe('BASE');
});

// --- wiring parity --------------------------------------------------------

test('agent-gate-check is registered under Stop in repo + template settings', () => {
  const ROOT = path.join(__dirname, '..', '..');
  for (const file of [
    path.join(ROOT, '.claude', 'settings.json'),
    path.join(ROOT, 'install', 'templates', '.claude', 'settings.json'),
  ]) {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const wired = cfg.hooks.Stop.some((g) => (g.hooks || []).some((h) => /agent-gate-check\.js/.test(h.command)));
    expect(wired).toBe(true);
  }
});
