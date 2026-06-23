'use strict';

/**
 * rtk-integration — optional NATIVE token-optimizer integration (rtk-ai/rtk).
 *
 * RTK ("Rust Token Killer", Apache-2.0) is a single zero-dependency binary that
 * filters/compresses dev-command output before it reaches the LLM context
 * (-60/90% tokens). It wires into Claude Code through its OWN hook installer.
 *
 * MAINTAINABILITY by design (the whole point of choosing this shape):
 *  - We do NOT reimplement per-OS download / checksum / version pinning. We
 *    DELEGATE the install to rtk's own canonical installer (brew / cargo / the
 *    official install.sh), and DELEGATE the Claude Code hook wiring to rtk's own
 *    `rtk init -g`. BYAN maintains only "pick the available installer, run it,
 *    verify, ask rtk to wire its hook" — a tiny surface, bumped via one constant.
 *  - SUPPLY-CHAIN: we pin to a TAG, never a moving branch. cargo builds the
 *    tagged source (`--tag`), and install.sh is fetched from the IMMUTABLE tag ref
 *    (and that script itself checksum-verifies the binary it downloads). So the
 *    fetched artifacts are reproducible, not "whatever master is today".
 *  - Everything is graceful: a missing installer or a failed step is a no-op that
 *    NEVER breaks the BYAN install (returns { ok:true, synced:false, reason }).
 *  - The command runner + the PATH probe are injectable, so the whole flow is
 *    unit-tested without shelling out (see install/__tests__/rtk-integration.test.js).
 *
 * Mirrors the ENTRY-POINT shape of byan-web-integration.js / byan-leantime-
 * integration.js (one `setup*Integration`); the return contract is { ok, synced,
 * reason, ... } because persistence is owned by rtk's own `rtk init -g`, not by
 * byan-platform-config.
 */

const { execSync } = require('child_process');
const { commandExists, firstAvailable } = require('./native-helper');

// Pinned install target. Bumping rtk = change these two constants only. We pin a
// TAG so the install is reproducible and supply-chain-bounded (see header).
const RTK_VERSION = '0.42.4';
const RTK_TAG = `v${RTK_VERSION}`;
const RTK_REPO = 'https://github.com/rtk-ai/rtk';
const RTK_INSTALL_SH = `https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/${RTK_TAG}/install.sh`;

/**
 * Ordered install strategies — each DELEGATES to rtk's own canonical installer,
 * pinned to RTK_TAG where the mechanism allows. Preference: brew (cleanest
 * upgrades, vetted formula) > cargo (any Rust dev, pinned --tag) > the official
 * install.sh at the immutable tag ref (universal fallback, self-checksumming).
 */
function installStrategies() {
  return [
    { id: 'brew', tool: 'brew', cmd: 'brew install rtk' },
    { id: 'cargo', tool: 'cargo', cmd: `cargo install --git ${RTK_REPO} --tag ${RTK_TAG}` },
    // Pass RTK_VERSION into the script so it pins the BINARY too (the script
    // builds releases/download/${VERSION}/...; without it, it resolves
    // releases/latest). Pinning the URL alone is not enough — this pins both.
    { id: 'script', tool: 'curl', cmd: `curl -fsSL ${RTK_INSTALL_SH} | RTK_VERSION=${RTK_TAG} sh` },
  ];
}

function oneLine(err) {
  return String((err && err.message) || err).split('\n')[0];
}

/**
 * rtkStatus() -> { installed, version }. Never throws. Parses `rtk --version`
 * ("rtk 0.42.4"). An installed-but-unparseable build yields { installed:true,
 * version:null } (a real runtime possibility, handled downstream).
 */
