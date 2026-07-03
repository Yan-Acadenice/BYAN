/**
 * Codex auto-delegation setup (installer F4) — opts the user into a Codex backup
 * pool and ARMS the F5 auto-delegation hook by writing
 * `_byan/_config/autodelegate.json`.
 *
 * Linking uses the LOCAL Codex auth — the ChatGPT subscription established by
 * `codex login` — NOT an API key: delegated turns cost subscription quota, not
 * per-token API credit. The entitled model is `gpt-5.4` (the `-codex` ids are
 * API-only on a subscription; see src/loadbalancer/providers/codex-provider.js).
 *
 * On a headless server the browser localhost redirect of the default login
 * fails, so we surface the DEVICE-FLOW instruction (`codex login --device-auth`)
 * rather than pretend the link worked.
 *
 * Companion to codex-native-setup.js (which wires the BYAN MCP into
 * ~/.codex/config.toml). This module owns only the auto-delegation opt-in. All
 * fs is injectable so the unit tests write nothing real; the hook it arms is a
 * no-op until this config exists (disarmed-by-default, see the F5 hook).
 */

const realFs = require('fs');
const realPath = require('path');
const os = require('os');
let chalk;
try { chalk = require('chalk'); } catch { chalk = null; }

const paint = (fn, s) => (chalk && chalk[fn] ? chalk[fn](s) : s);

const DEVICE_FLOW_INSTRUCTION = [
  'Codex is not linked yet. On THIS machine run:',
  '    codex login --device-auth',
  'then open the printed URL, enter the code, and re-run the installer.',
  '(device-auth avoids the localhost browser redirect that fails on a headless server).',
].join('\n');

// Which local Codex auth backs the CLI: 'api-key' (CODEX_API_KEY, per-token),
// 'subscription' (~/.codex/auth.json, the 5h window), or null (not linked).
function codexAuthState({ home = os.homedir(), fs = realFs, path = realPath } = {}) {
  if (process.env.CODEX_API_KEY) return 'api-key';
  try {
    if (fs.existsSync(path.join(home, '.codex', 'auth.json'))) return 'subscription';
  } catch {
    /* fall through */
  }
  return null;
}

// The config that ARMS the F5 hook. enabled:true is the whole point — the hook
// no-ops without this file.
function autodelegateConfig({ threshold = 80, budget = null, invocation = 'codex:codex-rescue --model gpt-5.4' } = {}) {
  return {
    enabled: true,
    threshold,
    budget,
    invocation,
    model: 'gpt-5.4',
    note: 'Written by the BYAN installer (F4). Delete or set enabled:false to disarm auto-delegation.',
  };
}

function writeAutodelegateConfig({ projectRoot, config, fs = realFs, path = realPath }) {
  const dir = path.join(projectRoot, '_byan', '_config');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'autodelegate.json');
  fs.writeFileSync(p, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return p;
}

// Orchestrate the opt-in step. Called only when the user chose "add a Codex
// backup" at install. Arms the hook when Codex is linked; otherwise leaves it
// disarmed and surfaces the device-flow so the link can be completed and the
// installer re-run. Never throws on a link check — an unlinked Codex is a normal
// outcome, not an installer failure.
async function setupCodexAutodelegate(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);
  const fs = options.fs || realFs;
  const path = options.path || realPath;

  const auth = codexAuthState({ fs, path, home: options.home });
  if (!auth) {
    log(paint('yellow', '  ! Codex not linked - auto-delegation left DISARMED'));
    log(paint('gray', `    ${DEVICE_FLOW_INSTRUCTION.replace(/\n/g, '\n    ')}`));
    return { armed: false, reason: 'codex-not-linked' };
  }

  const config = autodelegateConfig(options);
  config.linkedVia = auth;
  const p = writeAutodelegateConfig({ projectRoot, config, fs, path });
  log(paint('green', `  + Codex auto-delegation ARMED (${auth}) -> ${p}`));
  log(paint('gray', '    BYAN will now propose handing delegable work to Codex (no API credit).'));
  return { armed: true, path: p, authPool: auth, config };
}

module.exports = {
  DEVICE_FLOW_INSTRUCTION,
  codexAuthState,
  autodelegateConfig,
  writeAutodelegateConfig,
  setupCodexAutodelegate,
};
