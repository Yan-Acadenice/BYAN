export const meta = {
  name: 'check-implementation-readiness',
  description: 'Adversarial readiness gate: validates PRD, Architecture, Epics & Stories, and UX for completeness and alignment before Phase 4 implementation. Mirrors the 6-step BYAN check-implementation-readiness pipeline and returns a structured verdict.',
  phases: [
    { title: 'DOCUMENT_DISCOVERY' },
    { title: 'PRD_ANALYSIS' },
    { title: 'EPIC_COVERAGE_VALIDATION' },
    { title: 'UX_ALIGNMENT' },
    { title: 'EPIC_QUALITY_REVIEW' },
    { title: 'FINAL_ASSESSMENT' }
  ]
}

// FD/STRICT CONTRACT (re-asserted): this script returns data only. It never
// imports lib/fd-state.js, never writes fd-state.json, and records no platform
// state. The orchestrating skill records FD/strict state via MCP at the human
// gate (duplicate resolution + the proceed-as-is / fix decision live OUTSIDE
// this script). No wall-clock, no randomness: any date/id is passed via args
// so the runtime can resume deterministically.

const planningArtifacts = (args && args.planningArtifacts) || '_byan-output/planning-artifacts'
const reportDate = (args && args.date) || 'unspecified'
const role = 'an expert Product Manager and Scrum Master specialized in requirements traceability and spotting gaps in planning artifacts. Be adversarial: your job is to find the failures others missed, not to reassure.'

// ---------------------------------------------------------------------------
// STEP 1 - Document Discovery (mirrors step-01-document-discovery.md)
// Inventory PRD / Architecture / Epics / UX (whole + sharded), flag duplicates
// and missing docs. The human resolution gate stays out of the script: we
// surface duplicates/missing as data for the orchestrating skill to gate on.
// ---------------------------------------------------------------------------
phase('DOCUMENT_DISCOVERY')
const inventory = await agent(
  `You are ${role}\n` +
  `STEP 1 - Document Discovery. Inventory all planning documents under "${planningArtifacts}".\n` +
  `For each of these four types, search BOTH whole and sharded forms:\n` +
  `- PRD: ${planningArtifacts}/*prd*.md and ${planningArtifacts}/*prd*/index.md\n` +
  `- Architecture: ${planningArtifacts}/*architecture*.md and ${planningArtifacts}/*architecture*/index.md\n` +
  `- Epics & Stories: ${planningArtifacts}/*epic*.md and ${planningArtifacts}/*epic*/index.md\n` +
  `- UX Design: ${planningArtifacts}/*ux*.md and ${planningArtifacts}/*ux*/index.md\n` +
  `Group sharded files with their folder. Flag CRITICAL duplicates (a type existing as BOTH whole.md AND a sharded folder) and WARN on missing required docs. ` +
  `Do NOT analyze contents yet - only locate and organize. Pick the version to use per type (or null if absent).`,
  {
    label: 'document-discovery',
    phase: 'DOCUMENT_DISCOVERY',
    schema: {
      type: 'object',
      required: ['documents', 'duplicates', 'missing'],
      properties: {
        documents: {
          type: 'object',
          properties: {
            prd: { type: 'array', items: { type: 'string' } },
            architecture: { type: 'array', items: { type: 'string' } },
            epics: { type: 'array', items: { type: 'string' } },
            ux: { type: 'array', items: { type: 'string' } }
          }
        },
        chosen: { type: 'object' },
        duplicates: { type: 'array', items: { type: 'string' } },
        missing: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)
log(`Discovery: ${inventory.duplicates.length} duplicate conflict(s), ${inventory.missing.length} missing doc(s)`)

// ---------------------------------------------------------------------------
// STEP 2 - PRD Analysis (mirrors step-02-prd-analysis.md)
// Read the PRD completely (whole or all sharded files) and extract EVERY FR
// and NFR verbatim with numbering. No summarizing.
// ---------------------------------------------------------------------------
phase('PRD_ANALYSIS')
const prd = await agent(
  `You are ${role}\n` +
  `STEP 2 - PRD Analysis. Read the chosen PRD completely (if sharded, read ALL files in the folder). ` +
  `Extract EVERY Functional Requirement (FR1, FR2, ...) and Non-Functional Requirement (NFR: performance, security, usability, reliability, scalability, compliance) with full text - do NOT summarize. ` +
  `Also note constraints, assumptions, integration requirements not labeled FR/NFR. Give an initial PRD completeness/clarity assessment.\n` +
  `PRD source(s): ${JSON.stringify(inventory.documents && inventory.documents.prd)}`,
  {
    label: 'prd-analysis',
    phase: 'PRD_ANALYSIS',
    schema: {
      type: 'object',
      required: ['functionalRequirements', 'nonFunctionalRequirements'],
      properties: {
        functionalRequirements: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: { id: { type: 'string' }, text: { type: 'string' } }
          }
        },
        nonFunctionalRequirements: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: { id: { type: 'string' }, category: { type: 'string' }, text: { type: 'string' } }
          }
        },
        additionalRequirements: { type: 'array', items: { type: 'string' } },
        completenessAssessment: { type: 'string' }
      }
    }
  }
)
log(`PRD: ${prd.functionalRequirements.length} FR, ${prd.nonFunctionalRequirements.length} NFR`)

