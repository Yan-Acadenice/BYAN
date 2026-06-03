export const meta = {
  name: 'testarch-test-review',
  description: 'Autonomous TEA test-quality review: load knowledge, discover tests, fan out 5 parallel quality-dimension checks, aggregate a weighted 0-100 score, and produce a report. Returns a verdict for the human gate.',
  phases: [
    { title: 'LOAD-CONTEXT' },
    { title: 'DISCOVER-TESTS' },
    { title: 'QUALITY-EVALUATION' },
    { title: 'AGGREGATE-SCORES' },
    { title: 'GENERATE-REPORT' }
  ]
}

// FD/STRICT CONTRACT (re-asserted): this script returns data only. It never
// imports lib/fd-state.js, never writes fd-state.json, and uses no wall-clock
// or randomness primitive (those break resume in the Workflow sandbox). Any
// timestamp/id is passed in via args. The orchestrating skill records FD /
// strict state via MCP at the human gate that lives OUTSIDE this script.
// The byan-lint-workflows linter forbids fd-state coupling here.

// --- Inputs (mirror workflow.yaml variables; all passed via args, no defaults that touch the clock) ---
const testDir = (args && args.test_dir) || './tests'
const reviewScope = (args && args.review_scope) || 'suite' // single | directory | suite
const targetPath = (args && args.target_path) || testDir   // for scope=single/directory
const usePlaywrightUtils = !!(args && args.tea_use_playwright_utils)
const timestamp = (args && args.timestamp) || 'run' // passed in by orchestrator; never generated here
const outputFile = (args && args.output_file) || `_byan-output/test-review-${timestamp}.md`
const knowledgeIndex = (args && args.knowledge_index) || '_byan/connaissance/testarch/tea-index.csv'

// Step 1: Load Context & Knowledge Base (steps-c/step-01-load-context.md)
phase('LOAD-CONTEXT')
const context = await agent(
  `You are the Master Test Architect running step 01 (load-context) of the testarch-test-review workflow.
Read the real source step: _byan/workflow/simple/testarch/test-review/steps-c/step-01-load-context.md.
Do exactly what it says:
1. Determine review scope = "${reviewScope}" (single = one file, directory = one folder, suite = whole repo). Target path: ${targetPath}.
2. Load the TEA knowledge base. Read the index at ${knowledgeIndex} and check tea_use_playwright_utils (=${usePlaywrightUtils}) to pick the fragment set.
   Core fragments: test-quality.md, data-factories.md, test-levels-framework.md, selective-testing.md, test-healing-patterns.md, selector-resilience.md, timing-debugging.md.
   ${usePlaywrightUtils
      ? 'Playwright Utils ENABLED -> also load: overview.md, api-request.md, network-recorder.md, auth-session.md, intercept-network-call.md, recurse.md, log.md, file-utils.md, burn-in.md, network-error-monitor.md, fixtures-composition.md.'
      : 'Playwright Utils DISABLED -> also load: fixture-architecture.md, network-first.md, playwright-config.md, component-tdd.md, ci-burn-in.md.'}
3. Gather context artifacts if present: story file (acceptance criteria), test-design doc (priorities), framework config.
Summarize what was found.`,
  {
    label: 'load-context',
    phase: 'LOAD-CONTEXT',
    schema: {
      type: 'object',
      required: ['scope', 'knowledgeFragmentsLoaded'],
      properties: {
        scope: { type: 'string', enum: ['single', 'directory', 'suite'] },
        knowledgeFragmentsLoaded: { type: 'array', items: { type: 'string' } },
        playwrightUtils: { type: 'boolean' },
        storyFile: { type: 'string' },
        testDesignFile: { type: 'string' },
        frameworkConfig: { type: 'string' },
        summary: { type: 'string' }
      }
    }
  }
)
log(`scope=${context.scope} fragments=${(context.knowledgeFragmentsLoaded || []).length}`)

