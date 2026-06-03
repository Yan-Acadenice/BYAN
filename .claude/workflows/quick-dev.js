export const meta = {
  name: 'quick-dev',
  description: 'Native port of the BYAN quick-dev workflow: flexible implementation from a tech-spec OR direct instructions, with self-check, an adversarial diff review, and a structured findings verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'MODE', detail: 'capture baseline + classify tech-spec vs direct + escalation signals (no human menu here)' },
    { title: 'CONTEXT', detail: 'direct mode only: identify files, patterns, dependencies, infer AC + plan' },
    { title: 'EXECUTE', detail: 'implement all tasks task-by-task; per-task convergence cap mirrors the 3-failure HALT rule' },
    { title: 'SELF_CHECK', detail: 'audit tasks/tests/AC/patterns; update tech-spec status (mode A)' },
    { title: 'ADVERSARIAL_REVIEW', detail: 'build the baseline diff, run adversarial review, order + number findings (zero findings is suspicious)' },
    { title: 'VERDICT', detail: 'return findings + summary; the W/F/S resolution decision stays at the human gate' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — byan-lint-workflows).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly (forbidden by the linter).
//   - uses NO wall-clock and NO randomness primitive (wall-clock / RNG /
//     crypto) — they break resume; any timestamp/id arrives via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools AT
//     the gate, and IT presents the source step-06 [W]alk/[F]ix/[S]kip menu.
// The product artifacts (the edited source files, and the tech-spec Status /
// Review Notes when mode A) are written by the execute/self-check leaves — that
// is the workflow's output, not BYAN platform state.
// ---------------------------------------------------------------------------

// Convergence guard — mirror of step-03 prose rule "3 consecutive failures on
// the same task -> HALT". The sandbox forbids import, so the tiny counter is
// inlined; it turns the prose into a real cap the model cannot silently overrun.
const MAX_TASK_CYCLES = 3
function taskConvergenceGuard({ cycles, passed, maxCycles = MAX_TASK_CYCLES }) {
  if (passed) return { done: true, halted: false, reason: 'task-green' }
  if (cycles >= maxCycles) return { done: true, halted: true, reason: `halt: ${maxCycles} consecutive failures on the same task` }
  return { done: false, halted: false, reason: 'retry' }
}

// Hard cap on the number of tasks we will drive in one run (the source loops
// "for each task" with no count; this bounds the outer loop for a resumable run).
const MAX_TASKS = (args && Number.isInteger(args.maxTasks) && args.maxTasks > 0) ? args.maxTasks : 25

const MODE_SCHEMA = {
  type: 'object',
  required: ['executionMode', 'baselineCommit'],
  properties: {
    executionMode: { type: 'string', enum: ['tech-spec', 'direct'], description: '"tech-spec" if user gave a spec path, else "direct"' },
    techSpecPath: { type: 'string', description: 'path to the tech-spec file when executionMode is tech-spec; empty otherwise' },
    baselineCommit: { type: 'string', description: 'git rev-parse HEAD at start, or "NO_GIT"' },
    projectContextLoaded: { type: 'boolean', description: 'true if a **/project-context.md was found and loaded' },
    escalationSignals: { type: 'array', items: { type: 'string' }, description: 'step-01 escalation signals detected in the direct request (multi-component, system-level, uncertainty, multi-layer, extended timeframe)' },
    escalationLevel: { type: 'integer', description: '0 = none, 0-2 = focused multi-component, 3+ = platform/system work' },
    escalationAdvice: { type: 'string', enum: ['proceed', 'suggest-plan', 'suggest-bmad'], description: 'what the human gate should consider: proceed = execute directly; suggest-plan = quick-spec; suggest-bmad = full PRD flow' },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['tasks', 'acceptanceCriteria'],
  properties: {
    filesToModify: { type: 'array', items: { type: 'string' } },
    patterns: { type: 'array', items: { type: 'string' }, description: 'code style / conventions / error-handling / test patterns observed' },
    dependencies: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'string' }, description: 'ordered task list synthesized from the request' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'AC inferred from the user request' },
  },
}

