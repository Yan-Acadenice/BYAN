'use strict';

// detect.js — assemble a serializable MachineProfile from the declarative
// probe-matrix. PURE w.r.t. the target project: no disk write, no file
// mutation, no state-changing spawn. The only spawn is a read-only `--version`
// probe, and that runner is INJECTABLE (opts.runVersion) so tests drive
// detection with fakes and prove zero real spawns. Likewise opts.lookpath is
// injectable so PATH resolution is a pure function under test.
//
// Contract (this module): detect(opts) -> Promise<MachineProfile>.
//   opts: {
//     cwd?            : string  = process.cwd()   (read-only; purity-checked)
//     probeVersions?  : boolean = false           (DEFAULT: presence-only, NO
//                                                  spawn; set true to opt into
//                                                  read-only `--version` probes)
//     lookpath?       : (binary) => string|null   (injected; default = real)
//     runVersion?     : (binary, args) => string|null (injected; default = real)
//     recommend?      : (profile) => {primaryPlatform, rationale} (optional)
//     platforms?      : string[] = ['claude','codex']  (preference)
//   }
// Returns a FROZEN object. Environment problems are reported as fields
// (present:false, version:null), never thrown. Throws ONLY on programmer error
// (bad opts shape). Covers C4 and part of C1.

const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  PROBE_MATRIX,
  probeVersion,
  parseVersionString,
  meetsRequirement,
} = require('./probe-matrix');

const SCHEMA_VERSION = 1;

// Default platform preference order, mirrored from data/recommender.json's
// preferenceOrder. Kept as a constant fallback so detect stays usable even if
// the recommender module/data is not wired by the caller (the recommender
// worker owns the canonical table; this is the offline default).
const DEFAULT_PREFERENCE = ['claude', 'codex'];

// Map a platform binary id to its conventional config dir, expanded to the home
// directory. authHint is a presence heuristic ONLY — detect never claims a real
// auth state (the real login is an apply()-time AUTH handoff, I50).
const CONFIG_DIRS = {
  claude: ['.claude', path.join('.config', 'claude')],
  codex: ['.codex', path.join('.config', 'codex')],
};

function osName() {
  switch (os.platform()) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

// Probe one tool-kind entry. Reads presence via the injected lookpath (pure
// PATH walk) and version via the injected runner — but ONLY if present and
// probing is enabled, so an absent binary never triggers a spawn.
function detectTool(probe, ctx) {
  const found = ctx.lookpath(probe.binary);
  const present = typeof found === 'string' && found.length > 0;
  let version = null;
  if (present && ctx.probeVersions) {
    version = ctx.runVersion(probe.binary, probe.versionArgs) || null;
  }
  return {
    present: present,
    path: present ? found : null,
    version: version,
  };
}

// Heuristic auth hint from config-dir presence under the home directory. Never
// 'authenticated' — only 'likely' (dir exists) or 'absent' (no dir / not found).
function authHintFor(id, present) {
  if (!present) return 'absent';
  const candidates = CONFIG_DIRS[id];
  if (!candidates) return 'unknown';
  const home = os.homedir();
  for (let i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(path.join(home, candidates[i]))) return 'likely';
    } catch (e) {
      // existsSync should not throw, but treat any access error as "no signal".
    }
  }
  return 'unknown';
}

// Pick the recommended primary platform: first preference-order platform that
// is present; else the first preference entry. Uses an injected recommender if
// provided, else the local preference fallback.
function computeRecommended(profile, ctx) {
  if (typeof ctx.recommend === 'function') {
    return ctx.recommend(profile);
  }
  const order = Array.isArray(ctx.platforms) && ctx.platforms.length
    ? ctx.platforms
    : DEFAULT_PREFERENCE;
  let primary = order[0];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (profile[id] && profile[id].present) {
      primary = id;
      break;
    }
  }
  return {
    primaryPlatform: primary,
    rationale: 'preference-order ' + order.join('>') + ' applied to found platforms',
  };
}

async function detect(opts) {
  const o = opts || {};
  if (typeof o !== 'object') {
    throw new TypeError('detect(opts): opts must be an object');
  }

  const ctx = {
    cwd: o.cwd || process.cwd(),
    // WHY default false: detect() must be spawn-free out of the box (C1). The
    // default pass resolves presence via the pure PATH walk (lookpath) only;
    // a tool's version requires running `<bin> --version`, an opt-in the caller
    // (the wizard's detailed report) asks for explicitly.
    probeVersions: o.probeVersions === true,
    // Default to the real read-only runner; tests inject a fake.
    runVersion: typeof o.runVersion === 'function' ? o.runVersion : probeVersion,
    // lookpath default is provided by the sibling lib/lookpath module; if a
    // caller does not inject one and the module is unavailable, fall back to a
    // null resolver so detection degrades to "nothing found" rather than
    // throwing. Tests always inject, so this branch is for production wiring.
    lookpath: typeof o.lookpath === 'function' ? o.lookpath : resolveDefaultLookpath(),
    recommend: typeof o.recommend === 'function' ? o.recommend : undefined,
    platforms: o.platforms,
  };

  const profile = {
    schemaVersion: SCHEMA_VERSION,
    type: 'MachineProfile',
  };

  for (let i = 0; i < PROBE_MATRIX.length; i++) {
    const probe = PROBE_MATRIX[i];
    if (probe.kind === 'platform') {
      if (probe.id === 'os') {
        profile.os = {
          name: osName(),
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          isWindows: os.platform() === 'win32',
        };
      } else if (probe.id === 'arch') {
        // arch is surfaced both nested in os and as a top-level tool-style
        // entry so C4's flat "arch present/version" reading is satisfied.
        profile.arch = { present: true, value: os.arch(), version: null, path: null };
      }
    } else if (probe.kind === 'runtime') {
      const version = parseVersionString(process.version) || process.version.replace(/^v/, '');
      profile.node = {
        present: true,
        path: process.execPath,
        version: version,
        min: probe.min,
        meetsMin: meetsRequirement(version, probe.min),
      };
    } else if (probe.kind === 'tool') {
      const base = detectTool(probe, ctx);
      // claude/codex are platform CLIs: attach configDir + authHint heuristic.
      if (CONFIG_DIRS[probe.id]) {
        base.configDir = probe.configDir || null;
        base.authHint = authHintFor(probe.id, base.present);
      }
      profile[probe.id] = base;
    }
  }

  profile.recommended = computeRecommended(profile, ctx);
  profile.generatedAt = new Date().toISOString();

  // Defensive immutability: callers (plan/apply) treat the profile as a read
  // contract. Freeze the top level and the per-tool sub-objects.
  Object.keys(profile).forEach((k) => {
    if (profile[k] && typeof profile[k] === 'object') Object.freeze(profile[k]);
  });
  return Object.freeze(profile);
}

// Lazily resolve the sibling lookpath module for production use. Isolated in a
// try/catch so detect never crashes if the parallel module is not yet wired;
// tests bypass this entirely by injecting opts.lookpath.
function resolveDefaultLookpath() {
  try {
    const lp = require('./lookpath');
    if (lp && typeof lp.lookpathSync === 'function') return lp.lookpathSync;
    if (typeof lp === 'function') return lp;
  } catch (e) {
    // lookpath sibling absent: degrade to "nothing found" (null resolver).
  }
  return function () {
    return null;
  };
}

module.exports = { detect };
