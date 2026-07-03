export const meta = {
  name: 'sprint-planning',
  description: 'Native port of the BYAN sprint-planning workflow: discover and parse all epic files, build the ordered sprint-status structure (epic / stories / retrospective), apply intelligent never-downgrade status detection, write sprint-status.yaml, then validate coverage and report. Returns a structured verdict; the human gate stays in the orchestrating skill.',
  phases: [
    { title: 'PARSE', detail: 'discover epic*.md files and extract all epics + stories into kebab-case keys' },
    { title: 'STRUCTURE', detail: 'build the ordered development_status map: epic, its stories, its retrospective' },
    { title: 'DETECT', detail: 'intelligent per-story status detection, never downgrade an existing status' },
    { title: 'GENERATE', detail: 'write sprint-status.yaml with metadata as comments AND as parseable fields' },
    { title: 'VALIDATE', detail: 'coverage + legal-status + YAML checks, then count totals and report', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — byan-lint-workflows).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, mantra-
// validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly. No require/import, no fs, no Date/RNG
//     (the sandbox forbids them; clock/RNG break resume — any date is passed
//     in via args.date).
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate.
// The product of THIS workflow is the sprint-status.yaml FILE, written by the
// GENERATE leaf — that is the artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Inputs are passed in (no clock/RNG inside the sandbox). Mirrors the
// workflow.yaml variables: epics_location, status_file, project_name, date.
const epicsLocation = (args && args.epicsLocation) || 'planning artifacts folder (look for *epic*.md or epics/index.md)'
const statusFile = (args && args.statusFile) || '{implementation_artifacts}/sprint-status.yaml'
const projectName = (args && args.projectName) || '{project_name from _byan/bmm/config.yaml}'
const projectKey = (args && args.projectKey) || 'NOKEY'
const trackingSystem = (args && args.trackingSystem) || 'file-system'
const storyLocation = (args && args.storyLocation) || '{implementation_artifacts}'
const date = (args && args.date) || '{date passed by orchestrator}'

// STEP 1 (+ sub-step 0.5 discovery) — Parse epic files and extract all work items.
// Mirrors instructions.md step n="1" and the FULL_LOAD discovery: whole doc first
// (epics.md / bmm-epics.md / *epic*.md), else sharded epics/index.md + epic-N.md.
phase('PARSE')
const PARSE_SCHEMA = {
  type: 'object',
  required: ['epics'],
  properties: {
    sourceMode: { type: 'string', enum: ['whole', 'sharded', 'none'], description: 'whole doc, sharded index, or no epics found' },
    epics: {
      type: 'array',
      description: 'every epic discovered, in document order',
      items: {
        type: 'object',
        required: ['num', 'title', 'stories'],
        properties: {
          num: { type: 'integer', description: 'epic number from "## Epic N:"' },
          title: { type: 'string' },
          stories: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'title'],
              properties: {
                key: { type: 'string', description: 'kebab key: "1-1-user-authentication" (period->dash, title kebab-case)' },
                title: { type: 'string', description: 'original story title' },
              },
            },
          },
        },
      },
    },
  },
}
const parsed = await agent(
  `You are the sprint-planning workflow (BYAN, Phase 4 implementation). Source of truth: ` +
    `_byan/workflow/simple/4-implementation/sprint-planning/instructions.md (steps 0.5 + 1).\n` +
    `DISCOVER epics under: ${JSON.stringify(epicsLocation)}. FULL_LOAD strategy:\n` +
    `1. Whole document first — epics.md, bmm-epics.md, user-stories.md, or any *epic*.md (fuzzy match).\n` +
    `2. Else sharded — read epics/index.md, then read EVERY epic section file it lists (epic-1.md, epic-2.md ...).\n` +
    `3. If both whole and sharded exist, prefer the whole document.\n` +
    `For each epic file, EXTRACT:\n` +
    `- Epic numbers from headers like "## Epic 1:" / "## Epic 2:".\n` +
    `- Story IDs + titles from "### Story 1.1: User Authentication".\n` +
    `- Convert each story to a kebab key: replace the period with a dash (1.1 -> 1-1) and kebab-case the title, ` +
    `e.g. "### Story 1.1: User Authentication" -> "1-1-user-authentication".\n` +
    `Build the COMPLETE inventory of all epics and stories from ALL epic files. ` +
    `If NO epic file is found, set sourceMode "none" and return an empty epics array (do not invent epics).`,
  { label: 'parse-epics', phase: 'PARSE', schema: PARSE_SCHEMA }
)

