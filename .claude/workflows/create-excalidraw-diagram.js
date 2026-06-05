export const meta = {
  name: 'create-excalidraw-diagram',
  description: 'Native port of the BYAN create-diagram (excalidraw) pipeline workflow: turn a confirmed diagram spec (type, components, relationships, notation, theme) into a valid .excalidraw file via plan -> load-resources -> build elements -> optimize/save -> validate-JSON (bounded fix loop) -> validate-content. Elicitation gates (steps 1-4: diagram type, requirements, theme choice) stay OUTSIDE the script and arrive via args; the script returns a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'ANALYZE', detail: 'source step 0 - extract diagram type, components, relationships, notation from the confirmed spec' },
    { title: 'PLAN', detail: 'source step 5 - list components/entities, map relationships, lay out the structure' },
    { title: 'LOAD-RESOURCES', detail: 'source step 6 - load excalidraw templates/library/helpers and merge the chosen theme' },
    { title: 'BUILD', detail: 'source step 7 - build shapes+labels (groupIds/containerId) and connections (start/endBinding) in the per-type build order on a 20px grid' },
    { title: 'SAVE', detail: 'source step 8 - strip appState/files/isDeleted elements and write the .excalidraw file' },
    { title: 'VALIDATE-JSON', detail: 'source step 9 - JSON.parse the saved file, fix syntax errors in place, re-validate up to a hard cap (NEVER delete the file)' },
    { title: 'VALIDATE-CONTENT', detail: 'source step 10 - validate the diagram against the create-diagram checklist.md' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — byan-lint-workflows).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly  (enforced by byan-lint-workflows.js).
//   - uses NO wall-clock and NO randomness primitive (wall-clock/RNG/
//     crypto) — those break resume; any timestamp/id is passed via args.
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate, and it owns the human decisions (steps 1-4 elicitation:
//     diagram type, requirements, notation, theme choice).
// The .excalidraw FILE is the workflow's product, written by the SAVE leaf —
// that is the artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Bounded JSON-fix loop guard — mirrors source step 9 ("repeat until validation
// passes") but with a HARD cap so the sandbox cannot loop forever. The sandbox
// forbids unbounded loops; this turns the prose rule into a real integer cap.
const MAX_JSON_FIX_CYCLES = 5

// Spec arrives pre-confirmed from the human gate (source steps 0-4). The script
// never elicits; it consumes what the orchestrating skill collected.
const diagramType = (args && args.diagramType) || 'system architecture'
const spec = (args && args.spec) || 'components, relationships and notation as described by the user'
const notation = (args && args.notation) || 'Standard'
const theme = (args && args.theme) || 'Professional (Component #e3f2fd / Database #e8f5e9 / Service #fff3e0 / Border #1976d2)'
// Timestamp/output path are passed in (no wall-clock in the sandbox).
const outputFile =
  (args && args.outputFile) ||
  `_byan-output/excalidraw-diagrams/diagram-${(args && args.timestamp) || 'GATE-TIMESTAMP'}.excalidraw`

const helpers = '_byan/connaissance/excalidraw/excalidraw-helpers.md'
const jsonValidation = '_byan/connaissance/excalidraw/validate-json-instructions.md'
const templates = '_byan/workflow/simple/excalidraw-diagrams/_shared/excalidraw-templates.yaml'
const library = '_byan/workflow/simple/excalidraw-diagrams/_shared/excalidraw-library.json'
const checklist = '_byan/workflow/simple/excalidraw-diagrams/create-diagram/checklist.md'

// --- Source step 0: Contextual Analysis ------------------------------------
phase('ANALYZE')
const analysis = await agent(
  `You are the create-excalidraw-diagram engine (BMad excalidraw pipeline), executing step 0 "Contextual Analysis".\n` +
    `The diagram spec is ALREADY confirmed by the user at the human gate — do NOT re-ask anything.\n` +
    `Diagram type: ${JSON.stringify(diagramType)}\n` +
    `Spec (components/entities + relationships): ${JSON.stringify(spec)}\n` +
    `Notation standard: ${JSON.stringify(notation)}\n` +
    `From this, extract and report a normalized structured intent: the resolved diagram type, the exhaustive list of ` +
    `components/entities, the exhaustive list of relationships (with direction), and the notation rules that apply ` +
    `for that type. If the spec is contradictory or missing a relationship endpoint, flag it explicitly (do not invent).`,
  { label: 'parse-spec-intent', model: 'haiku', phase: 'ANALYZE' }
)

// --- Source step 5: Plan Diagram Structure ---------------------------------
phase('PLAN')
const plan = await agent(
  `Step 5 "Plan Diagram Structure". Confirmed intent:\n${analysis}\n\n` +
    `List ALL components/entities and map ALL relationships. Produce a concrete planned layout for a ${JSON.stringify(diagramType)}: ` +
    `assign each element an (x,y) snapped to a 20px grid, keep 40px spacing between components and 60px between sections, ` +
    `and pick the build order appropriate to the type (Architecture: Services -> Databases -> Connections -> Labels; ` +
    `ERD: Entities -> Attributes -> Relationships -> Cardinality; UML Class: Classes -> Attributes -> Methods -> Relationships; ` +
    `UML Sequence: Actors -> Lifelines -> Messages -> Returns; UML Use Case: Actors -> Use Cases -> Relationships). ` +
    `Report the layout and the chosen build order. Do NOT draw yet.`,
  { label: 'plan-structure', phase: 'PLAN' }
)

// --- Source step 6: Load Resources -----------------------------------------
phase('LOAD-RESOURCES')
const resources = await agent(
  `Step 6 "Load Resources". Read these files and report what you will reuse:\n` +
    `- templates: ${templates} (extract the \`diagram\` section)\n` +
    `- library: ${library}\n` +
    `- helpers (element-creation guidelines): ${helpers}\n` +
    `Merge the chosen theme into the template. Theme = ${JSON.stringify(theme)}.\n` +
    `Report the resolved template skeleton, the available library items, and the merged theme color map ` +
    `(component fill, database fill, service fill, border/accent stroke, text stroke #1e1e1e, arrow stroke).`,
  { label: 'load-resources', phase: 'LOAD-RESOURCES', model: 'haiku' }
)

// --- Source step 7: Build Diagram Elements ---------------------------------
phase('BUILD')
const built = await agent(
  `Step 7 "Build Diagram Elements". CRITICAL: follow the helpers (${helpers}) exactly.\n` +
    `Planned layout & build order:\n${plan}\n\nResources & merged theme:\n${resources}\n\n` +
    `For EACH component: generate unique shape-id/text-id/group-id; create the shape with groupIds and ` +
    `boundElements; compute text width = (text.length * fontSize * 0.6) + 20 rounded to 10; create the text with ` +
    `containerId=shape-id, the SAME groupIds, textAlign=center, verticalAlign=middle. For EACH connection: choose ` +
    `straight (forward flow) or elbow (upward/backward/complex) arrow, set startBinding and endBinding, and update ` +
    `boundElements on BOTH connected shapes. Follow the build order from the plan, snap every (x,y) to the 20px grid, ` +
    `apply theme colors consistently, and keep IDs unique. Report the full in-memory excalidraw element array.`,
  { label: 'build-elements', phase: 'BUILD' }
)

// --- Source step 8: Optimize and Save --------------------------------------
phase('SAVE')
const saved = await agent(
  `Step 8 "Optimize and Save". Element array:\n${built}\n\n` +
    `Strip from the final output: the appState object, the files object (unless images are used), every element with ` +
    `isDeleted:true, unused library items, and any version history. Then WRITE the optimized excalidraw document to ` +
    `${JSON.stringify(outputFile)} (type "excalidraw", a valid version/source header, and the elements array). ` +
    `Report the saved path and the final element count.`,
  { label: 'optimize-save', phase: 'SAVE' }
)

// --- Source step 9: Validate JSON Syntax (bounded fix loop) -----------------
phase('VALIDATE-JSON')
const JSON_SCHEMA = {
  type: 'object',
  required: ['valid'],
  properties: {
    valid: { type: 'boolean', description: 'true ONLY if node -e JSON.parse on the saved file exits 0' },
    error: { type: 'string', description: 'the syntax error message + position when not valid' },
    fixed: { type: 'boolean', description: 'true if a syntax error was found and fixed this pass' },
  },
}
let jsonCycles = 0
let jsonResult = { valid: false, error: 'not started' }
while (true) {
  jsonCycles += 1
  jsonResult = await agent(
    `Step 9 "Validate JSON Syntax", pass ${jsonCycles}. CRITICAL: NEVER delete the file if validation fails — fix it.\n` +
      `Follow ${jsonValidation}. Run exactly:\n` +
      `  node -e "JSON.parse(require('fs').readFileSync('${outputFile}', 'utf8')); console.log('valid')"\n` +
      `If it exits 0, set valid=true. If it exits 1, read the error message/position, open ${JSON.stringify(outputFile)} at ` +
      `that location, fix the single syntax error indicated (missing/extra comma, bracket, brace or quote), SAVE, set ` +
      `fixed=true and valid=false, and report the error. Do not re-run here; the loop re-invokes you.`,
    { label: `validate-json-${jsonCycles}`, phase: 'VALIDATE-JSON', schema: JSON_SCHEMA }
  )
  log(`json pass ${jsonCycles}: valid=${Boolean(jsonResult && jsonResult.valid)}`)
  if (jsonResult && jsonResult.valid) break
  if (jsonCycles >= MAX_JSON_FIX_CYCLES) break
}

// --- Source step 10: Validate Content (checklist) --------------------------
phase('VALIDATE-CONTENT')
const CONTENT_SCHEMA = {
  type: 'object',
  required: ['pass'],
  properties: {
    pass: { type: 'boolean', description: 'true only if every checklist item is satisfied' },
    failedItems: { type: 'array', items: { type: 'string' }, description: 'checklist items that are not satisfied' },
    elementCount: { type: 'integer', description: 'final element count (must be under 80)' },
    notes: { type: 'string' },
  },
}
const content = await agent(
  `Step 10 "Validate Content". Validate the saved diagram ${JSON.stringify(outputFile)} against the checklist at ${checklist}.\n` +
    `Check element structure (matching groupIds, containerId on text, text width, alignment), layout (20px grid, 40/60px ` +
    `spacing, no overlaps), connections (start/endBinding on every arrow, boundElements updated, clear relationship types), ` +
    `notation/standards for ${JSON.stringify(diagramType)} (${JSON.stringify(notation)}), theme consistency, and output ` +
    `quality (element count under 80, no isDeleted elements, valid JSON, correct save location). ` +
    `Set pass=true only if EVERY item holds; otherwise list the failed items precisely.`,
  { label: 'validate-content', phase: 'VALIDATE-CONTENT', schema: CONTENT_SCHEMA }
)

// Return DATA only. The orchestrating skill presents this at the human gate
// ("Diagram created ... Open to view?") and records FD/strict state via MCP.
return {
  workflow: 'create-excalidraw-diagram',
  diagramType,
  notation,
  theme,
  outputFile,
  jsonValid: Boolean(jsonResult && jsonResult.valid),
  jsonFixCycles: jsonCycles,
  maxJsonFixCycles: MAX_JSON_FIX_CYCLES,
  contentPass: Boolean(content && content.pass),
  failedChecklistItems: (content && content.failedItems) || [],
  elementCount: content && content.elementCount,
  steps: 7,
  needsHumanGate: true,
  result: { analysis, plan, resources, built, saved, json: jsonResult, content },
}
