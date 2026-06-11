/**
 * C2 prose-wiring guard.
 *
 * The peer-review loop (byan_review_*) is driven by PROSE in the byan-byan
 * REVIEW phase, not by code — so a silent revert of that prose would re-orphan
 * bmad-compliance with every test still green. This test pins the wiring: if
 * Phase 6 stops naming the review tools or the reviewer, it fails loudly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'skills', 'byan-byan', 'SKILL.md'),
  'utf8'
);

describe('byan-byan REVIEW phase wires the tiered peer-review loop', () => {
  const phase6 = SKILL.slice(SKILL.indexOf('### Phase 6'), SKILL.indexOf('### Phase 7'));

  test('Phase 6 exists and is the REVIEW phase', () => {
    expect(phase6).toContain('REVIEW');
  });

  test('drives the peer-review MCP tools', () => {
    expect(phase6).toContain('byan_review_request');
    expect(phase6).toContain('byan_review_pick_reviewer');
    expect(phase6).toContain('byan_review_verdict');
  });

  test('names the adversarial reviewer and the tiering signal', () => {
    expect(phase6).toContain('bmad-compliance');
    expect(phase6).toContain('byan_dispatch');
  });
});