function rtkStatus({ run = execSync } = {}) {
  try {
    const out = String(run('rtk --version', { stdio: 'pipe' }) || '');
    const m = out.match(/rtk\s+v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    return { installed: true, version: m ? m[1] : null };
  } catch {
    return { installed: false, version: null };
  }
}

/**
 * pickStrategy() -> the first install strategy whose tool is on PATH, or null.
 */
function pickStrategy({ has = commandExists } = {}) {
  return firstAvailable(installStrategies(), { has });
}

/**
 * doctor() -> a status report for diagnostics / a `byan` doctor surface. `pinned`
 * is the version BYAN installs/targets — NOT an enforced floor on a pre-existing
 * rtk (we do not break a user's own older rtk).
 */
function doctor({ run = execSync } = {}) {
  const s = rtkStatus({ run });
  return {
    component: 'rtk',
    installed: s.installed,
    version: s.version,
    pinned: RTK_VERSION,
    repo: RTK_REPO,
    hookCommand: 'rtk init -g',
  };
}

// Delegate the Claude Code hook wiring to rtk's OWN command (idempotent). This is
// the maintainability win: no manual settings.json merge to keep in sync.
function wireHook({ run, log, installedVia, version }) {
  try {
    run('rtk init -g', { stdio: 'pipe' });
    log(`rtk: ready (${installedVia}, v${version || '?'}) — hook wired via 'rtk init -g'. Restart Claude Code to activate.`);
    return { ok: true, synced: true, reason: 'wired', installed: true, installedVia, version, hook: true };
  } catch (err) {
    log(`rtk: installed (${installedVia}) but 'rtk init -g' failed (${oneLine(err)}) — run it manually, BYAN unaffected.`);
    return { ok: true, synced: false, reason: 'hook-failed', installed: true, installedVia, version, hook: false };
  }
}

/**
 * setupRtkIntegration(options) -> { ok, synced, reason, ... }. The single entry.
 *
 * Flow: if rtk is already present, just (re)wire the hook (idempotent). Otherwise
 * pick an available installer, delegate the install to rtk, verify, then wire the
 * hook. Any missing tool / failed step degrades to a logged no-op — it NEVER
 * throws and NEVER fails the surrounding BYAN install. `ok` is therefore always
 * true; `synced` says whether rtk ended up wired.
 *
 * @param {object} [o]
 * @param {Function} [o.run]  command runner (default execSync) — injected in tests
 * @param {Function} [o.has]  PATH probe (default commandExists) — injected in tests
 * @param {Function} [o.log]  one-line breadcrumb sink (default no-op)
 */
function setupRtkIntegration({ run = execSync, has = commandExists, log = () => {} } = {}) {
  const before = rtkStatus({ run });
  if (before.installed) {
    return wireHook({ run, log, installedVia: 'already-present', version: before.version });
  }

  const strat = pickStrategy({ has });
  if (!strat) {
    log('rtk: no installer found (brew / cargo / curl) — skipped. BYAN install unaffected.');
    return { ok: true, synced: false, reason: 'no-installer', installed: false, hook: false };
  }

  // Breadcrumb BEFORE the (silent, possibly slow) delegated install so the user
  // is not left staring at a frozen prompt while rtk's installer runs.
  log(`rtk: installing via ${strat.id} (pinned ${RTK_TAG}; this can take a moment)...`);
  try {
    run(strat.cmd, { stdio: 'pipe' });
  } catch (err) {
    log(`rtk: install via ${strat.id} failed (${oneLine(err)}) — skipped gracefully.`);
    return { ok: true, synced: false, reason: `install-failed:${strat.id}`, installed: false, hook: false };
  }

  const after = rtkStatus({ run });
  if (!after.installed) {
    log(`rtk: install via ${strat.id} ran but 'rtk --version' did not confirm — skipped.`);
    return { ok: true, synced: false, reason: 'install-unverified', installed: false, hook: false };
  }

  return wireHook({ run, log, installedVia: strat.id, version: after.version });
}

/**
 * shouldOfferRtk() -> boolean. The installer asks this BEFORE prompting the user:
 * offer rtk only when (a) interactive (a TTY), (b) not opted out
 * (BYAN_SKIP_RTK=1), and (c) an installer is actually on PATH — so we never prompt
 * for something we cannot deliver, and never block a non-interactive/CI install.
 */
function shouldOfferRtk({ env = process.env, isTTY = !!(process.stdin && process.stdin.isTTY), has = commandExists } = {}) {
  if (env && env.BYAN_SKIP_RTK === '1') return false;
  if (!isTTY) return false;
  return Boolean(pickStrategy({ has }));
}

module.exports = {
  setupRtkIntegration,
  rtkStatus,
  pickStrategy,
  installStrategies,
  doctor,
  shouldOfferRtk,
  RTK_VERSION,
  RTK_TAG,
  RTK_INSTALL_SH,
  RTK_REPO,
};
