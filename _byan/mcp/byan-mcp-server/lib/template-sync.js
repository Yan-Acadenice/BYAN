// Template fidelity sync — keep install/templates/ faithful to root.
//
// Only install/templates/ ships on npm (package.json files[]); the dev code
// lives at root _byan/ and .claude/. With no mechanism to mirror root -> template,
// the template drifted: 81 stale files accumulated across several chantiers, so a
// published version could promise features its package did not contain.
//
// This module is that mechanism. The contract is deliberately narrow to avoid the
// opposite failure (shipping the 4000+ dev-only files at root):
//
//   - The mirrored perimeter is the template ITSELF. Every file already present in
//     install/templates/ is re-synced from its root twin. The template is its own
//     manifest of "what must stay up to date" — we never walk root and copy down.
//   - TARGET_ADDITIONS is the explicit, reviewed list of NEW files that must enter
//     the template (the 2.21.0 routing/ledger chantier). Growth of the shipped set
//     is a deliberate edit here, never an accident of a glob.
//   - EXCLUSIONS are runtime/seed files that legitimately differ between a dev
//     checkout and a fresh install (the memoire ledger holds the maintainer's ELO
//     scores). Re-syncing them would push dev state into the package.
//
// The risky half — classifying each file — is pure (buildPlan / checkDrift, no
// I/O). The I/O half (walk + copy) takes an injected `io` so the unit tests pin
// behaviour without touching the real filesystem, the same shape suitability-store
// uses.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Runtime/seed paths that must keep their template value, never the dev value.
// Prefix match on a POSIX-style relative path.
export const EXCLUSIONS = ['_byan/memoire/'];

