export const meta = {
  name: 'qa-automate',
  description: 'Native port of the BYAN qa-automate (Quinn QA) workflow: autonomously generate automated API + E2E tests for already-implemented code using the project\'s existing test framework, run them to green (bounded fix loop), and return a structured test-automation summary for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'DETECT', detail: 'Step 0 - detect the project test framework' },
    { title: 'IDENTIFY', detail: 'Step 1 - identify the features/dirs to test' },
    { title: 'API_TESTS', detail: 'Step 2 - generate API tests (if applicable)' },
    { title: 'E2E_TESTS', detail: 'Step 3 - generate E2E tests (if UI exists)' },
    { title: 'RUN', detail: 'Step 4 - run tests, fix failures immediately (bounded loop)' },
    { title: 'SUMMARY', detail: 'Step 5 - produce the test-automation summary verdict' },
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
//   - uses NO wall-clock and NO randomness primitive (Date/RNG break
//     resume); any date/id must arrive via args.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate. The generated test FILES + the summary markdown are the
//     workflow's product, not BYAN platform state.
// ---------------------------------------------------------------------------

// Convergence guard for Step 4 ("Run Tests ... If failures occur, fix them
// immediately"). The source prose has no explicit cap, but an autonomous fix
// loop must be bounded so the model cannot spin forever in the sandbox. Hard
// cap = 3 fix attempts; turns the prose into a real JS counter.
const MAX_FIX_ATTEMPTS = 3

const RUN_SCHEMA = {
  type: 'object',
  required: ['pass', 'fixed'],
  properties: {
    pass: { type: 'boolean', description: 'true ONLY if the full generated test suite passes via the project test command' },
    fixed: { type: 'boolean', description: 'true if this attempt changed test/source code to address failures' },
    failures: { type: 'array', items: { type: 'string' }, description: 'precise failing tests / errors when not passing' },
    testCommand: { type: 'string', description: 'the exact command used to run the tests' },
    summary: { type: 'string', description: 'one-line run status' },
  },
}

const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['ok', 'apiTestFiles', 'e2eTestFiles', 'allPass'],
  properties: {
    ok: { type: 'boolean', description: 'true if a complete, faithful test-automation summary was produced' },
    apiTestFiles: { type: 'array', items: { type: 'string' }, description: 'relative paths of generated API test files' },
    e2eTestFiles: { type: 'array', items: { type: 'string' }, description: 'relative paths of generated E2E test files' },
    allPass: { type: 'boolean', description: 'true if all generated tests pass' },
    apiCoverage: { type: 'string', description: 'e.g. "5/10 endpoints covered"' },
    uiCoverage: { type: 'string', description: 'e.g. "3/8 UI features covered"' },
    summaryPath: { type: 'string', description: 'path the test-summary.md was written to (implementation_artifacts/tests/test-summary.md)' },
    notes: { type: 'string', description: 'next steps / caveats' },
  },
}

// Inputs arrive via args (no clock/RNG inside the script).
const target = (args && args.target) || 'auto-discover features in the codebase'
const testDir = (args && args.testDir) || '{project-root}/tests'
const sourceDir = (args && args.sourceDir) || '{project-root}'
const summaryPath = (args && args.summaryPath) || '{implementation_artifacts}/tests/test-summary.md'

// --- Step 0: Detect Test Framework -----------------------------------------
phase('DETECT')
const framework = await agent(
  `You are Quinn (BYAN QA), running qa-automate Step 0 (Detect Test Framework). ` +
    `Scope: GENERATE TESTS ONLY — do NOT do code review or story validation. ` +
    `Inspect the project under ${JSON.stringify(sourceDir)}: read package.json dependencies for an existing test ` +
    `framework (playwright, jest, vitest, cypress, etc.) and read existing test files to learn the project's patterns. ` +
    `Use whatever framework the project already has. If NO framework exists: analyze the source to determine the project ` +
    `type (React, Vue, Node API, ...), determine the currently recommended test framework for that stack, and propose it ` +
    `(flag that user confirmation is normally required). Report: detected framework, version, config file, conventions, ` +
    `and the test command. State explicitly if none was found.`,
  { label: 'detect-framework', phase: 'DETECT' }
)

// --- Step 1: Identify Features ----------------------------------------------
phase('IDENTIFY')
const features = await agent(
  `qa-automate Step 1 (Identify Features). Target requested: ${JSON.stringify(target)}. ` +
    `Framework context: ${framework}\n` +
    `Determine exactly what to test: a specific feature/component, a directory to scan (e.g. src/components/), ` +
    `or auto-discover features across ${JSON.stringify(sourceDir)}. Classify each into API surfaces (endpoints/services) ` +
    `vs UI surfaces (components/pages with user interaction). Report the concrete list of testable units with their files.`,
  { label: 'identify-features', phase: 'IDENTIFY' }
)