// Step 2: Discover & Parse Tests (steps-c/step-02-discover-tests.md)
phase('DISCOVER-TESTS')
const discovery = await agent(
  `Run step 02 (discover-tests) of testarch-test-review.
Read the real source step: _byan/workflow/simple/testarch/test-review/steps-c/step-02-discover-tests.md.
1. Discover test files for scope "${context.scope}":
   - single: use the provided file path (${targetPath})
   - directory: glob test files under the selected folder (${targetPath})
   - suite: glob all tests in the repo (root: ${testDir})
   HALT (set halted=true, testFileCount=0) if no test files are found.
2. Per file, parse metadata: file size & line count, detected framework, describe/test block counts,
   test IDs and priority markers (P0/P1/P2/P3), imports/fixtures/factories/network interception,
   waits/timeouts and control flow (if/try/catch).`,
  {
    label: 'discover-tests',
    phase: 'DISCOVER-TESTS',
    schema: {
      type: 'object',
      required: ['halted', 'testFileCount'],
      properties: {
        halted: { type: 'boolean' },
        testFileCount: { type: 'integer' },
        framework: { type: 'string' },
        testFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              lineCount: { type: 'integer' },
              describeBlocks: { type: 'integer' },
              testBlocks: { type: 'integer' },
              testIds: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        summary: { type: 'string' }
      }
    }
  }
)
log(`discovered ${discovery.testFileCount} test file(s), halted=${discovery.halted}`)

// If discovery halted (no tests), short-circuit with a verdict — the human gate decides next move.
if (discovery.halted || discovery.testFileCount === 0) {
  return {
    workflow: 'testarch-test-review',
    summary: 'No tests found in scope — review halted at discovery (mirrors step-02 HALT condition).',
    steps: 2,
    halted: true,
    scope: context.scope,
    needsHumanGate: true,
    result: { reason: 'no-tests-found', testFileCount: 0 }
  }
}

// Step 3: Orchestrate 5 Parallel Quality-Dimension Subprocesses (steps-c/step-03 + 03a-03e)
// True fan-out in the source ("Launch FIVE subprocesses in PARALLEL") -> parallel() of 5 thunks.
// Each subprocess is read-only, checks ONE dimension, and returns a 0-100 score with severity-weighted
// violations (HIGH 10 / MEDIUM 5 / LOW 2), except coverage which uses its own gap-based penalty.
phase('QUALITY-EVALUATION')

const dimensionSchema = {
  type: 'object',
  required: ['dimension', 'score', 'violations'],
  properties: {
    dimension: { type: 'string' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    grade: { type: 'string' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          category: { type: 'string' },
          description: { type: 'string' },
          suggestion: { type: 'string' }
        }
      }
    },
    violationSummary: {
      type: 'object',
      properties: {
        HIGH: { type: 'integer' },
        MEDIUM: { type: 'integer' },
        LOW: { type: 'integer' }
      }
    },
    recommendations: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }
  }
}

const filesForPrompt = JSON.stringify(discovery.testFiles || [])