// New files that must enter the template. Each is a root-relative POSIX path.
// This list is the ONLY way the shipped set grows: adding a file here is a
// reviewed decision, not a side effect of a directory glob.
export const TARGET_ADDITIONS = [
  '_byan/mcp/byan-mcp-server/lib/native-tiers.js',
  '_byan/mcp/byan-mcp-server/lib/suitability.js',
  '_byan/mcp/byan-mcp-server/lib/suitability-store.js',
  '_byan/mcp/byan-mcp-server/lib/suitability-feeder.js',
  '_byan/mcp/byan-mcp-server/bin/byan-suitability.js',
  '.claude/skills/byan-suitability/SKILL.md',
  '.claude/rules/team-doctrine.md',
  '_byan/mcp/byan-mcp-server/lib/stub-sync.js',
  '_byan/mcp/byan-mcp-server/bin/byan-sync-stubs.js',
  '_byan/mcp/byan-mcp-server/lib/insight-harvest.js',
  '_byan/mcp/byan-mcp-server/bin/byan-insight-digest.js',
  '_byan/mcp/byan-mcp-server/test/insight-harvest.test.js',
  '.claude/skills/byan-insight/SKILL.md',
  '_byan/mcp/byan-mcp-server/lib/advisory-autofeed.js',
  '_byan/mcp/byan-mcp-server/lib/outcome-buffer.js',
  '_byan/mcp/byan-mcp-server/test/advisory-autofeed.test.js',
  '_byan/mcp/byan-mcp-server/test/outcome-buffer.test.js',
  '.claude/hooks/drain-advisory.js',
  // Shared Stop-hook transcript reader. Required by strict-stop-guard,
  // fd-response-check, stage-to-byan AND the autobench hook below — they
  // `require('./lib/transcript-read')`, so a fresh install crashes without it.
  '.claude/hooks/lib/transcript-read.js',
  // Auto-benchmark chantier (C1-C5). The runtime/doctrine files that make the
  // feature exist in a fresh install: the reactive Stop hook + its runtime libs,
  // the generated config, the proactive doctrine rule, the conductor skill, the
  // DATA-only workflow engine + its markdown fallback, and the YAML source of
  // truth. The Stop hook ships DISARMED (enforcement.armed=false in the config),
  // so a fresh install carries the net inert until the user opts in.
  '.claude/hooks/autobench-stop-guard.js',
  '.claude/hooks/lib/autobench-runtime.js',
  '.claude/hooks/lib/autobench-config.json',
  '.claude/hooks/lib/autobench-fc-enrich.js',
  '.claude/hooks/lib/autobench-ledger-report.js',
  '.claude/rules/benchmark.md',
  '.claude/skills/byan-benchmark/SKILL.md',
  '.claude/workflows/byan-benchmark.js',
  '_byan/workflow/simple/bmb/byan-benchmark/workflow.md',
  '_byan/_config/autobench.yaml',
  // MCP-package test ships with the server (same convention as the insight /
  // advisory tests above). The root __tests__/ and .claude/__tests__/ suites do
  // NOT ship: they verify this dev checkout's generated artifacts, a fresh
  // install regenerates its own, and there is no root/.claude test in the
  // template perimeter — mirroring the way .claude/hooks/drain-advisory.js ships
  // without its root test.
  '_byan/mcp/byan-mcp-server/test/sync-rules-autobench.test.js',
  // Cluster C — fact-check on conversation claims (C4). The shared detection
  // engine + the non-blocking Stop hook. fact-check-absolutes.js (already
  // shipped) now `require('./lib/fact-check-core')`, so the lib MUST ship or a
  // fresh install crashes — same coupling as transcript-read.js above.
  '.claude/hooks/lib/fact-check-core.js',
  '.claude/hooks/fact-check-claims.js',
  // Leantime integration (one-way FD -> board). server.js (already mirrored)
  // imports ./lib/leantime-sync.js, so the lib MUST ship or a fresh install
  // crashes on boot. Its two test files ship with the server, same convention
  // as the insight / advisory tests above.
  '_byan/mcp/byan-mcp-server/lib/leantime-sync.js',
  '_byan/mcp/byan-mcp-server/test/leantime-sync.test.js',
  '_byan/mcp/byan-mcp-server/test/leantime-tools.test.js',
  // Leantime usage guide ships with the feature (same convention as
  // docs/native-workflows-contract.md): a fresh install gets the setup +
  // token-generation + troubleshooting doc, not just the agent rule.
  'docs/leantime-integration.md',
  // FD -> Leantime auto-sync (the hook + its pure decision core + the core test).
  // The hook is registered in .claude/settings.json (already mirrored), so it
  // fires on a fresh install; without these files the registration would point at
  // a missing script.
  '_byan/mcp/byan-mcp-server/lib/leantime-fd-core.js',
  '_byan/mcp/byan-mcp-server/test/leantime-fd-core.test.js',
  '_byan/mcp/byan-mcp-server/test/leantime-fd-hook.test.js',
  '.claude/hooks/leantime-fd-sync.js',
  // Token cache-alignment (F-A): the full tao moved to a SessionStart hook so it
  // sits in the cacheable prefix, and a compact per-turn voice anchor replaces the
  // old per-turn full-tao re-injection. settings.json (already mirrored) registers
  // inject-voice-anchor.js in UserPromptSubmit, so it MUST ship or a fresh install
  // points at a missing script -- same coupling rationale as leantime-fd-sync.js.
  '.claude/hooks/inject-voice-anchor.js',
  // Remote MCP connector enabling layer (BYAN native to Claude Team). server.js
  // (already mirrored) gains createByanServer()+remoteOnly; these NEW files must
  // ship so a fresh install can host the connector + build/verify skill bundles.
  '_byan/mcp/byan-mcp-server/server-http.js',
  '_byan/mcp/byan-mcp-server/bin/byan-lint-remote-safe.js',
  '_byan/mcp/byan-mcp-server/bin/byan-build-skill-bundles.js',
  '_byan/mcp/byan-mcp-server/skill-bundles-manifest.json',
  '_byan/mcp/byan-mcp-server/test/connector-auth-isolation.test.js',
  '_byan/mcp/byan-mcp-server/test/connector-remote-surface.test.js',
  '_byan/mcp/byan-mcp-server/test/skill-bundler.test.js',
  'docs/connector-admin-runbook.md',
  // Portable MCP config (resolve-config). server.js (already mirrored) imports
  // ./lib/resolve-config.js at load time, so the lib MUST ship or a fresh
  // install crashes on boot (ERR_MODULE_NOT_FOUND). The resolver makes the
  // server own its config (env -> ~/.byan/credentials.json -> localhost), so
  // every yanstaller install works without the fragile .mcp.json ${} expansion.
  // Its test ships with the server, same convention as the tests above.
  '_byan/mcp/byan-mcp-server/lib/resolve-config.js',
  '_byan/mcp/byan-mcp-server/test/resolve-config.test.js',
  // Google Docs publisher (byan_publish, service account / headless). server.js
  // (already mirrored) imports ./lib/gdoc-client.js, which imports ./lib/
  // gdoc-content.js, so both MUST ship or a fresh install crashes on boot.
  // googleapis is lazy-loaded at publish time (not import time), so the server
  // boots without it. The two tests ship with the server (mock googleapis), same
  // convention as the tests above. The usage guide ships like the other docs/.
  '_byan/mcp/byan-mcp-server/lib/gdoc-content.js',
  '_byan/mcp/byan-mcp-server/lib/gdoc-client.js',
  '_byan/mcp/byan-mcp-server/test/gdoc-content.test.js',
  '_byan/mcp/byan-mcp-server/test/gdoc-client.test.js',
  'docs/google-docs-publish.md',
  // Delivery-default chantier (F1/F2/F3): make prod-grade + maximal scope the
  // mechanical default. F1 (the delivery-contract anchor + hook) ships LIVE and
  // is registered in .claude/settings.json (already mirrored), so the hook +
  // its pure lib + the config MUST ship or a fresh install points at a missing
  // script. F2 (completeness-evidence) is required by strict-mode.js (already
  // mirrored) at import time -> the lib MUST ship or the server crashes on boot;
  // its test ships with the server, same convention as the tests above. F3 (the
  // punt-guard Stop hook + its pure detector) is likewise registered in
  // settings.json. The config carries both blockers DISARMED by default.
  '_byan/_config/delivery-default.json',
  '.claude/hooks/inject-delivery-default.js',
  '.claude/hooks/lib/delivery-contract.js',
  '.claude/hooks/punt-guard.js',
  '.claude/hooks/lib/punt-detect.js',
  '_byan/mcp/byan-mcp-server/lib/completeness-evidence.js',
  '_byan/mcp/byan-mcp-server/test/completeness-evidence.test.js',
  // Claude Code channel (research preview). The yanstaller registers an INERT
  // byan-channel entry in .mcp.json pointing at channel-entry.js, so these NEW
  // files MUST ship or a fresh install's registration points at a missing
  // script. channel-entry.js imports ./lib/channel-server.js (already imports
  // ./lib/resolve-config.js, shipped above) which imports ./lib/channel-poll.js,
  // so all three runtime files must ship together. Its tests ship with the
  // server, same convention as the tests above: channel.test.js (poll/reply
  // behaviour) and channel-resolve.test.js (the env-absent resolver path).
  '_byan/mcp/byan-mcp-server/channel-entry.js',
  '_byan/mcp/byan-mcp-server/lib/channel-server.js',
  '_byan/mcp/byan-mcp-server/lib/channel-poll.js',
  '_byan/mcp/byan-mcp-server/test/channel.test.js',
  '_byan/mcp/byan-mcp-server/test/channel-resolve.test.js',
  // Native workflow model tiering (FD native-workflow-model-tiering). The
  // tier-script lib is the analysis engine under BOTH the bin and the
  // tier-script-guard.js PreToolUse hook; the hook is registered in
  // .claude/settings.json (already mirrored), so lib + bin + hook MUST ship
  // together or a fresh install's registration points at a missing script.
  // Tests ship with the server, same convention as above.
  '_byan/mcp/byan-mcp-server/lib/tier-script.js',
  '_byan/mcp/byan-mcp-server/bin/byan-tier-script.js',
  '_byan/mcp/byan-mcp-server/test/tier-script.test.js',
  '_byan/mcp/byan-mcp-server/test/tier-hook.test.js',
  '.claude/hooks/tier-script-guard.js',
  // Codex auto-delegation (FD codex-auto-delegation, F1/F5). The
  // codex-autodelegate.js UserPromptSubmit hook is registered in
  // .claude/settings.json (already mirrored), so the hook + its two pure libs
  // MUST ship or a fresh install points at a missing script / a broken require.
  // The libs live under .claude/hooks/lib/ (the shippable home) precisely so the
  // hook is self-contained in a user project (no dependency on the repo-only
  // src/loadbalancer subsystem). The hook is DISARMED by default (no-ops until
  // the yanstaller writes _byan/_config/autodelegate.json on opt-in).
  '.claude/hooks/codex-autodelegate.js',
  '.claude/hooks/lib/usage-estimator.js',
  '.claude/hooks/lib/autodelegate-decision.js',
  // F3 perf-routing mechanism: autodelegate-decision.js requires it, so it MUST
  // ship alongside. Neutral by default (empty forces) — asserts no unsourced
  // perf ranking (below BYAN's L2 perf floor); opt-in via config.
  '.claude/hooks/lib/perf-routing.js',
  // Codex auto-delegation usage guide ships with the hook. It explains the
  // three Codex layers: MCP config, native skills in ~/.codex/skills, and the
  // optional backup-pool/autodelegate config.
  'docs/codex-auto-delegation.md',
  // Native Codex entrypoint skill. Fresh Codex installs need a skill named
  // "byan" so `$byan` resolves directly, not only the Claude-derived specialty
  // skills copied from .claude/skills.
  '.codex/skills/byan/SKILL.md',
  // Portable Claude <-> Codex project handoff workflow. The CLI ships through
  // package files[] (install/bin + install/lib); the workflow must also ship in
  // the project template so assistants can invoke the operational procedure.
  '_byan/workflow/simple/byan/project-handoff-workflow.md',
  // Intelligent dispatch (Codex/Claude routing + architect<->dev loop, option B).
  // Four cooperating ESM libs: the pure router (F1) is imported by the Codex bridge
  // (F2) and the orchestrator (F4); the orchestrator also imports the blackboard
  // (F3). None is required by server.js at boot (standalone libs a main-thread skill
  // drives), but the feature only WORKS on a fresh install if all four ship
  // together. Tests ship with the server (same convention as above). The native
  // workflow script is the launch facade for one routed task ; the usage guide
  // ships like the other docs/.
  '_byan/mcp/byan-mcp-server/lib/dispatch-router.js',
  '_byan/mcp/byan-mcp-server/lib/codex-bridge.js',
  '_byan/mcp/byan-mcp-server/lib/dispatch-blackboard.js',
  '_byan/mcp/byan-mcp-server/lib/dispatch-orchestrator.js',
  '_byan/mcp/byan-mcp-server/test/dispatch-router.test.js',
  '_byan/mcp/byan-mcp-server/test/codex-bridge.test.js',
  '_byan/mcp/byan-mcp-server/test/dispatch-blackboard.test.js',
  '_byan/mcp/byan-mcp-server/test/dispatch-orchestrator.test.js',
  '.claude/workflows/intelligent-dispatch.js',
  'docs/intelligent-dispatch.md',
  // Agent entry gate (match-or-create) : the mandatory agent-dispatch front step.
  // The matcher lib is the pre-filter Hermes+BYAN present ; the doctrine rule is
  // pointed at from CLAUDE.md (already mirrored) so it must ship ; the reactive
  // net is a Stop hook registered in .claude/settings.json (already mirrored) +
  // its pure core, so both MUST ship or a fresh install points at a missing
  // script. The matcher test ships with the server (same convention as above) ;
  // the .claude/__tests__ agent-gate test does NOT ship (per the note above).
  '_byan/mcp/byan-mcp-server/lib/agent-matcher.js',
  '_byan/mcp/byan-mcp-server/test/agent-matcher.test.js',
  '.claude/hooks/lib/agent-gate.js',
  '.claude/hooks/agent-gate-check.js',
  '.claude/rules/agent-entry-gate.md',
  // BYAN sovereignty teeth (byan-sovereignty FD). Each new hook is registered in
  // .claude/settings.json (already mirrored) so it MUST ship or a fresh install
  // points at a missing script (the `[ -f ] || exit 0` guard would degrade it to a
  // silent no-op — the feature absent with no signal). WI-1 : the armed-Codex
  // delegation PreToolUse tooth + its pure core. WI-2 : the voice-conformance Stop
  // net + its pure core (also required by inject-voice-anchor.js, already mirrored,
  // so it MUST ship or that hook's require breaks). WI-7 : the armament report
  // lib + bin + test (reads the ledgers' would-fire before any arming decision).
  // WI-3/WI-4 modified agent-gate.js / agent-gate-check.js / inject-voice-anchor.js
  // which are already mirrored, so they re-sync automatically.
  '.claude/hooks/codex-delegate-guard.js',
  '.claude/hooks/lib/codex-delegate-gate.js',
  '.claude/hooks/voice-conformance-check.js',
  '.claude/hooks/lib/voice-conformance.js',
  '_byan/mcp/byan-mcp-server/lib/armament-report.js',
  '_byan/mcp/byan-mcp-server/bin/byan-armament-report.js',
  '_byan/mcp/byan-mcp-server/test/armament-report.test.js',
  // The shipping parity guard : makes "a new sovereignty hook is not shipped /
  // not wired" CI-visible (the drift the review caught). Ships like the other
  // server tests.
  '_byan/mcp/byan-mcp-server/test/sovereignty-shipping.test.js',
];

