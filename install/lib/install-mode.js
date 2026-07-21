'use strict';

// Since 2.57.0 the default install experience is the graphical web wizard
// (create-byan-agent, which starts the local server and opens the browser).
// Two terminal escape hatches stay reachable by flag:
//   --cli    -> the zero-question automatic terminal install (installAuto)
//   --legacy -> the original question-by-question interview (install)
// --legacy wins over --cli when both are passed: it is the more explicit,
// older path, so an operator who typed it means it.
function chooseInstallMode(options = {}) {
  if (options && options.legacy) return 'legacy';
  if (options && options.cli) return 'cli';
  return 'web';
}

// Global-skills consent for the AUTOMATIC terminal install (installAuto).
//
// Field bug (2026-07-21): the auto install froze at "[6/8] Controle des copies
// globales de skills". Root cause — the engine's skills-sync step was handed an
// inquirer prompt as its `ask`, but installAuto keeps an ora progress spinner
// spinning during every step. The prompt was drawn UNDER the live spinner:
// invisible, waiting on input the user could not see -> apparent infinite load.
//
// The fix is a rule, not spinner choreography: the automatic install NEVER opens
// an interactive prompt. Two non-interactive behaviours only:
//   - default        -> null : the engine notices the divergence and prints the
//                        exact sync command, writes nothing in ~/.claude, does
//                        not block (keeps the "no silent home write" red line).
//   - --sync-skills  -> an unattended auto-approve (resolves true, no inquirer):
//                        the flag itself is the explicit consent, so the engine
//                        syncs the stale global copies without a prompt.
function skillsSyncConsent(options = {}) {
  if (options && options.syncSkills) return async () => true;
  return null;
}

module.exports = { chooseInstallMode, skillsSyncConsent };
