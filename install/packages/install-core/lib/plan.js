'use strict';

// plan.js — the PURE planner.
//
// plan(profile, answers) -> InstallPlan. It takes a MachineProfile (from
// detect.js) plus the I9 non-interactive answers contract and produces a
// serializable, deterministic ordered step list. It is PURE: no disk write, no
// spawn, no LLM, no prompt. It NEVER requires child_process or any fs-write
// surface — the only thing it touches is lib/recommender.js (which itself only
// READS the versioned JSON table) to resolve the 'auto' fields.
//
// Determinism: same (profile, answers) => byte-identical plan. Order is fixed
// (mkdir -> copy -> write-config -> soul -> render-mcp -> env -> cli-install ->
// auth-handoff -> manifest); `when:false` steps are pruned; planId is a stable
// content hash so plans are diffable/cacheable.
//
// Flow-unique (I37): AUTO/CUSTOM/MANUAL are VALUES of answers.flow, not separate
// code paths. One builder runs for all three; only step `when` predicates and
// the stub-copy breadth differ.
//
// Covers C1 (plan purity), C5 (consumes the table), C7 (no prompts inside),
// part of C6 (superset of the v2.19 AUTO artifact contract), C12 (AUTH handoff).

const crypto = require('crypto');
const recommender = require('./recommender');

// crypto is used ONLY for a content hash (planId) — a pure, deterministic
// transform of the plan JSON. It performs no I/O and no spawn, so plan() stays
// pure. WHY crypto over a hand-rolled hash: sha256 of canonical JSON is the
// standard, collision-resistant, reproducible plan identity.

class InstallPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InstallPlanError';
  }
}

// The full I9 non-interactive answers contract, as a documented shape. Callers
// (npm CLI wizard F2, Electron F5) build this object; plan() consumes it with
// ZERO prompts of its own (C7). Values here are the DEFAULT/AUTO presets so a
// minimal answers object reproduces v2.19 AUTO.
const ANSWERS_SCHEMA = Object.freeze({
  flow: 'auto', // 'auto' | 'custom' | 'manual' — the only carry-over of the legacy modes
  platforms: 'auto', // ['claude'|'codex'|'copilot'] | 'auto' (=> recommender)
  agents: [], // required non-empty IFF flow==='manual'
  user: { name: '', communicationLanguage: 'fr', documentLanguage: undefined },
  soul: { mode: 'creator', importPath: undefined }, // 'creator'|'blank'|'import'|'skip'
  byanWeb: { enabled: true, apiUrl: 'auto', token: undefined, syncConsent: false },
  turboWhisper: 'skip', // 'skip'|'local'|'docker'
  costOptimizer: false,
  installV2: false,
  installClis: false,
  byanVersion: '',
});

const VALID_FLOWS = ['auto', 'custom', 'manual'];
const VALID_SOUL_MODES = ['creator', 'blank', 'import', 'skip'];

// The reference token the plan carries for the byanWeb secret. The raw value
// lives in answers.byanWeb.token and is resolved at APPLY time from
// opts.secrets[KEY] via apply.js's '@secret:KEY' convention — it is NEVER
// serialized into the plan object. WHY: a plan is diffable/cacheable and may be
// logged; a secret must not leak through it. The string form (not an object)
// is what apply.resolveSecret understands, so plan and apply share one
// secret-reference contract.
const TOKEN_KEY = 'BYAN_API_TOKEN';
const TOKEN_REF = '@secret:' + TOKEN_KEY;

// --- validation ---------------------------------------------------------------

function assertProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new InstallPlanError('plan(profile, answers): profile must be a MachineProfile object');
  }
}

function assertAnswers(answers) {
  if (!answers || typeof answers !== 'object') {
    throw new InstallPlanError('plan(profile, answers): answers must be an object (the I9 contract)');
  }
  const flow = answers.flow;
  if (VALID_FLOWS.indexOf(flow) === -1) {
    throw new InstallPlanError('answers.flow must be one of ' + VALID_FLOWS.join('|') + ', got "' + flow + '"');
  }
  if (flow === 'manual') {
    if (!Array.isArray(answers.agents) || answers.agents.length === 0) {
      throw new InstallPlanError("flow:'manual' requires a non-empty answers.agents[]");
    }
  }
  const soul = answers.soul || {};
  if (soul.mode !== undefined && VALID_SOUL_MODES.indexOf(soul.mode) === -1) {
    throw new InstallPlanError('answers.soul.mode must be one of ' + VALID_SOUL_MODES.join('|'));
  }
  if (soul.mode === 'import' && (typeof soul.importPath !== 'string' || soul.importPath.length === 0)) {
    throw new InstallPlanError("soul.mode:'import' requires answers.soul.importPath");
  }
}

