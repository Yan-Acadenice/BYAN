#!/usr/bin/env node
// BYAN FD phase-guard — UserPromptSubmit hook.
// Injects phase-specific rules into the model context whenever an FD is active.

import fs from 'node:fs';
import path from 'node:path';

const PHASE_RULES = {
  BRAINSTORM:
    "Quantity > quality. YES AND. Role-play Carson. No pruning questions. Prefix `[FD:BRAINSTORM]`. Exit only when user says 'stop brainstorm' or raw_ideas >= 10.",
  PRUNE:
    "Challenge Before Confirm. Ockham. YAGNI. For each idea ask probleme/necessaire/MVP. Prefix `[FD:PRUNE]`. Exit only when user says 'OK backlog'.",
  DISPATCH:
    "Map feature → component × specialist × model × strategy × est_tokens. Use byan_dispatch. Prefix `[FD:DISPATCH]`. Exit when user validates table.",
  BUILD:
    "Delegate to byan-hermes-dispatch. One commit per feature. TDD first. Prefix `[FD:BUILD]`. Exit when backlog all done + user validates.",
  VALIDATE:
    "npm test. MantraValidator >= 80%. Fact-check absolutes. Prefix `[FD:VALIDATE]`. Exit when tests green + user 'ok'.",
};

const TERMINAL = new Set(['COMPLETED', 'ABORTED']);

function emit(additionalContext) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: additionalContext || '',
    },
  };
  process.stdout.write(JSON.stringify(out));
}

function main() {
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const statePath = path.join(root, '_byan-output', 'fd-state.json');
    if (!fs.existsSync(statePath)) return emit('');
    const raw = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(raw);
    const phase = state && state.phase;
    if (!phase || TERMINAL.has(phase)) return emit('');
    const rule = PHASE_RULES[phase];
    if (!rule) return emit('');
    const ctx = [
      `### BYAN FD active — phase ${phase}`,
      `Feature : ${state.feature_name || 'unnamed'}`,
      `fd_id   : ${state.fd_id || 'n/a'}`,
      '',
      `Hard rules for this phase :`,
      rule,
      '',
      `MANDATORY : every assistant response MUST start with the header \`[FD:${phase}]\` on its own line. Responses without the header will be blocked by the Stop hook.`,
    ].join('\n');
    return emit(ctx);
  } catch (_err) {
    // Fail open — never block prompt submission on parse error.
    return emit('');
  }
}

main();
