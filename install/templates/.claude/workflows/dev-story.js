export const meta = {
  name: 'dev-story',
  description: 'Native port of the BYAN dev-story workflow: implement a story task-by-task via a red-green-refactor loop, run to green (or hard-abort at the 3-cycle convergence cap), and return a structured verdict for the orchestrating skill to present at the human gate.',
  phases: [
    { title: 'LOAD', detail: 'load the story + first incomplete task' },
    { title: 'RGR', detail: 'red-green-refactor loop until green or the 3-cycle cap' },
    { title: 'VERDICT', detail: 'return a structured verdict to the orchestrating skill' },
  ],
}

// ---------------------------------------------------------------------------
// FD / STRICT STATE CONTRACT  (re-asserted inline — enforcement-bridge F3).
//
// The in-CLI Workflow tool runs this script OUTSIDE the conversation turn, so
// BYAN's main-thread hooks (fd-phase-guard, strict-scope-guard, strict-stop-
// guard, mantra-validate) DO NOT fire here. This script therefore:
//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes
//     fd-state.json directly  (enforced by byan-lint-workflows.js).
//   - returns DATA only. The orchestrating skill (.claude/skills/
//     byan-native-dev-story) is the human-gated conductor; IT records FD/strict
//     state via the byan_fd_* / byan_strict_* MCP tools AT the gate.
// The story FILE (Status, Tasks/Subtasks, Dev Agent Record, File List, Change
// Log) is the workflow's product, written by the implement leaf — that is the
// artifact, not BYAN platform state.
// ---------------------------------------------------------------------------

// Convergence guard — mirror of _byan/mcp/byan-mcp-server/lib/native-loop.js.
// The sandbox forbids import, so the tiny guard is inlined verbatim; the lib
// copy is the unit-tested reference (test/native-loop.test.js). Keep in sync.
// This turns dev-story's prose rule ("3 consecutive failures -> HALT") into a
// real JS counter the model cannot silently overrun.
const MAX_CYCLES = 3
function convergenceGuard({ cycles, green, maxCycles = MAX_CYCLES }) {
  if (green) return { done: true, abort: false, reason: 'green' }
  if (cycles >= maxCycles) return { done: true, abort: true, reason: `no convergence after ${maxCycles} cycles` }
  return { done: false, abort: false, reason: 'continue' }
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['green', 'blocking'],
  properties: {
    green: { type: 'boolean', description: 'true ONLY if the full test suite passes and the current task acceptance criteria are met' },
    blocking: { type: 'array', items: { type: 'string' }, description: 'blocking issues when not green' },
    summary: { type: 'string', description: 'one-line status' },
  },
}

const story = (args && args.story) || 'next ready-for-dev story'

phase('LOAD')
const loaded = await agent(
  `You are dev-story (BYAN dev agent). Target story: ${JSON.stringify(story)}.\n` +
    `Read the COMPLETE story file. Parse Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, File List, Status. ` +
    `Identify the FIRST incomplete task (unchecked [ ]). Report the story key and that task. ` +
    `If no story is found or the file is inaccessible, say so explicitly (do not invent one).`,
  { label: 'load-story', phase: 'LOAD', model: 'haiku' }
)

phase('RGR')
// Red-green-refactor loop with a real convergence counter (max 3 cycles).
let cycles = 0
let last = { green: false, blocking: ['not started'] }
let guard = { done: false, abort: false, reason: 'init' }
while (true) {
  cycles += 1
  const impl = await agent(
    `dev-story red-green-refactor, cycle ${cycles}, story ${JSON.stringify(story)}.\n` +
      `Load context: ${loaded}\n` +
      `On the first incomplete task: (RED) write FAILING tests first and confirm they fail; ` +
      `(GREEN) implement the MINIMAL code to pass; (REFACTOR) improve structure while keeping tests green. ` +
      `Modify ONLY the permitted story-file sections (Tasks/Subtasks checkboxes, Dev Agent Record, File List, Change Log, Status). ` +
      `Do NOT mark a task [x] unless its tests actually pass. Then stop and report what you did.`,
    { label: `rgr-cycle-${cycles}`, phase: 'RGR' }
  )
  last = await agent(
    `Run the project's full test suite for story ${JSON.stringify(story)} (infer the test command from the repo). ` +
      `Cycle ${cycles}. Implementation notes: ${impl}\n` +
      `Set green=true ONLY if all tests pass with zero regressions AND the current task's acceptance criteria are met. ` +
      `Otherwise green=false and list the blocking issues precisely.`,
    { label: `verify-cycle-${cycles}`, phase: 'RGR', schema: VERIFY_SCHEMA }
  )
  guard = convergenceGuard({ cycles, green: Boolean(last && last.green) })
  log(`cycle ${cycles}: green=${Boolean(last && last.green)} -> ${guard.reason}`)
  if (guard.done) break
}

phase('VERDICT')
// Return DATA only. The skill presents this at the human gate and records state.
return {
  workflow: 'dev-story',
  story,
  status: last.green ? 'review-ready' : guard.abort ? 'aborted-no-convergence' : 'in-progress',
  green: Boolean(last.green),
  cycles,
  maxCycles: MAX_CYCLES,
  blocking: (last && last.blocking) || [],
  reason: guard.reason,
  needsHumanGate: true,
}