// The template lives under this root-relative directory.
export const TEMPLATE_DIR = path.join('install', 'templates');

export function isExcluded(relPath) {
  const posix = relPath.split(path.sep).join('/');
  return EXCLUSIONS.some((prefix) => posix.startsWith(prefix));
}

// Content fingerprint for the root-vs-template comparison. sha1 is for change
// detection, not security: a fast digest that flags any byte difference (text or
// binary) is all the drift check needs.
function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// Pure classification. The caller supplies the template's current file list and
// two readers; this function performs no I/O of its own, which is what makes the
// risky logic exhaustively unit-testable.
//
//   templateFiles : array of root-relative POSIX paths currently in the template
//   readRoot(rel) : Buffer of root/rel, or null if absent in root
//   readTemplate(rel) : Buffer of template/rel
//   additions     : explicit new-file list (defaults to TARGET_ADDITIONS)
//
// Returns { toUpdate, toAdd, excluded, orphans, identical, missingTargets }.
//   toUpdate : in template, present in root, content differs  -> re-sync
//   identical: in template, present in root, content matches   -> no-op
//   excluded : matches an EXCLUSION prefix                      -> never touched
//   orphans  : in template, ABSENT from root                   -> never touched
//   toAdd    : a target absent from template, present in root   -> add
//   missingTargets : a target absent from BOTH                  -> surfaced, not silent
export function buildPlan({ templateFiles, readRoot, readTemplate, additions = TARGET_ADDITIONS }) {
  const plan = { toUpdate: [], toAdd: [], excluded: [], orphans: [], identical: [], missingTargets: [] };
  const inTemplate = new Set(templateFiles);

  for (const rel of templateFiles) {
    if (isExcluded(rel)) {
      plan.excluded.push(rel);
      continue;
    }
    const rootBuf = readRoot(rel);
    if (rootBuf === null || rootBuf === undefined) {
      plan.orphans.push(rel);
      continue;
    }
    const tmplBuf = readTemplate(rel);
    if (sha1(rootBuf) === sha1(tmplBuf)) plan.identical.push(rel);
    else plan.toUpdate.push(rel);
  }

  for (const rel of additions) {
    if (inTemplate.has(rel)) continue; // already handled by the template loop
    if (isExcluded(rel)) continue; // an excluded path is never an addition
    const rootBuf = readRoot(rel);
    if (rootBuf === null || rootBuf === undefined) {
      plan.missingTargets.push(rel); // cannot add what root does not have — surface it
      continue;
    }
    plan.toAdd.push(rel);
  }

  return plan;
}

