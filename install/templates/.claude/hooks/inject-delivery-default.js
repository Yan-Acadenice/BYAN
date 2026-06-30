#!/usr/bin/env node
/**
 * UserPromptSubmit hook — BYAN delivery-default contract (F1).
 *
 * Injects, every turn, the baseline delivery posture: grade=PROD, scope=MAXIMAL,
 * the AI-2026 cost yardstick (estimate in agent-time x10, never human-by-hand
 * time), and the explicit ban on quietly proposing an MVP / short deliverable /
 * a split that exists only to avoid doing the heavy part. This is the proactive
 * twin of strict mode: strict locks a scope on demand, this sets the DEFAULT.
 *
 * Ships LIVE (unlike the F2 completeness reject and the F3 punt-guard, which
 * ship disarmed): the anchor is pure injected context, it blocks nothing, so a
 * false positive costs a few tokens — never a trapped turn or a blocked commit.
 *
 * The only escape is an explicit opt-out word the user types THIS message (mvp,
 * quick, brouillon, ...). On opt-out the hook emits a single descope-authorized
 * line instead of the full anchor, so the agent is told the contract is relaxed
 * for this one request.
 *
 * Always exits 0; never blocks prompt submission.
 */

const { loadConfig, decideContext } = require('./lib/delivery-contract');
const { readStdin, parseJson } = require('./lib/strict-runtime');

if (require.main === module) {
  (async () => {
    let additionalContext = '';
    try {
      const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const config = loadConfig(projectRoot);
      const payload = parseJson(await readStdin());
      const userMsg = payload.prompt || payload.user_prompt || payload.userPrompt || '';
      additionalContext = decideContext({ userMsg, config }).text;
    } catch {
      // Never block prompt submission — degrade to no context.
      additionalContext = '';
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
      })
    );
    process.exit(0);
  })();
}
