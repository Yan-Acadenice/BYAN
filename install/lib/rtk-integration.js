'use strict';

/**
 * rtk-integration — optional NATIVE token-optimizer integration (rtk-ai/rtk).
 *
 * RTK ("Rust Token Killer", Apache-2.0) is a single zero-dependency binary that
 * filters/compresses dev-command output before it reaches the LLM context
 * (-60/90% tokens). It wires into Claude Code through its OWN hook installer;
 * for Codex installs BYAN can make the native binary available, but does not
 * claim a transparent hook layer where Codex has no BYAN hook adapter.
 *
 * MAINTAINABILITY by design (the whole point of choosing this shape):
 *  - We do NOT reimplement per-OS download / checksum / version pinning. We
 *    DELEGATE the install to rtk's own canonical installer (brew / the official
 *    install.sh / cargo), and DELEGATE the Claude Code hook wiring to rtk's own
 *    `rtk init -g --auto-patch` (the `--auto-patch` is what makes it non-
 *    interactive — see wireHook). For Codex, BYAN stops at verified native
 *    binary availability and reports that honestly. BYAN maintains only "pick
 *    the available installer, run it bounded + visible, locate the binary, ask
 *    rtk to wire its hook when Claude is targeted" — a tiny surface, bumped via
 *    one constant.
 *  - SUPPLY-CHAIN: we pin to a TAG, never a moving branch. cargo builds the
 *    tagged source (`--tag`), and install.sh is fetched from the IMMUTABLE tag ref.
 *    That script verifies a SHA-256 of the downloaded binary against a published
 *    checksums.txt and aborts on mismatch (source: refs/tags/v0.42.4/install.sh,
 *    fetched + verified 2026-06-23). So the fetched artifacts are reproducible and
 *    integrity-checked, not "whatever master is today".
 *  - FAIL-PROOF: the delegated install runs with a per-strategy TIMEOUT (a hung
 *    network/build is bounded, not infinite) and with INHERITED stdio (the user
 *    SEES the installer's progress instead of staring at a frozen line; this also
 *    sidesteps execSync's 1MB maxBuffer cap that a verbose build would blow). Any
 *    missing installer / failed / timed-out step is a logged no-op that NEVER
 *    breaks the BYAN install (returns { ok:true, synced:false, reason }).
 *  - OFF-PATH SAFE: a successful install can leave the binary off PATH (the
 *    classic: cargo drops it in ~/.cargo/bin, which Debian's apt-cargo does not
 *    add to PATH). We RESOLVE the binary across known install dirs before
 *    declaring "unverified", verify + wire it by its real path, and hand the user
 *    a one-line PATH hint. The user's own report (rtk installed at ~/.cargo/bin,
 *    invisible to a bare probe) is exactly this case.
 *  - The command runner + the PATH probe + the resolver are injectable, so the
 *    whole flow is unit-tested without shelling out (see
 *    install/__tests__/rtk-integration.test.js).
 *
 * Mirrors the ENTRY-POINT shape of byan-web-integration.js / byan-leantime-
 * integration.js (one `setup*Integration`); the return contract is { ok, synced,
 * reason, ... } because persistence is owned by rtk's own `rtk init -g
 * --auto-patch`, not by byan-platform-config.
 */

const { execSync } = require('child_process');
const path = require('path');
const { commandExists, resolveBinary, firstAvailable } = require('./native-helper');

// Pinned install target. Bumping rtk = change these two constants only. We pin a
// TAG so the install is reproducible and supply-chain-bounded (see header).
const RTK_VERSION = '0.42.4';
const RTK_TAG = `v${RTK_VERSION}`;
const RTK_REPO = 'https://github.com/rtk-ai/rtk';
const RTK_INSTALL_SH = `https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/${RTK_TAG}/install.sh`;

// Per-strategy timeout (ms). A prebuilt-binary path (brew / script) should be
// quick; cargo COMPILES from source and is legitimately slow, so it gets a wide
// budget. The bound exists to cap a genuine HANG, not to race a normal build.
const MIN = 60 * 1000;
const RTK_TIMEOUT_MS = { brew: 5 * MIN, script: 5 * MIN, cargo: 20 * MIN };
const RTK_DEFAULT_TIMEOUT_MS = 10 * MIN;

/**
 * Ordered install strategies — each DELEGATES to rtk's own canonical installer,
 * pinned to RTK_TAG where the mechanism allows.
 *
 * Order = brew > script > cargo. WHY this order (not brew > cargo > script):
 *  - brew first: vetted formula, cleanest upgrades, prebuilt.
 *  - script second: the official install.sh downloads a PREBUILT binary to a
 *    PATH-stable location in seconds. It is pinned to the immutable tag ref and
 *    verifies the binary's SHA-256 before installing (see the cited check above)
 *    — a bounded supply-chain surface.
 *  - cargo LAST: it COMPILES from source (minutes) AND drops the binary in
 *    ~/.cargo/bin, frequently off a non-login PATH. It stays as a build-from-
 *    source fallback for machines without brew/curl, not the default path.
 */