// Pure drift verdict for --check. Drift = anything the sync WOULD change.
// Exclusions and orphans are not drift (they are intentionally left alone).
// missingTargets is drift: a promised file the package cannot ship.
export function checkDrift(plan) {
  const drifted = [...plan.toUpdate];
  const missing = [...plan.toAdd, ...plan.missingTargets];
  return { drifted, missing, ok: drifted.length === 0 && missing.length === 0 };
}

// Recursively list root-relative POSIX paths of every file under dir. Returns []
// if dir does not exist (a fresh checkout without a template is not an error here).
export function walkRelFiles(dir, { io = fs, base = dir } = {}) {
  let entries;
  try {
    entries = io.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkRelFiles(full, { io, base }));
    } else if (e.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

// Build the plan against real directories. rootDir holds the source of truth;
// templateDir is install/templates/ under rootDir.
export function planSync({ rootDir, templateDir, io = fs } = {}) {
  const tmplAbs = templateDir || path.join(rootDir, TEMPLATE_DIR);
  const templateFiles = walkRelFiles(tmplAbs, { io });
  const readRoot = (rel) => {
    const p = path.join(rootDir, rel);
    if (!io.existsSync(p)) return null;
    return io.readFileSync(p);
  };
  const readTemplate = (rel) => io.readFileSync(path.join(tmplAbs, rel));
  const plan = buildPlan({ templateFiles, readRoot, readTemplate });

  // Mode fidelity. buildPlan compares content only; a file whose bytes match but
  // whose permission bits differ (a hook that lost its exec bit) is still drift.
  // Promote those from identical to toUpdate so applyPlan restores the mode.
  const modeDrift = plan.identical.filter((rel) => {
    const rmode = io.statSync(path.join(rootDir, rel)).mode & 0o777;
    const tmode = io.statSync(path.join(tmplAbs, rel)).mode & 0o777;
    return rmode !== tmode;
  });
  if (modeDrift.length) {
    const drifted = new Set(modeDrift);
    plan.identical = plan.identical.filter((rel) => !drifted.has(rel));
    plan.toUpdate.push(...modeDrift);
  }
  return plan;
}

// Apply a plan: copy root/rel -> template/rel for every toUpdate and toAdd.
// Each copy is atomic (stage adjacent tmp, then rename over the target) so a crash
// mid-run never leaves a half-written file that would masquerade as a real one.
// Returns { updated, added }.
export function applyPlan(plan, { rootDir, templateDir, io = fs } = {}) {
  const tmplAbs = templateDir || path.join(rootDir, TEMPLATE_DIR);
  const copy = (rel) => {
    const src = path.join(rootDir, rel);
    const dest = path.join(tmplAbs, rel);
    io.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    try {
      io.writeFileSync(tmp, io.readFileSync(src));
      // Preserve the source permission bits. writeFileSync creates the temp file
      // with the default mode, which would silently strip the exec bit off a
      // mirrored hook or script and leave it non-runnable for an installed user.
      io.chmodSync(tmp, io.statSync(src).mode & 0o777);
      io.renameSync(tmp, dest);
    } catch (err) {
      try {
        io.unlinkSync(tmp);
      } catch {
        void 0;
      }
      throw err;
    }
  };
  for (const rel of plan.toUpdate) copy(rel);
  for (const rel of plan.toAdd) copy(rel);
  return { updated: [...plan.toUpdate], added: [...plan.toAdd] };
}

// Convenience: plan + drift verdict in one call (used by --check).
export function checkSync({ rootDir, templateDir, io = fs } = {}) {
  return checkDrift(planSync({ rootDir, templateDir, io }));
}
