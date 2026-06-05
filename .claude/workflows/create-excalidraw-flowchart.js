export const meta = {
  name: 'create-excalidraw-flowchart',
  description: 'Native port of the BYAN create-excalidraw-flowchart workflow: turn gathered flowchart requirements + theme into a valid .excalidraw file via a deterministic pipeline (plan layout -> load template/library/helpers -> build bound elements -> optimize & save -> JSON-validate with a bounded retry loop -> content-validate against the checklist), returning a verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'CONTEXT', detail: 'mirror step 0/1: restate gathered requirements (type, complexity, decisions, output path)' },
    { title: 'PLAN', detail: 'mirror step 4: plan the flowchart layout (steps + decision points)' },
    { title: 'RESOURCES', detail: 'mirror step 5: load template flowchart section, library, helpers, merge theme colors' },
    { title: 'BUILD', detail: 'mirror step 6: build shapes/diamonds/circles with labels and bound arrows' },
    { title: 'SAVE', detail: 'mirror step 7: strip deleted elements and save to the output file' },
    { title: 'VALIDATE_JSON', detail: 'mirror step 8: JSON.parse the file, fix syntax, re-validate (bounded retry)' },
    { title: 'VALIDATE_CONTENT', detail: 'mirror step 9: validate against checklist.md' },
    { title: 'VERDICT', detail: 'return a structured verdict to the orchestrating skill' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — byan-lint-workflows).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly (forbidden by the linter; no import/require/fs).
//   - uses NO wall-clock and NO randomness primitive (wall-clock / RNG
//     break resume); any timestamp/id arrives via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools.
// The .excalidraw FILE is this workflow's product (written by the BUILD/SAVE
// leaves) — that is the artifact, not BYAN platform state.
//
// The interactive elicitation of the source (step 1 gather-requirements, step 2
// reuse-theme, step 3 create-theme, step 4 structure-approval, step 8 "open to
// view?") are HUMAN GATES. They stay OUT of the script: their answers arrive as
// `args`, and the final open/approve decision is returned as a verdict.
// ---------------------------------------------------------------------------

// Convergence guard for step 8's JSON-validation retry. The source prose says
// "Repeat until validation passes" (unbounded). Turn it into a real counter
// with a hard cap so the loop cannot run forever in the sandbox.
const MAX_FIX_CYCLES = 3
function jsonFixGuard({ cycles, valid, maxCycles = MAX_FIX_CYCLES }) {
  if (valid) return { done: true, abort: false, reason: 'valid-json' }
  if (cycles >= maxCycles) return { done: true, abort: true, reason: `JSON still invalid after ${maxCycles} fix attempts` }
  return { done: false, abort: false, reason: 'continue' }
}

// --- args (all gathered at the human gate by the orchestrating skill) --------
// flowType        : "Business Process" | "Algorithm/Logic" | "User Journey" | "Data Pipeline" | "Other"
// complexity      : "simple(3-5)" | "medium(6-10)" | "complex(11-20)" | "very-complex(20+)"
// decisionPoints  : "none" | "few(1-2)" | "multiple(3-5)" | "complex(6+)"
// outputFile      : absolute/relative path to the .excalidraw file to write
// theme           : a theme.json-shaped object (primaryFill/accent/decision/text) or null
const flowType = (args && args.flowType) || 'Business Process Flow'
const complexity = (args && args.complexity) || 'medium(6-10)'
const decisionPoints = (args && args.decisionPoints) || 'few(1-2)'
const outputFile = (args && args.outputFile) || '_byan-output/excalidraw-diagrams/flowchart.excalidraw'
const theme = (args && args.theme) || null

const ELEMENTS_SCHEMA = {
  type: 'object',
  required: ['shapeCount', 'arrowCount', 'hasStart', 'hasEnd'],
  properties: {
    shapeCount: { type: 'number', description: 'number of labelled shapes built (circles/rectangles/diamonds)' },
    arrowCount: { type: 'number', description: 'number of bound arrows built' },
    diamondCount: { type: 'number', description: 'number of decision diamonds (should match decisionPoints)' },
    hasStart: { type: 'boolean', description: 'true if a start circle with a label exists' },
    hasEnd: { type: 'boolean', description: 'true if an end circle with a label exists' },
    notes: { type: 'string' },
  },
}

const JSON_SCHEMA = {
  type: 'object',
  required: ['valid'],
  properties: {
    valid: { type: 'boolean', description: 'true ONLY if `node -e JSON.parse(...)` on the saved file exits 0' },
    error: { type: 'string', description: 'the parser error message + position when invalid' },
  },
}

const CHECKLIST_SCHEMA = {
  type: 'object',
  required: ['pass', 'failedItems'],
  properties: {
    pass: { type: 'boolean', description: 'true if every applicable checklist item is satisfied' },
    failedItems: { type: 'array', items: { type: 'string' }, description: 'checklist items that failed, verbatim' },
    summary: { type: 'string' },
  },
}

const SRC = '_byan/workflow/simple/excalidraw-diagrams/create-flowchart'
const SHARED = '_byan/workflow/simple/excalidraw-diagrams/_shared'

// === STEP 0 + 1 (CONTEXT) ===================================================
// Source step 0 (Contextual Analysis) + step 1 (Gather Requirements) are the
// elicitation gate; here we just restate the locked requirements that the skill
// already collected, so every downstream leaf shares one understanding.
phase('CONTEXT')
const context = await agent(
  `You are the BYAN create-flowchart workflow. Restate the LOCKED flowchart requirements as a short brief.\n` +
    `flowType=${JSON.stringify(flowType)} complexity=${JSON.stringify(complexity)} ` +
    `decisionPoints=${JSON.stringify(decisionPoints)} outputFile=${JSON.stringify(outputFile)} ` +
    `theme=${theme ? 'provided' : 'none (will default to Professional Blue palette)'}.\n` +
    `Do NOT ask questions — those were answered at the human gate. Just confirm the understanding in 2-3 lines.`,
  { label: 'read-requirements', model: 'haiku', phase: 'CONTEXT' }
)

// === STEP 4 (PLAN) ==========================================================
phase('PLAN')
const plan = await agent(
  `Mirror create-flowchart step 4 (Plan Flowchart Layout). Brief: ${context}\n` +
    `Enumerate the concrete nodes: ONE start circle, the process rectangles, exactly the decision diamonds implied ` +
    `by decisionPoints=${JSON.stringify(decisionPoints)}, and ONE end circle. List the directed edges (including the ` +
    `yes/no branches off each diamond). Keep total elements under 50 (checklist: Composition). ` +
    `Output the ordered node list and the edge list — this is the structure the user approved at the gate.`,
  { label: 'plan-layout', phase: 'PLAN' }
)

// === STEP 5 (RESOURCES) =====================================================
phase('RESOURCES')
const resources = await agent(
  `Mirror create-flowchart step 5 (Load Template and Resources). Read these real files:\n` +
    `- template: ${SHARED}/excalidraw-templates.yaml  -> extract the \`flowchart\` section\n` +
    `- library:  ${SHARED}/excalidraw-library.json\n` +
    `- helpers:  _byan/connaissance/excalidraw/excalidraw-helpers.md  (element-creation guidelines)\n` +
    `- json-validation guide: _byan/connaissance/excalidraw/validate-json-instructions.md\n` +
    `Merge the theme colors (${theme ? JSON.stringify(theme) : 'Professional Blue default: fill #e3f2fd, accent #1976d2, decision #fff3e0, text #1e1e1e'}) ` +
    `onto the template. Report which template fields the flowchart will use and the resolved color palette. ` +
    `If a file is missing, say so explicitly — do not invent its contents.`,
  { label: 'load-resources', phase: 'RESOURCES', model: 'haiku' }
)

// === STEP 6 (BUILD) =========================================================
phase('BUILD')
const elements = await agent(
  `Mirror create-flowchart step 6 (Build Flowchart Elements), following the helpers guidelines from RESOURCES.\n` +
    `Plan: ${plan}\nResolved resources/palette: ${resources}\n` +
    `Build ONE section at a time, in this order: start circle -> process rectangles -> decision diamonds -> end circle -> arrows.\n` +
    `Per shape-with-label: unique shape-id/text-id/group-id; shape and its text share the SAME groupIds; ` +
    `text width = round((text.length * fontSize * 0.6) + 20) to nearest 10; text has containerId=shape-id, ` +
    `textAlign=center, verticalAlign=middle; add boundElements on the shape referencing the text.\n` +
    `Per arrow: startBinding/endBinding with gap=10 to source/target shape ids; straight for forward flow, ` +
    `elbow (with intermediate points) for upward/backward/complex routing; update boundElements on BOTH endpoints.\n` +
    `Alignment: snap every x,y to a 20px grid; same x for vertical flow; 60px spacing between shapes.\n` +
    `Produce the in-memory Excalidraw elements array (do not write the file yet) and report the counts.`,
  { label: 'build-elements', phase: 'BUILD', schema: ELEMENTS_SCHEMA }
)

// === STEP 7 (SAVE) ==========================================================
phase('SAVE')
const saved = await agent(
  `Mirror create-flowchart step 7 (Optimize and Save). Built elements: ${JSON.stringify(elements)}.\n` +
    `Strip any element with isDeleted:true and any unused/orphan element. Wrap the array in a valid ` +
    `Excalidraw document ({ type:"excalidraw", version:2, source, elements, appState, files }). ` +
    `Write the file to ${JSON.stringify(outputFile)} (creating parent dirs as needed). ` +
    `Confirm the byte path written and the final element count (must stay under 50).`,
  { label: 'optimize-save', phase: 'SAVE' }
)

// === STEP 8 (VALIDATE_JSON) — bounded fix/re-validate loop ==================
phase('VALIDATE_JSON')
let fixCycles = 0
let jsonRes = { valid: false, error: 'not yet validated' }
let jsonGuard = { done: false, abort: false, reason: 'init' }
while (true) {
  fixCycles += 1
  jsonRes = await agent(
    `Mirror create-flowchart step 8 (Validate JSON Syntax), attempt ${fixCycles}. Save context: ${saved}\n` +
      `CRITICAL: NEVER delete the file if validation fails — always FIX it.\n` +
      `Run exactly: node -e "JSON.parse(require('fs').readFileSync('${outputFile}', 'utf8')); console.log('valid')"\n` +
      (fixCycles > 1
        ? `Previous error: ${jsonRes.error || 'unknown'}. Open the file at the error position, fix the missing comma/bracket/quote, save, then re-run the same command.\n`
        : ``) +
      `Set valid=true ONLY if that node command exits 0; otherwise valid=false and copy the parser error + position into \`error\`.`,
    { label: `validate-json-${fixCycles}`, phase: 'VALIDATE_JSON', schema: JSON_SCHEMA }
  )
  jsonGuard = jsonFixGuard({ cycles: fixCycles, valid: Boolean(jsonRes && jsonRes.valid) })
  log(`json-validate attempt ${fixCycles}: valid=${Boolean(jsonRes && jsonRes.valid)} -> ${jsonGuard.reason}`)
  if (jsonGuard.done) break
}

// === STEP 9 (VALIDATE_CONTENT) ==============================================
phase('VALIDATE_CONTENT')
let checklist = { pass: false, failedItems: ['skipped — JSON never validated'], summary: 'skipped' }
if (jsonRes.valid) {
  checklist = await agent(
    `Mirror create-flowchart step 9 (Validate Content). Validate the saved file ${JSON.stringify(outputFile)} ` +
      `against the checklist at ${SRC}/checklist.md (Element Structure, Layout/Alignment, Connections, ` +
      `Theme/Styling, Composition, Output Quality, Functional Requirements). ` +
      `Read the checklist file, evaluate EACH applicable item against the actual file content, and report pass/fail per item.`,
    { label: 'validate-content', phase: 'VALIDATE_CONTENT', schema: CHECKLIST_SCHEMA }
  )
}

// === VERDICT — DATA ONLY ====================================================
// The orchestrating skill presents this at the human gate (step 8 "Open to
// view?" / step 3 theme-approval are human decisions) and records FD/strict
// state via MCP. The script writes only the .excalidraw artifact, never state.
phase('VERDICT')
const jsonValid = Boolean(jsonRes && jsonRes.valid)
const contentPass = Boolean(checklist && checklist.pass)
return {
  workflow: 'create-excalidraw-flowchart',
  outputFile,
  requirements: { flowType, complexity, decisionPoints, themedFromArgs: Boolean(theme) },
  elements: {
    shapeCount: (elements && elements.shapeCount) || 0,
    arrowCount: (elements && elements.arrowCount) || 0,
    diamondCount: (elements && elements.diamondCount) || 0,
    hasStart: Boolean(elements && elements.hasStart),
    hasEnd: Boolean(elements && elements.hasEnd),
  },
  jsonValid,
  jsonFixCycles: fixCycles,
  maxFixCycles: MAX_FIX_CYCLES,
  jsonAbort: jsonGuard.abort,
  contentValidationPass: contentPass,
  failedChecklistItems: (checklist && checklist.failedItems) || [],
  status: jsonValid && contentPass ? 'ready-to-open' : jsonGuard.abort ? 'aborted-invalid-json' : 'needs-attention',
  summary:
    jsonValid && contentPass
      ? `Flowchart written to ${outputFile}; JSON valid and checklist passed.`
      : `Flowchart at ${outputFile} needs attention: jsonValid=${jsonValid}, contentPass=${contentPass}.`,
  needsHumanGate: true,
}
