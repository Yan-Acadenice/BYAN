'use strict';

// byan-install-core — the headless install ENGINE for BYAN.
//
// This is the single, stable, LLM-free, prompt-free public surface that both
// front-ends bind to: the npm CLI wizard (F2) and the Electron app (F5). It
// exposes the four-verb install lifecycle plus the contract constants and error
// classes callers need to drive and validate an install:
//
//   detect(opts)            -> Promise<MachineProfile>  (PURE w.r.t. the target)
//   plan(profile, answers)  -> InstallPlan              (PURE, deterministic)
//   apply(plan, opts)       -> Promise<ApplyResult>     (the ONLY mutator)
//   verify(planOrTarget)    -> Promise<VerifyReport>    (READ-ONLY)
//
// The four verbs form a pipeline: detect the machine, plan the install against
// the I9 answers contract, apply the plan to disk, verify the result. detect and
// plan never touch the target project; apply is the only side-effecting step;
// verify never writes and never spawns.
//
// LOAD ORDER (C10): the ES5, dependency-free preflight primitive is the ONLY
// thing required eagerly here. Every modern verb (which transitively pulls
// fs-extra / child_process) is exposed through a lazy getter and is required on
// FIRST ACCESS, not at import time. So a front-end can require this package,
// run preflight() to gate the Node version, and only touch detect/plan/apply
// afterwards — the modern engine never loads before the guard runs. For an
// even stricter guard on ancient Node, require the dedicated entry
// `byan-install-core/preflight`, which pulls ONLY the ES5 primitive.
//
// CommonJS, zero third-party dep beyond byan-platform-config + fs-extra. No
// emoji, no prompts, no LLM.

// Eager + safe: preflight has zero require() of its own, so loading this
// package and calling preflight() pulls no modern syntax/deps.
const preflightMod = require('./lib/preflight');

const surface = {
  preflight: preflightMod.preflight,
  checkNode: preflightMod.checkNode,
  MIN_MAJOR: preflightMod.MIN_MAJOR,
};

// Each entry resolves its module on first access only. Defining them as
// enumerable getters keeps `const { detect } = require('byan-install-core')`
// and `require('byan-install-core').detect` both working, while ensuring the
// modern modules stay unloaded until a verb is actually used.
const lazyBindings = {
  // --- the four-verb lifecycle ----------------------------------------------
  detect: function () { return require('./lib/detect').detect; },
  plan: function () { return require('./lib/plan').plan; },
  apply: function () { return require('./lib/apply').apply; },
  verify: function () { return require('./lib/verify').verify; },

  // --- recommender (recipe selection for UIs) -------------------------------
  loadRecipes: function () { return require('./lib/recommender').loadRecipes; },
  recommend: function () { return require('./lib/recommender').recommend; },
  recommendPlatform: function () { return require('./lib/recommender').recommendPlatform; },
  recipeFor: function () { return require('./lib/recommender').recipeFor; },
  DEFAULTS: function () { return require('./lib/recommender').DEFAULTS; },

  // --- advanced primitives --------------------------------------------------
  lookpath: function () { return require('./lib/lookpath').lookpath; },
  lookpathSync: function () { return require('./lib/lookpath').lookpathSync; },
  renderMcp: function () { return require('./lib/mcp-renderer').renderMcp; },
  previewMcp: function () { return require('./lib/mcp-renderer').previewMcp; },
  validateApiUrl: function () { return require('./lib/mcp-renderer').validateApiUrl; },

  // --- contract constants ---------------------------------------------------
  ANSWERS_SCHEMA: function () { return require('./lib/plan').ANSWERS_SCHEMA; },
  AUTO_ARTIFACT_SET: function () { return require('./lib/verify').AUTO_ARTIFACT_SET; },

  // --- error classes (callers branch on these) ------------------------------
  McpUrlError: function () { return require('./lib/mcp-renderer').McpUrlError; },
  InstallPlanError: function () { return require('./lib/plan').InstallPlanError; },
  ApplyError: function () { return require('./lib/apply').ApplyError; },
};

Object.keys(lazyBindings).forEach(function (name) {
  Object.defineProperty(surface, name, {
    enumerable: true,
    configurable: true,
    get: lazyBindings[name],
  });
});

module.exports = surface;
