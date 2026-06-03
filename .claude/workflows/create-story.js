export const meta = {
  name: 'create-story',
  description: 'Native port of the BYAN create-story workflow: select the next backlog story, exhaustively analyze epics + previous story + git + architecture, web-research latest tech, write the ULTIMATE ready-for-dev story file from the template, then return a structured verdict for the orchestrating skill to update sprint-status and present at the human gate.',
  phases: [
    { title: 'TARGET', detail: 'determine the target story (auto-discover first backlog from sprint-status, or use the provided story key)' },
    { title: 'ARTIFACTS', detail: 'load + exhaustively analyze epics, previous story learnings, and git history' },
    { title: 'ARCHITECTURE', detail: 'extract architecture guardrails the developer MUST follow' },
    { title: 'RESEARCH', detail: 'web-research latest stable versions / breaking changes for the relevant tech' },
    { title: 'WRITE', detail: 'create the comprehensive story file from template.md and set Status: ready-for-dev' },
    { title: 'FINALIZE', detail: 'validate against the checklist and return a verdict (sprint-status update + report happen at the gate)' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, mantra-validate)
// DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly  (enforced by byan-lint-workflows.js).
//   - uses NO wall-clock and NO randomness primitive (Date/RNG break
//     resume); any date/id is passed in via args.
//   - returns DATA only. The orchestrating skill is the human-gated conductor:
//     IT updates sprint-status.yaml (source step 6) and records FD/strict state
//     via the byan_fd_* / byan_strict_* MCP tools AT the gate. Source step 1's
//     HALT/ask branches (no sprint file, no backlog, done/invalid epic) are
//     human gates -> surfaced as a verdict, never decided inside the script.
// The story FILE (the {{story_key}}.md product) is the workflow's artifact,
// written by the WRITE leaf — that is the deliverable, not BYAN platform state.
// ---------------------------------------------------------------------------

// Inputs are passed in (no fs, no clock, no RNG in the sandbox).
// storyKey: explicit "epic-story-title" the user provided (skips auto-discover).
// date: caller-supplied date string for the story header (system-generated upstream).
const storyKey = (args && args.storyKey) || null
const date = (args && args.date) || 'unspecified'
const storyDir = (args && args.storyDir) || '{implementation_artifacts}'

// Verdict shape for the TARGET step: either a story is resolved, or we hit one
// of source step 1's human-gate conditions (HALT/ask) that the script must NOT
// resolve on its own.
const TARGET_SCHEMA = {
  type: 'object',
  required: ['resolved'],
  properties: {
    resolved: { type: 'boolean', description: 'true if a concrete target story key was determined' },
    epicNum: { type: 'string' },
    storyNum: { type: 'string' },
    storyKey: { type: 'string', description: 'e.g. 1-2-user-authentication' },
    storyId: { type: 'string', description: 'e.g. 1.2' },
    storyTitle: { type: 'string' },
    isFirstStoryInEpic: { type: 'boolean', description: 'true if matches {epicNum}-1-*; epic should be flagged in-progress at the gate' },
    gate: {
      type: 'string',
      description: 'human-gate condition when resolved=false: no-sprint-status | no-backlog | epic-done | invalid-epic-status | none',
    },
    gateMessage: { type: 'string', description: 'message to surface to the human when resolved=false' },
  },
}

// Verdict shape for the final FINALIZE step.
const FINAL_SCHEMA = {
  type: 'object',
  required: ['storyFileWritten', 'status', 'checklistVerdict'],
  properties: {
    storyFileWritten: { type: 'boolean' },
    storyFilePath: { type: 'string' },
    status: { type: 'string', description: "the Status set in the story file; must be 'ready-for-dev' on success" },
    checklistVerdict: { type: 'string', enum: ['pass', 'gaps'], description: 'result of validating the story against checklist.md' },
    criticalIssues: { type: 'array', items: { type: 'string' }, description: 'checklist critical misses (must-fix)' },
    enhancements: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' }, description: 'questions saved for the end (source: SAVE QUESTIONS rule)' },
  },
}

// === STEP 1 — Determine target story =======================================
// Source: instructions.xml step n="1". Auto-discover the FIRST backlog story
// from sprint-status.yaml (read top-to-bottom, preserve order), OR honour an
// explicitly provided story key. The HALT/ask branches (missing sprint file,
// no backlog story, epic done, invalid epic status) are HUMAN gates: the agent
// reports them via resolved=false + gate, it does NOT pick or HALT autonomously.
phase('TARGET')
const target = await agent(
  `You are create-story (BYAN). Goal: determine the target story.\n` +
    `Read the REAL source: _byan/workflow/simple/4-implementation/create-story/workflow.yaml and instructions.xml (step 1).\n` +
    (storyKey
      ? `The user provided a story key: ${JSON.stringify(storyKey)}. Parse it into epicNum, storyNum, storyTitle (format "epic-story-title", e.g. "1-2-user-auth"). Set storyId = "{epicNum}.{storyNum}", storyKey, resolved=true, gate="none".`
      : `No story key was provided. Read the COMPLETE sprint-status.yaml (variable {implementation_artifacts}/sprint-status.yaml) from start to end, preserving order. Parse development_status fully. Find the FIRST story key (top-to-bottom) matching number-number-name, NOT an epic-X or epic-X-retrospective key, whose status equals "backlog". Extract epicNum (before first dash), storyNum (after first dash), storyTitle (remainder); set storyId="{epicNum}.{storyNum}".\n` +
        `Then detect the HUMAN-GATE conditions and report them WITHOUT deciding:\n` +
        `  - sprint-status.yaml missing -> resolved=false, gate="no-sprint-status".\n` +
        `  - no backlog story found -> resolved=false, gate="no-backlog".\n` +
        `  - if this is the first story in the epic ({epicNum}-1-*): check epic-{epicNum} status. If "done" -> resolved=false, gate="epic-done". If not one of backlog/contexted/in-progress/done -> resolved=false, gate="invalid-epic-status". Otherwise set isFirstStoryInEpic=true (the epic should be flagged in-progress at the gate) and resolved=true.\n` +
        `  - otherwise resolved=true, gate="none".`) +
    `\nDo NOT write any file in this step. Only resolve / report the target.`,
  { label: 'determine-target', phase: 'TARGET', schema: TARGET_SCHEMA }
)
log(`target: resolved=${target.resolved} key=${target.storyKey || '(none)'} gate=${target.gate || 'n/a'}`)

// If a human gate blocks selection, stop the autonomous run and return the
// gate to the orchestrating skill. The script never HALTs or asks the user.
if (!target.resolved) {
  return {
    workflow: 'create-story',
    summary: `Target story could not be resolved autonomously — human gate: ${target.gate}.`,
    steps: 1,
    needsHumanGate: true,
    gate: target.gate,
    gateMessage: target.gateMessage || '',
    target,
  }
}

const resolvedKey = target.storyKey
const storyFilePath = `${storyDir}/${resolvedKey}.md`

// === STEP 2 — Load and analyze core artifacts ==============================
// Source: step n="2". Exhaustive (NOT lazy) analysis of epics for THIS story,
// previous-story intelligence (if storyNum > 1), and git history for recent
// work patterns. This is where future developer mistakes are prevented.
phase('ARTIFACTS')
const artifacts = await agent(
  `create-story step 2 — EXHAUSTIVE artifact analysis for story ${JSON.stringify(resolvedKey)} (id ${target.storyId}). Do NOT skim.\n` +
    `Run discover_inputs: load epics ({planning_artifacts}/*epic*.md), and fall back to prd / architecture / ux / project-context only as needed.\n` +
    `EPIC ANALYSIS: from epics, extract Epic ${target.epicNum} objectives + business value, ALL stories in the epic (cross-story context), our story's user-story statement + BDD acceptance criteria + technical requirements + dependencies + source hints.\n` +
    `STORY FOUNDATION: As-a / I-want / so-that, detailed acceptance criteria, story-specific technical requirements, success criteria.\n` +
    `PREVIOUS STORY INTELLIGENCE: if storyNum (${target.storyNum}) > 1, load the previous story file ${storyDir}/${target.epicNum}-{previous_story_num}-*.md and extract dev notes, review feedback, files created/modified + their patterns, testing approaches that worked/failed, problems + solutions, code patterns established.\n` +
    `GIT INTELLIGENCE: if a previous story exists AND a git repo is detected, read the last 5 commit titles; analyze recent commits for files touched, conventions, dependency changes, architecture decisions, testing approaches; extract actionable insights for this story.\n` +
    `Return a tight, structured analysis (no fluff). Save any clarifying questions for the END (do not ask now).`,
  { label: 'analyze-artifacts', phase: 'ARTIFACTS' }
)

// === STEP 3 — Architecture analysis for developer guardrails ===============
// Source: step n="3". Pull every architecture constraint the developer MUST
// follow (stack/versions, structure, API, DB, security, performance, testing,
// deployment, integration); flag decisions that override previous patterns.
phase('ARCHITECTURE')
const architecture = await agent(
  `create-story step 3 — ARCHITECTURE guardrails for story ${JSON.stringify(resolvedKey)}.\n` +
    `Artifact analysis so far: ${artifacts}\n` +
    `Load architecture: complete file if single, or the index + all shards if sharded ({planning_artifacts}/*architecture*.md or */*.md).\n` +
    `For each section, decide relevance to THIS story and extract what the developer MUST follow: Technical Stack (languages/frameworks/libraries WITH versions); Code Structure (folders, naming, file patterns); API Patterns (service structure, endpoints, data contracts); Database Schemas (tables/relationships/constraints relevant to the story); Security Requirements (auth/authz); Performance Requirements (caching, optimization); Testing Standards (frameworks, coverage, patterns); Deployment Patterns; Integration Patterns (external services, data flows).\n` +
    `Explicitly identify any architectural decision that OVERRIDES a previous pattern. Return a tight list of binding constraints.`,
  { label: 'analyze-architecture', phase: 'ARCHITECTURE' }
)

// === STEP 4 — Web research for latest technical specifics ==================
// Source: step n="4". For each critical library/framework, research latest
// stable version + breaking changes + security/perf notes + best practices,
// so the story never carries outdated implementation guidance.
phase('RESEARCH')
const research = await agent(
  `create-story step 4 — LATEST-TECH web research for story ${JSON.stringify(resolvedKey)}.\n` +
    `From the architecture guardrails: ${architecture}\n` +
    `Identify the specific libraries / APIs / frameworks this story depends on. For each critical one, research: latest stable version + key breaking changes; security vulnerabilities/updates; performance improvements/deprecations; best practices for the current version; migration considerations if upgrading.\n` +
    `Return ONLY the critical, story-relevant facts the developer needs (specific versions and WHY, endpoints with params/auth, recent security patches, perf techniques). If no external lookup is warranted, say so explicitly rather than padding.`,
  { label: 'web-research', phase: 'RESEARCH' }
)

// === STEP 5 — Create comprehensive story file ==============================
// Source: step n="5". Initialize from template.md and write the full story:
// header, requirements, the developer_context section (MOST IMPORTANT), tech
// requirements, architecture compliance, library/framework reqs, file-structure
// reqs, testing reqs, previous-story intelligence, git summary, latest tech,
// project-context reference, completion status; set Status: ready-for-dev.
phase('WRITE')
const written = await agent(
  `create-story step 5 — WRITE the ULTIMATE story file at ${storyFilePath} (story ${target.storyId}, date ${date}).\n` +
    `Initialize from the template: _byan/workflow/simple/4-implementation/create-story/template.md (keep its section order).\n` +
    `Fill EVERY relevant section from the analyses below — this single file is ALL the dev agent will have, so make flawless implementation inevitable:\n` +
    `  story_header (epic_num/story_num/title, Status), story_requirements (As-a/I-want/so-that + Acceptance Criteria + Tasks/Subtasks with AC refs),\n` +
    `  developer_context_section (MOST IMPORTANT — anti-reinvention, exact file locations, reuse opportunities),\n` +
    `  technical_requirements, architecture_compliance, library_framework_requirements, file_structure_requirements, testing_requirements,\n` +
    `  previous_story_intelligence (only if available), git_intelligence_summary (only if git analysis ran), latest_tech_information (only if research produced facts),\n` +
    `  project_context_reference, story_completion_status.\n` +
    `EPICS/STORY ANALYSIS:\n${artifacts}\nARCHITECTURE GUARDRAILS:\n${architecture}\nLATEST-TECH:\n${research}\n` +
    `Cite technical details with source paths/sections, e.g. [Source: docs/<file>.md#Section]. Set Status to "ready-for-dev" and add the completion note "Ultimate context engine analysis completed - comprehensive developer guide created". Write ONLY the story file. Report the path written and the Status set.`,
  { label: 'write-story', phase: 'WRITE' }
)
log(`write: ${typeof written === 'string' ? written.slice(0, 120) : 'done'}`)

// === STEP 6 — Validate against checklist & finalize ========================
// Source: step n="6". Validate the freshly written story against checklist.md
// (the quality-competition reviewer) and report gaps. The unconditional save,
// the sprint-status.yaml update (backlog -> ready-for-dev) and the user report
// are the HUMAN-GATE side: the script returns a verdict; the skill applies
// the sprint-status mutation and surfaces the report.
phase('FINALIZE')
const finalVerdict = await agent(
  `create-story step 6 — VALIDATE the story at ${storyFilePath} against the checklist: _byan/workflow/simple/4-implementation/create-story/checklist.md.\n` +
    `Re-analyze the source artifacts with a critical eye (the checklist is a fresh-context quality reviewer hunting for misses the writer left). Classify findings: critical issues (must-fix blockers), enhancements (should-add), and any open questions you saved for the end.\n` +
    `Confirm the story file was written and its Status is exactly "ready-for-dev". Set checklistVerdict="pass" only if there are NO critical issues, otherwise "gaps". Do NOT modify sprint-status.yaml here — that mutation happens at the human gate.`,
  { label: 'validate-checklist', phase: 'FINALIZE', schema: FINAL_SCHEMA }
)
log(`finalize: status=${finalVerdict.status} checklist=${finalVerdict.checklistVerdict}`)

// Return DATA only. The orchestrating skill presents this at the human gate,
// updates sprint-status.yaml (backlog -> ready-for-dev), optionally flags the
// epic in-progress, and records FD/strict state via MCP.
return {
  workflow: 'create-story',
  storyKey: resolvedKey,
  storyId: target.storyId,
  storyFilePath,
  status: finalVerdict.status,
  isFirstStoryInEpic: Boolean(target.isFirstStoryInEpic),
  checklistVerdict: finalVerdict.checklistVerdict,
  criticalIssues: finalVerdict.criticalIssues || [],
  enhancements: finalVerdict.enhancements || [],
  openQuestions: finalVerdict.openQuestions || [],
  steps: 6,
  summary: `Story ${resolvedKey} written to ${storyFilePath} as ready-for-dev (checklist: ${finalVerdict.checklistVerdict}).`,
  needsHumanGate: true,
  // Action the skill must apply at the gate (kept OUT of the script):
  sprintStatusUpdate: { storyKey: resolvedKey, from: 'backlog', to: 'ready-for-dev' },
}
