export const meta = {
  name: 'create-excalidraw-wireframe',
  description: 'Native port of the BYAN create-excalidraw-wireframe workflow: plan a website/app wireframe, load Excalidraw resources, build elements per screen at the requested fidelity, optimize and save the .excalidraw file, then validate JSON syntax (bounded fix loop) and content against the checklist. Returns a structured verdict; the elicitation steps (type, requirements, theme) stay at the human gate.',
  phases: [
    { title: 'CONTEXT', detail: 'step 0 - extract type, fidelity, screen count, device, save location from the request' },
    { title: 'PLAN', detail: 'step 5 - list screens, map navigation flow, identify key UI elements' },
    { title: 'LOAD', detail: 'step 6 - load templates(wireframe), library, theme.json, helpers' },
    { title: 'BUILD', detail: 'step 7 - build wireframe elements per screen in the prescribed build order at the chosen fidelity' },
    { title: 'SAVE', detail: 'step 8 - strip unused/isDeleted elements and save to the output file' },
    { title: 'VALIDATE_JSON', detail: 'step 9 - JSON.parse the file; on failure fix syntax and re-check (bounded loop)' },
    { title: 'VALIDATE_CONTENT', detail: 'step 10 - validate against checklist.md' },
    { title: 'VERDICT', detail: 'return a structured verdict to the orchestrating skill' },
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
//   - uses NO wall-clock and NO randomness primitive (a fixed timestamp/id is
//     passed in via args so resume stays deterministic).
//   - returns DATA only. The orchestrating skill is the human-gated conductor;
//     IT records FD/strict state via the byan_fd_* / byan_strict_* MCP tools
//     AT the gate, and owns the four elicit="true" steps (1: wireframe type,
//     2: requirements, 3: check theme, 4: create theme) — those are human
//     decisions and are intentionally kept OUT of this autonomous engine.
// The .excalidraw FILE is the workflow's product, written by the SAVE leaf —
// that is the artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Source paths (workflow.yaml) — passed to the agents so they read the REAL
// resources rather than inventing schema/colors.
const SRC = {
  helpers: '_byan/connaissance/excalidraw/excalidraw-helpers.md',
  jsonValidation: '_byan/connaissance/excalidraw/validate-json-instructions.md',
  templates: '_byan/workflow/simple/excalidraw-diagrams/_shared/excalidraw-templates.yaml',
  library: '_byan/workflow/simple/excalidraw-diagrams/_shared/excalidraw-library.json',
  checklist: '_byan/workflow/simple/excalidraw-diagrams/create-wireframe/checklist.md',
}

// Inputs come from the human-gated elicitation steps (1-4), threaded in via args.
// Defaults keep the engine runnable; the skill overrides them at the gate.
const wireframeType = (args && args.wireframeType) || 'Web App (Responsive)'
const fidelity = (args && args.fidelity) || 'Medium'
const screenCount = (args && args.screenCount) || 'Few (2-3)'
const device = (args && args.device) || 'standard responsive dimensions'
const theme = (args && args.theme) || 'Classic Wireframe (white bg / light-gray container / gray border / dark-gray text)'
// timestamp/id MUST be supplied (no clock/RNG in the sandbox).
const timestamp = (args && args.timestamp) || 'TIMESTAMP'
const outputFile = (args && args.outputFile) || `_byan-output/excalidraw-diagrams/wireframe-${timestamp}.excalidraw`

// JSON-validation convergence guard (step 9). Mirrors the prose rule
// "Repeat until validation passes" with a real integer cap so the model
// cannot loop forever. NEVER delete the file on failure — always fix syntax.
const MAX_FIX_PASSES = 3

const VALIDATE_JSON_SCHEMA = {
  type: 'object',
  required: ['valid'],
  properties: {
    valid: { type: 'boolean', description: 'true ONLY if JSON.parse on the saved file succeeded' },
    error: { type: 'string', description: 'the parser error and position when not valid' },
    fixed: { type: 'boolean', description: 'true if a syntax fix was applied this pass' },
  },
}

const CHECKLIST_SCHEMA = {
  type: 'object',
  required: ['pass', 'failedItems'],
  properties: {
    pass: { type: 'boolean', description: 'true only if every checklist item is satisfied' },
    failedItems: { type: 'array', items: { type: 'string' }, description: 'checklist items not satisfied' },
    notes: { type: 'string' },
  },
}

// --- STEP 0: Contextual Analysis -------------------------------------------
phase('CONTEXT')
const context = await agent(
  `You are create-excalidraw-wireframe (step 0, Contextual Analysis).\n` +
    `Locked inputs from the human gate: type=${JSON.stringify(wireframeType)}, ` +
    `fidelity=${JSON.stringify(fidelity)}, screenCount=${JSON.stringify(screenCount)}, ` +
    `device=${JSON.stringify(device)}, theme=${JSON.stringify(theme)}, output=${JSON.stringify(outputFile)}.\n` +
    `Restate these requirements cleanly and flag any that are still ambiguous (do NOT ask the user — ` +
    `this engine runs headless; surface ambiguity as a note for the gate).`,
  { label: 'read-context', model: 'haiku', phase: 'CONTEXT' }
)

// --- STEP 5: Plan Wireframe Structure --------------------------------------
phase('PLAN')
const plan = await agent(
  `Step 5 (Plan Wireframe Structure). Context: ${context}\n` +
    `List every screen and its purpose, map the navigation flow between screens, and identify the key UI ` +
    `elements per screen. Honor screenCount=${JSON.stringify(screenCount)} and device=${JSON.stringify(device)}. ` +
    `Output the planned structure as a clear screen-by-screen outline.`,
  { label: 'plan', phase: 'PLAN' }
)

// --- STEP 6: Load Resources ------------------------------------------------
phase('LOAD')
const resources = await agent(
  `Step 6 (Load Resources). Read these REAL files and extract what is needed:\n` +
    `- templates: ${SRC.templates} (extract the \`wireframe\` section)\n` +
    `- library: ${SRC.library}\n` +
    `- helpers: ${SRC.helpers} (the authoritative element-creation rules)\n` +
    `- the chosen theme: ${JSON.stringify(theme)} (use a theme.json if one exists).\n` +
    `Summarize the wireframe template primitives, the relevant library elements, the theme color tokens, ` +
    `and the element-creation constraints from helpers (grid 20px, containerId on text, grouping).`,
  { label: 'load-resources', phase: 'LOAD', model: 'haiku' }
)

// --- STEP 7: Build Wireframe Elements --------------------------------------
phase('BUILD')
const build = await agent(
  `Step 7 (Build Wireframe Elements). Follow ${SRC.helpers} strictly for element creation.\n` +
    `Plan: ${plan}\nResources: ${resources}\n` +
    `For EACH screen create: container/frame, header section, content areas, navigation elements, ` +
    `interactive elements (buttons, inputs), labels and annotations.\n` +
    `Respect this BUILD ORDER: (1) screen containers, (2) layout sections header/content/footer, ` +
    `(3) navigation elements, (4) content blocks, (5) interactive elements, (6) labels/annotations, ` +
    `(7) flow indicators if multi-screen.\n` +
    `Apply fidelity=${JSON.stringify(fidelity)} — Low: basic shapes, minimal detail, placeholder text; ` +
    `Medium: more defined elements, some styling, representative content; ` +
    `High: detailed elements, realistic sizing, actual content examples.\n` +
    `Produce the full Excalidraw element set (valid scene JSON) for all screens.`,
  { label: 'build', phase: 'BUILD' }
)

// --- STEP 8: Optimize and Save ---------------------------------------------
phase('SAVE')
const saved = await agent(
  `Step 8 (Optimize and Save). Built scene: ${build}\n` +
    `Strip unused elements and any element with isDeleted:true. Then save the cleaned Excalidraw scene ` +
    `to ${JSON.stringify(outputFile)} (create parent directories as needed). Report the saved path.`,
  { label: 'save', phase: 'SAVE' }
)

// --- STEP 9: Validate JSON Syntax (bounded fix loop) -----------------------
phase('VALIDATE_JSON')
let jsonPass = 0
let jsonResult = { valid: false, error: 'not started' }
while (true) {
  jsonPass += 1
  jsonResult = await agent(
    `Step 9 (Validate JSON Syntax), pass ${jsonPass}/${MAX_FIX_PASSES}. Saved file: ${saved}\n` +
      `Run: node -e "JSON.parse(require('fs').readFileSync('${outputFile}', 'utf8')); console.log('Valid JSON')".\n` +
      `Follow ${SRC.jsonValidation} for the validation procedure. ` +
      `CRITICAL: NEVER delete the file if validation fails — read the parser error (it shows the syntax ` +
      `error and position), open the file at that location, fix the missing comma/bracket/quote, save, ` +
      `and report. Set valid=true only when JSON.parse succeeds.`,
    { label: `validate-json-${jsonPass}`, phase: 'VALIDATE_JSON', schema: VALIDATE_JSON_SCHEMA }
  )
  log(`json pass ${jsonPass}: valid=${Boolean(jsonResult && jsonResult.valid)}`)
  if (jsonResult && jsonResult.valid) break
  if (jsonPass >= MAX_FIX_PASSES) break
}

// --- STEP 10: Validate Content (against checklist) -------------------------
phase('VALIDATE_CONTENT')
const checklist = await agent(
  `Step 10 (Validate Content). Validate the saved wireframe ${JSON.stringify(outputFile)} against the ` +
    `REAL checklist at ${SRC.checklist}. Check layout structure (device-appropriate dimensions, 20px grid ` +
    `alignment, consistent spacing, header/content/footer hierarchy), UI elements (interactive elements ` +
    `marked, controls sized, readable labels, navigation indicated), fidelity match (${JSON.stringify(fidelity)}), ` +
    `annotations (interactions, flow indicators if multi-screen, notes, element purposes), and technical ` +
    `quality (grouping, text containerId, grid snapping, no isDeleted:true, valid JSON, correct save path). ` +
    `Report pass=true only if every item is satisfied; otherwise list the failed items.`,
  { label: 'validate-content', phase: 'VALIDATE_CONTENT', schema: CHECKLIST_SCHEMA }
)

// --- VERDICT: data only, gate is owned by the orchestrating skill ----------
phase('VERDICT')
const jsonValid = Boolean(jsonResult && jsonResult.valid)
const contentPass = Boolean(checklist && checklist.pass)
return {
  workflow: 'create-excalidraw-wireframe',
  summary: `Wireframe (${wireframeType}, ${fidelity} fidelity, ${screenCount}) built and saved to ${outputFile}.`,
  inputs: { wireframeType, fidelity, screenCount, device, theme, outputFile },
  steps: 7,
  outputFile,
  jsonValid,
  jsonFixPasses: jsonPass,
  maxJsonFixPasses: MAX_FIX_PASSES,
  contentPass,
  failedChecklistItems: (checklist && checklist.failedItems) || [],
  status: jsonValid && contentPass ? 'ready-for-review' : jsonValid ? 'content-gaps' : 'invalid-json',
  needsHumanGate: true,
}
