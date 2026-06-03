export const meta = {
  name: 'testarch-nfr',
  description: 'Native port of the BYAN testarch-nfr workflow (create mode): assess non-functional requirements before release with evidence-based PASS/CONCERNS/FAIL outcomes. Load context+knowledge, define NFR categories+thresholds, gather evidence, fan out 4 parallel domain subprocesses (security/performance/reliability/scalability), aggregate into an executive summary, generate the report, then return a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'CONTEXT', detail: 'step-01: load NFR requirements, evidence sources, knowledge base' },
    { title: 'THRESHOLDS', detail: 'step-02: select NFR categories (ADR 8) + extract/UNKNOWN thresholds' },
    { title: 'EVIDENCE', detail: 'step-03: gather measurable evidence per category; gaps -> CONCERNS' },
    { title: 'ASSESS', detail: 'step-04: parallel fan-out of 4 NFR domain subprocesses (security/performance/reliability/scalability)' },
    { title: 'AGGREGATE', detail: 'step-04e: read 4 outputs, overall risk, compliance, cross-domain risks, exec summary' },
    { title: 'REPORT', detail: 'step-05: produce nfr-assessment.md, validate vs checklist, completion summary' },
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
//   - uses NO wall-clock (wall-clock/wall-clock) and NO randomness (RNG):
//     those break Workflow resume. The unique run id used by the source for
//     the /tmp/tea-nfr-*-{timestamp}.json subprocess outputs is passed IN via
//     args.runId (the source generated it with an injected timestamp).
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate. The nfr-assessment.md report is the workflow's product,
//     written by the REPORT leaf — that is the artifact, not platform state.
// ---------------------------------------------------------------------------

// Risk hierarchy mirrors steps-c/step-04e-aggregate-nfr.md (HIGH>MEDIUM>LOW>NONE).
// Inlined (sandbox forbids import) so the prose rule becomes a real reduction.
const RISK_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 }
function overallRisk(levels) {
  const max = levels.reduce((m, r) => Math.max(m, RISK_RANK[r] || 0), 0)
  return Object.keys(RISK_RANK).find((k) => RISK_RANK[k] === max) || 'NONE'
}

// Per-domain subprocess output schema — mirrors the OUTPUT FORMAT JSON in
// steps-c/step-04a..04d (domain, risk_level, findings[], compliance, priority_actions, summary).
const DOMAIN_SCHEMA = {
  type: 'object',
  required: ['domain', 'risk_level', 'findings', 'summary'],
  properties: {
    domain: { type: 'string' },
    risk_level: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'status'],
        properties: {
          category: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'CONCERN', 'FAIL', 'N/A'] },
          description: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    compliance: { type: 'object' },
    priority_actions: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const story = (args && args.story) || (args && args.target) || 'the implementation under release review'
const runId = (args && args.runId) || (args && args.timestamp) || 'nfr-run'
const customCategories = (args && args.customNfrCategories) || ''

