export const meta = {
  name: 'testarch-atdd',
  description: 'Native port of the BYAN testarch-atdd workflow (create mode): generate FAILING acceptance tests before implementation (TDD red phase). Preflight+context, generation mode, test strategy, parallel API+E2E failing-test generation, aggregate+verify red-phase compliance, then return a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'PREFLIGHT', detail: 'verify prerequisites and load story, framework, and knowledge base' },
    { title: 'MODE', detail: 'choose AI generation vs recording mode' },
    { title: 'STRATEGY', detail: 'map acceptance criteria to test levels and P0-P3 priorities' },
    { title: 'GENERATE', detail: 'parallel fan-out: FAILING API tests and FAILING E2E tests (red phase)' },
    { title: 'AGGREGATE', detail: 'aggregate subprocess outputs, verify TDD red-phase compliance, build infra + checklist' },
    { title: 'VALIDATE', detail: 'validate against checklist and return a completion verdict' },
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
//   - uses NO wall-clock and NO randomness primitive (wall-clock / wall-clock /
//     RNG break resume); any timestamp/id arrives via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate. The ATDD test files + checklist on disk are the workflow's
//     product (written by the generate/aggregate leaves), not platform state.
// ---------------------------------------------------------------------------

// Mirrors source step-04 "Prepare Subprocess Inputs": the source builds a
// timestamp via `an injected timestamp` for /tmp file naming. The sandbox
// forbids wall-clock, so the id is passed in via args (orchestrator-supplied)
// with a deterministic fallback. This keeps temp-file naming reproducible.
const story = (args && args.story) || 'next approved story with clear acceptance criteria'
const runId = (args && args.runId) || 'atdd-run'

// Source step-04c "Verify TDD Red Phase Compliance": every generated test MUST
// carry test.skip(), assert EXPECTED behavior (no expect(true).toBe(true)
// placeholders), and be flagged expected_to_fail. This schema turns that prose
// gate into a structured, validated subprocess contract.
const GEN_SCHEMA = {
  type: 'object',
  required: ['success', 'tdd_phase', 'tests', 'test_count'],
  properties: {
    success: { type: 'boolean' },
    subprocess: { type: 'string' },
    tdd_phase: { type: 'string', description: "must be 'RED' for ATDD" },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'uses_test_skip', 'expected_to_fail', 'placeholder_assertions'],
        properties: {
          file: { type: 'string' },
          uses_test_skip: { type: 'boolean', description: 'true if every test in the file uses test.skip()' },
          expected_to_fail: { type: 'boolean' },
          placeholder_assertions: { type: 'boolean', description: 'true if any expect(true).toBe(true) placeholders exist (must be false)' },
          acceptance_criteria_covered: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    fixture_needs: { type: 'array', items: { type: 'string' } },
    test_count: { type: 'integer' },
    summary: { type: 'string' },
  },
}

// Source step-04c red-phase gate, applied to a subprocess result object.
function redPhaseCompliant(out) {
  if (!out || out.success !== true) return false
  if (out.tdd_phase !== 'RED') return false
  const tests = (out && out.tests) || []
  if (tests.length === 0) return false
  return tests.every((t) => t && t.uses_test_skip === true && t.expected_to_fail === true && t.placeholder_assertions === false)
}

// === Step 1: Preflight & Context Loading (steps-c/step-01) ===
phase('PREFLIGHT')
const preflight = await agent(
  `You are the Master Test Architect running the ATDD workflow (create mode), step 1 (preflight & context). ` +
    `Read the real source step file _byan/workflow/simple/testarch/atdd/steps-c/step-01-preflight-and-context.md. ` +
    `Target story: ${JSON.stringify(story)}.\n` +
    `1) Verify HARD prerequisites: story approved with clear, testable acceptance criteria; a test framework is configured ` +
    `(playwright.config.ts or cypress.config.ts); a dev environment is available. If any is missing, HALT: set proceed=false and list what is missing.\n` +
    `2) Load story context: read the story markdown, extract acceptance criteria + constraints, identify affected components and integrations.\n` +
    `3) Load framework + existing patterns: inspect the tests/ dir for fixtures/helpers; read TEA config flags tea_use_playwright_utils and tea_use_mcp_enhancements.\n` +
    `4) Load knowledge-base fragments (data-factories, component-tdd, test-quality, test-healing-patterns, selector-resilience, timing-debugging; plus playwright-utils OR traditional fixture-architecture/network-first per the utils flag).\n` +
    `Report a concise summary of loaded inputs.`,
  {
    label: 'preflight',
    phase: 'PREFLIGHT',
    schema: {
      type: 'object',
      required: ['proceed'],
      properties: {
        proceed: { type: 'boolean', description: 'false if any hard prerequisite is missing (HALT)' },
        missing: { type: 'array', items: { type: 'string' } },
        acceptance_criteria: { type: 'array', items: { type: 'string' } },
        framework: { type: 'string', description: 'playwright | cypress | unknown' },
        use_playwright_utils: { type: 'boolean' },
        use_mcp_enhancements: { type: 'boolean' },
        notes: { type: 'string' },
      },
    }
  }
)

// Hard prerequisite gate (source step-01: "If any are missing: HALT").
if (!preflight.proceed) {
  return {
    workflow: 'testarch-atdd',
    story,
    status: 'halted-prerequisites',
    summary: 'Preflight HALT: hard prerequisites missing (acceptance criteria / framework / env).',
    missing: (preflight && preflight.missing) || [],
    steps: 1,
    needsHumanGate: true,
  }
}

// === Step 2: Generation Mode Selection (steps-c/step-02) ===
phase('MODE')
const mode = await agent(
  `ATDD step 2 (generation mode). Read _byan/workflow/simple/testarch/atdd/steps-c/step-02-generation-mode.md. ` +
    `Context: framework=${(preflight && preflight.framework) || 'unknown'}, use_mcp_enhancements=${Boolean(preflight && preflight.use_mcp_enhancements)}.\n` +
    `Default to AI generation when acceptance criteria are clear and scenarios are standard (CRUD/auth/API/navigation). ` +
    `Choose recording mode ONLY for complex UI (drag/drop, multi-step wizards) when tea_use_mcp_enhancements is true AND Playwright MCP tools are available. ` +
    `State the chosen mode and why.`,
  {
    label: 'generation-mode',
    phase: 'MODE',
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', description: 'ai-generation | recording' },
        rationale: { type: 'string' },
      },
    }
  }
)

