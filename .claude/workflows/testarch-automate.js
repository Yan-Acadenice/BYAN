export const meta = {
  name: 'testarch-automate',
  description: 'Native port of the BYAN testarch-automate workflow: expand test automation coverage after implementation (or analyze an existing codebase) by preflighting the framework, identifying targets and levels, generating API + E2E tests in parallel, aggregating into files and fixtures, and validating into an automation summary. Returns a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'PREFLIGHT', detail: 'verify framework, determine mode (BMad-integrated vs standalone), load context + TEA knowledge fragments' },
    { title: 'TARGETS', detail: 'identify automation targets, choose test levels (E2E/API/Component/Unit), assign P0-P3 priorities, produce coverage plan' },
    { title: 'GENERATE', detail: 'parallel fan-out: subprocess A generates API tests, subprocess B generates E2E tests' },
    { title: 'AGGREGATE', detail: 'aggregate subprocess outputs, write test files + shared fixtures/factories/helpers, compute summary stats' },
    { title: 'VALIDATE', detail: 'validate against the checklist and produce the automation summary; return the verdict' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — enforcement-bridge).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly (forbidden by byan-lint-workflows.js).
//   - uses NO wall-clock (wall-clock / wall-clock) and NO randomness (RNG
//     / crypto). The source step-03 derives a temp-file timestamp from
//     a wall-clock read; the sandbox forbids that (it breaks resume), so any id/ts is
//     passed in via `args` instead (args.runId).
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via byan_fd_* / byan_strict_* MCP tools AT the
//     gate. The generated tests + automation summary are the workflow product
//     (written by the leaves), not BYAN platform state.
// ---------------------------------------------------------------------------

// Inputs mirror workflow.yaml variables. The source is autonomous
// (execution_hints.autonomous=true, interactive=false): it proceeds without
// prompts unless blocked, so this is a linear step sequence (one agent per
// real source step), not a retry loop.
const sourceDir = (args && args.sourceDir) || '{project-root}'
const testDir = (args && args.testDir) || '{project-root}/tests'
const coverageTarget = (args && args.coverageTarget) || 'critical-paths'
const targetFeature = (args && args.targetFeature) || null // optional: focus a feature/files
const runId = (args && args.runId) || 'run' // ts/id passed in (no clock in sandbox)

// Step 1 of the source HALTs if no test framework is configured. That gate is a
// hard precondition, not a human decision, so the script surfaces it as a
// verdict field rather than continuing to invent tests against a missing config.
const PREFLIGHT_SCHEMA = {
  type: 'object',
  required: ['frameworkReady', 'mode'],
  properties: {
    frameworkReady: { type: 'boolean', description: 'true only if playwright.config.ts or cypress.config.ts exists AND package.json has the test deps' },
    framework: { type: 'string', description: 'detected framework (playwright | cypress | none)' },
    mode: { type: 'string', description: 'bmad-integrated (story/tech-spec/test-design found) or standalone (source only)' },
    usePlaywrightUtils: { type: 'boolean', description: 'value of tea_use_playwright_utils from config' },
    knowledgeFragments: { type: 'array', items: { type: 'string' }, description: 'TEA knowledge fragments loaded' },
    notes: { type: 'string' },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['targets', 'levels'],
  properties: {
    targets: { type: 'array', items: { type: 'string' }, description: 'features/files to test' },
    levels: { type: 'array', items: { type: 'string' }, description: 'selected test levels: e2e, api, component, unit' },
    priorities: { type: 'object', description: 'priority assignment summary (P0-P3)' },
    justification: { type: 'string', description: 'why this coverage scope (critical-paths/comprehensive/selective)' },
  },
}

const SUBPROCESS_SCHEMA = {
  type: 'object',
  required: ['success', 'subprocess', 'testCount'],
  properties: {
    success: { type: 'boolean' },
    subprocess: { type: 'string', description: 'api-tests | e2e-tests' },
    files: { type: 'array', items: { type: 'string' }, description: 'test file paths produced' },
    testCount: { type: 'integer' },
    fixtureNeeds: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean', description: 'true only if all checklist completion criteria are met' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'unmet checklist items' },
    summaryPath: { type: 'string', description: 'path to the written automation summary' },
    nextWorkflow: { type: 'string', description: 'recommended follow-up workflow (test-review or trace)' },
  },
}

// --- Step 1: Preflight & Context Loading (steps-c/step-01) -----------------
phase('PREFLIGHT')
const preflight = await agent(
  `You are the Master Test Architect running testarch-automate (autonomous mode: proceed without prompts unless blocked).\n` +
    `STEP 1 - Preflight & Context. Source dir: ${JSON.stringify(sourceDir)}; test dir: ${JSON.stringify(testDir)}.\n` +
    `1. Verify a test framework exists (playwright.config.ts or cypress.config.ts AND test deps in package.json). ` +
    `If the framework is completely missing, set frameworkReady=false (the source HALTs here with "Run the framework workflow first") and do NOT fabricate tests.\n` +
    `2. Determine execution mode: bmad-integrated if a story / tech-spec / test-design artifact is present, else standalone (source code only).\n` +
    `3. Load context: framework config, existing test structure under the test dir, existing tests (for coverage gaps). Read tea_use_playwright_utils from config.\n` +
    `4. Load the required TEA knowledge fragments (test-levels-framework, test-priorities-matrix, data-factories, selective-testing, ci-burn-in, test-quality; plus playwright-utils OR traditional fixture/network-first fragments per config).\n` +
    `Report the detected framework, mode, playwright-utils flag, and the fragments loaded.`,
  { label: 'preflight', phase: 'PREFLIGHT', schema: PREFLIGHT_SCHEMA }
)
log(`preflight: frameworkReady=${Boolean(preflight && preflight.frameworkReady)} mode=${preflight && preflight.mode}`)

// Hard precondition gate (mirrors step-01 HALT). Return early as a verdict;
// the human-gated skill decides whether to run the framework workflow first.
if (!preflight || !preflight.frameworkReady) {
  return {
    workflow: 'testarch-automate',
    status: 'halted-no-framework',
    summary: 'No test framework configured (playwright.config.ts / cypress.config.ts missing). Run the framework workflow first.',
    steps: 1,
    preflight,
    needsHumanGate: true,
  }
}

// --- Step 2: Identify Automation Targets (steps-c/step-02) -----------------
phase('TARGETS')
const plan = await agent(
  `STEP 2 - Identify automation targets and build the coverage plan. Mode: ${preflight.mode}. ` +
    `Coverage target: ${JSON.stringify(coverageTarget)}. Focus: ${targetFeature ? JSON.stringify(targetFeature) : 'auto-discover features in the source dir'}.\n` +
    `1. Determine targets: bmad-integrated -> map acceptance criteria to scenarios, check existing ATDD outputs to avoid duplication, expand with edge/negative paths. ` +
    `standalone -> focus the given feature/files if provided, else auto-discover; prioritize critical paths, integrations, untested logic.\n` +
    `2. Choose test levels per test-levels-framework: E2E for critical journeys, API for business logic/contracts, Component for UI behavior, Unit for pure logic/edge cases. Avoid duplicate coverage across levels.\n` +
    `3. Assign priorities per test-priorities-matrix (P0 critical+high-risk, P1 important+medium/high-risk, P2 secondary+edge, P3 optional).\n` +
    `4. Produce a concise coverage plan: targets by level, priority assignments, and justification for the ${coverageTarget} scope.`,
  { label: 'coverage-plan', phase: 'TARGETS', schema: PLAN_SCHEMA }
)
log(`plan: targets=${(plan && plan.targets && plan.targets.length) || 0} levels=${(plan && plan.levels && plan.levels.join(',')) || ''}`)

// --- Step 3: Orchestrate Parallel Test Generation (steps-c/step-03) --------
// The source mandates a PARALLEL fan-out: subprocess 3A (API) and 3B (E2E)
// run simultaneously, and step-03c waits for BOTH before aggregating. parallel()
// is the faithful native shape (NOT sequential — sequential is a SYSTEM FAILURE
// per the source's own rules).
phase('GENERATE')
const planJson = JSON.stringify(plan)
const [apiGen, e2eGen] = await parallel([
  // Subprocess A: API tests ONLY (steps-c/step-03a-subprocess-api).
  () =>
    agent(
      `SUBPROCESS A (run ${runId}) - generate API tests ONLY (no E2E, no fixtures yet, do not run tests).\n` +
        `Coverage plan: ${planJson}. Playwright-utils enabled: ${Boolean(preflight.usePlaywrightUtils)}.\n` +
        `From the plan, identify API endpoints, request/response shapes, auth needs, error scenarios. ` +
        `For each, create tests/api/[feature].spec.ts: use apiRequest() if playwright-utils enabled (else the request fixture), ` +
        `data factories for test data, priority tags [P0]-[P3], happy-path AND error scenarios, proper TS types, deterministic assertions. ` +
        `Track (do NOT create) the fixture needs for the aggregation step. Report the files, test count, and fixture needs.`,
      { label: 'gen-api', phase: 'GENERATE', schema: SUBPROCESS_SCHEMA }
    ),
  // Subprocess B: E2E tests ONLY (steps-c/step-03b-subprocess-e2e).
  () =>
    agent(
      `SUBPROCESS B (run ${runId}) - generate E2E tests ONLY (no API, no fixtures yet, do not run tests).\n` +
        `Coverage plan: ${planJson}. Playwright-utils enabled: ${Boolean(preflight.usePlaywrightUtils)}.\n` +
        `From the plan, identify the critical user journeys. ` +
        `For each, create tests/e2e/[feature].spec.ts: fixture-architecture patterns, network-first (intercept BEFORE navigate), ` +
        `resilient selectors (getByRole/getByText/getByLabel), priority tags [P0]-[P3], complete journeys (not isolated clicks), ` +
        `proper TS types, deterministic waits (no hard sleeps). ` +
        `Track (do NOT create) the fixture needs for aggregation. Report the files, test count, and fixture needs.`,
      { label: 'gen-e2e', phase: 'GENERATE', schema: SUBPROCESS_SCHEMA }
    ),
])
log(
  `generate: api.success=${Boolean(apiGen && apiGen.success)} (${(apiGen && apiGen.testCount) || 0}) ` +
    `e2e.success=${Boolean(e2eGen && e2eGen.success)} (${(e2eGen && e2eGen.testCount) || 0})`
)

// Mirror of step-03 / step-03c exit guard: do NOT aggregate if either
// subprocess failed. This is a precondition, not a human decision.
const bothSucceeded = Boolean(apiGen && apiGen.success) && Boolean(e2eGen && e2eGen.success)
if (!bothSucceeded) {
  return {
    workflow: 'testarch-automate',
    status: 'failed-generation',
    summary: 'One or both test-generation subprocesses failed; aggregation skipped (mirrors step-03 exit condition).',
    steps: 3,
    preflight,
    plan,
    generation: { api: apiGen, e2e: e2eGen },
    needsHumanGate: true,
  }
}

// --- Step 3C: Aggregate (steps-c/step-03c-aggregate) -----------------------
phase('AGGREGATE')
const aggregate = await agent(
  `STEP 3C - Aggregate the two subprocess outputs and complete the test infrastructure (do NOT regenerate tests, do NOT run them).\n` +
    `API subprocess output: ${JSON.stringify(apiGen)}\nE2E subprocess output: ${JSON.stringify(e2eGen)}\n` +
    `1. Write all API and E2E test files to disk.\n` +
    `2. Aggregate the fixture needs from both subprocesses (de-duplicate), categorize them (auth fixtures, data factories, network mocks, helpers).\n` +
    `3. Generate the shared fixture infrastructure: tests/fixtures/auth.ts (test.extend with auto-cleanup), tests/fixtures/data-factories.ts (faker-based, override-able), tests/fixtures/network-mocks.ts, tests/fixtures/helpers.ts.\n` +
    `4. Compute summary statistics: total/api/e2e test counts, fixtures created, per-priority breakdown (P0-P3), knowledge fragments used.\n` +
    `Report the written files and the computed statistics.`,
  { label: 'aggregate', phase: 'AGGREGATE' }
)

// --- Step 4: Validate & Summarize (steps-c/step-04-validate-and-summarize) -
phase('VALIDATE')
const validate = await agent(
  `STEP 4 - Validate the generated outputs against the automate checklist and produce the automation summary.\n` +
    `Aggregation result: ${aggregate}\n` +
    `1. Validate per checklist.md: framework readiness, coverage mapping, test quality/structure, fixtures/factories/helpers, no duplicate coverage, priority tags present, network-first applied, deterministic (no hard waits). Fix gaps before completing; report any that remain.\n` +
    `2. Write the automation summary to the output folder (automation-summary.md): coverage plan by level and priority, files created/updated, key assumptions and risks, and the recommended next workflow (test-review or trace).\n` +
    `Set passed=true only if every completion criterion is satisfied.`,
  { label: 'validate-summarize', phase: 'VALIDATE', schema: VALIDATE_SCHEMA }
)
log(`validate: passed=${Boolean(validate && validate.passed)} gaps=${(validate && validate.gaps && validate.gaps.length) || 0}`)

// Return DATA only. The orchestrating skill presents this at the human gate
// and records FD/strict state via MCP.
return {
  workflow: 'testarch-automate',
  status: validate && validate.passed ? 'complete' : 'needs-fixes',
  summary:
    `Generated ${(apiGen.testCount || 0) + (e2eGen.testCount || 0)} tests ` +
    `(${apiGen.testCount || 0} API, ${e2eGen.testCount || 0} E2E) for ${coverageTarget} coverage in ${preflight.mode} mode.`,
  steps: 5,
  mode: preflight.mode,
  coverageTarget,
  preflight,
  plan,
  generation: { api: apiGen, e2e: e2eGen },
  aggregation: aggregate,
  validation: validate,
  needsHumanGate: true,
}
