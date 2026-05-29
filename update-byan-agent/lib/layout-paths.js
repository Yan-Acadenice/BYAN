const fs = require('fs');
const path = require('path');

/**
 * Self-contained layout helper for the standalone updater package.
 *
 * The updater is published as its own npm package and cannot require the root
 * src/byan-v2 layout-resolver. This mirrors that resolver's ordering — Gen3
 * (flat semantic) first, Gen2 (legacy module) fallback — so the updater works
 * against an install in either layout during the transition.
 */

function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// Config candidates in priority order. Note: the AUTHORITATIVE installed config
// (carrying byan_version + installed_agents) is the module config
// _byan/bmb/config.yaml on Gen2 — the legacy updater read exactly this file. A
// stale root _byan/config.yaml may also exist (older scaffold), so bmb MUST win
// over root to preserve correct version detection; root is only a last resort.
//  - Gen3 split config   _byan/context/config.yaml
//  - Gen2 module config  _byan/bmb/config.yaml  (authoritative installed config)
//  - Gen2 root config    _byan/config.yaml      (legacy fallback)
function configCandidates(installPath) {
  return [
    path.join(installPath, '_byan', 'context', 'config.yaml'),
    path.join(installPath, '_byan', 'bmb', 'config.yaml'),
    path.join(installPath, '_byan', 'config.yaml'),
  ];
}

// First existing config, or null when the install has none.
function resolveConfigPath(installPath) {
  return firstExisting(configCandidates(installPath));
}

// Memory/state directory: Gen3 _byan/memoire/ first, Gen2 _byan/_memory/ fallback.
function resolveMemoryDir(installPath) {
  const g3 = path.join(installPath, '_byan', 'memoire');
  const g2 = path.join(installPath, '_byan', '_memory');
  return fs.existsSync(g3) ? g3 : g2;
}

module.exports = { configCandidates, resolveConfigPath, resolveMemoryDir };