const [determinism, isolation, maintainability, coverage, performance] = await parallel([
  // 3A — Determinism (steps-c/step-03a-subprocess-determinism.md)
  () => agent(
    `Subprocess 3A (DETERMINISM only). Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03a-subprocess-determinism.md.
Read-only analysis of these test files: ${filesForPrompt}.
Flag non-determinism: HIGH = RNG calls, wall-clock reads/a wall-clock read unmocked, setTimeout/setInterval without waits, unmocked external API calls, random-path FS ops, non-deterministic DB ordering;
MEDIUM = waitForTimeout hard waits, flaky selectors, race conditions, test-order dependencies; LOW = shared state, unfixed timezone.
Score = max(0, 100 - penalty) with HIGH=10, MEDIUM=5, LOW=2. Check determinism ONLY.`,
    { label: 'subprocess-determinism', phase: 'QUALITY-EVALUATION', schema: dimensionSchema }
  ),
  // 3B — Isolation (steps-c/step-03b-subprocess-isolation.md)
  () => agent(
    `Subprocess 3B (ISOLATION only). Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03b-subprocess-isolation.md.
Read-only analysis of these test files: ${filesForPrompt}.
Flag isolation issues: HIGH = global state mutations, test-order dependencies, shared DB records without cleanup, beforeAll/afterAll side effects leaking;
MEDIUM = missing cleanup, state-mutating shared fixtures, assumed execution order, env vars modified without restore; LOW = shared (non-mutated) data, missing describe grouping.
Score = max(0, 100 - penalty) with HIGH=10, MEDIUM=5, LOW=2. Check isolation ONLY.`,
    { label: 'subprocess-isolation', phase: 'QUALITY-EVALUATION', schema: dimensionSchema }
  ),
  // 3C — Maintainability (steps-c/step-03c-subprocess-maintainability.md)
  () => agent(
    `Subprocess 3C (MAINTAINABILITY only). Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03c-subprocess-maintainability.md.
Read-only analysis of these test files: ${filesForPrompt}.
Flag maintainability issues: HIGH = tests >100 lines, no describe grouping, duplicate/copy-paste logic, unclear names (no Given/When/Then), magic numbers/strings;
MEDIUM = missing comments on complex logic, inconsistent naming, nesting >3 levels, large setup/teardown; LOW = minor style, helper-extraction opportunities, inconsistent assertion styles.
Score = max(0, 100 - penalty) with HIGH=10, MEDIUM=5, LOW=2. Check maintainability ONLY.`,
    { label: 'subprocess-maintainability', phase: 'QUALITY-EVALUATION', schema: dimensionSchema }
  ),
  // 3D — Coverage (steps-c/step-03d-subprocess-coverage.md) — distinct gap-based scoring
  () => agent(
    `Subprocess 3D (COVERAGE only). Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03d-subprocess-coverage.md.
Read-only analysis of these test files: ${filesForPrompt}.
Flag coverage gaps: HIGH = critical/P0 paths untested, API endpoints without tests, error handling untested, missing auth/authz tests;
MEDIUM = uncovered edge cases (boundaries, null/empty), only happy path, missing integration layer, weak assertion coverage; LOW = additional cases, minor edges, incomplete docs.
Scoring is DISTINCT here: if any HIGH gap exists, score = max(0, 50 - highCount*10); else score = max(0, 100 - totalViolations*5). Check coverage ONLY.`,
    { label: 'subprocess-coverage', phase: 'QUALITY-EVALUATION', schema: dimensionSchema }
  ),
  // 3E — Performance (steps-c/step-03e-subprocess-performance.md)
  () => agent(
    `Subprocess 3E (PERFORMANCE only). Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03e-subprocess-performance.md.
Read-only analysis of these test files: ${filesForPrompt}.
Flag performance issues: HIGH = unnecessary test.describe.serial (not parallelizable), slow setup/teardown (fresh DB per test), excessive navigation, no fixture reuse;
MEDIUM = hard waits >2s, inefficient selectors (page.$$ vs locators), large datasets without pagination, missing optimizations; LOW = unused parallelization, minor inefficiencies, excessive logging.
Score = max(0, 100 - penalty) with HIGH=10, MEDIUM=5, LOW=2. Check performance ONLY.`,
    { label: 'subprocess-performance', phase: 'QUALITY-EVALUATION', schema: dimensionSchema }
  )
])
log(`dimensions: det=${determinism.score} iso=${isolation.score} maint=${maintainability.score} cov=${coverage.score} perf=${performance.score}`)

