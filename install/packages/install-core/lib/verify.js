'use strict';

// verify.js — the READ-ONLY verifier. Never writes, never spawns.
//
// Two input forms:
//   verify(plan, { cwd })  -> check every declared artifact in the plan exists
//                             and matches (copy/render/write dests, .mcp.json
//                             cleanliness, env KEY presence, manifest hashes).
//   verify({ cwd })        -> check the v2.19 AUTO artifact identity set is
//                             present (retro-compat proof, F2/F5 share it).
//
// Returns { ok, checks, missing, drift }:
//   - checks : one Check {id, kind, ok, detail} per thing inspected
//   - missing: relative paths the plan/target declared but are absent
//   - drift  : artifacts present but WRONG (bad mcp url, leaked token, hash
//              mismatch vs the manifest ledger)
//
// WHY read-only: this gives the wizard (F2) and Electron (F5) the same
// machine-checkable proof an install is complete and untampered without any
// side-effect. Token VALUES are never read into the report — only KEY presence.

const path = require('path');
const fs = require('fs-extra');

const { sha256File } = require('./hash-util');

// The v2.19 AUTO artifact identity set, encoded as a frozen list of relative
// paths. Built from the recon "AUTO artifact superset" enumeration: the 13
// _byan subtrees, the platform stub dirs, the .claude rules surface, the config
// + soul files, .mcp.json and .env. The retro-compat test asserts every entry
// here exists after a full detect->plan->apply chain (superset invariant).
//
// WHY directories not files: at the identity level the AUTO set is "these trees
// exist". File-level parity (config.yaml fields, .mcp.json content) is checked
// separately in the retro-compat test; here we assert structural presence.
const AUTO_ARTIFACT_SET = Object.freeze([
  // 13 _byan subtrees
  '_byan/agent',
  '_byan/workflow',
  '_byan/connaissance',
  '_byan/command',
  '_byan/worker',
  '_byan/memoire',
  '_byan/core',
  '_byan/bmb',
  '_byan/bmm',
  '_byan/tea',
  '_byan/cis',
  '_byan/_config',
  '_byan/data',
  // platform stubs
  '.github/agents',
  // claude rules surface
  '.claude/CLAUDE.md',
  '.claude/rules',
  // config + soul files
  '_byan/bmb/config.yaml',
  '_byan/agent/byan/soul.md',
  '_byan/agent/byan/tao.md',
  '_byan/agent/byan/soul-memory.md',
  '_byan/agent/byan/creator-soul.md',
  // wiring
  '.mcp.json',
  '.env',
]);

const BYAN_API_SUFFIX_RE = /\/api(\/.*)?$/;

function isPlan(arg) {
  return arg && typeof arg === 'object' && Array.isArray(arg.steps);
}

async function verify(planOrTarget, opts) {
  const o = opts || {};
  // Resolve cwd from opts first, then from a target object's cwd field.
  let cwd = o.cwd;
  if (!cwd && planOrTarget && typeof planOrTarget === 'object' && !isPlan(planOrTarget)) {
    cwd = planOrTarget.cwd;
  }
  cwd = cwd || process.cwd();

  if (isPlan(planOrTarget)) {
    return verifyPlan(planOrTarget, cwd);
  }
  return verifyTarget(cwd);
}

// Target form: assert the AUTO identity set is present. No hash checking (no
// manifest implied by a bare target) — pure structural presence.
async function verifyTarget(cwd) {
  const checks = [];
  const missing = [];
  for (let i = 0; i < AUTO_ARTIFACT_SET.length; i++) {
    const rel = AUTO_ARTIFACT_SET[i];
    const exists = await fs.pathExists(path.join(cwd, rel));
    checks.push({ id: rel, kind: 'exists', ok: exists, detail: rel });
    if (!exists) missing.push(rel);
  }
  return finalize(checks, missing, []);
}

// Plan form: walk the plan's mutating steps and verify each declared artifact.
async function verifyPlan(plan, cwd) {
  const checks = [];
  const missing = [];
  const drift = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    await verifyStep(step, cwd, checks, missing, drift);
  }

  // Manifest hash ledger: if a manifest landed, every tracked file must still
  // hash to its recorded value. A mismatch is drift; a missing tracked file is
  // missing.
  await verifyManifest(plan, cwd, checks, missing, drift);

  return finalize(checks, missing, drift);
}

async function verifyStep(step, cwd, checks, missing, drift) {
  switch (step.type) {
    case 'mkdir':
    case 'copy-template':
    case 'write-file': {
      await checkExists(step.id, step.dest, cwd, checks, missing);
      return;
    }
    case 'render-mcp': {
      await checkMcp(step, cwd, checks, missing, drift);
      return;
    }
    case 'write-env': {
      await checkEnvKeys(step, cwd, checks, missing, drift);
      return;
    }
    case 'write-settings-local': {
      await checkSettingsLocal(step, cwd, checks, missing, drift);
      return;
    }
    case 'manifest': {
      await checkExists(step.id, step.dest, cwd, checks, missing);
      return;
    }
    // auth-handoff / cli-install declare no on-disk artifact to verify.
    default:
      return;
  }
}

async function checkExists(id, rel, cwd, checks, missing) {
  if (!rel) return;
  const exists = await fs.pathExists(path.join(cwd, rel));
  checks.push({ id: id, kind: 'exists', ok: exists, detail: rel });
  if (!exists) missing.push(rel);
}