// ---------------------------------------------------------------------------
// STEP 3 - Epic Coverage Validation (mirrors step-03-epic-coverage-validation.md)
// Compare every PRD FR against the epics' coverage. Build a traceability matrix.
// Every uncovered FR is a documented gap; flag epic-only FRs not in PRD too.
// ---------------------------------------------------------------------------
phase('EPIC_COVERAGE_VALIDATION')
const coverage = await agent(
  `You are ${role}\n` +
  `STEP 3 - Epic Coverage Validation. Read the epics & stories document completely. Extract its FR coverage map. ` +
  `For EACH PRD FR below, determine whether it is covered (which epic/story) or MISSING. Also flag any FR present in epics but NOT in the PRD. Build a coverage matrix and compute coverage statistics.\n` +
  `Epics source(s): ${JSON.stringify(inventory.documents && inventory.documents.epics)}\n` +
  `PRD FRs to trace: ${JSON.stringify(prd.functionalRequirements)}`,
  {
    label: 'epic-coverage',
    phase: 'EPIC_COVERAGE_VALIDATION',
    schema: {
      type: 'object',
      required: ['matrix', 'missingFRs', 'totalFRs', 'coveredFRs', 'coveragePercent'],
      properties: {
        matrix: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fr', 'status'],
            properties: {
              fr: { type: 'string' },
              epicCoverage: { type: 'string' },
              status: { type: 'string', enum: ['covered', 'missing'] }
            }
          }
        },
        missingFRs: { type: 'array', items: { type: 'string' } },
        extraEpicFRs: { type: 'array', items: { type: 'string' } },
        totalFRs: { type: 'integer' },
        coveredFRs: { type: 'integer' },
        coveragePercent: { type: 'number' }
      }
    }
  }
)
log(`Coverage: ${coverage.coveredFRs}/${coverage.totalFRs} FRs covered (${coverage.coveragePercent}%), ${coverage.missingFRs.length} missing`)

