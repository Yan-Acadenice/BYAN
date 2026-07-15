export const meta = {
  name: 'intelligent-dispatch',
  description: 'Route a task to Codex or Claude (pre-decided by the F1 router), then run architect -> dev -> verify with the dev turn on the routed runtime.',
  whenToUse: 'When you have a single task already routed by the dispatch brain (runtime/model/effort in args) and want the native architect<->dev<->verify pipeline. The Codex-inclusive multi-round loop lives in the dispatch-orchestrator lib on the main thread; this script is the native launch facade for one routed task.',
  phases: [
    { title: 'Design', detail: 'architect frames the change (Claude)' },
    { title: 'Implement', detail: 'dev turn on the routed runtime (Codex via codex exec, or Claude)' },
    { title: 'Verify', detail: 'a Claude reviewer checks the result (never Codex)' },
  ],
};

// A native workflow script has NO imports and NO filesystem of its own, so it
// cannot require the dispatch-router (F1) or the blackboard (F3). The doctrine's
// hybrid pattern applies: routing is decided OUTSIDE (the main-thread skill calls
// the F1 router / byan_dispatch) and handed in via `args`. This script only runs
// the exchange for ONE already-routed task. The dev agent() leaf holds the tools
// (Bash), so IT is what actually invokes `codex exec` and applies the diff — the
// script never shells out itself.
//
// args shape: { brief, runtime: 'codex'|'claude', effort: 'low'|'medium'|'high',
//               model?: string, codexModel?: string, paths?: string[] }

const task = (args && typeof args === 'object') ? args : {};
const brief = task.brief || 'No brief provided.';
const runtime = task.runtime === 'codex' ? 'codex' : 'claude';
const effort = ['low', 'medium', 'high'].includes(task.effort) ? task.effort : 'medium';
const codexModel = task.codexModel || 'gpt-5.4';

phase('Design');
// The architect framing is the load-bearing reasoning step of the whole loop, so
// it opts to the session model (the 'deep-' prefix = frontier analysis, no
// downgrade) rather than the sonnet analysis default. On an Opus session the
// design is framed by Opus; a lighter session inherits its own model.
const design = await agent(
  `You are the architect (Claude). Frame this task for a delegated dev.\n` +
  `Give: the intended change, the interface/contract to honour, and the acceptance check.\n` +
  `Keep it tight and unambiguous.\n\nTask:\n${brief}`,
  { label: 'deep-design-architecture', phase: 'Design' }
);

phase('Implement');
// Implementation leaf -> deep (inherit session model). The prompt BRANCHES on the
// routed runtime: for Codex, the leaf runs `codex exec` read-only to get a diff
// and applies it (Codex never writes; Claude applies). For Claude, it implements
// directly. Routing was decided upstream by F1 — this leaf just executes it.
const devPrompt = runtime === 'codex'
  ? `You are the dev, delegating to Codex. Run Codex non-interactively to get a unified diff, then apply it.\n` +
    `Command (adjust the task text): \`codex exec -c model="${codexModel}" -c model_reasoning_effort="${effort}" -c sandbox_permissions=["disk-full-read-access"] "<<diff-only instruction + the task>>"\`\n` +
    `Extract the diff, apply it with \`git apply\`, and report what changed. Codex must NOT write files itself (read-only sandbox); YOU apply the diff.\n` +
    `If Codex is unavailable or errors, say so plainly and implement the change yourself on Claude (the fallback).\n\n` +
    `Design from the architect:\n${design}\n\nTask:\n${brief}`
  : `You are the dev (Claude). Implement the change per the architect's design.\n` +
    `Follow the interface exactly. Write the code and the tests.\n\n` +
    `Design from the architect:\n${design}\n\nTask:\n${brief}`;
const work = await agent(devPrompt, { label: 'implement-task', phase: 'Implement' });

phase('Verify');
// Verification leaf -> deep, and ALWAYS Claude (the red line: a runtime never
// grades its own work). Never routed to Codex regardless of the dev runtime.
const verdict = await agent(
  `You are the reviewer (Claude, NOT the dev). Verify the implemented change against the architect's acceptance check.\n` +
  `Report PASS or FAIL with the exact reasons. Do not fix — only judge.\n\n` +
  `Design + acceptance:\n${design}\n\nDev report:\n${work}`,
  { label: 'verify-result', phase: 'Verify' }
);

log(`intelligent-dispatch done: runtime=${runtime} effort=${effort}`);
return { runtime, effort, design, work, verdict };