// === Step 1: Load Context & Knowledge Base (steps-c/step-01) ===
phase('CONTEXT')
const context = await agent(
  `You are the Master Test Architect running testarch-nfr (create mode). Target: ${JSON.stringify(story)}. ` +
    `Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-01-load-context.md and follow it.\n` +
    `1) Verify prerequisites: implementation accessible for evaluation AND evidence sources available (test results, metrics, logs). If either is missing, set halt=true and name the missing inputs (do NOT invent evidence).\n` +
    `2) Load knowledge fragments from the tea index (adr-quality-readiness-checklist, ci-burn-in, test-quality, playwright-config, error-handling).\n` +
    `3) If available, read tech-spec.md (primary NFRs), PRD.md (product NFRs), story/test-design docs (feature NFRs).\n` +
    `4) Summarize the loaded NFR sources and evidence availability.`,
  {
    label: 'load-context',
    phase: 'CONTEXT',
    schema: {
      type: 'object',
      required: ['halt'],
      properties: {
        halt: { type: 'boolean', description: 'true if prerequisites (implementation or evidence) are missing' },
        missingInputs: { type: 'array', items: { type: 'string' } },
        nfrSources: { type: 'array', items: { type: 'string' } },
        evidenceAvailable: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
    },
  }
)

if (context && context.halt) {
  // step-01 mandatory rule: HALT if implementation or evidence is unavailable.
  // Surface as a verdict (gap, not silent cut); the gate decides.
  return {
    workflow: 'testarch-nfr',
    target: story,
    status: 'halted-missing-inputs',
    summary: 'NFR assessment halted at CONTEXT: prerequisites (implementation/evidence) missing.',
    missingInputs: (context && context.missingInputs) || [],
    steps: 6,
    needsHumanGate: true,
  }
}

// === Step 2: Define NFR Categories & Thresholds (steps-c/step-02) ===
phase('THRESHOLDS')
const thresholds = await agent(
  `testarch-nfr step 2 (define thresholds). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-02-define-thresholds.md.\n` +
    `Context summary: ${JSON.stringify((context && context.summary) || '')}.\n` +
    `1) Select the 8 ADR Quality Readiness categories (Testability & Automation, Test Data Strategy, Scalability & Availability, Disaster Recovery, Security, Monitorability/Debuggability/Manageability, QoS/QoE, Deployability). Add any custom categories: ${JSON.stringify(customCategories)}.\n` +
    `2) For each category extract thresholds from tech-spec (primary), PRD (secondary), story/test-design (feature-specific). NEVER guess a threshold: if unknown, mark it UNKNOWN and plan to report CONCERNS for it.\n` +
    `3) Produce the NFR matrix: each category with its threshold or UNKNOWN status.`,
  {
    label: 'define-thresholds',
    phase: 'THRESHOLDS',
    schema: {
      type: 'object',
      required: ['matrix'],
      properties: {
        matrix: {
          type: 'array',
          items: {
            type: 'object',
            required: ['category', 'threshold'],
            properties: {
              category: { type: 'string' },
              threshold: { type: 'string', description: 'concrete threshold or "UNKNOWN"' },
              unknown: { type: 'boolean' },
            },
          },
        },
        notes: { type: 'string' },
      },
    },
  }
)

// === Step 3: Gather Evidence (steps-c/step-03) ===
phase('EVIDENCE')
const evidence = await agent(
  `testarch-nfr step 3 (gather evidence). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-03-gather-evidence.md.\n` +
    `NFR matrix: ${JSON.stringify((thresholds && thresholds.matrix) || [])}.\n` +
    `1) Collect MEASURABLE evidence per category: Performance (load tests, metrics, response-time data); Security (scans, auth tests, vuln reports); Reliability (error rates, burn-in runs, failover tests); Maintainability (test quality, code-health signals); Other (logs, monitoring, DR drills, deployability checks).\n` +
    `2) Where evidence is MISSING for a category, mark that category CONCERNS (do not fabricate evidence).`,
  {
    label: 'gather-evidence',
    phase: 'EVIDENCE',
    schema: {
      type: 'object',
      required: ['evidenceByCategory'],
      properties: {
        evidenceByCategory: {
          type: 'array',
          items: {
            type: 'object',
            required: ['category'],
            properties: {
              category: { type: 'string' },
              evidence: { type: 'array', items: { type: 'string' } },
              missing: { type: 'boolean', description: 'true -> category marked CONCERNS for evidence gap' },
            },
          },
        },
        gaps: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    },
  }
)

// === Step 4: Orchestrate parallel NFR assessment — 4 subprocesses (steps-c/step-04 + 04a..04d) ===
// Source step-04 launches FOUR subprocesses in PARALLEL and waits for ALL.
// parallel() mirrors that fan-out exactly; each subprocess assesses ONE domain
// and writes /tmp/tea-nfr-<domain>-<runId>.json. runId is passed via args (no clock).
phase('ASSESS')
const sharedContext =
  `Shared context — system: ${JSON.stringify((context && context.summary) || '')}; ` +
  `thresholds: ${JSON.stringify((thresholds && thresholds.matrix) || [])}; ` +
  `evidence: ${JSON.stringify((evidence && evidence.evidenceByCategory) || [])}. ` +
  `Run id (use for the temp output file name): ${JSON.stringify(runId)}.`

const [security, performance, reliability, scalability] = await parallel([
  () =>
    agent(
      `testarch-nfr subprocess 4A (SECURITY only). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-04a-subprocess-security.md.\n` +
        `${sharedContext}\n` +
        `Assess SECURITY ONLY (auth/authz, data protection, input validation, API security, secrets management). ` +
        `Set per-finding status PASS/CONCERN/FAIL/N/A, a domain risk_level (HIGH/MEDIUM/LOW/NONE), compliance (SOC2/GDPR/HIPAA/PCI-DSS/ISO27001), priority_actions and a summary. ` +
        `Write the JSON to /tmp/tea-nfr-security-${runId}.json. Do NOT assess other domains.`,
      { label: 'sub-security', phase: 'ASSESS', schema: DOMAIN_SCHEMA }
    ),
  () =>
    agent(
      `testarch-nfr subprocess 4B (PERFORMANCE only). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-04b-subprocess-performance.md.\n` +
        `${sharedContext}\n` +
        `Assess PERFORMANCE ONLY (response times, throughput, resource usage, optimization/caching/CDN/indexing). ` +
        `Set per-finding status, domain risk_level, compliance (SLA tiers), priority_actions and a summary. ` +
        `Write the JSON to /tmp/tea-nfr-performance-${runId}.json. Do NOT assess other domains.`,
      { label: 'sub-performance', phase: 'ASSESS', schema: DOMAIN_SCHEMA }
    ),
  () =>
    agent(
      `testarch-nfr subprocess 4C (RELIABILITY only). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-04c-subprocess-reliability.md.\n` +
        `${sharedContext}\n` +
        `Assess RELIABILITY ONLY (error handling/circuit breakers/retries, monitoring & observability, fault tolerance/failover/backup/DR, uptime & availability). ` +
        `Set per-finding status, domain risk_level, compliance, priority_actions and a summary. ` +
        `Write the JSON to /tmp/tea-nfr-reliability-${runId}.json. Do NOT assess other domains.`,
      { label: 'sub-reliability', phase: 'ASSESS', schema: DOMAIN_SCHEMA }
    ),
  () =>
    agent(
      `testarch-nfr subprocess 4D (SCALABILITY only). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-04d-subprocess-scalability.md.\n` +
        `${sharedContext}\n` +
        `Assess SCALABILITY ONLY (horizontal scaling, vertical scaling, data scaling/sharding/replicas, traffic handling/CDN/queues). ` +
        `Set per-finding status, domain risk_level, compliance (user-scale tiers), priority_actions and a summary. ` +
        `Write the JSON to /tmp/tea-nfr-scalability-${runId}.json. Do NOT assess other domains.`,
      { label: 'sub-scalability', phase: 'ASSESS', schema: DOMAIN_SCHEMA }
    ),
])

// === Step 4E: Aggregate the 4 domain assessments (steps-c/step-04e) ===
phase('AGGREGATE')
const domainRisks = [security, performance, reliability, scalability].map((d) => (d && d.risk_level) || 'NONE')
const computedOverall = overallRisk(domainRisks)
log(`domain risks: security=${domainRisks[0]} performance=${domainRisks[1]} reliability=${domainRisks[2]} scalability=${domainRisks[3]} -> overall=${computedOverall}`)

const aggregate = await agent(
  `testarch-nfr step 4E (aggregate). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-04e-aggregate-nfr.md.\n` +
    `Four domain outputs: security=${JSON.stringify(security)}; performance=${JSON.stringify(performance)}; reliability=${JSON.stringify(reliability)}; scalability=${JSON.stringify(scalability)}.\n` +
    `Computed overall risk (HIGH>MEDIUM>LOW>NONE) is ${JSON.stringify(computedOverall)} — use it.\n` +
    `Do NOT re-assess any domain (use the subprocess outputs). 1) Aggregate compliance per standard: FAIL if any domain FAILs, else PARTIAL if any PARTIAL/CONCERN, else PASS. ` +
    `2) Identify cross-domain risks (e.g. performance+scalability concerns; security FAIL + reliability concern). ` +
    `3) Aggregate priority actions, marking URGENT those from a HIGH-risk domain. ` +
    `4) Produce an executive summary (overall risk, per-domain breakdown, compliance summary, cross-domain risks, prioritized actions).`,
  {
    label: 'aggregate',
    phase: 'AGGREGATE',
    schema: {
      type: 'object',
      required: ['overallRisk', 'riskBreakdown'],
      properties: {
        overallRisk: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        riskBreakdown: {
          type: 'object',
          properties: {
            security: { type: 'string' },
            performance: { type: 'string' },
            reliability: { type: 'string' },
            scalability: { type: 'string' },
          },
        },
        complianceSummary: { type: 'object' },
        crossDomainRisks: { type: 'array', items: { type: 'object' } },
        priorityActions: { type: 'array', items: { type: 'object' } },
        executiveSummary: { type: 'string' },
      },
    },
  }
)

// === Step 5: Generate Report & Validate (steps-c/step-05) ===
phase('REPORT')
const report = await agent(
  `testarch-nfr step 5 (generate report & validate). Read _byan/workflow/simple/testarch/nfr-assess/steps-c/step-05-generate-report.md, the nfr-report-template.md, and the workflow checklist.md.\n` +
    `Executive aggregate: ${JSON.stringify(aggregate)}.\n` +
    `1) Using nfr-report-template.md, write the report to the configured output folder as nfr-assessment.md: per-category results (PASS/CONCERNS/FAIL), evidence summary, remediation actions, and a gate-ready YAML snippet if applicable. ` +
    `2) Validate the report against checklist.md and fix any gaps. ` +
    `3) Completion summary: overall NFR status, critical blockers or waivers needed, and the next recommended workflow (trace or release gate).`,
  {
    label: 'generate-report',
    phase: 'REPORT',
    schema: {
      type: 'object',
      required: ['reportPath', 'overallStatus', 'valid'],
      properties: {
        reportPath: { type: 'string' },
        overallStatus: { type: 'string', enum: ['PASS', 'CONCERNS', 'FAIL'] },
        valid: { type: 'boolean', description: 'true only if the report satisfies checklist.md' },
        blockers: { type: 'array', items: { type: 'string' } },
        waiversNeeded: { type: 'array', items: { type: 'string' } },
        nextWorkflow: { type: 'string' },
        gaps: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
    },
  }
)

// Return DATA only. The orchestrating skill presents this at the human gate
// and records FD/strict state via MCP. No platform state is written here.
return {
  workflow: 'testarch-nfr',
  target: story,
  status: report && report.valid ? 'nfr-assessed' : 'gaps-found',
  overallRisk: (aggregate && aggregate.overallRisk) || computedOverall,
  overallStatus: (report && report.overallStatus) || 'CONCERNS',
  riskBreakdown: (aggregate && aggregate.riskBreakdown) || {
    security: domainRisks[0],
    performance: domainRisks[1],
    reliability: domainRisks[2],
    scalability: domainRisks[3],
  },
  reportPath: (report && report.reportPath) || '',
  blockers: (report && report.blockers) || [],
  nextWorkflow: (report && report.nextWorkflow) || 'trace',
  steps: 6,
  needsHumanGate: true,
  result: report,
}