function installStrategies() {
  return [
    { id: 'brew', tool: 'brew', cmd: 'brew install rtk', timeoutMs: RTK_TIMEOUT_MS.brew },
    // Pass RTK_VERSION into the script so it pins the BINARY too (the script
    // builds releases/download/${VERSION}/...; without it, it resolves
    // releases/latest). Pinning the URL alone is not enough — this pins both.
    // The script verifies a SHA-256 of the binary (vs checksums.txt) before
    // installing — verified at refs/tags/v0.42.4/install.sh, 2026-06-23.
    { id: 'script', tool: 'curl', cmd: `curl -fsSL ${RTK_INSTALL_SH} | RTK_VERSION=${RTK_TAG} sh`, timeoutMs: RTK_TIMEOUT_MS.script },
    { id: 'cargo', tool: 'cargo', cmd: `cargo install --git ${RTK_REPO} --tag ${RTK_TAG}`, timeoutMs: RTK_TIMEOUT_MS.cargo },
  ];
}

function oneLine(err) {
  return String((err && err.message) || err).split('\n')[0];
}

// A bounded, env-overridable timeout for a strategy. BYAN_RTK_TIMEOUT_MS (ms)
// lets a user widen the bound (e.g. a slow machine compiling via cargo). Only a
// POSITIVE integer is honored: Node treats timeout:0 as "no timeout", so a 0
// override would silently re-introduce the unbounded hang the bound exists to
// prevent — it falls back to the strategy budget instead.
function timeoutFor(strat, { env = process.env } = {}) {
  const raw = env && env.BYAN_RTK_TIMEOUT_MS;
  if (raw != null && /^[0-9]+$/.test(String(raw))) {
    const n = Number(raw);
    if (n > 0) return n;
  }
  return (strat && strat.timeoutMs) || RTK_DEFAULT_TIMEOUT_MS;
}

// Did execSync throw because WE killed it on timeout (vs the command failing on
// its own)? Node sets `killed=true` and code 'ETIMEDOUT' when it kills the child
// on timeout; a build error sets a non-zero exit status with killed=false. We do
// NOT match a bare 'SIGTERM' signal: a sub-process self-terminating with SIGTERM
// for an unrelated reason would otherwise be mislabelled a timeout.
function isTimeout(err) {
  return Boolean(err && (err.killed === true || err.code === 'ETIMEDOUT'));
}

// A shell/platform-correct "add this dir to PATH" hint. The resolved binary can
// live off PATH (cargo -> ~/.cargo/bin); the user needs the line that actually
// works in THEIR shell — fish rejects POSIX `export`, Windows rejects both.
function pathHintFor(bin, { env = process.env, platform = process.platform } = {}) {
  // Parse the dir with the TARGET platform's rules, not the host's — so a win32
  // path yields the right dir even when this code runs on a POSIX CI host.
  const dir = (platform === 'win32' ? path.win32 : path.posix).dirname(bin);
  if (platform === 'win32') return `$env:PATH = "${dir};$env:PATH"`;
  const shell = String((env && env.SHELL) || '');
  if (/(^|\/)fish$/.test(shell)) return `fish_add_path ${dir}`;
  return `export PATH="${dir}:$PATH"`;
}

function normalizeTargetPlatforms(targetPlatforms = ['claude']) {
  const raw = Array.isArray(targetPlatforms) ? targetPlatforms : [targetPlatforms];
  const set = new Set();
  for (const p of raw) {
    const key = String(p || '').trim().toLowerCase();
    if (key === 'claude' || key === 'claude-code') set.add('claude');
    if (key === 'codex') set.add('codex');
  }
  if (!set.size) set.add('claude');
  return set;
}

function codexReady({
  log,
  installedVia,
  version,
  bin = 'rtk',
  env = process.env,
  platform = process.platform,
  claudeHook = false,
} = {}) {
  const offPath = bin !== 'rtk';
  log(`rtk: ready for Codex (${installedVia}, v${version || '?'}) — native binary available; no transparent Codex hook is wired.`);
  const r = {
    ok: true,
    synced: true,
    reason: 'codex-binary-ready',
    installed: true,
    installedVia,
    version,
    hook: Boolean(claudeHook),
    claudeHook: Boolean(claudeHook),
    codexReady: true,
    bin,
  };
  if (offPath) {
    r.pathHint = pathHintFor(bin, { env, platform });
    log(`rtk: note — installed at ${bin}, not on your PATH. Add it: ${r.pathHint}`);
  }
  return r;
}