// .mcp.json: must parse, carry mcpServers.byan, have a clean BYAN_API_URL (no
// /api suffix), and carry NO raw token. The token VALUE is never logged — its
// mere presence as a key is the drift signal.
async function checkMcp(step, cwd, checks, missing, drift) {
  const rel = step.dest || '.mcp.json';
  const full = path.join(cwd, rel);
  if (!(await fs.pathExists(full))) {
    checks.push({ id: step.id, kind: 'exists', ok: false, detail: rel });
    missing.push(rel);
    return;
  }
  let parsed;
  try {
    parsed = await fs.readJson(full);
  } catch (e) {
    checks.push({ id: step.id, kind: 'parse', ok: false, detail: rel + ' is not valid JSON' });
    drift.push(rel + ' parse error');
    return;
  }
  const byan = parsed && parsed.mcpServers && parsed.mcpServers.byan;
  if (!byan) {
    checks.push({ id: step.id, kind: 'mcp', ok: false, detail: 'mcpServers.byan absent' });
    drift.push(rel + ' missing mcpServers.byan');
    return;
  }
  const env = byan.env || {};
  let ok = true;
  if (typeof env.BYAN_API_URL === 'string' && BYAN_API_SUFFIX_RE.test(env.BYAN_API_URL)) {
    drift.push(rel + ' BYAN_API_URL has an /api suffix');
    ok = false;
  }
  if (env.BYAN_API_TOKEN !== undefined) {
    // Presence only — never read or log the value.
    drift.push(rel + ' contains a raw BYAN_API_TOKEN (must not be committed)');
    ok = false;
  }
  checks.push({ id: step.id, kind: 'mcp', ok: ok, detail: rel });
}

// .env: assert the declared KEYS exist. Value never read into the report.
async function checkEnvKeys(step, cwd, checks, missing, drift) {
  const rel = '.env';
  const full = path.join(cwd, rel);
  if (!(await fs.pathExists(full))) {
    checks.push({ id: step.id, kind: 'exists', ok: false, detail: rel });
    missing.push(rel);
    return;
  }
  const content = await fs.readFile(full, 'utf8');
  const keys = Object.keys((step.vars && step.vars) || {});
  let ok = true;
  for (let i = 0; i < keys.length; i++) {
    const present = new RegExp('^' + escapeRe(keys[i]) + '=', 'm').test(content);
    if (!present) {
      drift.push(rel + ' missing key ' + keys[i]);
      ok = false;
    }
  }
  checks.push({ id: step.id, kind: 'env-keys', ok: ok, detail: rel });
}

async function checkSettingsLocal(step, cwd, checks, missing, drift) {
  const rel = step.dest || '.claude/settings.local.json';
  const full = path.join(cwd, rel);
  if (!(await fs.pathExists(full))) {
    checks.push({ id: step.id, kind: 'exists', ok: false, detail: rel });
    missing.push(rel);
    return;
  }
  let parsed;
  try {
    parsed = await fs.readJson(full);
  } catch (e) {
    drift.push(rel + ' parse error');
    checks.push({ id: step.id, kind: 'parse', ok: false, detail: rel });
    return;
  }
  const env = (parsed && parsed.env) || {};
  const keys = Object.keys((step.env && step.env) || {});
  let ok = true;
  for (let i = 0; i < keys.length; i++) {
    // KEY existence only — never read the value.
    if (!(keys[i] in env)) {
      drift.push(rel + ' missing env key ' + keys[i]);
      ok = false;
    }
  }
  checks.push({ id: step.id, kind: 'settings-env-keys', ok: ok, detail: rel });
}

// Verify the manifest hash ledger if present. _byan/.manifest.json maps a
// relative path -> { sha256 }. Each tracked file is re-hashed; a mismatch is
// drift, an absent tracked file is missing.
async function verifyManifest(plan, cwd, checks, missing, drift) {
  const manifestStep = plan.steps.find((s) => s.type === 'manifest');
  if (!manifestStep) return;
  const rel = manifestStep.dest || '_byan/.manifest.json';
  const full = path.join(cwd, rel);
  if (!(await fs.pathExists(full))) return; // already flagged by the step check
  let manifest;
  try {
    manifest = await fs.readJson(full);
  } catch (e) {
    drift.push(rel + ' parse error');
    return;
  }
  const ledger = manifest.files || {};
  const tracked = Object.keys(ledger);
  for (let i = 0; i < tracked.length; i++) {
    const trel = tracked[i];
    const tfull = path.join(cwd, trel);
    if (!(await fs.pathExists(tfull))) {
      missing.push(trel);
      checks.push({ id: 'manifest:' + trel, kind: 'hash', ok: false, detail: 'tracked file missing' });
      continue;
    }
    const actual = await sha256File(tfull);
    const expected = ledger[trel] && ledger[trel].sha256;
    const ok = actual === expected;
    checks.push({ id: 'manifest:' + trel, kind: 'hash', ok: ok, detail: trel });
    if (!ok) drift.push(trel + ' hash mismatch (manifest drift)');
  }
}

function finalize(checks, missing, drift) {
  const ok = checks.every((c) => c.ok) && missing.length === 0 && drift.length === 0;
  return { ok: ok, checks: checks, missing: missing, drift: drift };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  verify,
  AUTO_ARTIFACT_SET,
};