// Step 3F: Aggregate Scores (steps-c/step-03f-aggregate-scores.md)
// Weighted overall score with the source's exact weights; grade thresholds A>=90 B>=80 C>=70 D>=60 else F.
phase('AGGREGATE-SCORES')
const aggregate = await agent(
  `Run step 03F (aggregate-scores) of testarch-test-review.
Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-03f-aggregate-scores.md.
You are given the 5 quality-dimension results (each already a 0-100 score with violations):
determinism=${JSON.stringify(determinism)}
isolation=${JSON.stringify(isolation)}
maintainability=${JSON.stringify(maintainability)}
coverage=${JSON.stringify(coverage)}
performance=${JSON.stringify(performance)}

Do NOT re-evaluate quality — only aggregate.
1. Weighted overall score = round( det*0.25 + iso*0.25 + maint*0.20 + cov*0.15 + perf*0.15 ).
2. Grade: >=90 A, >=80 B, >=70 C, >=60 D, else F.
3. Aggregate all violations across dimensions; count by severity (HIGH/MEDIUM/LOW) plus total.
4. Prioritize recommendations (impact HIGH if a dimension score <70), keep the top 10.`,
  {
    label: 'aggregate-scores',
    phase: 'AGGREGATE-SCORES',
    schema: {
      type: 'object',
      required: ['overallScore', 'overallGrade', 'violationSummary'],
      properties: {
        overallScore: { type: 'integer', minimum: 0, maximum: 100 },
        overallGrade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
        dimensionScores: {
          type: 'object',
          properties: {
            determinism: { type: 'integer' },
            isolation: { type: 'integer' },
            maintainability: { type: 'integer' },
            coverage: { type: 'integer' },
            performance: { type: 'integer' }
          }
        },
        violationSummary: {
          type: 'object',
          required: ['total', 'HIGH', 'MEDIUM', 'LOW'],
          properties: {
            total: { type: 'integer' },
            HIGH: { type: 'integer' },
            MEDIUM: { type: 'integer' },
            LOW: { type: 'integer' }
          }
        },
        topRecommendations: { type: 'array', items: { type: 'string' } },
        qualityAssessment: { type: 'string' }
      }
    }
  }
)
log(`overall=${aggregate.overallScore}/100 grade=${aggregate.overallGrade} violations=${aggregate.violationSummary.total}`)

// Step 4: Generate Report & Validate (steps-c/step-04-generate-report.md)
phase('GENERATE-REPORT')
const report = await agent(
  `Run step 04 (generate-report) of testarch-test-review.
Read the real source: _byan/workflow/simple/testarch/test-review/steps-c/step-04-generate-report.md
and the template _byan/workflow/simple/testarch/test-review/test-review-template.md.
Using the aggregated results: ${JSON.stringify(aggregate)}
and scope=${context.scope}, write the report to ${outputFile} including:
- Score summary (overall ${aggregate.overallScore}/100, grade ${aggregate.overallGrade})
- Critical findings with concrete fixes (HIGH-severity violations)
- Warnings and recommendations (top recommendations)
- Context references (story / test-design if available)
Then validate the report against _byan/workflow/simple/testarch/test-review/checklist.md and fix any gaps.
Report the scope reviewed, overall score, critical blocker count, and the next recommended workflow (e.g. automate or trace).
Do NOT make the approve/request-changes/block decision — that is the human gate.`,
  {
    label: 'generate-report',
    phase: 'GENERATE-REPORT',
    schema: {
      type: 'object',
      required: ['reportPath', 'checklistValidated'],
      properties: {
        reportPath: { type: 'string' },
        checklistValidated: { type: 'boolean' },
        criticalBlockers: { type: 'integer' },
        nextRecommendedWorkflow: { type: 'string' },
        completionSummary: { type: 'string' }
      }
    }
  }
)
log(`report -> ${report.reportPath} checklistValidated=${report.checklistValidated}`)

// Final verdict object. The decision (Approve / Approve-with-comments / Request-changes / Block)
// stays OUT of this script — the orchestrating skill presents this at the human gate.
return {
  workflow: 'testarch-test-review',
  summary: `Test-quality review of scope "${context.scope}" across ${discovery.testFileCount} file(s): overall ${aggregate.overallScore}/100 (grade ${aggregate.overallGrade}), ${aggregate.violationSummary.total} violations (${aggregate.violationSummary.HIGH} HIGH).`,
  steps: 5,
  halted: false,
  scope: context.scope,
  testFileCount: discovery.testFileCount,
  overallScore: aggregate.overallScore,
  overallGrade: aggregate.overallGrade,
  dimensionScores: aggregate.dimensionScores,
  violationSummary: aggregate.violationSummary,
  topRecommendations: aggregate.topRecommendations,
  reportPath: report.reportPath,
  criticalBlockers: report.criticalBlockers,
  nextRecommendedWorkflow: report.nextRecommendedWorkflow,
  needsHumanGate: true,
  result: {
    dimensions: { determinism, isolation, maintainability, coverage, performance },
    aggregate,
    report
  }
}
