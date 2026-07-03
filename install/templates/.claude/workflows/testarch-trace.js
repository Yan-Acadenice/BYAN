export const meta = {
  name: 'testarch-trace',
  description: 'Generate a requirements-to-tests traceability matrix, analyze coverage gaps, and apply deterministic quality-gate logic (PASS/CONCERNS/FAIL/WAIVED). Mirrors the BYAN testarch-trace Create-mode steps; returns a verdict for the human gate.',
  phases: [
    { title: 'LOAD_CONTEXT' },
    { title: 'DISCOVER_TESTS' },
    { title: 'MAP_CRITERIA' },
    { title: 'ANALYZE_GAPS' },
    { title: 'GATE_DECISION', model: 'sonnet' }
  ]
}

// FD/STRICT CONTRACT (re-asserted): this script returns data only. It never
// imports lib/fd-state.js, never writes fd-state.json, and records no platform
// state. The orchestrating skill presents the gate verdict at the human gate
// and records FD/strict state via MCP. The byan-lint-workflows linter forbids
// fd-state coupling, and the sandbox forbids import/require/fs/clock/RNG.
// Any timestamp or run id must arrive through `args` (no wall-clock / RNG).

const source = '/home/yan/BYAN/_byan/workflow/simple/testarch/trace'
const testDir = (args && args.testDir) || '{project-root}/tests'
const sourceDir = (args && args.sourceDir) || '{project-root}'
const story = (args && args.story) || '{project-root} story / inline acceptance criteria'
const coverageLevels = (args && args.coverageLevels) || 'e2e,api,component,unit'
const gateType = (args && args.gateType) || 'story'
const decisionMode = (args && args.decisionMode) || 'deterministic'
const runId = (args && args.runId) || 'trace-run'

// Step 1 (steps-c/step-01-load-context.md): gather acceptance criteria,
// priorities, knowledge base and supporting artifacts. HALT if AC missing.
phase('LOAD_CONTEXT')
const context = await agent(
  [
    'You are the Master Test Architect running Step 1 of the testarch-trace workflow.',
    'Read the real source step at ' + source + '/steps-c/step-01-load-context.md and follow it.',
    'Goal: gather acceptance criteria (AC), their priorities (P0/P1/P2/P3), and supporting artifacts for traceability.',
    'Story / AC input: ' + story + '.',
    'Prerequisite: acceptance criteria MUST be available. If AC are missing, do NOT invent them: set acGate to "HALT".',
    'Load the tea knowledge base index ({project-root}/_byan/connaissance/testarch/tea-index.csv): test-priorities-matrix, risk-governance, probability-impact, test-quality, selective-testing.',
    'Load artifacts if present: story file + AC, test design doc (priorities), tech spec / PRD. Summarize what was found.'
  ].join(' '),
  {
    label: 'load-context',
    phase: 'LOAD_CONTEXT',
    schema: {
      type: 'object',
      required: ['acGate', 'criteria'],
      properties: {
        acGate: { type: 'string', enum: ['OK', 'HALT'] },
        haltReason: { type: 'string' },
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'priority'],
            properties: {
              id: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }
            }
          }
        },
        artifactsSummary: { type: 'string' }
      }
    }
  }
)

if (context.acGate === 'HALT') {
  // Mirror the source HALT: AC are a hard prerequisite. Return early; the
  // human gate decides how to supply criteria. No state is written here.
  return {
    workflow: 'testarch-trace',
    runId,
    summary: 'Halted at Step 1: acceptance criteria are required and were not provided.',
    steps: 5,
    completedSteps: 1,
    halted: true,
    haltReason: context.haltReason || 'Acceptance criteria missing.',
    needsHumanGate: true,
    result: context
  }
}