// --- answer normalization (resolve every 'auto') ------------------------------

// Project the raw answers onto a fully-concrete object: 'auto' platforms become
// the recommender's pick, 'auto' apiUrl becomes the table default, defaults fill
// the rest. Pure (recommender only reads the table). Profile-driven so the same
// profile+answers always normalizes identically (determinism).
function normalizeAnswers(profile, answers) {
  const soul = answers.soul || {};
  const byanWeb = answers.byanWeb || {};
  const user = answers.user || {};

  const platforms = resolvePlatforms(profile, answers.platforms);
  const apiUrl = byanWeb.apiUrl && byanWeb.apiUrl !== 'auto'
    ? byanWeb.apiUrl
    : recommender.DEFAULTS.apiUrl;

  return {
    flow: answers.flow,
    platforms: platforms,
    agents: Array.isArray(answers.agents) ? answers.agents.slice() : [],
    user: {
      name: user.name || '',
      communicationLanguage: user.communicationLanguage || 'fr',
      documentLanguage: user.documentLanguage || user.communicationLanguage || 'fr',
    },
    soul: { mode: soul.mode || 'creator', importPath: soul.importPath },
    byanWeb: {
      enabled: byanWeb.enabled !== false,
      apiUrl: apiUrl,
      hasToken: typeof byanWeb.token === 'string' && byanWeb.token.length > 0,
      syncConsent: byanWeb.syncConsent === true,
    },
    turboWhisper: answers.turboWhisper || 'skip',
    costOptimizer: answers.costOptimizer === true,
    installV2: answers.installV2 === true,
    installClis: answers.installClis === true,
    byanVersion: answers.byanVersion || '',
  };
}

// Resolve the requested platforms to a concrete, deduped, preference-ordered
// list. 'auto' (or absent) => the single best pick.
//
// detect.js already computes profile.recommended.primaryPlatform from the REAL
// machine shape (flat per-platform keys), so for 'auto' we trust THAT value —
// it is the authoritative recommendation and was derived from the table's
// preference order applied to actually-found platforms. recommender.recommendPlatform
// is only the fallback when a caller hands us a profile without a precomputed
// recommendation (e.g. a hand-built profile in the nested-platforms shape).
function resolvePlatforms(profile, requested) {
  if (requested && requested !== 'auto' && Array.isArray(requested) && requested.length) {
    return dedupePreserveOrder(requested);
  }
  const recommended = profile.recommended && profile.recommended.primaryPlatform;
  if (typeof recommended === 'string' && recommended.length > 0) {
    return [recommended];
  }
  return [recommender.recommendPlatform(profile)];
}

function dedupePreserveOrder(list) {
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  }
  return out;
}

// True when a platform's CLI is already on the machine (REAL profile shape:
// flat per-platform keys with `present`). Defensive when the key is absent
// (e.g. copilot has no probe in the current matrix => treat as not found).
function platformFound(profile, platform) {
  return Boolean(profile[platform] && profile[platform].present === true);
}

// --- step builders ------------------------------------------------------------

// Each builder returns a step descriptor (or null). A `when:false` descriptor is
// pruned later; builders express their condition by returning null directly so
// the final plan never carries when:false (asserted by the test).

function coreCopySteps() {
  // Always-present base: the _byan platform tree.
  return [
    { id: 'mkdir:_byan', type: 'mkdir', dest: '_byan' },
    { id: 'copy:_byan', type: 'copy-template', src: 'templates/_byan', dest: '_byan', overwrite: true },
  ];
}

function platformCopySteps(norm) {
  const steps = [];
  const platforms = norm.platforms;

  if (platforms.indexOf('claude') !== -1) {
    steps.push({
      id: 'copy:.claude',
      type: 'copy-template',
      src: 'templates/.claude',
      dest: '.claude',
      overwrite: true,
    });
  }

  if (platforms.indexOf('copilot') !== -1) {
    // Stub breadth (I37): auto/custom copy ALL stubs; manual copies only the
    // explicit agents[]. Same step, different breadth.
    const all = norm.flow !== 'manual';
    steps.push({
      id: 'copy:.github/agents',
      type: 'copy-template',
      src: 'templates/.github/agents',
      dest: '.github/agents',
      overwrite: true,
      all: all,
      agents: all ? null : norm.agents.slice(),
    });
  }

  return steps;
}