/**
 * rtkStatus() -> { installed, version, bin }. Never throws. Probes `<bin>
 * --version` ("rtk 0.42.4"), default bin "rtk" (on PATH). An installed-but-
 * unparseable build yields { installed:true, version:null }.
 */
function rtkStatus({ run = execSync, bin = 'rtk' } = {}) {
  try {
    const out = String(run(`${bin} --version`, { stdio: 'pipe' }) || '');
    const m = out.match(/rtk\s+v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    return { installed: true, version: m ? m[1] : null, bin };
  } catch {
    return { installed: false, version: null, bin: null };
  }
}

/**
 * locateRtk() -> a verified { installed, version, bin } by trying the bare name
 * first (on PATH), then resolving across known install dirs (off-PATH). Returns
 * the off-PATH absolute path in `bin` when that is where it was found.
 */
function locateRtk({ run = execSync, has = commandExists, resolve = resolveBinary, env = process.env } = {}) {
  const onPath = rtkStatus({ run, bin: 'rtk' });
  if (onPath.installed) return onPath;
  // The resolver must never break the never-throws contract; degrade to not-found
  // if it (or a misbehaving injected resolver) throws.
  let resolved = null;
  try {
    resolved = resolve('rtk', { has, env });
  } catch {
    resolved = null;
  }
  if (resolved && resolved !== 'rtk') {
    const s = rtkStatus({ run, bin: resolved });
    if (s.installed) return s;
  }
  return { installed: false, version: null, bin: null };
}

/**
 * pickStrategy() -> the first install strategy whose tool is on PATH, or null.
 */
function pickStrategy({ has = commandExists } = {}) {
  return firstAvailable(installStrategies(), { has });
}

/**
 * doctor() -> a status report for diagnostics / a `byan` doctor surface. Resolves
 * the binary across known dirs so an off-PATH install is reported as installed
 * (with its real path), not as missing. `pinned` is the version BYAN targets —
 * NOT an enforced floor on a pre-existing rtk.
 */
function doctor({ run = execSync, has = commandExists, resolve = resolveBinary, env = process.env } = {}) {
  const s = locateRtk({ run, has, resolve, env });
  return {
    component: 'rtk',
    installed: s.installed,
    version: s.version,
    bin: s.bin,
    pinned: RTK_VERSION,
    repo: RTK_REPO,
    hookCommand: 'rtk init -g --auto-patch',
  };
}

// Delegate the Claude Code hook wiring to rtk's OWN command (idempotent). This is
// the maintainability win: no manual settings.json merge to keep in sync. Wires
// via the resolved `bin` so an off-PATH install still gets its hook.
//
// `--auto-patch` is REQUIRED: bare `rtk init -g` PROMPTS before patching
// settings.json, and we run it non-interactively (stdio:'pipe', no TTY) — so the
// prompt gets no answer and rtk silently writes only the instruction layer
// (RTK.md + @RTK.md) WITHOUT the PreToolUse hook. `--auto-patch` patches
// settings.json non-interactively, so the transparent command-rewriting hook is
// actually installed. (Verified live: `rtk init --show` reports "Hook: not found"
// after bare `-g` piped, "Hook: ... configured" after `-g --auto-patch`.)
function wireHook({ run, log, installedVia, version, bin = 'rtk', env = process.env, platform = process.platform }) {
  const offPath = bin !== 'rtk';
  const initCmd = `${bin} init -g --auto-patch`;
  try {
    run(initCmd, { stdio: 'pipe' });
    log(`rtk: ready (${installedVia}, v${version || '?'}) — hook wired via '${initCmd}'. Restart Claude Code to activate.`);
    const r = { ok: true, synced: true, reason: 'wired', installed: true, installedVia, version, hook: true, claudeHook: true, bin };
    if (offPath) {
      r.pathHint = pathHintFor(bin, { env, platform });
      log(`rtk: note — installed at ${bin}, not on your PATH. Add it: ${r.pathHint}`);
    }
    return r;
  } catch (err) {
    log(`rtk: installed (${installedVia}) but '${initCmd}' failed (${oneLine(err)}) — run it manually, BYAN unaffected.`);
    const r = { ok: true, synced: false, reason: 'hook-failed', installed: true, installedVia, version, hook: false, claudeHook: false, bin };
    if (offPath) r.pathHint = pathHintFor(bin, { env, platform });
    return r;
  }
}

/**
 * setupRtkIntegration(options) -> { ok, synced, reason, ... }. The single entry.
 *
 * Flow: if rtk is already present (on PATH or off-PATH in a known dir), just
 * (re)wire the hook (idempotent). Otherwise pick an available installer, delegate
 * the install (BOUNDED by a timeout + VISIBLE via inherited stdio), LOCATE the
 * binary, verify, then wire the hook. Any missing tool / failed / timed-out step
 * degrades to a logged no-op — it NEVER throws and NEVER fails the surrounding
 * BYAN install. `ok` is therefore always true; `synced` says whether rtk ended
 * up wired. An off-PATH install carries a `pathHint`.
 *
 * @param {object} [o]
 * @param {Function} [o.run]      command runner (default execSync) — injected in tests
 * @param {Function} [o.has]      PATH probe (default commandExists) — injected in tests
 * @param {Function} [o.resolve]  binary resolver (default resolveBinary) — injected in tests
 * @param {Function} [o.log]      one-line breadcrumb sink (default no-op)
 * @param {object}   [o.env]      environment (default process.env) — for the timeout override
 * @param {string[]|string} [o.targetPlatforms] platforms to prepare:
 *                    claude wires RTK's Claude Code hook; codex verifies the
 *                    native binary and reports no transparent hook.
 */
function setupRtkIntegration({
  run = execSync,
  has = commandExists,
  resolve = resolveBinary,
  log = () => {},
  env = process.env,
  platform = process.platform,
  targetPlatforms = ['claude'],
} = {}) {
  const targets = normalizeTargetPlatforms(targetPlatforms);
  const wantsClaude = targets.has('claude');
  const wantsCodex = targets.has('codex');
  const finishReady = ({ installedVia, version, bin }) => {
    if (!wantsClaude && wantsCodex) {
      return codexReady({ log, installedVia, version, bin, env, platform });
    }
    const r = wireHook({ run, log, installedVia, version, bin, env, platform });
    if (wantsCodex && r.installed) {
      r.codexReady = true;
      if (r.reason === 'wired') r.reason = 'wired+codex-binary-ready';
      log('rtk: also ready for Codex — native binary available; no transparent Codex hook is wired.');
    }
    return r;
  };

  const before = locateRtk({ run, has, resolve, env });
  if (before.installed) {
    return finishReady({ installedVia: 'already-present', version: before.version, bin: before.bin });
  }

  const strat = pickStrategy({ has });
  if (!strat) {
    log('rtk: no installer found (brew / curl / cargo) — skipped. BYAN install unaffected.');
    return { ok: true, synced: false, reason: 'no-installer', installed: false, hook: false, claudeHook: false, codexReady: false };
  }

  // Breadcrumb BEFORE the delegated install. stdio is INHERITED so the installer's
  // own progress streams to the user (no frozen line), bounded by a timeout.
  const timeoutMs = timeoutFor(strat, { env });
  log(`rtk: installing via ${strat.id} (pinned ${RTK_TAG}; up to ${Math.round(timeoutMs / MIN)}min, Ctrl+C is safe)...`);
  try {
    run(strat.cmd, { stdio: 'inherit', timeout: timeoutMs });
  } catch (err) {
    if (isTimeout(err)) {
      log(`rtk: install via ${strat.id} exceeded ${Math.round(timeoutMs / MIN)}min — stopped (a background build may still continue). Retry with 'npm run setup-rtk' (or widen BYAN_RTK_TIMEOUT_MS). BYAN unaffected.`);
      return { ok: true, synced: false, reason: `install-timeout:${strat.id}`, installed: false, hook: false, claudeHook: false, codexReady: false };
    }
    log(`rtk: install via ${strat.id} failed (${oneLine(err)}) — skipped gracefully.`);
    return { ok: true, synced: false, reason: `install-failed:${strat.id}`, installed: false, hook: false, claudeHook: false, codexReady: false };
  }

  // The binary may be installed but OFF PATH (cargo -> ~/.cargo/bin). Resolve it
  // before declaring failure, and wire it by its real location.
  const after = locateRtk({ run, has, resolve, env });
  if (!after.installed) {
    log(`rtk: install via ${strat.id} ran but 'rtk --version' did not confirm — skipped.`);
    return { ok: true, synced: false, reason: 'install-unverified', installed: false, hook: false, claudeHook: false, codexReady: false };
  }

  return finishReady({ installedVia: strat.id, version: after.version, bin: after.bin });
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
  locateRtk,
  pickStrategy,
  installStrategies,
  timeoutFor,
  isTimeout,
  pathHintFor,
  normalizeTargetPlatforms,
  doctor,
  shouldOfferRtk,
  RTK_VERSION,
  RTK_TAG,
  RTK_INSTALL_SH,
  RTK_REPO,
  RTK_TIMEOUT_MS,
  RTK_DEFAULT_TIMEOUT_MS,
};
