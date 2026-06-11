/**
 * B2/B3 prose-wiring guard.
 *
 * The kanban + standup families are driven by PROSE in the byan-orchestrate
 * skill, not by code — so a silent revert OR a malformed call would re-orphan
 * both families with every test still green. The first version of this guard
 * only checked tool NAMES and green-washed a malformed byan_kanban_add (missing
 * the `card` wrapper) and a blockers field that does not exist in the report
 * contract. This version pins the call SHAPES against the real MCP schemas.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'skills', 'byan-orchestrate', 'SKILL.md'),
  'utf8'
);

describe('byan-orchestrate wires the kanban + standup families (correct shapes)', () => {
  test('B2 kanban_add uses the real shape: sessionId + card:{id,title}', () => {
    expect(SKILL).toContain('byan_kanban_create');
    expect(SKILL).toContain('byan_kanban_add');
    // The real schema is { sessionId, card: { id, title } } (additionalProperties:false).
    expect(SKILL).toMatch(/byan_kanban_add\(\{\s*sessionId,\s*card:\s*\{\s*id:/);
    // The old malformed top-level { id, title } form must not return.
    expect(SKILL).not.toMatch(/byan_kanban_add\(\{\s*id:\s*<sessionId>/);
  });

  test('B2 card id is the role name and move targets it (distinct from sessionId)', () => {
    expect(SKILL).toContain('cardId: <role>');
    expect(SKILL).toContain('card: { id: <role>');
  });

  test('B2 moves a successful card to review, not done, and gives a blocker_reason on fail', () => {
    expect(SKILL).toMatch(/'review'/);
    expect(SKILL).toContain('human gate owns completion');
    expect(SKILL).toContain('blocker_reason');
  });

  test('B3 standup sources blockers from status, NOT a non-existent report.blockers field', () => {
    expect(SKILL).toContain('byan_standup_post');
    // blockers synthesized from a non-ok status; the report has no blockers field.
    expect(SKILL).toContain('[report.summary]');
    expect(SKILL).not.toContain('report.blockers');
    // next comes from next_steps (array), not a non-existent report.next.
    expect(SKILL).toContain('report.next_steps');
  });

  test('B3 blocked check uses minStreak:1 (a 2-streak is unreachable single-pass)', () => {
    expect(SKILL).toContain('byan_standup_blocked');
    expect(SKILL).toMatch(/minStreak:\s*1/);
  });
});
