#!/usr/bin/env node
/**
 * UserPromptSubmit hook — Codex auto-delegation nudge (F5).
 *
 * Every turn, estimates Claude's rolling-5h consumption (F1 usage-estimator) and
 * asks the pure decision core (F5 autodelegate-decision) whether to nudge BYAN to
 * hand delegable work to Codex — on the ChatGPT subscription, no API credit. The
 * nudge is ADVISORY context only: it proposes, never forces, and always names the
 * red line (delegable work only; judgment/soul/verify stay on Claude).
 *
 * DISARMED BY DEFAULT. The hook no-ops unless `_byan/_config/autodelegate.json`
 * exists with `enabled: true` (written by the yanstaller F4 when the user opts
 * into a Codex backup). No config file -> silence. This keeps it from nagging on
 * machines where Codex is not set up, and honors "only once the user chose it at
 * install".
 *
 * Escape hatch: a `.byan-codex-autodelegate/off` file in the project root forces
 * silence even when enabled. Always exits 0; never blocks prompt submission.
 */

const fs = require('fs');
const path = require('path');
const { readStdin, parseJson } = require('./lib/strict-runtime');
const { decideAutodelegation, renderNudge } = require('./lib/autodelegate-decision');
const { estimateClaudeUsage } = require('./lib/usage-estimator');

// Load the opt-in config; absent/invalid -> disarmed ({ enabled: false }).
function loadConfig(projectRoot) {
  try {
    const p = path.join(projectRoot, '_byan', '_config', 'autodelegate.json');
    if (!fs.existsSync(p)) return { enabled: false };
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    return cfg && typeof cfg === 'object' ? cfg : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function toggledOff(projectRoot) {
  try {
    return fs.existsSync(path.join(projectRoot, '.byan-codex-autodelegate', 'off'));
  } catch {
    return false;
  }
}

if (require.main === module) {
  (async () => {
    let additionalContext = '';
    try {
      const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const config = loadConfig(projectRoot);
      if (config.enabled === true && !toggledOff(projectRoot)) {
        const payload = parseJson(await readStdin());
        const prompt = payload.prompt || payload.user_prompt || payload.userPrompt || '';
        // Estimate usage only when a budget is configured; else pct stays null and
        // the decision falls back to nature-based delegation (still useful).
        const usage = estimateClaudeUsage({ budget: config.budget || null });
        const decision = decideAutodelegation({ requestText: prompt, usage, config });
        additionalContext = renderNudge(decision);
      }
    } catch {
      additionalContext = ''; // never block prompt submission
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
      })
    );
    process.exit(0);
  })();
}

module.exports = { loadConfig, toggledOff };