// Step 2 (steps-c/step-02-discover-tests.md): discover tests under test_dir and
// classify by level (E2E / API / Component / Unit), recording test IDs.
phase('DISCOVER_TESTS')
const tests = await agent(
  [
    'Step 2 of testarch-trace. Read ' + source + '/steps-c/step-02-discover-tests.md and follow it.',
    'Search the test directory (' + testDir + ', source: ' + sourceDir + ') for tests relevant to the acceptance criteria from Step 1.',
    'Match by: explicit test IDs (e.g. 1.3-E2E-001), feature-name matches, and spec patterns (*.spec.*, *.test.*).',
    'Categorize each discovered test by level among: ' + coverageLevels + ' (E2E, API, Component, Unit).',
    'Record test IDs, describe blocks, file:line, and any priority markers present.'
  ].join(' '),
  {
    label: 'discover-tests',
    phase: 'DISCOVER_TESTS',
    schema: {
      type: 'object',
      required: ['tests', 'levelCounts'],
      properties: {
        tests: {
          type: 'array',
          items: {
            type: 'object',
            required: ['testId', 'level'],
            properties: {
              testId: { type: 'string' },
              level: { type: 'string', enum: ['E2E', 'API', 'Component', 'Unit'] },
              location: { type: 'string' },
              describeBlock: { type: 'string' }
            }
          }
        },
        levelCounts: {
          type: 'object',
          properties: {
            E2E: { type: 'integer' },
            API: { type: 'integer' },
            Component: { type: 'integer' },
            Unit: { type: 'integer' }
          }
        }
      }
    }
  }
)

