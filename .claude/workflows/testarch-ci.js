export const meta = {
  name: 'testarch-ci',
  description: 'Native port of the BYAN testarch-ci workflow: scaffold a CI/CD quality pipeline (lint -> sharded test -> burn-in flaky detection -> report) with caching, artifacts, quality gates and notifications, then return a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'PREFLIGHT', detail: 'verify git + test framework + local pass, detect CI platform and Node version' },
    { title: 'GENERATE', detail: 'generate the platform CI config (stages, sharding, burn-in, caching, artifacts)' },
    { title: 'QUALITY_GATES', detail: 'configure burn-in loop, quality thresholds and failure notifications' },
    { title: 'VALIDATE', detail: 'validate against checklist.md and produce the completion summary verdict' },
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
//     resume); any timestamp/id is passed in via args.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools AT
//     the gate, and IT owns the human "update or replace existing CI" decision.
// The CI config FILE (and helper scripts / docs) is the workflow's product,
// written by the generate/quality-gate leaves — that is the artifact, not
// BYAN platform state.
// ---------------------------------------------------------------------------

// Inputs (all optional; defaults mirror workflow.yaml variables).
const ciPlatform = (args && args.ci_platform) || 'auto' // auto | github-actions | gitlab-ci | circle-ci | jenkins
const testDir = (args && args.test_dir) || '{project-root}/tests'
const shards = (args && args.shards) || 4
const burnInIterations = (args && args.burn_in_iterations) || 10

const PREFLIGHT_SCHEMA = {
  type: 'object',
  required: ['ready', 'platform', 'blocking'],
  properties: {
    ready: { type: 'boolean', description: 'true ONLY if git repo, a test framework, and a passing local test command were all confirmed' },
    gitOk: { type: 'boolean', description: 'true if .git/ exists (remote noted if available)' },
    frameworkOk: { type: 'boolean', description: 'true if playwright.config.* or cypress.config.* exists AND the framework is in package.json' },
    localTestsPass: { type: 'boolean', description: 'true if the main test command (e.g. npm run test:e2e) passes locally' },
    framework: { type: 'string', description: 'playwright | cypress | other' },
    platform: { type: 'string', description: 'resolved CI platform: github-actions | gitlab-ci | circle-ci | jenkins' },
    nodeVersion: { type: 'string', description: 'from .nvmrc, or the default LTS if absent' },
    existingCi: { type: 'string', description: 'path of any pre-existing CI config detected, or empty if none' },
    blocking: { type: 'array', items: { type: 'string' }, description: 'HALT reasons when not ready (missing git, no framework, failing tests)' },
  },
}

const GENERATE_SCHEMA = {
  type: 'object',
  required: ['configPath', 'stages'],
  properties: {
    configPath: { type: 'string', description: 'path the CI config was written to (e.g. .github/workflows/test.yml or .gitlab-ci.yml)' },
    stages: { type: 'array', items: { type: 'string' }, description: 'pipeline stages present, expect lint, test, burn-in, report' },
    sharding: { type: 'boolean', description: 'true if parallel sharding (matrix, fail-fast:false) is configured' },
    retries: { type: 'boolean', description: 'true if CI retries / timeouts are configured' },
    caching: { type: 'boolean', description: 'true if dependency + browser caching keyed on the lockfile is configured' },
    artifacts: { type: 'boolean', description: 'true if failure-only artifacts (HTML report, JUnit XML, traces/videos) are uploaded' },
    notes: { type: 'string' },
  },
}

const GATES_SCHEMA = {
  type: 'object',
  required: ['burnInConfigured', 'qualityGates'],
  properties: {
    burnInConfigured: { type: 'boolean', description: 'true if the N-iteration burn-in flaky-detection loop with `|| exit 1` gating is in place' },
    burnInIterations: { type: 'integer', description: 'configured burn-in iteration count' },
    qualityGates: { type: 'array', items: { type: 'string' }, description: 'gates defined, e.g. "P0=100%", "P1>=95%", "fail CI on critical failures"' },
    notifications: { type: 'boolean', description: 'true if failure notifications (Slack/email) and artifact links are configured' },
    notes: { type: 'string' },
  },
}

const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['valid', 'gaps', 'summary'],
  properties: {
    valid: { type: 'boolean', description: 'true ONLY if every checklist.md item the script covers (config created, stages+sharding, burn-in+artifacts, secrets documented, YAML syntactically valid) is satisfied' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'unmet checklist items; empty when valid' },
    secretsDocumented: { type: 'boolean', description: 'true if required secrets/variables are documented' },
    nextSteps: { type: 'array', items: { type: 'string' }, description: 'post-workflow actions for the human: set secrets, commit, push, open PR to trigger first run' },
    summary: { type: 'string', description: 'one-line completion summary: platform + config path + key stages' },
  },
}