function configStep(norm) {
  // Mirrors the v2.19 AUTO config.yaml field block. The primary platform is the
  // first selected one (the recommender already ordered 'auto').
  const data = {
    user_name: norm.user.name,
    communication_language: norm.user.communicationLanguage,
    document_output_language: norm.user.documentLanguage,
    platform: norm.platforms.join(','),
    install_mode: norm.flow,
    byan_version: norm.byanVersion,
    soul_mode: norm.soul.mode,
  };
  // MANUAL records the explicit agent list, matching v2.19 installed_agents.
  if (norm.flow === 'manual') {
    data.installed_agents = norm.agents.slice();
  }
  return {
    id: 'write:config.yaml',
    type: 'write-file',
    dest: '_byan/bmb/config.yaml',
    format: 'yaml',
    data: data,
  };
}

// The creator-mode soul step carries the byan-* -> active rename map exactly as
// v2.19 does (byan-soul.md -> soul.md, etc.). Returns null for non-creator modes
// (blank/import/skip are handled by their own steps in apply; out of plan scope
// here beyond not emitting the creator rename).
function soulStep(norm) {
  if (norm.soul.mode !== 'creator') return null;
  return {
    id: 'soul:creator',
    type: 'copy-template',
    src: 'templates/_byan/agent/byan',
    dest: '_byan/agent/byan',
    files: [
      'creator-soul.md->creator-soul.md',
      'byan-soul.md->soul.md',
      'byan-tao.md->tao.md',
      'byan-soul-memory.md->soul-memory.md',
    ],
  };
}

function mcpStep(norm) {
  // render-mcp only when byan_web is on AND claude is a target (the .mcp.json is
  // a Claude Code artifact).
  if (!norm.byanWeb.enabled) return null;
  if (norm.platforms.indexOf('claude') === -1) return null;
  return {
    id: 'render:mcp',
    type: 'render-mcp',
    dest: '.mcp.json',
    apiUrl: norm.byanWeb.apiUrl,
  };
}

function envStep(norm) {
  if (!norm.byanWeb.enabled) return null;
  // vars carry the public URL inline; the token is carried by REFERENCE only
  // (resolved at apply-time from opts.secrets), never as a raw value.
  return {
    id: 'write:env',
    type: 'write-env',
    dest: '.env',
    scope: 'project',
    vars: {
      BYAN_API_URL: norm.byanWeb.apiUrl,
      BYAN_API_TOKEN: norm.byanWeb.hasToken ? TOKEN_REF : undefined,
    },
    secretKeys: ['BYAN_API_TOKEN'],
  };
}

function settingsLocalStep(norm) {
  if (!norm.byanWeb.enabled) return null;
  if (norm.platforms.indexOf('claude') === -1) return null;
  return {
    id: 'write:settings-local',
    type: 'write-settings-local',
    dest: '.claude/settings.local.json',
    env: {
      BYAN_API_URL: norm.byanWeb.apiUrl,
      BYAN_API_TOKEN: norm.byanWeb.hasToken ? TOKEN_REF : undefined,
    },
    secretKeys: ['BYAN_API_TOKEN'],
  };
}

// One cli-install step per selected platform that (a) the user opted to install
// and (b) is NOT already on the machine. Command comes straight from the table
// recipe; never sudo (I47).
function cliInstallSteps(profile, norm) {
  if (!norm.installClis) return [];
  const steps = [];
  for (let i = 0; i < norm.platforms.length; i++) {
    const platform = norm.platforms[i];
    if (platformFound(profile, platform)) continue;
    const recipe = recommender.recipeFor(platform);
    if (!recipe) continue;
    steps.push({
      id: 'cli-install:' + platform,
      type: 'cli-install',
      platform: platform,
      npmPackage: recipe.npmPackage || null,
      version: recipe.versionRange || null,
      command: renderInstallCommand(recipe),
      global: recipe.global === true,
      sudo: false,
    });
  }
  return steps;
}