// STEP 2 — Build sprint status structure. Mirrors step n="2": per epic emit, in
// order, epic-{num} (backlog), each story key (backlog), epic-{num}-retrospective
// (optional). All defaults; status detection happens in DETECT.
phase('STRUCTURE')
const STRUCTURE_SCHEMA = {
  type: 'object',
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      description: 'ordered development_status entries: epic, its stories, its retrospective, then next epic...',
      items: {
        type: 'object',
        required: ['key', 'kind', 'defaultStatus'],
        properties: {
          key: { type: 'string', description: 'epic-N | story kebab key | epic-N-retrospective' },
          kind: { type: 'string', enum: ['epic', 'story', 'retrospective'] },
          defaultStatus: { type: 'string', enum: ['backlog', 'optional'], description: 'epic/story=backlog, retrospective=optional' },
        },
      },
    },
  },
}
const structure = await agent(
  `Step 2 of sprint-planning. From the parsed inventory below, build the ORDERED development_status entry list.\n` +
    `Inventory: ${JSON.stringify(parsed)}\n` +
    `For EACH epic, in epic order, emit in this exact order:\n` +
    `1. epic-{num}  -> kind "epic",  defaultStatus "backlog"\n` +
    `2. one entry per story, key = the story kebab key -> kind "story", defaultStatus "backlog"\n` +
    `3. epic-{num}-retrospective -> kind "retrospective", defaultStatus "optional"\n` +
    `Then move to the next epic. Do NOT add or drop any item relative to the inventory.`,
  { label: 'build-structure', phase: 'STRUCTURE', schema: STRUCTURE_SCHEMA }
)

// STEP 3 — Apply intelligent status detection. Mirrors step n="3": for each story
// check {story_location}/{key}.md -> at least ready-for-dev; if a prior status_file
// exists with a MORE advanced status, preserve it (NEVER downgrade).
phase('DETECT')
const DETECT_SCHEMA = {
  type: 'object',
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'kind', 'status'],
        properties: {
          key: { type: 'string' },
          kind: { type: 'string', enum: ['epic', 'story', 'retrospective'] },
          status: { type: 'string', enum: ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional'] },
          reason: { type: 'string', description: 'why this status (file found / preserved from prior status-file / default)' },
        },
      },
    },
    preservedCount: { type: 'integer', description: 'entries whose status was preserved from a more-advanced prior status-file' },
  },
}
const detected = await agent(
  `Step 3 of sprint-planning — intelligent status detection. Ordered entries (all defaults):\n` +
    `${JSON.stringify(structure)}\n` +
    `Story location: ${JSON.stringify(storyLocation)}. Existing status file (if any): ${JSON.stringify(statusFile)}.\n` +
    `Rules, applied per entry:\n` +
    `- STORY: if ${JSON.stringify(storyLocation)}/{key}.md exists, upgrade to at least "ready-for-dev".\n` +
    `- PRESERVATION (never downgrade): if a prior ${JSON.stringify(statusFile)} exists and holds a MORE advanced status ` +
    `for this key, KEEP that status. Story order: backlog < ready-for-dev < in-progress < review < done. ` +
    `Epic order: backlog < in-progress < done. Retrospective: optional <-> done.\n` +
    `- Items with no signal keep their default (backlog / optional).\n` +
    `Return every entry with its resolved status and a short reason, preserving the input order. ` +
    `Count how many statuses were preserved from a prior file in preservedCount.`,
  { label: 'detect-status', phase: 'DETECT', schema: DETECT_SCHEMA }
)