const TASKS_SCHEMA = {
  type: 'object',
  required: ['tasks'],
  properties: {
    tasks: { type: 'array', items: { type: 'string' }, description: 'ordered task list to implement' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean', description: 'true ONLY if this task\'s tests pass with no regressions AND its acceptance criteria are met' },
    blocking: { type: 'array', items: { type: 'string' }, description: 'blocking issues when not passed' },
    summary: { type: 'string' },
  },
}

const SELF_CHECK_SCHEMA = {
  type: 'object',
  required: ['tasksComplete', 'testsPassing', 'acSatisfied', 'patternsFollowed'],
  properties: {
    tasksComplete: { type: 'boolean' },
    testsPassing: { type: 'boolean' },
    acSatisfied: { type: 'boolean' },
    patternsFollowed: { type: 'boolean' },
    filesModified: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' }, description: 'any self-audit gaps; empty if clean' },
    summary: { type: 'string' },
  },
}

const FINDING = {
  type: 'object',
  required: ['id', 'severity', 'validity', 'description'],
  properties: {
    id: { type: 'string', description: 'F1, F2, ...' },
    severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
    validity: { type: 'string', enum: ['real', 'noise', 'undecided'] },
    description: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: { type: 'array', items: FINDING, description: 'ALL findings, ordered by severity (Critical first), numbered F1..Fn; do not drop by severity/validity' },
    suspiciousZeroFindings: { type: 'boolean', description: 'true if the review returned zero findings (step-05 says this is suspicious and should HALT for human guidance)' },
    diffSummary: { type: 'string' },
  },
}

// --- inputs (everything non-deterministic arrives via args; no clock/RNG) ---
const userInput = (args && args.request) || (args && args.input) || ''
const techSpecArg = (args && args.techSpec) || ''

// ===========================================================================
phase('MODE')
// step-01: capture baseline, load project-context, classify mode, evaluate the
// escalation threshold. The human escalation MENU ([P]/[W]/[E]) is NOT executed
// here — the script records the signal/advice and lets the gate decide.
const mode = await agent(
  `You are quick-dev step-01 (mode detection). User input: ${JSON.stringify(userInput)}. ` +
    `Tech-spec arg (if any): ${JSON.stringify(techSpecArg)}.\n` +
    `1) Capture baseline: if a git repo, run \`git rev-parse HEAD\` -> baselineCommit; else baselineCommit="NO_GIT". ` +
    `2) Check for a **/project-context.md and report projectContextLoaded. ` +
    `3) Classify executionMode: "tech-spec" if a spec path was provided (set techSpecPath), else "direct". ` +
    `4) For direct mode ONLY, evaluate the escalation signals (multiple components, system-level language, ` +
    `uncertainty about approach, multi-layer scope, extended timeframe; reduced by simplicity markers / single-file focus). ` +
    `Use holistic judgment. Set escalationLevel (0 none, 0-2 focused, 3+ platform) and escalationAdvice ` +
    `(proceed / suggest-plan / suggest-bmad). Do NOT prompt the user — just report.`,
  { label: 'mode-detection', phase: 'MODE', schema: MODE_SCHEMA }
)
log(`mode=${mode.executionMode} baseline=${mode.baselineCommit} escalation=${mode.escalationLevel || 0} advice=${mode.escalationAdvice || 'proceed'}`)

