export const meta = {
  name: 'testarch-framework',
  description: 'Native port of the BYAN testarch-framework workflow (Create mode): initialize a production-ready E2E test framework (Playwright or Cypress) with directory structure, config, fixtures, data factories, sample tests, helpers, docs and package scripts, then validate against the checklist and return a structured completion verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'PREFLIGHT', detail: 'verify prerequisites (package.json, no existing E2E framework) and gather project context' },
    { title: 'SELECT', detail: 'select Playwright or Cypress and justify the choice (respect framework_preference)' },
    { title: 'SCAFFOLD', detail: 'create dir structure, config, env/node, fixtures+factories, sample tests+helpers' },
    { title: 'DOCS_SCRIPTS', detail: 'write tests/README.md and add the test:e2e package.json script' },
    { title: 'VALIDATE', detail: 'validate against checklist.md, fix gaps (bounded loop), and summarize' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — byan-lint-workflows guard).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly  (enforced by byan-lint-workflows.js).
//   - uses NO wall-clock and NO randomness primitive (wall-clock/wall-clock/
//     RNG break resume); any date/id arrives via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate. The HALT in PREFLIGHT and the "fix gaps before completion"
//     decision are surfaced as verdict fields, not enforced as side effects.
// The framework FILES (config, fixtures, factories, sample tests, tests/README,
// package scripts) are this workflow's product, written by the leaf agents —
// those are the artifacts, not BYAN platform state.
// ---------------------------------------------------------------------------

// Bounded validate->fix convergence guard. Mirrors step-05's prose rule
// ("Fix any gaps before completion") as a real counter the model cannot
// silently overrun. No unbounded loop: hard cap at MAX_FIX_PASSES.
const MAX_FIX_PASSES = 3

// Inputs arrive via args (no fs, no clock, no RNG inside the sandbox).
const projectRoot = (args && args.projectRoot) || '{project-root}'
const testDir = (args && args.testDir) || `${projectRoot}/tests`
const useTypescript = !(args && args.useTypescript === false) // workflow.yaml default: true
const frameworkPreference = (args && args.frameworkPreference) || 'auto' // auto | playwright | cypress
const projectSize = (args && args.projectSize) || 'auto' // auto | small | large
const runDate = (args && args.date) || 'unset' // system-generated date passed in by the conductor

// ── Step 1: Preflight ──────────────────────────────────────────────────────
// Source: steps-c/step-01-preflight.md — validate prerequisites, gather context.
// HALT on missing prerequisite is a real early-exit (returned as a verdict).
phase('PREFLIGHT')
const PREFLIGHT_SCHEMA = {
  type: 'object',
  required: ['readyToScaffold', 'projectType', 'frameworkAlreadyInstalled'],
  properties: {
    readyToScaffold: { type: 'boolean' },
    haltReason: { type: 'string' }, // non-empty iff readyToScaffold === false
    projectType: { type: 'string' }, // React, Vue, Angular, Next.js, Node, ...
    bundler: { type: 'string' }, // Vite, Webpack, Rollup, esbuild, or N/A
    frameworkAlreadyInstalled: { type: 'boolean' },
    contextDocs: { type: 'array', items: { type: 'string' } }, // architecture.md, tech-spec*.md
    authOrApiNotes: { type: 'string' },
  },
}
const preflight = await agent(
  [
    'You are the Master Test Architect executing step-01-preflight of the testarch-framework workflow.',
    `Source step file: ${projectRoot}/_byan/workflow/simple/testarch/framework/steps-c/step-01-preflight.md`,
    '1. Validate prerequisites: package.json exists in project root; NO existing E2E framework',
    '   (playwright.config.*, cypress.config.*, cypress.json); project type/stack context is available.',
    '   If any prerequisite fails, set readyToScaffold=false and put the missing requirement in haltReason (HALT).',
    `2. Gather context: read ${projectRoot}/package.json to identify framework, bundler, dependencies;`,
    '   check for architecture docs (architecture.md, tech-spec*.md); note auth requirements and APIs if documented.',
    '3. Confirm findings: project type and bundler, whether a framework is already installed, relevant context docs.',
    'Do NOT scaffold anything in this step. Report findings only.',
  ].join('\n'),
  { label: 'preflight', phase: 'PREFLIGHT', schema: PREFLIGHT_SCHEMA },
)

// HALT gate (mirrors "If any fail, HALT and report"). End early with a verdict;
// the human gate (handled by the orchestrating skill) decides what to do next.
if (!preflight.readyToScaffold) {
  return {
    workflow: 'testarch-framework',
    mode: 'create',
    summary: `Preflight HALT: ${preflight.haltReason || 'prerequisite(s) not met'}`,
    halted: true,
    haltedAt: 'PREFLIGHT',
    steps: 1,
    needsHumanGate: true,
    preflight,
  }
}

// ── Step 2: Framework Selection ─────────────────────────────────────────────
// Source: steps-c/step-02-select-framework.md — default Playwright, respect
// framework_preference; justify the choice.
phase('SELECT')
const SELECT_SCHEMA = {
  type: 'object',
  required: ['framework', 'rationale'],
  properties: {
    framework: { type: 'string', enum: ['playwright', 'cypress'] },
    rationale: { type: 'string' },
    preferenceRespected: { type: 'boolean' },
  },
}
const selection = await agent(
  [
    'Execute step-02-select-framework of the testarch-framework workflow.',
    `Source step file: ${projectRoot}/_byan/workflow/simple/testarch/framework/steps-c/step-02-select-framework.md`,
    `Inputs: framework_preference=${frameworkPreference}, project_size=${projectSize}.`,
    'Default to Playwright unless strong reasons suggest Cypress.',
    'Playwright when: large/complex repo, multi-browser, heavy API+UI integration, CI speed/parallelism matters.',
    'Cypress when: small team prioritizes DX, component-testing focus, simpler setup.',
    'If framework_preference is explicitly playwright or cypress, respect it (set preferenceRespected=true).',
    'Announce the selected framework and the reasoning.',
    `Context: projectType=${preflight.projectType}, bundler=${preflight.bundler || 'N/A'}.`,
  ].join('\n'),
  { label: 'select-framework', phase: 'SELECT', schema: SELECT_SCHEMA },
)

// ── Step 3: Scaffold Framework ──────────────────────────────────────────────
// Source: steps-c/step-03-scaffold-framework.md — dirs, config, env/node,
// fixtures+factories (knowledge-base driven), sample tests + helpers.
phase('SCAFFOLD')
const SCAFFOLD_SCHEMA = {
  type: 'object',
  required: ['directoriesCreated', 'configFile', 'filesCreated'],
  properties: {
    directoriesCreated: { type: 'array', items: { type: 'string' } },
    configFile: { type: 'string' }, // playwright.config.ts | cypress.config.ts
    envFiles: { type: 'array', items: { type: 'string' } }, // .env.example, .nvmrc
    fixturesCreated: { type: 'array', items: { type: 'string' } },
    factoriesCreated: { type: 'array', items: { type: 'string' } },
    sampleTests: { type: 'array', items: { type: 'string' } },
    helpersCreated: { type: 'array', items: { type: 'string' } },
    knowledgeFragmentsApplied: { type: 'array', items: { type: 'string' } },
    filesCreated: { type: 'array', items: { type: 'string' } },
  },
}
const scaffold = await agent(
  [
    'Execute step-03-scaffold-framework of the testarch-framework workflow.',
    `Source step file: ${projectRoot}/_byan/workflow/simple/testarch/framework/steps-c/step-03-scaffold-framework.md`,
    `Selected framework: ${selection.framework}. use_typescript=${useTypescript}.`,
    `1. Create dir structure under ${testDir}: e2e/, support/fixtures/, support/helpers/, support/page-objects/ (optional).`,
    `2. Generate the framework config (${selection.framework === 'cypress' ? 'cypress.config.ts' : 'playwright.config.ts'}):`,
    '   timeouts (action 15s, navigation 30s, test 60s), BASE_URL env fallback, retain-on-failure artifacts',
    '   (trace/screenshot/video), reporters HTML+JUnit+console, parallelism enabled (CI tuned). TypeScript if use_typescript.',
    '3. Environment & Node: .env.example with TEST_ENV/BASE_URL/API_URL; .nvmrc on current LTS (prefer Node 24+).',
    `4. Fixtures & factories: read ${projectRoot}/_byan/tea/config.yaml and use the knowledge index`,
    `   ${projectRoot}/_byan/connaissance/testarch/tea-index.csv based on config.tea_use_playwright_utils.`,
    '   If Playwright Utils enabled, load: overview.md, fixtures-composition.md, auth-session.md, api-request.md,',
    '   burn-in.md, network-error-monitor.md, data-factories.md and recommend @seontechnologies/playwright-utils.',
    '   If disabled, load: fixture-architecture.md, data-factories.md, network-first.md, playwright-config.md, test-quality.md.',
    '   Implement: fixture index with mergeTests, auto-cleanup hooks, Faker-based data factories with overrides.',
    '5. Sample tests in e2e/ (Given/When/Then, data-testid strategy, factory usage, network interception if applicable),',
    '   plus helpers for API clients, network utilities, auth (only those needed).',
    'List every directory and file created and every knowledge fragment applied.',
  ].join('\n'),
  { label: 'scaffold-framework', phase: 'SCAFFOLD', schema: SCAFFOLD_SCHEMA },
)

// ── Step 4: Documentation & Scripts ─────────────────────────────────────────
// Source: steps-c/step-04-docs-and-scripts.md — tests/README.md + package.json
// test:e2e script.
phase('DOCS_SCRIPTS')
const DOCS_SCHEMA = {
  type: 'object',
  required: ['readmePath', 'scriptsAdded'],
  properties: {
    readmePath: { type: 'string' }, // {test_dir}/README.md
    readmeSections: { type: 'array', items: { type: 'string' } },
    scriptsAdded: { type: 'array', items: { type: 'string' } }, // at minimum test:e2e
  },
}
const docs = await agent(
  [
    'Execute step-04-docs-and-scripts of the testarch-framework workflow.',
    `Source step file: ${projectRoot}/_byan/workflow/simple/testarch/framework/steps-c/step-04-docs-and-scripts.md`,
    `1. Create ${testDir}/README.md with: setup instructions; running tests (local/headed/debug);`,
    '   architecture overview (fixtures, factories, helpers); best practices (selectors, isolation, cleanup);',
    '   CI integration notes; knowledge base references.',
    '2. Update package.json scripts: add at minimum test:e2e = the framework execution command',
    `   for ${selection.framework}.`,
    'List the README path, its sections, and every script added.',
  ].join('\n'),
  { label: 'docs-and-scripts', phase: 'DOCS_SCRIPTS', schema: DOCS_SCHEMA },
)

// ── Step 5: Validate & Summarize ────────────────────────────────────────────
// Source: steps-c/step-05-validate-and-summary.md — validate against
// checklist.md, "Fix any gaps before completion", then summarize.
// Bounded validate->fix loop (hard cap MAX_FIX_PASSES); last pass must be clean.
phase('VALIDATE')
const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['checklistPassed', 'gaps'],
  properties: {
    checklistPassed: { type: 'boolean' },
    gaps: { type: 'array', items: { type: 'string' } }, // non-empty iff checklistPassed === false
    fixesApplied: { type: 'array', items: { type: 'string' } },
  },
}
let validation = { checklistPassed: false, gaps: [], fixesApplied: [] }
let fixPasses = 0
while (fixPasses < MAX_FIX_PASSES) {
  fixPasses += 1
  validation = await agent(
    [
      `Execute step-05-validate-and-summary of the testarch-framework workflow (pass ${fixPasses}/${MAX_FIX_PASSES}).`,
      `Source step file: ${projectRoot}/_byan/workflow/simple/testarch/framework/steps-c/step-05-validate-and-summary.md`,
      `Validate the scaffold against the checklist: ${projectRoot}/_byan/workflow/simple/testarch/framework/checklist.md`,
      'Verify: preflight success; directory structure created; config correctness (timeouts, BASE_URL, artifacts,',
      'reporters, parallelism); fixtures/factories created with auto-cleanup; sample tests; helpers; docs and the',
      'test:e2e script present; no placeholders/secrets; imports resolve.',
      'If any item fails, FIX the gap now (write/patch the offending file) and record the fix in fixesApplied,',
      'then re-check. Set checklistPassed=true only when every checklist item holds; otherwise list remaining gaps.',
      `Context: framework=${selection.framework}, config=${scaffold.configFile}, readme=${docs.readmePath}.`,
    ].join('\n'),
    { label: `validate-pass-${fixPasses}`, phase: 'VALIDATE', schema: VALIDATE_SCHEMA },
  )
  if (validation.checklistPassed) break
}

