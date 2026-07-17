'use strict';

// WI-4 (party-mode visual signal) + WI-3 (dispatch net) additions to agent-gate.
// The pre-existing agent-gate.test.js covers the original assessTurn/detect ;
// this file covers the new signals, the dispatch slip, and the voice-anchor relay.

const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../hooks/lib/agent-gate');
const hook = require('../hooks/agent-gate-check');
const voiceAnchor = require('../hooks/inject-voice-anchor');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-gate-'));
}
const asg = (blocks) => [{ role: 'assistant', content: blocks }];

describe('WI-4 — task-visual signal', () => {
  test('hasTaskActivity detects TaskCreate / TaskUpdate', () => {
    expect(gate.hasTaskActivity(asg([{ type: 'tool_use', name: 'TaskCreate', input: {} }]))).toBe(true);
    expect(gate.hasTaskActivity(asg([{ type: 'tool_use', name: 'TaskUpdate', input: {} }]))).toBe(true);
    expect(gate.hasTaskActivity(asg([{ type: 'tool_use', name: 'Write', input: {} }]))).toBe(false);
  });
  test('assessTurn: a live task visual holds the entry posture (no slip)', () => {
    expect(gate.assessTurn({ wroteFiles: true, proposedAgent: false, taskVisualSeen: true, fdActive: false }).slip).toBe(false);
    // regression: still a slip without visual / proposal / FD
    expect(gate.assessTurn({ wroteFiles: true, proposedAgent: false, taskVisualSeen: false, fdActive: false }).slip).toBe(true);
  });
});

describe('WI-3 — dispatch net', () => {
  test('hasDispatchActivity detects a byan_dispatch tool call (namespaced)', () => {
    expect(gate.hasDispatchActivity(asg([{ type: 'tool_use', name: 'mcp__byan__byan_dispatch', input: {} }]))).toBe(true);
    expect(gate.hasDispatchActivity(asg([{ type: 'tool_use', name: 'Bash', input: {} }]))).toBe(false);
  });
  test('assessDispatch: code written without dispatch, outside FD -> slip', () => {
    expect(gate.assessDispatch({ wroteFiles: true, dispatchConsulted: false, fdActive: false }).slip).toBe(true);
    expect(gate.assessDispatch({ wroteFiles: true, dispatchConsulted: true, fdActive: false }).slip).toBe(false);
    expect(gate.assessDispatch({ wroteFiles: true, dispatchConsulted: false, fdActive: true }).slip).toBe(false);
    expect(gate.assessDispatch({ wroteFiles: false, dispatchConsulted: false, fdActive: false }).slip).toBe(false);
  });
  test('dispatch slip write/read/clear roundtrip', () => {
    const dir = tmpDir();
    expect(gate.readDispatchSlip(dir)).toBe(null);
    gate.writeDispatchSlip(dir, 'reason');
    expect(gate.readDispatchSlip(dir).detail).toBe('reason');
    gate.clearDispatchSlip(dir);
    expect(gate.readDispatchSlip(dir)).toBe(null);
  });
  test('formatDispatchReminder names byan_dispatch, empty without slip', () => {
    expect(voiceAnchor.withDispatchReminder('base', null)).toBe('base');
    const withR = voiceAnchor.withDispatchReminder('base', { detail: 'x' });
    expect(withR).toMatch(/byan_dispatch/);
  });
});

describe('detect() wires both nets', () => {
  test('a direct code write with no proposal / no visual / no dispatch / no FD -> both slips', () => {
    const dir = tmpDir();
    const payload = {
      last_assistant_message: 'voila le code',
      transcript: asg([{ type: 'tool_use', name: 'Write', input: { file_path: 'x.js', content: 'y' } }]),
    };
    const a = hook.detect(payload, dir);
    expect(a.slip).toBe(true);              // agent-gate slip
    expect(a.dispatch.slip).toBe(true);     // dispatch slip
    expect(gate.readSlip(dir)).not.toBe(null);
    expect(gate.readDispatchSlip(dir)).not.toBe(null);
  });
  test('a turn WITH a task visual is not an agent-gate slip', () => {
    const dir = tmpDir();
    const payload = {
      last_assistant_message: 'je bosse',
      transcript: asg([
        { type: 'tool_use', name: 'TaskCreate', input: {} },
        { type: 'tool_use', name: 'Write', input: { file_path: 'x.js', content: 'y' } },
      ]),
    };
    const a = hook.detect(payload, dir);
    expect(a.slip).toBe(false);
  });
});
