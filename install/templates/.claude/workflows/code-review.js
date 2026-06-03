export const meta = {
  name: 'code-review',
  description: 'Native port of the BYAN code-review workflow: an ADVERSARIAL Senior Developer review that validates a story file against the actual implementation and git reality, hunts a minimum of 3-10 specific issues (AC validation, task audit, code quality, test quality), and returns a structured verdict. The fix/action-items human decision stays OUT of the script.',
  phases: [
    { title: 'LOAD', detail: 'load story + discover actual changes via git, cross-reference File List' },
    { title: 'PLAN', detail: 'build the adversarial review attack plan' },
    { title: 'REVIEW', detail: 'execute the review; enforce the >=3-issue floor with a bounded re-scan' },
    { title: 'FINDINGS', detail: 'categorize HIGH/MEDIUM/LOW; return a verdict (no auto-fix here)' },
    { title: 'VERDICT', detail: 'compute proposed story status + sprint-sync intent for the human gate' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — enforcement-bridge).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly  (enforced by byan-lint-workflows.js).
//   - uses NO wall-clock / NO randomness primitive (wall-clock, RNG,
//     a wall-clock read break resume) — any date/id is passed via args.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate, and AT the gate it asks the human the fix/action-items
//     decision (source step 4) and applies the chosen story-status update
//     + sprint-status.yaml sync (source step 5).
// ---------------------------------------------------------------------------

// Issue-floor guard — turns the source's prose rule ("Find 3-10 issues; if
// total_issues_found < 3 -> NOT LOOKING HARD ENOUGH, re-examine") into a real
// JS counter the model cannot silently overrun. Bounded re-scan: one extra
// adversarial pass, never an unbounded loop.
const MIN_ISSUES = 3
const MAX_RESCANS = 1

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['totalIssues', 'high', 'medium', 'low', 'findings'],
  properties: {
    totalIssues: { type: 'integer', description: 'total specific, actionable issues found' },
    high: { type: 'integer', description: 'count of HIGH severity (must-fix) issues' },
    medium: { type: 'integer', description: 'count of MEDIUM (should-fix) issues' },
    low: { type: 'integer', description: 'count of LOW (nice-to-fix) issues' },
    gitDiscrepancies: { type: 'integer', description: 'git-vs-story File List discrepancies' },
    acMissing: { type: 'integer', description: 'Acceptance Criteria found MISSING or PARTIAL' },
    tasksFalselyComplete: { type: 'integer', description: 'tasks marked [x] but NOT actually done (CRITICAL)' },
    findings: {
      type: 'array',
      description: 'each: severity + description + file:line evidence',
      items: {
        type: 'object',
        required: ['severity', 'description'],
        properties: {
          severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          category: { type: 'string', description: 'ac|task|security|performance|error-handling|quality|test|git-discrepancy' },
          description: { type: 'string' },
          evidence: { type: 'string', description: 'file:line or git proof' },
        },
      },
    },
  },
}

const story = (args && args.story) || (args && args.story_path) || 'the story file under review'
const reviewer = (args && args.user_name) || 'reviewer'

// --- Step 1: Load story and discover changes -------------------------------
phase('LOAD')
const loaded = await agent(
  `You are code-review (BYAN ADVERSARIAL Senior Developer reviewer). Target story: ${JSON.stringify(story)}.\n` +
    `Read the COMPLETE story file. Set story_key from the filename (e.g. "1-2-user-auth.md" -> "1-2-user-auth") or metadata. ` +
    `Parse: Story, Acceptance Criteria, Tasks/Subtasks (note [x] vs [ ]), Dev Agent Record -> File List, Change Log, Status.\n` +
    `Then DISCOVER ACTUAL CHANGES via git (if a git repo is present): run "git status --porcelain", ` +
    `"git diff --name-only", and "git diff --cached --name-only"; compile the list of actually changed files. ` +
    `Cross-reference the story File List against git reality and note discrepancies: ` +
    `(a) files in git but NOT in the story File List, (b) files in the File List with NO git change, ` +
    `(c) undocumented uncommitted changes.\n` +
    `Load project-context.md for coding standards if it exists. ` +
    `EXCLUDE from review: _byan/, _byan-output/, and IDE/CLI config folders (.cursor/, .windsurf/, .claude/). ` +
    `If the story cannot be found or read, say so explicitly — do not invent one.`,
  { label: 'load-story', phase: 'LOAD' }
)

// --- Step 2: Build review attack plan --------------------------------------
phase('PLAN')
const plan = await agent(
  `Build the adversarial review attack plan for story ${JSON.stringify(story)}.\n` +
    `Context from load: ${loaded}\n` +
    `Extract ALL Acceptance Criteria, ALL Tasks/Subtasks with completion status, and the claimed File List changes. ` +
    `Produce the four-axis plan: (1) AC Validation — verify each AC is actually implemented; ` +
    `(2) Task Audit — verify each [x] task is really done; (3) Code Quality — security, performance, maintainability; ` +
    `(4) Test Quality — real assertions vs placeholder tests. ` +
    `List the comprehensive review file set = story File List UNION git-discovered files.`,
  { label: 'attack-plan', phase: 'PLAN' }
)

// --- Step 3: Execute adversarial review (with bounded >=3-issue floor) ------
phase('REVIEW')
let review = { totalIssues: 0, high: 0, medium: 0, low: 0, findings: [] }
let rescans = 0
while (true) {
  const harder =
    rescans === 0
      ? ''
      : `\nPREVIOUS PASS FOUND ONLY ${review.totalIssues} issue(s) — NOT LOOKING HARD ENOUGH. ` +
        `Re-examine for: edge cases & null handling, architecture violations, documentation gaps, ` +
        `integration issues, dependency problems, git commit message quality. Find at least 3 MORE.`
  review = await agent(
    `Execute the ADVERSARIAL review for story ${JSON.stringify(story)}. VALIDATE EVERY CLAIM against git reality.\n` +
      `Plan: ${plan}\n` +
      `Score git-vs-story discrepancies: files changed but not in File List -> MEDIUM; ` +
      `story lists files but no git change -> HIGH (false claim); undocumented uncommitted changes -> MEDIUM.\n` +
      `For EACH Acceptance Criterion: search the implementation for evidence -> IMPLEMENTED / PARTIAL / MISSING; ` +
      `MISSING or PARTIAL = HIGH finding.\n` +
      `For EACH task marked [x]: search files for proof it was actually done; if marked [x] but NOT done = CRITICAL finding ` +
      `(record file:line proof).\n` +
      `For EACH file in the comprehensive review set: check Security (injection, missing validation, auth), ` +
      `Performance (N+1, inefficient loops, missing caching), Error Handling (missing try/catch, poor messages), ` +
      `Code Quality (complex functions, magic numbers, poor naming), Test Quality (real assertions vs placeholders).\n` +
      `Do NOT accept "looks good". Find a MINIMUM of ${MIN_ISSUES} specific, actionable issues; aim for 3-10. ` +
      `Every finding needs file:line (or git) evidence.${harder}`,
    { label: rescans === 0 ? 'adversarial-review' : `adversarial-rescan-${rescans}`, phase: 'REVIEW', schema: REVIEW_SCHEMA }
  )
  const enough = (review.totalIssues || 0) >= MIN_ISSUES
  log(`review pass ${rescans + 1}: ${review.totalIssues} issues (H${review.high}/M${review.medium}/L${review.low}) -> ${enough ? 'floor met' : 'below floor'}`)
  if (enough || rescans >= MAX_RESCANS) break
  rescans += 1
}

// --- Step 4: Present findings (DECISION stays at the human gate) ------------
phase('FINDINGS')
// Source step 4 asks the human: 1) auto-fix, 2) create action items, 3) details.
// That branch is a human gate — kept OUT of the script. We only categorize and
// emit fix-ready action-item lines so the orchestrating skill can offer them.
const findings = await agent(
  `Categorize and present the review findings for story ${JSON.stringify(story)} (reviewer: ${JSON.stringify(reviewer)}).\n` +
    `Review result: ${JSON.stringify(review)}\n` +
    `Group findings into HIGH (must fix), MEDIUM (should fix), LOW (nice to fix). ` +
    `For each finding, also produce a ready-to-paste story action-item line in the form ` +
    `"- [ ] [AI-Review][Severity] Description [file:line]". ` +
    `Do NOT auto-fix anything and do NOT prompt the user — the fix/action-items/details decision belongs to the human gate. ` +
    `Output a clear findings report plus the action-item lines.`,
  { label: 'present-findings', phase: 'FINDINGS' }
)

// --- Step 5: Compute proposed status (the human gate applies it) ------------
phase('VERDICT')
// Source step 5: status = "done" iff all HIGH+MEDIUM fixed AND all ACs implemented,
// else "in-progress"; then sync sprint-status.yaml. No fixes have been applied in
// this autonomous pass, so unresolved HIGH/MEDIUM or missing ACs => proposed
// "in-progress". The skill writes the story Status + sprint sync at the gate.
const blockingIssues = (review.high || 0) + (review.medium || 0)
const acGap = (review.acMissing || 0) > 0 || (review.tasksFalselyComplete || 0) > 0
const cleanForDone = blockingIssues === 0 && !acGap
const proposedStatus = cleanForDone ? 'done' : 'in-progress'

// Return DATA only. The skill presents this at the human gate, asks the
// fix/action-items decision, applies the story-status update + sprint sync,
// and records FD/strict state via MCP.
return {
  workflow: 'code-review',
  story,
  totalIssues: review.totalIssues || 0,
  high: review.high || 0,
  medium: review.medium || 0,
  low: review.low || 0,
  gitDiscrepancies: review.gitDiscrepancies || 0,
  acMissing: review.acMissing || 0,
  tasksFalselyComplete: review.tasksFalselyComplete || 0,
  metMinimumIssueFloor: (review.totalIssues || 0) >= MIN_ISSUES,
  rescans,
  findings: review.findings || [],
  presentation: findings,
  proposedStatus,
  needsHumanGate: true,
  gateDecision: ['auto-fix', 'create-action-items', 'show-details'],
  syncSprintStatusOnGate: true,
}