// --- Step 2: Generate API Tests (if applicable) -----------------------------
phase('API_TESTS')
const apiTests = await agent(
  `qa-automate Step 2 (Generate API Tests, if applicable). Framework: ${framework}\nFeatures: ${features}\n` +
    `For each API endpoint/service identified, generate tests using the project's existing framework patterns that: ` +
    `test status codes (200/400/404/500), validate response structure, and cover the happy path + 1-2 error cases. ` +
    `Write them under ${JSON.stringify(testDir)} (e.g. tests/api/...). Keep them simple — standard framework APIs, no ` +
    `complex fixture composition, no over-engineering. If there are no API surfaces, skip and say so. ` +
    `Report the generated API test file paths.`,
  { label: 'generate-api-tests', phase: 'API_TESTS' }
)

// --- Step 3: Generate E2E Tests (if UI exists) ------------------------------
phase('E2E_TESTS')
const e2eTests = await agent(
  `qa-automate Step 3 (Generate E2E Tests, if UI exists). Framework: ${framework}\nFeatures: ${features}\n` +
    `For each UI feature identified, generate end-to-end tests that: cover user workflows end-to-end, use semantic ` +
    `locators (roles, labels, text — not brittle CSS), focus on real user interactions (clicks, form fills, navigation), ` +
    `assert visible outcomes, and stay linear and simple. Follow the project's existing test patterns. ` +
    `Forbid hardcoded waits/sleeps; tests must be independent (no order dependency). Write them under ` +
    `${JSON.stringify(testDir)} (e.g. tests/e2e/...). If there is no UI, skip and say so. Report the generated E2E test file paths.`,
  { label: 'generate-e2e-tests', phase: 'E2E_TESTS' }
)

// --- Step 4: Run Tests (with immediate-fix, bounded loop) -------------------
phase('RUN')
// "Execute tests to verify they pass. If failures occur, fix them immediately."
// Bounded so an autonomous fix loop cannot spin forever.
let attempts = 0
let run = { pass: false, fixed: false, failures: ['not started'] }
while (true) {
  attempts += 1
  run = await agent(
    `qa-automate Step 4 (Run Tests), attempt ${attempts}/${MAX_FIX_ATTEMPTS}. Framework: ${framework}\n` +
      `Generated API tests: ${apiTests}\nGenerated E2E tests: ${e2eTests}\n` +
      `Run the generated tests using the project's test command. Set pass=true ONLY if the full generated suite passes. ` +
      `If failures occur, FIX them immediately (correct the tests or the obviously-broken test setup — do NOT silently ` +
      `delete tests to make them pass) and report fixed=true with the precise failures addressed. ` +
      `Report the exact test command used.`,
    { label: `run-tests-attempt-${attempts}`, phase: 'RUN', schema: RUN_SCHEMA }
  )
  log(`run attempt ${attempts}: pass=${Boolean(run && run.pass)} fixed=${Boolean(run && run.fixed)}`)
  if (run && run.pass) break
  if (attempts >= MAX_FIX_ATTEMPTS) break
}

// --- Step 5: Create Summary -------------------------------------------------
phase('SUMMARY')
const summary = await agent(
  `qa-automate Step 5 (Create Summary). Produce the Test Automation Summary markdown and save it to ` +
    `${JSON.stringify(summaryPath)}. Use the source template sections: Generated Tests (API Tests, E2E Tests with ` +
    `checkboxes + one-line description per file), Coverage (API endpoints X/Y, UI features X/Y), and Next Steps.\n` +
    `Inputs — API tests: ${apiTests}\nE2E tests: ${e2eTests}\nRun result: ${JSON.stringify(run)}\n` +
    `Be faithful: list only files actually generated; do not over-state coverage. Return the structured fields.`,
  { label: 'create-summary', phase: 'SUMMARY', schema: SUMMARY_SCHEMA }
)

// Return DATA only. The orchestrating skill presents this at the human gate
// and records FD/strict state via MCP.
return {
  workflow: 'qa-automate',
  target,
  framework,
  steps: 6,
  apiTestFiles: (summary && summary.apiTestFiles) || [],
  e2eTestFiles: (summary && summary.e2eTestFiles) || [],
  allTestsPass: Boolean(run && run.pass),
  fixAttempts: attempts,
  maxFixAttempts: MAX_FIX_ATTEMPTS,
  failures: (run && run.failures) || [],
  apiCoverage: (summary && summary.apiCoverage) || 'unknown',
  uiCoverage: (summary && summary.uiCoverage) || 'unknown',
  summaryPath: (summary && summary.summaryPath) || summaryPath,
  notes: (summary && summary.notes) || '',
  needsHumanGate: true,
}