// Render the recipe's installCommandTemplate with {npmPackage}/{versionRange}
// substituted. Copilot's recipe has a null npmPackage (bundled with gh) and a
// gh-extension template that carries no placeholders, so substitution is a no-op
// there. Pure string transform.
function renderInstallCommand(recipe) {
  const template = recipe.installCommandTemplate || [];
  return template.map(function (token) {
    return token
      .replace('{npmPackage}', recipe.npmPackage || '')
      .replace('{versionRange}', recipe.versionRange || '');
  });
}

// One auth-handoff per selected platform — ALWAYS present (C12). It is a
// descriptor of the manual action; it never claims authenticated.
function authHandoffSteps(norm) {
  return norm.platforms.map(function (platform) {
    const recipe = recommender.recipeFor(platform);
    return {
      id: 'auth-handoff:' + platform,
      type: 'auth-handoff',
      platform: platform,
      command: recipe ? recipe.authCommand : null,
      reason: 'interactive auth cannot be automated',
    };
  });
}

function manifestStep() {
  return { id: 'manifest', type: 'manifest', dest: '_byan/.manifest.json' };
}

// --- assembly -----------------------------------------------------------------

// Build the ordered step list. Each group is appended in the fixed canonical
// order; null entries are dropped here (so the final plan never carries a
// when:false / null step).
function buildSteps(profile, norm) {
  const groups = [
    coreCopySteps(),
    platformCopySteps(norm),
    [configStep(norm)],
    [soulStep(norm)],
    [mcpStep(norm)],
    [envStep(norm), settingsLocalStep(norm)],
    cliInstallSteps(profile, norm),
    authHandoffSteps(norm),
    [manifestStep()],
  ];
  const steps = [];
  groups.forEach(function (group) {
    group.forEach(function (step) {
      if (step) steps.push(step);
    });
  });
  return steps;
}

// Canonical JSON: stable key ordering so the hash and the serialized plan are
// byte-identical across runs (determinism). Recursively sorts object keys.
function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(function (k) {
      if (value[k] !== undefined) sorted[k] = sortKeys(value[k]);
    });
    return sorted;
  }
  return value;
}

// Stable, content-derived plan id: sha256 of (os name + canonical answers),
// truncated. Diffable/cacheable. WHY os.name + answers (not the full step list):
// the plan is a deterministic function of those two, so they are the identity.
function computePlanId(profile, norm) {
  const osName = (profile.os && profile.os.name) || 'unknown';
  const material = osName + '|' + canonicalJson(norm);
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 12);
}

// plan(profile, answers) -> InstallPlan. PURE, deterministic.
function plan(profile, answers) {
  assertProfile(profile);
  assertAnswers(answers);

  const norm = normalizeAnswers(profile, answers);
  const steps = buildSteps(profile, norm);
  const planId = computePlanId(profile, norm);

  const authHandoffs = steps
    .filter(function (s) { return s.type === 'auth-handoff'; })
    .map(function (s) { return { platform: s.platform, command: s.command }; });

  const deferredInstalls = steps
    .filter(function (s) { return s.type === 'cli-install'; })
    .map(function (s) { return { platform: s.platform, command: s.command, global: s.global, sudo: s.sudo }; });

  const result = {
    schemaVersion: 1,
    type: 'InstallPlan',
    planId: planId,
    deterministic: true,
    flow: norm.flow,
    targets: {
      platforms: norm.platforms.slice(),
      byanWeb: {
        enabled: norm.byanWeb.enabled,
        apiUrl: norm.byanWeb.apiUrl,
      },
    },
    // Echo of the resolved answers with all 'auto' concretized. The token is NOT
    // echoed (hasToken boolean only) so the plan never serializes the secret.
    answers: {
      flow: norm.flow,
      platforms: norm.platforms.slice(),
      agents: norm.agents.slice(),
      user: norm.user,
      soul: { mode: norm.soul.mode, importPath: norm.soul.importPath },
      byanWeb: {
        enabled: norm.byanWeb.enabled,
        apiUrl: norm.byanWeb.apiUrl,
        hasToken: norm.byanWeb.hasToken,
        syncConsent: norm.byanWeb.syncConsent,
      },
      turboWhisper: norm.turboWhisper,
      costOptimizer: norm.costOptimizer,
      installV2: norm.installV2,
      installClis: norm.installClis,
      byanVersion: norm.byanVersion,
    },
    steps: steps,
    authHandoffs: authHandoffs,
    deferredInstalls: deferredInstalls,
  };

  return result;
}

module.exports = {
  plan: plan,
  InstallPlanError: InstallPlanError,
  ANSWERS_SCHEMA: ANSWERS_SCHEMA,
};