// STEP 4 — Generate the sprint status file. Mirrors step n="4" and the template:
// metadata appears TWICE (as # comments for docs AND as YAML key:value for
// parsing), then the ordered development_status block.
phase('GENERATE')
const GENERATE_SCHEMA = {
  type: 'object',
  required: ['written', 'path'],
  properties: {
    written: { type: 'boolean', description: 'true once sprint-status.yaml has been written' },
    path: { type: 'string', description: 'absolute path of the written status file' },
    metadataDuplicated: { type: 'boolean', description: 'true if metadata appears both as # comments AND as YAML fields' },
    entryCount: { type: 'integer', description: 'number of development_status lines written' },
  },
}
const generated = await agent(
  `Step 4 of sprint-planning — write the status file. Resolved entries (preserve order):\n` +
    `${JSON.stringify(detected)}\n` +
    `Target: ${JSON.stringify(statusFile)}.\n` +
    `Write valid YAML following sprint-status-template.yaml. CRITICAL: metadata appears TWICE — ` +
    `first as a # comment header (generated / project / project_key / tracking_system / story_location, ` +
    `plus the STATUS DEFINITIONS and WORKFLOW NOTES comment block), then again as parseable YAML key:value fields:\n` +
    `  generated: ${date}\n  project: ${projectName}\n  project_key: ${projectKey}\n` +
    `  tracking_system: ${trackingSystem}\n  story_location: ${JSON.stringify(storyLocation)}\n` +
    `Then a development_status: map with every entry "key: status", in order ` +
    `(epic, its stories, its retrospective, blank line, next epic...). ` +
    `Write the complete file to disk and report the path and entry count.`,
  { label: 'generate-status-file', phase: 'GENERATE', schema: GENERATE_SCHEMA }
)

// STEP 5 — Validate and report. Mirrors step n="5" + checklist.md: coverage both
// ways, retrospective per epic, legal statuses, valid YAML, then totals.
phase('VALIDATE')
const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['passed', 'checks', 'totals'],
  properties: {
    passed: { type: 'boolean', description: 'true only if EVERY coverage/legal/YAML check holds' },
    checks: {
      type: 'object',
      required: ['everyEpicPresent', 'everyStoryPresent', 'everyEpicHasRetro', 'noExtraItems', 'allStatusesLegal', 'validYaml'],
      properties: {
        everyEpicPresent: { type: 'boolean' },
        everyStoryPresent: { type: 'boolean' },
        everyEpicHasRetro: { type: 'boolean' },
        noExtraItems: { type: 'boolean', description: 'no status-file item absent from the epic files' },
        allStatusesLegal: { type: 'boolean', description: 'every status value matches the state machine' },
        validYaml: { type: 'boolean' },
      },
    },
    totals: {
      type: 'object',
      required: ['epicCount', 'storyCount'],
      properties: {
        epicCount: { type: 'integer' },
        storyCount: { type: 'integer' },
        epicsInProgress: { type: 'integer' },
        storiesDone: { type: 'integer' },
      },
    },
    failures: { type: 'array', items: { type: 'string' }, description: 'specific check failures, empty if passed' },
  },
}
const validation = await agent(
  `Step 5 of sprint-planning — validate and report. Compare the epic-file inventory against the written status file.\n` +
    `Inventory: ${JSON.stringify(parsed)}\nResolved entries: ${JSON.stringify(detected)}\nWrite result: ${JSON.stringify(generated)}\n` +
    `Run every check (per checklist.md):\n` +
    `- everyEpicPresent: each epic in the epic files appears as epic-N in the status file.\n` +
    `- everyStoryPresent: each story in the epic files appears (kebab key) in the status file.\n` +
    `- everyEpicHasRetro: each epic has an epic-N-retrospective entry.\n` +
    `- noExtraItems: no status-file item is absent from the epic files.\n` +
    `- allStatusesLegal: every status matches the state machine (epic: backlog/in-progress/done; ` +
    `story: backlog/ready-for-dev/in-progress/review/done; retro: optional/done).\n` +
    `- validYaml: the file parses as YAML.\n` +
    `Count totals: epicCount, storyCount, epicsInProgress, storiesDone. ` +
    `passed = true only if ALL six checks hold; otherwise list specific failures.`,
  { label: 'mech-validate-status', phase: 'VALIDATE', schema: VALIDATE_SCHEMA, model: 'sonnet' }
)

// Single top-level return — DATA only. The orchestrating skill presents this at
// the human gate (review the generated file, then track development) and records
// FD/strict state via MCP. No platform state is touched here.
return {
  workflow: 'sprint-planning',
  summary: `Generated sprint-status from ${parsed.epics.length} epic(s); validation ${validation.passed ? 'PASSED' : 'FAILED'}.`,
  steps: 5,
  statusFile: generated.path || statusFile,
  totals: validation.totals,
  validationPassed: validation.passed,
  failures: validation.failures || [],
  needsHumanGate: true,
  nextSteps: [
    'Review the generated sprint-status.yaml',
    'Use it to track development progress',
    'Agents update statuses as they work',
    'Re-run to refresh auto-detected statuses',
  ],
  result: { parsed, detected, generated, validation },
}