// === Step 3: Test Strategy (steps-c/step-03) ===
phase('STRATEGY')
const strategy = await agent(
  `ATDD step 3 (test strategy). Read _byan/workflow/simple/testarch/atdd/steps-c/step-03-test-strategy.md. ` +
    `Acceptance criteria: ${JSON.stringify((preflight && preflight.acceptance_criteria) || [])}.\n` +
    `1) Convert each acceptance criterion into test scenarios, including negative/edge cases where risk is high. ` +
    `2) Select the best level per scenario: E2E for critical journeys, API for business logic/service contracts, Component for UI behavior; avoid duplicate coverage across levels. ` +
    `3) Assign P0-P3 priorities by risk + business impact. ` +
    `4) Confirm every test is designed to FAIL before implementation (TDD red phase). ` +
    `Output the prioritized scenario plan split into apiScenarios and e2eScenarios.`,
  {
    label: 'test-strategy',
    phase: 'STRATEGY',
    schema: {
      type: 'object',
      required: ['apiScenarios', 'e2eScenarios'],
      properties: {
        apiScenarios: { type: 'array', items: { type: 'string' } },
        e2eScenarios: { type: 'array', items: { type: 'string' } },
        redPhaseConfirmed: { type: 'boolean' },
        notes: { type: 'string' },
      },
    }
  }
)

// === Step 4: Orchestrate Parallel FAILING Test Generation (steps-c/step-04 + 04a + 04b) ===
// Source mandates TWO subprocesses launched in PARALLEL and waits for BOTH:
//   04a -> FAILING API tests, 04b -> FAILING E2E tests. This is a genuine
//   fan-out over two independent generators, so parallel() mirrors it exactly.
phase('GENERATE')
const [apiOut, e2eOut] = await parallel([
  () =>
    agent(
      `ATDD subprocess 4A (FAILING API tests, TDD RED phase). Read _byan/workflow/simple/testarch/atdd/steps-c/step-04a-subprocess-api-failing.md. ` +
        `Temp output id: ${JSON.stringify(runId)}.\n` +
        `From the API scenarios ${JSON.stringify((strategy && strategy.apiScenarios) || [])}, generate FAILING API test files under tests/api/. ` +
        `Each test MUST use test.skip() (intentional red phase), assert EXPECTED request/response contracts + status codes + error cases (NO expect(true).toBe(true) placeholders), ` +
        `use realistic data via factories, and carry priority tags [P0]-[P3]. Track fixture needs (do not build them yet). Do NOT generate E2E tests. Do NOT run tests.`,
      { label: 'gen-api-red', phase: 'GENERATE', schema: GEN_SCHEMA }
    ),
  () =>
    agent(
      `ATDD subprocess 4B (FAILING E2E tests, TDD RED phase). Read _byan/workflow/simple/testarch/atdd/steps-c/step-04b-subprocess-e2e-failing.md. ` +
        `Temp output id: ${JSON.stringify(runId)}.\n` +
        `From the E2E scenarios ${JSON.stringify((strategy && strategy.e2eScenarios) || [])}, generate FAILING E2E test files under tests/e2e/. ` +
        `Each test MUST use test.skip() (intentional red phase), assert EXPECTED UI behavior with resilient selectors (getByRole/getByText/getByLabel), follow network-first, use deterministic waits (no hard sleeps), ` +
        `cover complete user journeys, and carry priority tags [P0]-[P3]. Track fixture needs (do not build them yet). Do NOT generate API tests. Do NOT run tests.`,
      { label: 'gen-e2e-red', phase: 'GENERATE', schema: GEN_SCHEMA }
    ),
])

