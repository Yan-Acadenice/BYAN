#!/usr/bin/env node
/**
 * UserPromptSubmit hook — FD phase guard.
 *
 * When an FD cycle is active (fd-state.json exists and phase is not
 * COMPLETED/ABORTED), inject a strong reminder into additionalContext
 * describing the current phase and its hard rules. Makes it mechanical
 * for Claude to stay in the right phase instead of drifting.
 *
 * Non-blocking : if fd-state is missing or invalid, emit empty context.
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const statePath = path.join(projectDir, '_byan-output', 'fd-state.json');

const PHASE_RULES = {
  BRAINSTORM: [
    'Quantity > quality. No idea rejected. Role-play Carson (brainstorming coach).',
    'Use YES AND to extend every user seed. Apply inversion, analogies.',
    'DO NOT ask pruning questions. DO NOT apply Ockham yet. Push ideas.',
    'Prefix every response with [FD:BRAINSTORM].',
    'Exit only when user says "stop brainstorm" / "ok j\'ai mes idees", or raw_ideas >= 10.',
  ],
  PRUNE: [
    'Challenge Before Confirm (Mantra IA-16). Apply Ockham\'s Razor (#37). YAGNI.',
    'For each idea : ask "probleme resolu ?" "necessaire MAINTENANT ?" "MVP ?"',
    'Cluster similar ideas, kill redundant, priority-rank what survives (P1/P2/P3).',
    'Prefix every response with [FD:PRUNE].',
    'Exit only when user says "OK backlog" or equivalent explicit validation.',
  ],
  DISPATCH: [
    'Map each feature to {component × specialist × model × strategy × est_tokens}.',
    'Use byan_dispatch MCP to compute strategy if uncertain. Surface missing specialist.',
    'Prefix every response with [FD:DISPATCH].',
    'Exit only when user validates the dispatch table explicitly.',
  ],
  BUILD: [
    'Delegate to byan-hermes-dispatch. One commit per feature. TDD : tests before code.',
    'Atomic commits : `type: description`, no emoji, zero cross-feature noise.',
    'Prefix every response with [FD:BUILD].',
    'Exit only when all backlog items show status=done AND user validates the diffs.',
  ],
  VALIDATE: [
    'Run npm test. Zero regression on previously-passing tests.',
    'MantraValidator >= 80% on changed agent/skill files. Fact-check any absolute claim.',
    'Prefix every response with [FD:VALIDATE].',
    'Exit only when tests green + user says "ok validate" OR retry cycle on BUILD.',
  ],
};

function readState() {
  try {
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

const state = readState();
let additionalContext = '';

if (state && !['COMPLETED', 'ABORTED'].includes(state.phase)) {
  const rules = PHASE_RULES[state.phase] || ['(unknown phase — fall back to conservative behavior)'];
  const header = `FD active — phase ${state.phase} — feature ${state.feature_name || '?'} (id ${state.fd_id || '?'})`;
  const body = rules.map((r) => `  - ${r}`).join('\n');
  additionalContext = [
    header,
    '',
    'Hard rules for this turn :',
    body,
    '',
    `Use byan_fd_status MCP to read full state if needed. Do not hand-edit fd-state.json.`,
  ].join('\n');
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: additionalContext,
    },
  })
);