// Step 3 (steps-c/step-03-map-criteria.md): build the traceability matrix
// linking each AC to tests with a coverage status; validate P0/P1 coverage and
// flag unjustified duplicate coverage across levels.
phase('MAP_CRITERIA')
const matrix = await agent(
  [
    'Step 3 of testarch-trace. Read ' + source + '/steps-c/step-03-map-criteria.md and follow it.',
    'For EACH acceptance criterion from Step 1, map it to matching tests from Step 2.',
    'Coverage status of each criterion is one of: FULL, PARTIAL, NONE, UNIT-ONLY, INTEGRATION-ONLY.',
    'Record the criterion priority and the levels of the mapped tests.',
    'Validate coverage logic: P0/P1 criteria MUST have coverage; flag duplicate coverage across levels that has no defense-in-depth justification.'
  ].join(' '),
  {
    label: 'map-criteria',
    phase: 'MAP_CRITERIA',
    schema: {
      type: 'object',
      required: ['traceabilityMatrix'],
      properties: {
        traceabilityMatrix: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'priority', 'coverage'],
            properties: {
              id: { type: 'string' },
              priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
              coverage: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE', 'UNIT-ONLY', 'INTEGRATION-ONLY'] },
              tests: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        coverageLogicIssues: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)

// Step 4 (steps-c/step-04-analyze-gaps.md): Phase 1 final step. Gap analysis by
// risk priority, recommendations, coverage statistics (overall + per-priority),
// and the complete coverage matrix. NO gate decision here (that is Step 5).
phase('ANALYZE_GAPS')
const coverage = await agent(
  [
    'Step 4 of testarch-trace (Phase 1 final). Read ' + source + '/steps-c/step-04-analyze-gaps.md and follow it.',
    'From the traceability matrix from Step 3, compute the gap analysis and coverage statistics. Do NOT make a gate decision here.',
    'Gaps: uncovered (coverage=NONE) split into critical=P0, high=P1, medium=P2, low=P3; plus partial-coverage and unit-only items.',
    'Recommendations: URGENT atdd for P0 gaps, HIGH automate for P1 gaps, MEDIUM complete partial coverage, LOW test-review for quality.',
    'Statistics: overall coverage percentage = round(fullyCovered / totalRequirements * 100); plus per-priority breakdown (P0/P1/P2/P3 total, covered=FULL, percentage). P0 percentage = round(p0Covered / p0Total * 100).',
    'Produce the complete Phase 1 coverage matrix object (requirements + coverage_statistics + gap_analysis + recommendations).'
  ].join(' '),
  {
    label: 'analyze-gaps',
    phase: 'ANALYZE_GAPS',
    schema: {
      type: 'object',
      required: ['phase', 'coverageStatistics', 'gapAnalysis', 'recommendations'],
      properties: {
        phase: { type: 'string', enum: ['PHASE_1_COMPLETE'] },
        coverageStatistics: {
          type: 'object',
          required: ['totalRequirements', 'fullyCovered', 'overallCoveragePercentage', 'p0Percentage'],
          properties: {
            totalRequirements: { type: 'integer' },
            fullyCovered: { type: 'integer' },
            partiallyCovered: { type: 'integer' },
            uncovered: { type: 'integer' },
            overallCoveragePercentage: { type: 'integer' },
            p0Total: { type: 'integer' },
            p0Covered: { type: 'integer' },
            p0Percentage: { type: 'integer' }
          }
        },
        gapAnalysis: {
          type: 'object',
          properties: {
            criticalGaps: { type: 'array', items: { type: 'string' } },
            highGaps: { type: 'array', items: { type: 'string' } },
            mediumGaps: { type: 'array', items: { type: 'string' } },
            lowGaps: { type: 'array', items: { type: 'string' } }
          }
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['priority', 'action'],
            properties: {
              priority: { type: 'string', enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] },
              action: { type: 'string' },
              requirements: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  }
)

// Phase 1 gate from the source: Step 5 must not run unless Phase 1 is complete.
if (coverage.phase !== 'PHASE_1_COMPLETE') {
  return {
    workflow: 'testarch-trace',
    runId,
    summary: 'Phase 1 (coverage matrix) did not complete; gate decision cannot proceed.',
    steps: 5,
    completedSteps: 4,
    halted: true,
    haltReason: 'Phase 1 not complete - cannot proceed to gate decision.',
    needsHumanGate: true,
    result: { context, tests, matrix, coverage }
  }
}

// Step 5 (steps-c/step-05-gate-decision.md): Phase 2. Apply the DETERMINISTIC
// gate decision tree from the source over the Phase 1 statistics. The
// rule-based verdict is computed; the human accept/waive decision stays OUT of
// this script (returned for the gate). decisionMode=manual is surfaced too.
phase('GATE_DECISION')
const gate = await agent(
  [
    'Step 5 of testarch-trace (Phase 2 gate). Read ' + source + '/steps-c/step-05-gate-decision.md and follow its deterministic decision tree.',
    'Inputs from Phase 1: p0Coverage = coverage_statistics.p0Percentage, overallCoverage = coverage_statistics.overallCoveragePercentage, criticalGaps = count of P0 uncovered.',
    'Apply EXACTLY these rules in order:',
    '(1) if p0Coverage < 100 -> FAIL (P0 coverage below required 100%, critical requirements uncovered).',
    '(2) else if overallCoverage >= 90 -> PASS (P0 at 100% and overall meets the 90% target).',
    '(3) else if overallCoverage >= 75 -> CONCERNS (P0 at 100% but overall below 90% target).',
    '(4) else -> FAIL (overall below the 75% minimum, significant gaps).',
    'Gate type: ' + gateType + '. Decision mode: ' + decisionMode + '.',
    'WAIVED is a manual stakeholder waiver only and is NOT decided here: leave waiverApplicable as a flag for the human gate. Do not self-apply a waiver.',
    'Return the deterministic decision, the rationale string, and the gate criteria (p0 met?, overall status MET/PARTIAL/NOT MET).'
  ].join(' '),
  {
    label: 'mech-gate-decision',
    phase: 'GATE_DECISION',
    model: 'sonnet',
    schema: {
      type: 'object',
      required: ['decision', 'rationale', 'gateCriteria'],
      properties: {
        decision: { type: 'string', enum: ['PASS', 'CONCERNS', 'FAIL'] },
        rationale: { type: 'string' },
        gateCriteria: {
          type: 'object',
          required: ['p0Status', 'overallStatus'],
          properties: {
            p0CoverageRequired: { type: 'string' },
            p0CoverageActual: { type: 'string' },
            p0Status: { type: 'string', enum: ['MET', 'NOT MET'] },
            overallCoverageTarget: { type: 'string' },
            overallCoverageActual: { type: 'string' },
            overallStatus: { type: 'string', enum: ['MET', 'PARTIAL', 'NOT MET'] }
          }
        },
        waiverApplicable: { type: 'boolean' },
        uncoveredRequirements: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)

// Single top-level return. The deterministic verdict travels to the human gate;
// the human (with gate_type=' + gateType + ') may PASS-through, demand fixes, or
// apply a WAIVED override. None of that is decided in-script.
return {
  workflow: 'testarch-trace',
  runId,
  gateType,
  decisionMode,
  summary:
    'Traceability matrix built and quality gate evaluated deterministically: ' +
    gate.decision +
    '. ' +
    gate.rationale,
  steps: 5,
  completedSteps: 5,
  halted: false,
  decision: gate.decision,
  waiverApplicable: gate.waiverApplicable === true,
  needsHumanGate: true,
  result: {
    context,
    tests,
    matrix,
    coverage,
    gate
  }
}
