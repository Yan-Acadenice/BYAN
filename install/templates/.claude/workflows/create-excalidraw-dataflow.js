export const meta = {
  name: 'create-excalidraw-dataflow',
  description: 'Native port of the BYAN create-excalidraw-dataflow workflow: build a Data Flow Diagram (DFD) in Excalidraw .excalidraw JSON format. Mirrors the 10 source steps (contextual analysis -> level -> requirements -> theme -> plan -> load resources -> build elements -> optimize/save -> validate JSON -> validate content) and returns a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'CONTEXT', detail: 'step 0 - contextual analysis of the DFD request' },
    { title: 'PLAN', detail: 'steps 1-4 - resolve level, requirements, theme, and plan the DFD structure' },
    { title: 'RESOURCES', detail: 'step 5 - load templates, library, theme, helpers' },
    { title: 'BUILD', detail: 'step 6 - build DFD elements per standard notation' },
    { title: 'SAVE', detail: 'step 7 - optimize, strip deleted, save the .excalidraw file' },
    { title: 'VALIDATE_JSON', detail: 'step 8 - JSON.parse validation loop (fix-and-retry, never delete)' },
    { title: 'VALIDATE_CONTENT', detail: 'step 9 - validate against checklist.md, return verdict' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT (re-asserted inline).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly (forbidden by byan-lint-workflows.js).
//   - uses NO wall-clock and NO randomness primitive (Date/RNG would
//     break resume). Any timestamp/id is passed in via `args`.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate, and it owns the elicit="true" human decisions (DFD level,
//     requirements, theme) that the source steps 1-3 prompt for.
// The .excalidraw FILE is the workflow's product, written by the BUILD/SAVE
// leaves — that is the artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Source paths (workflow.yaml). The leaf agents read these real files; the
// script never touches the filesystem itself.
const ROOT = '/home/yan/BYAN'
const INSTALLED = `${ROOT}/_byan/workflow/simple/excalidraw-diagrams/create-dataflow`
const SHARED = `${ROOT}/_byan/workflow/simple/excalidraw-diagrams/_shared`
const HELPERS = `${ROOT}/_byan/connaissance/excalidraw/excalidraw-helpers.md`
const JSON_VALIDATION = `${ROOT}/_byan/connaissance/excalidraw/validate-json-instructions.md`
const TEMPLATES = `${SHARED}/excalidraw-templates.yaml`
const LIBRARY = `${SHARED}/excalidraw-library.json`
const CHECKLIST = `${INSTALLED}/checklist.md`

// Human-elicited inputs (source steps 1-3). Defaults keep the engine runnable
// when the orchestrating skill has not yet resolved the gate; the skill should
// pass these in args once the user has answered.
const level = (args && args.level) || 'unspecified (resolve at human gate: context/level-0/level-1/level-2/custom)'
const requirements = (args && args.requirements) || 'unspecified (resolve at human gate: processes, data stores, external entities)'
const theme = (args && args.theme) || 'Standard DFD (process #e3f2fd, data store #e8f5e9, external entity #f3e5f5, border #1976d2)'
// Timestamp MUST come from args (no Date in the sandbox). Source default_output_file
// is dataflow-{timestamp}.excalidraw under {output_folder}/excalidraw-diagrams/.
const stamp = (args && args.timestamp) || 'TIMESTAMP'
const outputFile = (args && args.outputFile) ||
  `${ROOT}/_byan-output/excalidraw-diagrams/dataflow-${stamp}.excalidraw`

// JSON validation convergence guard (source step 8: re-run until pass, NEVER
// delete the file). Bounded retry cap so the script cannot loop forever.
const MAX_FIX_ATTEMPTS = 3

const PLAN_SCHEMA = {
  type: 'object',
  required: ['processes', 'dataStores', 'externalEntities', 'dataFlows'],
  properties: {
    processes: { type: 'array', items: { type: 'string' }, description: 'numbered processes (1.0, 2.0, ...), verb phrases' },
    dataStores: { type: 'array', items: { type: 'string' }, description: 'named data stores (D1, D2, ...), noun phrases' },
    externalEntities: { type: 'array', items: { type: 'string' }, description: 'named external entities, noun phrases' },
    dataFlows: { type: 'array', items: { type: 'string' }, description: 'labeled flows, source -> target with data name' },
    notes: { type: 'string', description: 'layout / level notes' },
  },
}

const JSON_VALIDATION_SCHEMA = {
  type: 'object',
  required: ['valid'],
  properties: {
    valid: { type: 'boolean', description: 'true ONLY if JSON.parse of the saved .excalidraw file succeeds' },
    error: { type: 'string', description: 'parser error message and position when invalid' },
  },
}

const CONTENT_SCHEMA = {
  type: 'object',
  required: ['pass', 'failedItems'],
  properties: {
    pass: { type: 'boolean', description: 'true only if every checklist.md item is satisfied' },
    failedItems: { type: 'array', items: { type: 'string' }, description: 'checklist items not satisfied' },
    summary: { type: 'string', description: 'one-line content-validation status' },
  },
}

// --- Step 0: Contextual Analysis -------------------------------------------
phase('CONTEXT')
const context = await agent(
  `You are the create-excalidraw-dataflow workflow (BMad). Read the source spec at ` +
    `${INSTALLED}/instructions.md and ${INSTALLED}/workflow.yaml.\n` +
    `STEP 0 (Contextual Analysis): from the request, extract what is already known about the DFD: ` +
    `level, processes, data stores, external entities, data flows. ` +
    `Request level=${JSON.stringify(level)}; requirements=${JSON.stringify(requirements)}. ` +
    `Report which of (level, processes, data stores, external entities) are clear and which are missing. ` +
    `Per the source, if ALL requirements are clear we may skip directly to structure planning.`,
  { label: 'context-scan', model: 'haiku', phase: 'CONTEXT' }
)

// --- Steps 1-4: Level, Requirements, Theme, Plan structure -----------------
// Source steps 1-3 are elicit="true" (human input). The orchestrating skill
// owns those decisions and passes the answers via args; here we consolidate
// the resolved inputs and produce the concrete DFD structure (step 4).
phase('PLAN')
const plan = await agent(
  `STEP 1-4 of create-excalidraw-dataflow. Context analysis: ${context}\n` +
    `Resolved human inputs (source steps 1-3 elicit): level=${JSON.stringify(level)}; ` +
    `requirements=${JSON.stringify(requirements)}; theme=${JSON.stringify(theme)}.\n` +
    `STEP 4 (Plan DFD Structure): produce the concrete plan. ` +
    `List processes numbered 1.0/2.0..., data stores D1/D2..., external entities, and every data flow ` +
    `(source -> target, labeled with the data name). Respect DFD rules: no direct flow between two external ` +
    `entities, no direct flow between two data stores. Match the chosen DFD level. ` +
    `Read ${HELPERS} for standard DFD notation if needed.`,
  { label: 'plan-structure', phase: 'PLAN', schema: PLAN_SCHEMA }
)

// --- Step 5: Load Resources -------------------------------------------------
phase('RESOURCES')
const resources = await agent(
  `STEP 5 (Load Resources) of create-excalidraw-dataflow. ` +
    `Load and summarize the materials needed to build the diagram:\n` +
    `- templates: ${TEMPLATES} (extract the \`dataflow\` section)\n` +
    `- library: ${LIBRARY}\n` +
    `- theme: ${JSON.stringify(theme)} (use existing theme.json if present, else this scheme)\n` +
    `- helpers: ${HELPERS} (standard DFD notation + Excalidraw element shapes)\n` +
    `Report the element templates (process ellipse, data-store rectangle/parallel-lines, external-entity ` +
    `rectangle, labeled-arrow) and the color/stroke values you will apply. Plan structure: ${JSON.stringify(plan)}`,
  { label: 'load-resources', phase: 'RESOURCES', model: 'haiku' }
)

// --- Step 6: Build DFD Elements --------------------------------------------
phase('BUILD')
const built = await agent(
  `STEP 6 (Build DFD Elements) of create-excalidraw-dataflow. Resources: ${resources}\n` +
    `Build the full Excalidraw element set following standard DFD notation, in this build order: ` +
    `(1) external entities as rectangles with bold border; (2) processes as circles/ellipses carrying their ` +
    `number (1.0, 2.0, verb phrases); (3) data stores as parallel lines or rectangles (D1, D2, noun phrases); ` +
    `(4) data flows as labeled arrows showing direction. ` +
    `Layout: external entities at the edges, processes in the center, data stores between processes, ` +
    `minimize crossing flows, left-to-right or top-to-bottom. ` +
    `Apply the theme colors. Bind arrows to their endpoints and group related elements. ` +
    `Produce a complete Excalidraw scene object (type "excalidraw", version, source, elements[], appState, files{}).`,
  { label: 'build-elements', phase: 'BUILD' }
)

// --- Step 7: Optimize and Save ---------------------------------------------
phase('SAVE')
const saved = await agent(
  `STEP 7 (Optimize and Save) of create-excalidraw-dataflow. Built scene: ${built}\n` +
    `Verify DFD-rule compliance (numbered processes, labeled flows, no entity->entity or store->store direct flow). ` +
    `Strip unused elements and any element with isDeleted: true. ` +
    `Write the final .excalidraw JSON to: ${outputFile}. Confirm the file was written.`,
  { label: 'optimize-save', phase: 'SAVE' }
)

// --- Step 8: Validate JSON Syntax (bounded fix-and-retry, never delete) -----
phase('VALIDATE_JSON')
let jsonCheck = { valid: false, error: 'not yet validated' }
let fixAttempts = 0
while (true) {
  jsonCheck = await agent(
    `STEP 8 (Validate JSON Syntax) of create-excalidraw-dataflow. Attempt ${fixAttempts + 1}/${MAX_FIX_ATTEMPTS + 1}.\n` +
      `Validate the saved file with: node -e "JSON.parse(require('fs').readFileSync('${outputFile}','utf8')); console.log('valid')". ` +
      `Guidance: ${JSON_VALIDATION}. ` +
      `CRITICAL: NEVER delete the file on failure. If JSON.parse fails, read the error position, open the file, ` +
      `fix the exact syntax error (missing comma/bracket/quote), save, and report valid=false with the error. ` +
      `If it parses, report valid=true. Save context: ${saved}`,
    { label: `validate-json-${fixAttempts + 1}`, phase: 'VALIDATE_JSON', schema: JSON_VALIDATION_SCHEMA }
  )
  log(`json validation attempt ${fixAttempts + 1}: valid=${Boolean(jsonCheck && jsonCheck.valid)}`)
  if (jsonCheck && jsonCheck.valid) break
  fixAttempts += 1
  if (fixAttempts > MAX_FIX_ATTEMPTS) break
}

// --- Step 9: Validate Content (against checklist.md) ------------------------
phase('VALIDATE_CONTENT')
const contentCheck = await agent(
  `STEP 9 (Validate Content) of create-excalidraw-dataflow. ` +
    `JSON valid=${Boolean(jsonCheck && jsonCheck.valid)}. ` +
    `Validate the saved diagram (${outputFile}) against EVERY item in the checklist at ${CHECKLIST}: ` +
    `DFD notation (process ellipses, data-store parallel-lines/rectangles, external-entity rectangles, labeled ` +
    `arrows), structure (numbered processes, labeled flows, named stores/entities), completeness (all I/O accounted, ` +
    `no orphaned processes, data conservation, level appropriate), layout (logical direction, minimal crossings, ` +
    `balanced, grid-aligned), and technical quality (grouped, bound arrows, readable text, no isDeleted:true, valid JSON, ` +
    `saved to correct location). List any item not satisfied.`,
  { label: 'validate-content', phase: 'VALIDATE_CONTENT', schema: CONTENT_SCHEMA }
)

// Return DATA only. The orchestrating skill presents this verdict at the human
// gate and records FD/strict state via MCP.
const jsonValid = Boolean(jsonCheck && jsonCheck.valid)
const contentPass = Boolean(contentCheck && contentCheck.pass)
return {
  workflow: 'create-excalidraw-dataflow',
  summary: jsonValid && contentPass
    ? 'DFD built, saved, JSON-valid, and checklist-compliant'
    : 'DFD produced but validation incomplete - see jsonValid/contentCheck',
  outputFile,
  level,
  steps: 10,
  plan,
  jsonValid,
  jsonFixAttempts: fixAttempts,
  maxFixAttempts: MAX_FIX_ATTEMPTS,
  contentPass,
  failedChecklistItems: (contentCheck && contentCheck.failedItems) || [],
  needsHumanGate: true,
  result: contentCheck,
}