// ===========================================================================
phase('CONTEXT')
// step-02: direct mode only — gather files/patterns/deps and synthesize a plan.
// Mode A (tech-spec) skips this and extracts tasks/AC from the spec instead.
let plan
if (mode.executionMode === 'direct') {
  plan = await agent(
    `quick-dev step-02 (context gathering, DIRECT mode). Request: ${JSON.stringify(userInput)}.\n` +
      `Baseline: ${mode.baselineCommit}. project-context loaded: ${Boolean(mode.projectContextLoaded)}.\n` +
      `Identify the files to modify (glob/grep), the relevant patterns (style, conventions, imports, error handling, test patterns), ` +
      `the dependencies (external libs, internal modules, config files), then synthesize an ordered task list and the inferred ` +
      `acceptance criteria. Return the plan; do NOT ask the user y/n/adjust here (that confirmation is the human gate's job).`,
    { label: 'context-gathering', phase: 'CONTEXT', schema: PLAN_SCHEMA }
  )
} else {
  plan = await agent(
    `quick-dev (TECH-SPEC mode). Load the tech-spec at ${JSON.stringify(mode.techSpecPath || techSpecArg)} and extract its ` +
      `tasks/subtasks and acceptance criteria verbatim. Return the ordered task list and the AC.`,
    { label: 'extract-tech-spec', phase: 'CONTEXT', schema: TASKS_SCHEMA }
  )
}
const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
log(`tasks=${tasks.length} mode=${mode.executionMode}`)

// ===========================================================================
phase('EXECUTE')
// step-03: implement EVERY task without stopping for milestones; per task, run a
// load->implement->test loop with a 3-failure convergence cap (the prose HALT).
const taskResults = []
const runnable = tasks.slice(0, MAX_TASKS)
for (let i = 0; i < runnable.length; i++) {
  const task = runnable[i]
  let cycles = 0
  let verify = { passed: false, blocking: ['not started'] }
  let guard = { done: false, halted: false, reason: 'init' }
  while (true) {
    cycles += 1
    const impl = await agent(
      `quick-dev step-03 execute. Task ${i + 1}/${runnable.length} (attempt ${cycles}): ${JSON.stringify(task)}.\n` +
        `Mode: ${mode.executionMode}. Plan context: ${JSON.stringify(plan)}.\n` +
        `Load the files relevant to THIS task, implement following existing patterns and the project-context rules, ` +
        `handle errors as the codebase does, write tests where appropriate, and run existing tests to catch regressions. ` +
        `Do NOT mark the task [x] unless its tests actually pass. Report what you changed.`,
      { label: `execute-task-${i + 1}-cycle-${cycles}`, phase: 'EXECUTE' }
    )
    verify = await agent(
      `Verify quick-dev task ${i + 1}: ${JSON.stringify(task)}. Implementation notes: ${impl}\n` +
        `Run the relevant tests (infer the command from the repo). passed=true ONLY if this task's tests pass with zero ` +
        `regressions AND its acceptance criteria are met. Otherwise passed=false with the precise blocking issues.`,
      { label: `verify-task-${i + 1}-cycle-${cycles}`, phase: 'EXECUTE', schema: VERIFY_SCHEMA }
    )
    guard = taskConvergenceGuard({ cycles, passed: Boolean(verify && verify.passed) })
    log(`task ${i + 1} cycle ${cycles}: passed=${Boolean(verify && verify.passed)} -> ${guard.reason}`)
    if (guard.done) break
  }
  taskResults.push({ index: i + 1, task, passed: Boolean(verify.passed), halted: guard.halted, cycles, blocking: (verify && verify.blocking) || [] })
  // step-03 HALT condition: stop driving further tasks once a task fails to converge.
  if (guard.halted) {
    log(`HALT: task ${i + 1} did not converge after ${MAX_TASK_CYCLES} attempts`)
    break
  }
}
const allTasksPassed = taskResults.length > 0 && taskResults.every((t) => t.passed)
const halted = taskResults.some((t) => t.halted)