// --- Step 1: Preflight (steps-c/step-01-preflight.md) ----------------------
phase('PREFLIGHT')
const preflight = await agent(
  `You are the Master Test Architect running testarch-ci preflight.\n` +
    `Read the COMPLETE source step: _byan/workflow/simple/testarch/ci/steps-c/step-01-preflight.md.\n` +
    `Verify, in order, exactly as the step mandates:\n` +
    `  1. Git repository: .git/ exists (note remote if available). HALT reason if missing.\n` +
    `  2. Test framework: playwright.config.* or cypress.config.* exists AND the framework is in package.json. HALT reason if missing.\n` +
    `  3. Local tests pass: run the main test command (e.g. npm run test:e2e). HALT reason if failing.\n` +
    `  4. Detect CI platform: scan for .github/workflows/*.yml, .gitlab-ci.yml, .circleci/config.yml, Jenkinsfile. ` +
    `If found, record its path in existingCi (the human, not this script, decides update vs replace). ` +
    `If none, infer from the git remote (github.com -> github-actions). ` +
    `Requested ci_platform=${JSON.stringify(ciPlatform)} overrides detection unless it is "auto".\n` +
    `  5. Read environment context: .nvmrc (default to current LTS if absent) and package.json caching strategy.\n` +
    `Test directory under consideration: ${testDir}.\n` +
    `Do NOT invent passing tests or a framework that is not there: report blocking honestly.`,
  { label: 'preflight', phase: 'PREFLIGHT', schema: PREFLIGHT_SCHEMA }
)

if (!preflight.ready) {
  // Mirror the source HALT: do not fabricate a pipeline on a failing preflight.
  return {
    workflow: 'testarch-ci',
    summary: 'preflight HALT — CI scaffolding not started',
    steps: 1,
    halted: true,
    needsHumanGate: true,
    preflight,
  }
}

// --- Step 2: Generate pipeline (steps-c/step-02-generate-pipeline.md) -------
phase('GENERATE')
const generate = await agent(
  `Read the COMPLETE source step: _byan/workflow/simple/testarch/ci/steps-c/step-02-generate-pipeline.md ` +
    `and the matching template in _byan/workflow/simple/testarch/ci/ ` +
    `(github-actions-template.yaml or gitlab-ci-template.yaml).\n` +
    `Target platform: ${preflight.platform}. Node version: ${preflight.nodeVersion}. Framework: ${preflight.framework}.\n` +
    `Select the output path by platform: github-actions -> .github/workflows/test.yml, gitlab-ci -> .gitlab-ci.yml, ` +
    `circle-ci -> .circleci/config.yml, jenkins -> Jenkinsfile.\n` +
    `Generate the CI config with these stages: lint, test (parallel shards), burn-in (flaky detection), report (aggregate + publish).\n` +
    `Test execution requirements: ${shards} parallel shards with fail-fast:false, CI retries/timeouts configured, ` +
    `failure-only artifacts (HTML report, JUnit XML, traces/videos), and dependency + browser caching keyed on the lockfile hash.\n` +
    `Write the config to the chosen path. Return the path and what was configured. Do not claim a stage you did not write.`,
  { label: 'generate-pipeline', phase: 'GENERATE', schema: GENERATE_SCHEMA }
)

// --- Step 3: Quality gates & notifications (steps-c/step-03-...) ------------
phase('QUALITY_GATES')
const gates = await agent(
  `Read the COMPLETE source step: _byan/workflow/simple/testarch/ci/steps-c/step-03-configure-quality-gates.md ` +
    `(and ci-burn-in.md guidance via the tea knowledge index if reachable).\n` +
    `CI config under edit: ${generate.configPath}.\n` +
    `Configure, in order:\n` +
    `  1. Burn-in: ${burnInIterations}-iteration loop for flaky detection, gating promotion on stability (`+'`'+`|| exit 1`+'`'+` per iteration).\n` +
    `  2. Quality gates: minimum pass rates (P0 = 100%, P1 >= 95%), fail CI on critical test failures, ` +
    `optionally require traceability / nfr-assess output before release.\n` +
    `  3. Notifications: failure notifications (Slack/email) and artifact links.\n` +
    `Return what was actually configured; do not assert a gate or notification you did not write.`,
  { label: 'quality-gates', phase: 'QUALITY_GATES', schema: GATES_SCHEMA }
)

// --- Step 4: Validate & summarize (steps-c/step-04-validate-and-summary.md) -
phase('VALIDATE')
const validate = await agent(
  `Read the COMPLETE source step: _byan/workflow/simple/testarch/ci/steps-c/step-04-validate-and-summary.md ` +
    `and the validation criteria in _byan/workflow/simple/testarch/ci/checklist.md.\n` +
    `Validate the generated CI setup at ${generate.configPath} against the checklist:\n` +
    `  - config file created and YAML syntactically valid\n` +
    `  - stages and parallel sharding configured\n` +
    `  - burn-in loop and failure-only artifacts enabled\n` +
    `  - secrets/variables documented\n` +
    `Generated stages reported: ${JSON.stringify(generate.stages)}; ` +
    `burn-in configured: ${gates.burnInConfigured}; quality gates: ${JSON.stringify(gates.qualityGates)}.\n` +
    `List any gaps honestly (do not pass over a missing item). Then produce the completion summary: ` +
    `CI platform and config path, key stages enabled, artifacts and notifications, and the next steps the human must take ` +
    `(set secrets, commit, push, open a PR to trigger the first run).`,
  { label: 'validate-and-summary', phase: 'VALIDATE', schema: VALIDATE_SCHEMA }
)

return {
  workflow: 'testarch-ci',
  summary: validate.summary,
  steps: 4,
  halted: false,
  needsHumanGate: true,
  platform: preflight.platform,
  configPath: generate.configPath,
  result: {
    preflight,
    generate,
    gates,
    validate,
  },
}
