'use strict';

// Thin, PURE loader + evaluator over data/recommender.json (C5).
// The table is DATA (rules, recipes, preference order, messages all live in JSON).
// This module owns ZERO domain knowledge that belongs in the table: it loads the
// JSON, deep-merges an optional override, and projects a MachineProfile onto the
// table's declarative rule predicates. No disk write, no spawn, no child_process,
// no LLM. Builtins only (fs, path).

const fs = require('fs');
const path = require('path');

const TABLE_PATH = path.join(__dirname, '..', 'data', 'recommender.json');

// The schemaVersion this loader understands. A mismatch is a hard error so a
// stale/forward override cannot be silently misinterpreted.
const SUPPORTED_SCHEMA_VERSION = 1;

// Severity ranking for deterministic action ordering: blocks first (they stop the
// install), then recommendations, then warnings. Lives here (not in the table)
// because it is presentation policy of THIS evaluator, not platform/recipe data.
const SEVERITY_RANK = { block: 0, recommend: 1, warn: 2 };

// Predicate registry. The table references these by name in each rule's `when`
// string; the evaluator resolves them against the profile. WHY a registry and not
// eval(): a profile-driven boolean is a closed, auditable set, so we map the
// table's declarative condition to a vetted function instead of executing
// arbitrary strings from a (user-overridable) JSON file.
const PREDICATES = {
  'node.meetsMin === false': function (profile) {
    return profile.node && profile.node.meetsMin === false;
  },
  'npm.found === false': function (profile) {
    return profile.npm && profile.npm.found === false;
  },
  'git.installed === false': function (profile) {
    return profile.git && profile.git.installed === false;
  },
  noPlatformFound: function (profile) {
    const platforms = profile.platforms || {};
    return Object.keys(platforms).every(function (name) {
      return !platforms[name] || platforms[name].found !== true;
    });
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Deep-merge `override` onto a fresh deep clone of `base`. Arrays are replaced
// wholesale (an override that sets configDirCandidates means exactly that list).
// Returns a new object; neither argument is mutated.
function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!isPlainObject(override)) return out;
  Object.keys(override).forEach(function (key) {
    const ov = override[key];
    const bv = out[key];
    if (isPlainObject(ov) && isPlainObject(bv)) {
      out[key] = deepMerge(bv, ov);
    } else {
      out[key] = ov;
    }
  });
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// loadRecipes([overridePath]) -> the parsed table, optionally deep-merged with a
// user/Electron override file. Validates schemaVersion. Always returns a fresh
// object so callers cannot mutate the on-disk source through the returned value.
function loadRecipes(overridePath) {
  const base = readJson(TABLE_PATH);
  if (base.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      'recommender.json schemaVersion ' +
        base.schemaVersion +
        ' is unsupported (expected ' +
        SUPPORTED_SCHEMA_VERSION +
        ')'
    );
  }
  if (!overridePath) {
    return base;
  }
  const override = readJson(overridePath);
  if (
    override.schemaVersion !== undefined &&
    override.schemaVersion !== SUPPORTED_SCHEMA_VERSION
  ) {
    throw new Error(
      'recommender override schemaVersion ' +
        override.schemaVersion +
        ' does not match supported schemaVersion ' +
        SUPPORTED_SCHEMA_VERSION
    );
  }
  return deepMerge(base, override);
}

// recommendPlatform(profile) -> the first preference-order platform that is found,
// or the first preference-order entry when none is found (so callers always get a
// concrete default).
function recommendPlatform(profile) {
  const table = loadRecipes();
  const order = table.preferenceOrder;
  const platforms = (profile && profile.platforms) || {};
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    if (platforms[name] && platforms[name].found === true) {
      return name;
    }
  }
  return order[0];
}

// recipeFor(platform[, overridePath]) -> the install/auth recipe for a platform.
function recipeFor(platform, overridePath) {
  const table = loadRecipes(overridePath);
  return table.recipes[platform] || null;
}

// recommend(profile) -> ordered list of recommended actions, derived ENTIRELY from
// the table. Each rule whose predicate matches the profile yields one action that
// carries the rule's id/action/message verbatim from the data (the evaluator adds
// no message text of its own). Output is sorted block -> recommend -> warn, then by
// the rule's order in the table, for deterministic, byte-stable results.
function recommend(profile) {
  const table = loadRecipes();
  const matched = [];
  for (let i = 0; i < table.rules.length; i++) {
    const rule = table.rules[i];
    const predicate = PREDICATES[rule.when];
    if (!predicate) {
      // An unknown predicate is a table/loader contract bug, not a runtime input
      // problem: fail loudly so a typo in the data is caught, never silently skipped.
      throw new Error('recommender rule "' + rule.id + '" has unknown predicate: ' + rule.when);
    }
    if (predicate(profile)) {
      matched.push({ rule: rule, index: i });
    }
  }

  matched.sort(function (a, b) {
    const ra = SEVERITY_RANK[a.rule.action];
    const rb = SEVERITY_RANK[b.rule.action];
    if (ra !== rb) return ra - rb;
    return a.index - b.index;
  });

  return matched.map(function (entry) {
    const rule = entry.rule;
    const action = {
      id: rule.id,
      action: rule.action,
      message: rule.message,
    };
    if (rule.fix) {
      action.fix = rule.fix;
    }
    // A recommend rule may carry a default platform (e.g. no-platform-cli).
    if (rule.defaultPlatform) {
      action.platform = rule.defaultPlatform;
    }
    return action;
  });
}

// DEFAULTS: the small constants UIs want without parsing the table themselves.
const DEFAULTS = Object.freeze({
  apiUrl: readJson(TABLE_PATH).byanWeb.defaultApiUrl,
});

module.exports = {
  loadRecipes: loadRecipes,
  recommend: recommend,
  recommendPlatform: recommendPlatform,
  recipeFor: recipeFor,
  DEFAULTS: DEFAULTS,
};
