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
  DISCOVERY: [
    'Identify the project before any ideation. Zero feature on a blurry context.',
    'Try local context first (cwd, CLAUDE.md, _byan/config.yaml, README). If unsure, ask the user.',
    'Fetch a project summary : MCP first (byan_list_projects, byan_api_projects_get), local fallback only if MCP unavailable or out-of-BYAN.',
    'Persist the result via update({ patch: { project_context: { name, slug, domain, stack, summary, source } } }).',
    'Prefix every response with [FD:DISCOVERY].',
    'Exit only when project_context is set and user confirms "ok c\'est ce projet".',
  ],
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
  REVIEW: [
    'Pre-flight humain before VALIDATE — Quinn (QA) inspects the diff against VALIDATE criteria.',
    'Check : readability, naming, side effects, coverage per branch, comments justified, zero emoji.',
    'Cross-check planned tests vs implemented tests. Cross-check mantra risks vs actual code.',
    'Output : { status: "ready-for-validate" | "needs-rework", findings: [...] }. Persist via update({ patch: { review_findings: [...] } }).',
    'Prefix every response with [FD:REVIEW].',
    'Exit : ready-for-validate -> advance to VALIDATE. needs-rework -> short-circuit to REFACTOR (skip VALIDATE this cycle).',
  ],
  VALIDATE: [
    'Run npm test. Zero regression on previously-passing tests.',
    'MantraValidator domain-aware >= 30 (anti-stub floor) on changed Gen3 persona sources. Fact-check any absolute claim.',
    'Decision is binary : OK -> DOC, KO -> REFACTOR. Persist via update({ patch: { validate_verdict: { status, blocking_issues } } }).',
    'Prefix every response with [FD:VALIDATE].',
    'Exit : tests green + score >= 30 (anti-stub floor) -> advance to DOC. Otherwise -> advance to REFACTOR.',
  ],
  REFACTOR: [
    'Corrective loop only — no new features, no re-design. Address blocking_issues from VALIDATE.',
    'For each issue : reproduce, minimal fix (Ockham), re-run check. Commits : `fix: [issue]`.',
    'Persist progress via update({ patch: { refactor_log: [...] } }).',
    'Prefix every response with [FD:REFACTOR].',
    'Exit : all blocking_issues resolved -> loop back to BUILD (then REVIEW -> VALIDATE again).',
    'Guard-rail : 3 consecutive BUILD->REVIEW->VALIDATE->REFACTOR cycles without convergence -> propose retour to PRUNE or ABORTED.',
  ],
  DOC: [
    'Documentation is a deliverable. Role-play Paige (tech-writer) or delegate to bmad-bmm-tech-writer.',
    'Update CHANGELOG.md (dated entry, type: description). Update README.md if public surface changed.',
    'Update usage guide (command, example, edge cases). Sync agent-manifest.csv / workflow-manifest.csv if applicable.',
    'Bump version (semver) if needed : minor for feature, major for breaking. No emoji, clarity first.',
    'Persist what was written via update({ patch: { doc_log: [...] } }).',
    'Prefix every response with [FD:DOC].',
    'Exit only when user reviews the doc and says "ok doc". Then advance to COMPLETED.',
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