// ===========================================================================
phase('SELF_CHECK')
// step-04: audit tasks/tests/AC/patterns; update tech-spec status when mode A.
const selfCheck = await agent(
  `quick-dev step-04 self-check. Mode: ${mode.executionMode}. Tech-spec: ${JSON.stringify(mode.techSpecPath || techSpecArg)}.\n` +
    `Task results: ${JSON.stringify(taskResults)}. AC: ${JSON.stringify(plan.acceptanceCriteria || [])}.\n` +
    `Audit: (1) all tasks marked complete with no silent skips; (2) all tests passing, new tests added where needed; ` +
    `(3) every acceptance criterion demonstrably met incl. edge cases; (4) existing patterns and project-context rules followed. ` +
    `If mode is "tech-spec": load the spec, mark its tasks [x] and set status "Implementation Complete". Report the audit verdict.`,
  { label: 'self-check', phase: 'SELF_CHECK', schema: SELF_CHECK_SCHEMA }
)
log(`self-check: tasks=${selfCheck.tasksComplete} tests=${selfCheck.testsPassing} ac=${selfCheck.acSatisfied} patterns=${selfCheck.patternsFollowed}`)

// ===========================================================================
phase('ADVERSARIAL_REVIEW')
// step-05: build the diff from baselineCommit (incl. new untracked files YOU
// created), run the adversarial review task, and order + number ALL findings.
const review = await agent(
  `quick-dev step-05 adversarial review. Baseline: ${mode.baselineCommit}.\n` +
    `1) Construct the full diff of changes since the baseline: if a git hash, \`git diff ${mode.baselineCommit}\` PLUS the full ` +
    `content of any new untracked files YOU created this run (do NOT git add anything; read-only). If "NO_GIT", best-effort diff ` +
    `of the files you touched plus new files. ` +
    `2) Run the adversarial review at _byan/command/review-adversarial-general.xml against that diff (inline the task if no ` +
    `subagent invocation is available). ` +
    `3) Return ALL findings ordered by severity (Critical first), numbered F1..Fn, each with severity + validity (real/noise/undecided) ` +
    `+ description. Do NOT drop findings by severity or validity. If the review returns ZERO findings, set suspiciousZeroFindings=true ` +
    `(step-05 treats zero findings as suspicious and a reason to halt for human guidance).`,
  { label: 'adversarial-review', phase: 'ADVERSARIAL_REVIEW', schema: REVIEW_SCHEMA }
)
const findings = Array.isArray(review.findings) ? review.findings : []
log(`review: findings=${findings.length} suspiciousZero=${Boolean(review.suspiciousZeroFindings)}`)

// ===========================================================================
phase('VERDICT')
// step-06 is a HUMAN decision ([W]alk-through / [F]ix-auto / [S]kip) plus the
// final tech-spec "Completed" + Review Notes update. We DO NOT pick a resolution
// here; we hand the gate the ordered, numbered findings and the run summary.
const realFindings = findings.filter((f) => f && f.validity === 'real')
const criticalOrHigh = findings.filter((f) => f && (f.severity === 'Critical' || f.severity === 'High'))
const status = halted
  ? 'halted-no-convergence'
  : allTasksPassed && selfCheck.tasksComplete && selfCheck.testsPassing && selfCheck.acSatisfied
    ? 'review-ready'
    : 'in-progress'

return {
  workflow: 'quick-dev',
  summary: selfCheck.summary || `quick-dev (${mode.executionMode}): ${taskResults.length} task(s) processed, ${findings.length} review finding(s).`,
  mode: mode.executionMode,
  baselineCommit: mode.baselineCommit,
  escalation: { level: mode.escalationLevel || 0, advice: mode.escalationAdvice || 'proceed', signals: mode.escalationSignals || [] },
  status,
  steps: 6,
  tasks: { total: tasks.length, run: taskResults.length, passed: taskResults.filter((t) => t.passed).length, results: taskResults },
  selfCheck,
  review: { total: findings.length, real: realFindings.length, criticalOrHigh: criticalOrHigh.length, suspiciousZeroFindings: Boolean(review.suspiciousZeroFindings), findings },
  // The orchestrating skill presents the step-06 [W]/[F]/[S] resolution menu and,
  // for mode A, writes the tech-spec "Completed" status + Review Notes at the gate.
  needsHumanGate: true,
}