// ---------------------------------------------------------------------------
// STEP 4 - UX Alignment (mirrors step-04-ux-alignment.md)
// If UX exists: check UX<->PRD and UX<->Architecture alignment. If absent:
// assess whether UX/UI is IMPLIED (user-facing app) and warn accordingly.
// ---------------------------------------------------------------------------
phase('UX_ALIGNMENT')
const ux = await agent(
  `You are a UX VALIDATOR ensuring user experience is properly addressed.\n` +
  `STEP 4 - UX Alignment. UX source(s): ${JSON.stringify(inventory.documents && inventory.documents.ux)}.\n` +
  `If a UX document exists: validate (A) UX<->PRD alignment (user journeys match use cases; UX needs reflected in PRD) and (B) UX<->Architecture alignment (architecture supports UX, performance/responsiveness, all UI components backed). ` +
  `If no UX document: assess whether UX/UI is IMPLIED (PRD mentions UI, web/mobile components, user-facing app) and issue a warning if implied-but-missing. Document every alignment gap.\n` +
  `Architecture source(s): ${JSON.stringify(inventory.documents && inventory.documents.architecture)}`,
  {
    label: 'ux-alignment',
    phase: 'UX_ALIGNMENT',
    schema: {
      type: 'object',
      required: ['uxStatus', 'alignmentIssues', 'warnings'],
      properties: {
        uxStatus: { type: 'string', enum: ['found', 'not-found-implied', 'not-found-not-needed'] },
        alignmentIssues: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)
log(`UX: ${ux.uxStatus}, ${ux.alignmentIssues.length} alignment issue(s), ${ux.warnings.length} warning(s)`)

// ---------------------------------------------------------------------------
// STEP 5 - Epic Quality Review (mirrors step-05-epic-quality-review.md)
// Enforce create-epics-and-stories best practices: epics deliver USER value
// (not technical milestones), epic independence (no Epic N -> Epic N+1),
// no forward story dependencies, just-in-time DB/entity creation, BDD ACs,
// starter-template / greenfield-vs-brownfield checks. Classify by severity.
// ---------------------------------------------------------------------------
phase('EPIC_QUALITY_REVIEW')
const quality = await agent(
  `You are an EPIC QUALITY ENFORCER. Validate the epics & stories against create-epics-and-stories best practices, rigorously and without compromise.\n` +
  `STEP 5 - Epic Quality Review. Check, for every epic and story:\n` +
  `- User value: epic title/goal is user-centric; reject technical milestones ("Setup Database", "API Development", "Infrastructure Setup").\n` +
  `- Epic independence: Epic N must function on Epic 1..N-1 only; NEVER require Epic N+1; no circular deps.\n` +
  `- Story dependencies: each story independently completable; NO forward references ("depends on Story 1.4").\n` +
  `- DB/entity timing: tables created just-in-time per story, NOT all upfront in Epic 1 Story 1.\n` +
  `- Acceptance criteria: Given/When/Then, testable, covers errors not just happy path, specific not vague.\n` +
  `- Starter template: if Architecture specifies one, Epic 1 Story 1 must set up the project from it.\n` +
  `- Greenfield vs brownfield: greenfield needs setup/env/CI-CD early; brownfield needs integration/migration stories.\n` +
  `- Traceability to FRs maintained.\n` +
  `Classify findings as critical / major / minor, each with a specific example and remediation.\n` +
  `Epics source(s): ${JSON.stringify(inventory.documents && inventory.documents.epics)}\n` +
  `Architecture source(s): ${JSON.stringify(inventory.documents && inventory.documents.architecture)}`,
  {
    label: 'epic-quality',
    phase: 'EPIC_QUALITY_REVIEW',
    schema: {
      type: 'object',
      required: ['critical', 'major', 'minor'],
      properties: {
        critical: { type: 'array', items: { type: 'string' } },
        major: { type: 'array', items: { type: 'string' } },
        minor: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } }
      }
    }
  }
)
log(`Quality: ${quality.critical.length} critical, ${quality.major.length} major, ${quality.minor.length} minor`)

// ---------------------------------------------------------------------------
// STEP 6 - Final Assessment (mirrors step-06-final-assessment.md)
// Compile all findings into one objective verdict: READY / NEEDS WORK /
// NOT READY, with the critical issues and concrete next steps. The script
// computes the verdict; it does NOT decide whether to proceed - that human
// "proceed as-is or fix" gate is owned by the orchestrating skill.
// ---------------------------------------------------------------------------
phase('FINAL_ASSESSMENT')
const final = await agent(
  `You are ${role}\n` +
  `STEP 6 - Final Assessment. Compile all findings into one objective readiness verdict. Be direct - do NOT soften the message. ` +
  `Determine overall status: READY (no critical issues, full FR coverage), NEEDS WORK (gaps/major issues but fixable), or NOT READY (critical violations or missing core docs). ` +
  `List the critical issues that must be addressed and concrete next-step action items. Do NOT decide whether to proceed - just report the state of readiness.\n` +
  `Discovery: ${JSON.stringify({ duplicates: inventory.duplicates, missing: inventory.missing })}\n` +
  `PRD: ${prd.functionalRequirements.length} FR / ${prd.nonFunctionalRequirements.length} NFR; completeness: ${prd.completenessAssessment || 'n/a'}\n` +
  `Coverage: ${coverage.coveragePercent}% (${coverage.coveredFRs}/${coverage.totalFRs}); missing FRs: ${JSON.stringify(coverage.missingFRs)}\n` +
  `UX: ${ux.uxStatus}; issues: ${JSON.stringify(ux.alignmentIssues)}; warnings: ${JSON.stringify(ux.warnings)}\n` +
  `Epic quality: ${JSON.stringify({ critical: quality.critical, major: quality.major, minor: quality.minor })}`,
  {
    label: 'final-assessment',
    phase: 'FINAL_ASSESSMENT',
    schema: {
      type: 'object',
      required: ['readinessStatus', 'criticalIssues', 'nextSteps'],
      properties: {
        readinessStatus: { type: 'string', enum: ['READY', 'NEEDS WORK', 'NOT READY'] },
        criticalIssues: { type: 'array', items: { type: 'string' } },
        nextSteps: { type: 'array', items: { type: 'string' } },
        finalNote: { type: 'string' }
      }
    }
  }
)
log(`Readiness verdict: ${final.readinessStatus}`)

const totalIssues =
  inventory.duplicates.length +
  inventory.missing.length +
  coverage.missingFRs.length +
  ux.alignmentIssues.length +
  ux.warnings.length +
  quality.critical.length +
  quality.major.length +
  quality.minor.length

return {
  workflow: 'check-implementation-readiness',
  summary: `Implementation readiness: ${final.readinessStatus} - ${totalIssues} issue(s) across discovery, PRD coverage, UX, and epic quality.`,
  steps: 6,
  reportDate,
  planningArtifacts,
  needsHumanGate: true,
  result: {
    discovery: inventory,
    prd: { frCount: prd.functionalRequirements.length, nfrCount: prd.nonFunctionalRequirements.length, completenessAssessment: prd.completenessAssessment },
    coverage,
    ux,
    epicQuality: quality,
    final
  },
  totalIssues
}
