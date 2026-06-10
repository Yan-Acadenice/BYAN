'use strict';

// probe-matrix.js — the declarative source of truth for detection.
//
// It holds (1) a single canonical semver impl (compareVersions /
// meetsRequirement / parseVersionString) so node-detector and version-compare
// can no longer drift, and (2) a declarative array of probes describing WHAT to
// detect, not HOW to spawn. detect.js consumes the matrix and injects the
// runner, which keeps the spawn surface in one place and lets tests drive
// detection with fakes (zero real spawns).
//
// WHY execFileSync (not execSync of a string): execFileSync passes argv
// directly, avoiding shell interpolation/injection, and is the only read-only
// spawn allowed in the detect path — it mutates nothing. WHY probeVersion never
// throws: an environment problem (missing bin, bad output) is a FIELD on the
// profile (version:null), never an exception — detect must not blow up on a
// machine that simply lacks a tool.

const { execFileSync } = require('child_process');

// --- semver ------------------------------------------------------------------

// Extract the first dotted numeric triple from arbitrary CLI banner text.
// "git version 2.39.2" -> "2.39.2"; "v24.13.1" -> "24.13.1". null if none.
function parseVersionString(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const patch = m[3] === undefined ? '0' : m[3];
  return m[1] + '.' + m[2] + '.' + patch;
}

// Compare two semver-ish strings. Returns -1, 0, or 1. Tolerant of a leading
// 'v' and of missing patch. Non-numeric segments compare as 0.
function compareVersions(a, b) {
  const pa = normalize(a);
  const pb = normalize(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function normalize(v) {
  const cleaned = String(v == null ? '' : v).replace(/^[vV]/, '');
  const parts = cleaned.split('.').slice(0, 3);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const n = parseInt(parts[i], 10);
    out[i] = Number.isNaN(n) ? 0 : n;
  }
  return out;
}

// True when `actual` is >= `minimum`. Used for node.meetsMin.
function meetsRequirement(actual, minimum) {
  return compareVersions(actual, minimum) >= 0;
}

// --- read-only version probe -------------------------------------------------

// The default runner injected into detect when none is supplied. Read-only
// spawn; returns the parsed version string or null on ANY failure.
function probeVersion(binary, versionArgs) {
  try {
    const args = Array.isArray(versionArgs) ? versionArgs : ['--version'];
    const out = execFileSync(binary, args, {
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return parseVersionString(out.toString());
  } catch (e) {
    // Missing binary, non-zero exit, timeout, unparseable banner: all are
    // "version unknown", never an error to the caller. WHY: a tool's absence
    // is data, not a fault.
    return null;
  }
}

// git-specific helper kept here so the one read-only spawn impl is centralized
// (the design's lib/probe-matrix exports probeGit). Delegates to probeVersion.
function probeGit() {
  return probeVersion('git', ['--version']);
}

// --- declarative matrix ------------------------------------------------------

// Each entry says WHAT to detect. detect.js maps over this; it never reads
// HOW to spawn from here (the runner is injected). `kind`:
//   - 'platform' : derived from the os module (os/arch), no PATH, no version.
//   - 'runtime'  : the host process itself (node), version from process.versions.
//   - 'tool'     : a binary located via lookpath, version via the injected runner.
const PROBE_MATRIX = [
  { id: 'os', kind: 'platform' },
  { id: 'arch', kind: 'platform' },
  {
    id: 'node',
    kind: 'runtime',
    min: '18.0.0',
  },
  {
    id: 'npm',
    kind: 'tool',
    binary: 'npm',
    versionArgs: ['--version'],
    configDir: null,
  },
  {
    id: 'git',
    kind: 'tool',
    binary: 'git',
    versionArgs: ['--version'],
    configDir: null,
  },
  {
    id: 'claude',
    kind: 'tool',
    binary: 'claude',
    versionArgs: ['--version'],
    configDir: '~/.claude',
  },
  {
    id: 'codex',
    kind: 'tool',
    binary: 'codex',
    versionArgs: ['--version'],
    configDir: '~/.codex',
  },
];

// The tool-kind subset, for callers that only care about installable binaries.
const TOOL_PROBES = PROBE_MATRIX.filter((p) => p.kind === 'tool');

module.exports = {
  PROBE_MATRIX,
  TOOL_PROBES,
  probeVersion,
  probeGit,
  compareVersions,
  meetsRequirement,
  parseVersionString,
};