// === Step 4C: Aggregate + verify TDD red-phase compliance (steps-c/step-04c) ===
phase('AGGREGATE')
// Source step-04c: if either subprocess failed OR red-phase compliance fails,
// "report error and stop (don't proceed)". Surface the gap as a verdict; the
// orchestrating skill decides at the human gate (gap is not a silent cut).
const apiOk = redPhaseCompliant(apiOut)
const e2eOk = redPhaseCompliant(e2eOut)
log(`red-phase compliance: api=${apiOk} e2e=${e2eOk}`)

if (!apiOk || !e2eOk) {
  const blocking = []
  if (!apiOk) blocking.push('API subprocess failed red-phase compliance (success/RED/test.skip/expected_to_fail/no-placeholder)')
  if (!e2eOk) blocking.push('E2E subprocess failed red-phase compliance (success/RED/test.skip/expected_to_fail/no-placeholder)')
  return {
    workflow: 'testarch-atdd',
    story,
    status: 'red-phase-violation',
    summary: 'Aggregation stopped: at least one subprocess did not produce compliant FAILING tests.',
    blocking,
    apiTestCount: (apiOut && apiOut.test_count) || 0,
    e2eTestCount: (e2eOut && e2eOut.test_count) || 0,
    steps: 5,
    needsHumanGate: true,
  }
}

const aggregate = await agent(
  `ATDD step 4C (aggregate). Read _byan/workflow/simple/testarch/atdd/steps-c/step-04c-aggregate.md. ` +
    `Both subprocesses are red-phase compliant. API result: ${JSON.stringify(apiOut)}. E2E result: ${JSON.stringify(e2eOut)}.\n` +
    `1) Write all generated test files to disk (tests/api/*, tests/e2e/*) keeping every test.skip(). ` +
    `2) Aggregate + dedupe fixture needs and create the minimal red-phase fixture infrastructure (e.g. tests/fixtures/test-data.ts). ` +
    `3) Generate the ATDD checklist (story summary, AC coverage, RED-phase status, GREEN-phase next steps: remove test.skip() -> run -> verify pass, implementation guidance for endpoints + UI flows) and save it under the configured output folder as atdd-checklist-<story-id>.md. ` +
    `Do NOT remove any test.skip() and do NOT run the tests yet. Report counts and written paths.`,
  {
    label: 'aggregate',
    phase: 'AGGREGATE',
    schema: {
      type: 'object',
      required: ['filesWritten', 'totalTests', 'checklistPath'],
      properties: {
        filesWritten: { type: 'array', items: { type: 'string' } },
        totalTests: { type: 'integer' },
        apiTests: { type: 'integer' },
        e2eTests: { type: 'integer' },
        fixturesCreated: { type: 'integer' },
        checklistPath: { type: 'string' },
        acceptanceCriteriaCovered: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    }
  }
)

// === Step 5: Validate & Complete (steps-c/step-05) ===
phase('VALIDATE')
const validation = await agent(
  `ATDD step 5 (validate & complete). Read _byan/workflow/simple/testarch/atdd/steps-c/step-05-validate-and-complete.md and the workflow checklist.md. ` +
    `Aggregation result: ${JSON.stringify(aggregate)}.\n` +
    `Validate against the checklist: prerequisites satisfied; test files created correctly; checklist matches the acceptance criteria; every test is designed to FAIL before implementation (RED phase). ` +
    `List any gaps that still need fixing. Then give a completion summary: test files created, checklist output path, key risks/assumptions, and the next recommended workflow (implementation, then 'automate' for the green phase).`,
  {
    label: 'validate-complete',
    phase: 'VALIDATE',
    schema: {
      type: 'object',
      required: ['valid'],
      properties: {
        valid: { type: 'boolean', description: 'true only if all checklist completion criteria are satisfied' },
        gaps: { type: 'array', items: { type: 'string' } },
        nextWorkflow: { type: 'string' },
        summary: { type: 'string' },
      },
    }
  }
)

// Return DATA only. The orchestrating skill presents this at the human gate
// and records FD/strict state via MCP. No platform state is written here.
return {
  workflow: 'testarch-atdd',
  story,
  status: validation.valid ? 'red-phase-ready' : 'gaps-found',
  mode: (mode && mode.mode) || 'ai-generation',
  totalTests: (aggregate && aggregate.totalTests) || 0,
  apiTests: (aggregate && aggregate.apiTests) || (apiOut && apiOut.test_count) || 0,
  e2eTests: (aggregate && aggregate.e2eTests) || (e2eOut && e2eOut.test_count) || 0,
  checklistPath: (aggregate && aggregate.checklistPath) || '',
  gaps: (validation && validation.gaps) || [],
  nextWorkflow: (validation && validation.nextWorkflow) || 'automate',
  steps: 6,
  needsHumanGate: true,
  result: validation,
}
