export const meta = {
  name: 'testarch-test-design',
  description: 'Native port of the BYAN testarch-test-design workflow (create mode): a dual-mode (system-level vs epic-level) test-design engine that detects mode, loads context + TEA knowledge fragments, performs testability + risk assessment, designs a coverage/priority/execution plan, then generates the output document(s) and validates them against the checklist. Returns a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'DETECT-MODE', detail: 'system-level vs epic-level + prerequisite check' },
    { title: 'LOAD-CONTEXT', detail: 'load artifacts, config flags, TEA knowledge fragments' },
    { title: 'RISK-AND-TESTABILITY', detail: 'testability review (system-level) + risk matrix (all modes)' },
    { title: 'COVERAGE-PLAN', detail: 'coverage matrix, priorities, execution strategy, estimates, gates' },
    { title: 'GENERATE-OUTPUT', detail: 'write template(s) and validate against checklist' },
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
//   - uses NO wall-clock and NO randomness primitive (wall-clock/RNG
//     break resume); any date/id arrives via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate. The mode-detection question and the team-review gate stay
//     OUT of this script — the script surfaces them as verdict fields.
// The test-design document(s) ARE the workflow's product, written by the
// generate leaf — that is the artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Inputs arrive via args (sandbox: no fs, no clock, no RNG). `mode` may force
// 'system-level' or 'epic-level'; default 'auto-detect' lets the detect leaf
// resolve it per the source priority order. `date` is passed in for stamping.
const requestedMode = (args && args.mode) || 'auto-detect'
const epicNum = (args && args.epicNum) || null
const designLevel = (args && args.designLevel) || 'full'
const date = (args && args.date) || null

const SOURCE = '_byan/workflow/simple/testarch/test-design'

// ---- STEP 1 : Detect Mode & Prerequisites (steps-c/step-01-detect-mode.md) --
phase('DETECT-MODE')
const DETECT_SCHEMA = {
  type: 'object',
  required: ['mode', 'prerequisitesMet'],
  properties: {
    mode: { type: 'string', enum: ['system-level', 'epic-level', 'ambiguous'], description: 'resolved mode; "ambiguous" if it cannot be decided without the user' },
    rationale: { type: 'string', description: 'why this mode (user intent > file-based detection > ask)' },
    prerequisitesMet: { type: 'boolean', description: 'true only if the mode-specific required inputs are present' },
    missingInputs: { type: 'array', items: { type: 'string' }, description: 'required inputs that are missing (HALT condition)' },
    needsUserDecision: { type: 'boolean', description: 'true if mode is ambiguous and the user must choose A/B' },
  },
}
const detect = await agent(
  `You are the Master Test Architect running step 1 of the BYAN testarch-test-design workflow. ` +
    `Read the COMPLETE source step ${SOURCE}/steps-c/step-01-detect-mode.md and the workflow.yaml in that folder. ` +
    `Requested mode: ${JSON.stringify(requestedMode)} (auto-detect means resolve it yourself).\n` +
    `Mode detection priority order (mirror the source exactly): ` +
    `(A) explicit user intent — PRD+ADR with no epic/stories => system-level; epic+stories with no PRD/ADR => epic-level; both present => prefer system-level first. ` +
    `(B) file-based — if {implementation_artifacts}/sprint-status.yaml exists => epic-level, otherwise system-level. ` +
    `(C) still unclear => mark mode "ambiguous" and needsUserDecision true (do NOT guess).\n` +
    `Then run the mode-specific prerequisite check: system-level requires PRD (FR+NFR) + ADR/architecture decisions + architecture/tech-spec; ` +
    `epic-level requires epic/story requirements with acceptance criteria (+ architecture context if available). ` +
    `If required inputs are missing, set prerequisitesMet false and list them in missingInputs (HALT condition — do not fabricate inputs). ` +
    `State which mode you will use and why.`,
  { label: 'detect-mode', phase: 'DETECT-MODE', schema: DETECT_SCHEMA }
)

// HALT conditions are surfaced to the orchestrating skill, not decided here.
const blocked = !detect.prerequisitesMet || detect.mode === 'ambiguous'
if (blocked) {
  log('detect-mode requires a human decision or missing inputs; halting before context load')
  return {
    workflow: 'testarch-test-design',
    summary: detect.mode === 'ambiguous'
      ? 'mode ambiguous — user must choose system-level (A) or epic-level (B)'
      : `prerequisites missing for ${detect.mode} mode`,
    mode: detect.mode,
    designLevel,
    steps: 1,
    halted: true,
    needsHumanGate: true,
    needsUserDecision: detect.mode === 'ambiguous',
    missingInputs: detect.missingInputs || [],
    detect,
  }
}

const mode = detect.mode
log(`mode resolved: ${mode} (${detect.rationale || 'no rationale'})`)

// ---- STEP 2 : Load Context & Knowledge Base (steps-c/step-02-load-context) --
phase('LOAD-CONTEXT')
const LOAD_SCHEMA = {
  type: 'object',
  required: ['loaded'],
  properties: {
    loaded: { type: 'array', items: { type: 'string' }, description: 'artifacts + knowledge fragments actually loaded' },
    teaUsePlaywrightUtils: { type: 'boolean', description: 'value of tea_use_playwright_utils from config' },
    techStack: { type: 'array', items: { type: 'string' } },
    integrationPoints: { type: 'array', items: { type: 'string' } },
    nfrs: { type: 'array', items: { type: 'string' }, description: 'performance/security/reliability/compliance NFRs (system-level)' },
    existingCoverageGaps: { type: 'array', items: { type: 'string' }, description: 'gaps + flaky areas found by scanning tests/ spec e2e api (epic-level)' },
    missing: { type: 'array', items: { type: 'string' }, description: 'inputs the user still needs to provide' },
  },
}
const context = await agent(
  `Master Test Architect, step 2 of testarch-test-design (mode: ${mode}). ` +
    `Read the COMPLETE source step ${SOURCE}/steps-c/step-02-load-context.md.\n` +
    `1. Load config from _byan/tea/config.yaml: read tea_use_playwright_utils, note output_folder.\n` +
    `2. Load mode-specific artifacts. system-level: PRD (FR+NFR), ADRs/architecture decisions, architecture/tech-spec, epics for scope; ` +
    `extract tech stack & dependencies, integration points, NFRs (perf/security/reliability/compliance). ` +
    `epic-level: epic + story docs with acceptance criteria, PRD if available, architecture/tech-spec if available, prior system-level test-design outputs if available; ` +
    `extract testable requirements, integration points, known coverage gaps.\n` +
    `3. epic-level only: scan the repo for existing tests (tests/, spec, e2e, api folders), identify coverage gaps and flaky areas, note existing fixture/test patterns.\n` +
    `4. Load ONLY the relevant TEA knowledge fragments via {project-root}/_byan/connaissance/testarch/tea-index.csv. ` +
    `system-level required: adr-quality-readiness-checklist.md, test-levels-framework.md, risk-governance.md, test-quality.md. ` +
    `epic-level required: risk-governance.md, probability-impact.md, test-levels-framework.md, test-priorities-matrix.md.\n` +
    `5. Summarize what was loaded; flag anything missing in "missing" (do not invent content).`,
  { label: 'load-context', phase: 'LOAD-CONTEXT', schema: LOAD_SCHEMA }
)
log(`loaded ${context.loaded.length} artifacts/fragments`)

// ---- STEP 3 : Testability & Risk Assessment (steps-c/step-03-...) ----------
phase('RISK-AND-TESTABILITY')
const RISK_SCHEMA = {
  type: 'object',
  required: ['risks'],
  properties: {
    testabilityConcerns: { type: 'array', items: { type: 'string' }, description: 'system-level: actionable controllability/observability/reliability concerns' },
    testabilityStrengths: { type: 'array', items: { type: 'string' }, description: 'system-level: what is already strong' },
    asrs: {
      type: 'array',
      description: 'Architecturally Significant Requirements (system-level), each ACTIONABLE or FYI',
      items: {
        type: 'object',
        required: ['requirement', 'classification'],
        properties: {
          requirement: { type: 'string' },
          classification: { type: 'string', enum: ['ACTIONABLE', 'FYI'] },
        },
      },
    },
    risks: {
      type: 'array',
      description: 'risk matrix — genuine risks, not features',
      items: {
        type: 'object',
        required: ['id', 'category', 'probability', 'impact', 'score'],
        properties: {
          id: { type: 'string', description: 'unique id R-001, R-002, ...' },
          category: { type: 'string', enum: ['TECH', 'SEC', 'PERF', 'DATA', 'BUS', 'OPS'] },
          description: { type: 'string' },
          probability: { type: 'integer', minimum: 1, maximum: 3 },
          impact: { type: 'integer', minimum: 1, maximum: 3 },
          score: { type: 'integer', minimum: 1, maximum: 9, description: 'probability * impact' },
          mitigation: { type: 'string' },
          owner: { type: 'string' },
          timeline: { type: 'string' },
        },
      },
    },
    highRisks: { type: 'array', items: { type: 'string' }, description: 'ids of risks with score >= 6' },
  },
}
const risk = await agent(
  `Master Test Architect, step 3 of testarch-test-design (mode: ${mode}). ` +
    `Read the COMPLETE source step ${SOURCE}/steps-c/step-03-risk-and-testability.md. Base every conclusion on evidence from the loaded artifacts.\n` +
    `1. system-level ONLY: evaluate architecture for Controllability (state seeding, mockability, fault injection), Observability (logs, metrics, traces, deterministic assertions), Reliability (isolation, reproducibility, parallel safety). ` +
    `Structure: actionable Testability Concerns FIRST, then a Testability Assessment Summary of strengths. ` +
    `Identify ASRs and mark each ACTIONABLE or FYI.\n` +
    `2. ALL modes: risk assessment using risk-governance.md + probability-impact.md. Identify GENUINE risks (not features). ` +
    `Classify by category TECH/SEC/PERF/DATA/BUS/OPS. Score Probability (1-3) and Impact (1-3). Compute Risk Score = P*I. ` +
    `Flag high risks (score >= 6). Define mitigation, owner, timeline for high risks.\n` +
    `3. Summarize the highest risks and their mitigation priorities.`,
  { label: 'risk-and-testability', phase: 'RISK-AND-TESTABILITY', schema: RISK_SCHEMA }
)
log(`${risk.risks.length} risks; ${(risk.highRisks || []).length} high (>=6)`)

// ---- STEP 4 : Coverage Plan & Execution Strategy (steps-c/step-04-...) ------
phase('COVERAGE-PLAN')
const COVERAGE_SCHEMA = {
  type: 'object',
  required: ['scenarios', 'qualityGates'],
  properties: {
    scenarios: {
      type: 'array',
      description: 'coverage matrix — atomic scenarios, one test level each, no duplicate coverage',
      items: {
        type: 'object',
        required: ['testId', 'testLevel', 'priority'],
        properties: {
          testId: { type: 'string' },
          requirement: { type: 'string' },
          testLevel: { type: 'string', enum: ['E2E', 'API', 'Component', 'Unit'] },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          riskLink: { type: 'string', description: 'risk id this scenario covers' },
          notes: { type: 'string' },
        },
      },
    },
    executionStrategy: {
      type: 'object',
      description: 'simple PR / Nightly / Weekly model — no smoke/P0/P1/P2 tier structure, no re-listing tests',
      properties: {
        pr: { type: 'string' },
        nightly: { type: 'string' },
        weekly: { type: 'string' },
      },
    },
    resourceEstimates: {
      type: 'object',
      description: 'interval ranges only, no false precision',
      properties: {
        p0: { type: 'string' },
        p1: { type: 'string' },
        p2: { type: 'string' },
        p3: { type: 'string' },
        total: { type: 'string' },
        timeline: { type: 'string' },
      },
    },
    qualityGates: {
      type: 'object',
      required: ['p0PassRate'],
      properties: {
        p0PassRate: { type: 'string', description: '100%' },
        p1PassRate: { type: 'string', description: '>= 95%' },
        highRiskMitigation: { type: 'string', description: 'complete before release' },
        coverageTarget: { type: 'string', description: '>= 80% unless justified' },
      },
    },
  },
}
const coverage = await agent(
  `Master Test Architect, step 4 of testarch-test-design (mode: ${mode}, design level: ${designLevel}). ` +
    `Read the COMPLETE source step ${SOURCE}/steps-c/step-04-coverage-plan.md. Avoid redundant coverage across test levels.\n` +
    `1. Coverage matrix: for each requirement or risk-driven scenario, decompose into atomic scenarios; select ONE test level (E2E/API/Component/Unit) via test-levels-framework.md; no duplicate coverage; assign priority P0-P3 via test-priorities-matrix.md. ` +
    `Priority rules: P0 = blocks core functionality + high risk + no workaround; P1 = critical paths + medium/high risk; P2 = secondary flows + low/medium risk; P3 = nice-to-have/exploratory/benchmarks. Link scenarios to risk ids from step 3.\n` +
    `2. Execution strategy = simple PR / Nightly / Weekly. PR = all functional tests if <15 min; Nightly/Weekly = long-running/expensive (perf, chaos, large datasets). Do NOT re-list all tests; do NOT build a smoke/P0/P1/P2 tier structure.\n` +
    `3. Resource estimates as INTERVAL RANGES only (e.g. P0 ~25-40h) — no false precision; total + timeline as ranges.\n` +
    `4. Quality gates: P0 pass rate = 100%, P1 pass rate >= 95%, high-risk mitigations complete before release, coverage target >= 80% (adjust only if justified).`,
  { label: 'coverage-plan', phase: 'COVERAGE-PLAN', schema: COVERAGE_SCHEMA }
)
log(`${coverage.scenarios.length} scenarios planned`)

// ---- STEP 5 : Generate Outputs & Validate (steps-c/step-05-...) ------------
phase('GENERATE-OUTPUT')
const GENERATE_SCHEMA = {
  type: 'object',
  required: ['outputs', 'checklistPass'],
  properties: {
    outputs: { type: 'array', items: { type: 'string' }, description: 'output file path(s) written' },
    templateUsed: { type: 'array', items: { type: 'string' }, description: 'template file(s) used' },
    checklistPass: { type: 'boolean', description: 'true only if all checklist.md criteria are satisfied' },
    checklistFailures: { type: 'array', items: { type: 'string' }, description: 'checklist items not satisfied (fix before completion)' },
    openAssumptions: { type: 'array', items: { type: 'string' } },
    needsEpicNum: { type: 'boolean', description: 'epic-level only: true if epic_num was unclear and must be asked' },
  },
}
const generate = await agent(
  `Master Test Architect, step 5 of testarch-test-design (mode: ${mode}). ` +
    `Read the COMPLETE source step ${SOURCE}/steps-c/step-05-generate-output.md and the checklist ${SOURCE}/checklist.md.\n` +
    `1. Select template(s) by mode. system-level (Phase 3) => TWO documents: {output_folder}/test-design-architecture.md from test-design-architecture-template.md, and {output_folder}/test-design-qa.md from test-design-qa-template.md. ` +
    `epic-level (Phase 4) => ONE document: {output_folder}/test-design-epic-${epicNum || '{epic_num}'}.md from test-design-template.md` +
    `${mode === 'epic-level' && !epicNum ? ' — epic_num is NOT provided, set needsEpicNum true and do NOT invent it' : ''}.\n` +
    `2. Populate the template(s) using the step-3 risk matrix and step-4 coverage plan: risk assessment matrix, coverage matrix + priorities, execution strategy, resource estimates (ranges), quality-gate criteria, and any mode-specific sections the template requires. ` +
    `tea_use_playwright_utils=${context.teaUsePlaywrightUtils === undefined ? 'unknown' : context.teaUsePlaywrightUtils} (drive the QA-doc code-example imports accordingly).\n` +
    `3. Validate the output(s) against checklist.md item-by-item. If any criterion is unmet, FIX it before reporting; list any residual failures in checklistFailures and set checklistPass false.\n` +
    `4. Completion report: mode used, output file path(s), key risks + gate thresholds, open assumptions.`,
  { label: 'generate-output', phase: 'GENERATE-OUTPUT', schema: GENERATE_SCHEMA }
)
log(`outputs: ${(generate.outputs || []).join(', ') || 'none'} | checklist ${generate.checklistPass ? 'PASS' : 'FAIL'}`)

// Single top-level return — DATA only. The team-review gate (checklist
// Post-Workflow Actions) is the human decision and stays with the skill.
return {
  workflow: 'testarch-test-design',
  summary: `test design (${mode}) — ${coverage.scenarios.length} scenarios, ${risk.risks.length} risks, checklist ${generate.checklistPass ? 'PASS' : 'FAIL'}`,
  mode,
  designLevel,
  epicNum,
  date,
  steps: 5,
  halted: false,
  needsHumanGate: true,
  checklistPass: generate.checklistPass,
  outputs: generate.outputs || [],
  highRisks: risk.highRisks || [],
  needsEpicNum: !!generate.needsEpicNum,
  checklistFailures: generate.checklistFailures || [],
  result: { detect, context, risk, coverage, generate },
}
