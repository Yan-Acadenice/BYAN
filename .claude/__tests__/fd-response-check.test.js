/**
 * Tests for the FD response-check Stop hook decision.
 *
 * This hook had NO test, which is why its transcript-read bug (it read
 * payload.transcript||messages, empty in production) went unnoticed: the
 * [FD:<PHASE>] header was never actually enforced live. These cover the pure
 * decision + the shared-reader delegation.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const hook = require(path.join(ROOT, '.claude', 'hooks', 'fd-response-check.js'));

describe('decideFdResponse', () => {
  test('no state -> no block', () => {
    expect(hook.decideFdResponse({ state: null, lastAssistantText: 'anything' }).block).toBe(false);
  });

  test('COMPLETED / ABORTED phases -> no block', () => {
    expect(hook.decideFdResponse({ state: { phase: 'COMPLETED' }, lastAssistantText: 'x' }).block).toBe(false);
    expect(hook.decideFdResponse({ state: { phase: 'ABORTED' }, lastAssistantText: 'x' }).block).toBe(false);
  });

  test('header present for the active phase -> no block', () => {
    const d = hook.decideFdResponse({ state: { phase: 'REVIEW' }, lastAssistantText: '[FD:REVIEW] looks good' });
    expect(d.block).toBe(false);
  });

  test('header missing -> BLOCK with a reason naming the expected header', () => {
    const d = hook.decideFdResponse({ state: { phase: 'BUILD' }, lastAssistantText: 'just some prose' });
    expect(d.block).toBe(true);
    expect(d.reason).toContain('[FD:BUILD]');
  });

  test('empty text (cannot read the turn) degrades to no block', () => {
    expect(hook.decideFdResponse({ state: { phase: 'BUILD' }, lastAssistantText: '' }).block).toBe(false);
  });

  test('wrong phase header -> still blocks (header must match the active phase)', () => {
    const d = hook.decideFdResponse({ state: { phase: 'VALIDATE' }, lastAssistantText: '[FD:REVIEW] mismatch' });
    expect(d.block).toBe(true);
  });
});

describe('extractLastAssistantText delegation (production shape)', () => {
  test('reads last_assistant_message and transcript_path via the shared reader', () => {
    expect(hook.extractLastAssistantText({ last_assistant_message: '[FD:DOC] x' })).toBe('[FD:DOC] x');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-resp-'));
    const tp = path.join(dir, 't.jsonl');
    fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '[FD:BUILD] ok' }] } }) + '\n');
    expect(hook.extractLastAssistantText({ transcript_path: tp })).toContain('[FD:BUILD]');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