const converged = validation.checklistPassed
const unresolvedGaps = converged ? [] : validation.gaps

return {
  workflow: 'testarch-framework',
  mode: 'create',
  summary: converged
    ? `${selection.framework} test framework scaffolded and validated clean (${fixPasses} validate pass(es)).`
    : `${selection.framework} test framework scaffolded; ${unresolvedGaps.length} gap(s) unresolved after ${MAX_FIX_PASSES} fix passes.`,
  halted: false,
  steps: 5,
  date: runDate,
  framework: selection.framework,
  frameworkRationale: selection.rationale,
  artifacts: {
    directories: scaffold.directoriesCreated,
    configFile: scaffold.configFile,
    envFiles: scaffold.envFiles || [],
    fixtures: scaffold.fixturesCreated || [],
    factories: scaffold.factoriesCreated || [],
    sampleTests: scaffold.sampleTests || [],
    helpers: scaffold.helpersCreated || [],
    readme: docs.readmePath,
    scripts: docs.scriptsAdded,
    knowledgeFragmentsApplied: scaffold.knowledgeFragmentsApplied || [],
  },
  validation: {
    converged,
    fixPasses,
    maxFixPasses: MAX_FIX_PASSES,
    unresolvedGaps,
    fixesApplied: validation.fixesApplied || [],
  },
  // Post-workflow user actions (checklist.md) — surfaced for the human gate,
  // never executed by this script.
  nextSteps: [
    'Copy .env.example to .env and fill values',
    'Run npm install to install test dependencies',
    'Run npm run test:e2e to verify setup',
    'Review tests/README.md',
    'Consider downstream workflows: ci, test-design, atdd',
  ],
  needsHumanGate: true,
}
