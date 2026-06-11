#!/usr/bin/env node
/**
 * Stop hook — stage the ending turn to byan_web memory (SM1b).
 *
 * Reads the Stop payload on stdin, extracts user + assistant messages,
 * delegates to src/staging/staging.js processTurn().
 *
 * Config source (first present wins) :
 *   - .claude/settings.local.json env.BYAN_API_URL / BYAN_API_TOKEN
 *   - process.env.BYAN_API_URL / BYAN_API_TOKEN
 *   - loadbalancer.yaml or _byan/config.yaml memory_sync: section
 *
 * Never blocks : this hook always exits 0 with continue:true. Failures
 * are queued locally for retry, not surfaced to the user mid-turn.
 */

const fs = require('fs');
const path = require('path');
// Shared transcript reader — the real Stop payload has no inline transcript
// (transcript_path JSONL). Without it extractTurn got null and never staged.
const { extractRecentMessages } = require('./lib/transcript-read');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function readSettingsEnv() {
  const p = path.join(projectDir, '.claude', 'settings.local.json');
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.env || {};
  } catch {
    return {};
  }
}

function readMemorySyncConfig() {
  const paths = [
    path.join(projectDir, 'loadbalancer.yaml'),
    // Gen3 split config first, then Gen2 root config.
    path.join(projectDir, '_byan', 'context', 'config.yaml'),
    path.join(projectDir, '_byan', 'config.yaml'),
  ];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const yaml = require('js-yaml');
      const doc = yaml.load(fs.readFileSync(p, 'utf8'));
      if (doc && doc.memory_sync) return doc.memory_sync;
    } catch {
      // fall through
    }
  }
  return null;
}

// Local opt-in override. Pure. A machine enables staging via BYAN_MEMORY_SYNC=1
// (in the gitignored .claude/settings.local.json env, or process env) WITHOUT
// touching _byan/config.yaml — that file is git-tracked + template-mirrored, so
// a flag there would ship enabled:true to every install and break the
// install-time consent design.
function applyEnvEnable(memorySync, env = {}) {
  if (String(env.BYAN_MEMORY_SYNC || '') === '1') {
    return { ...memorySync, enabled: true };
  }
  return memorySync;
}

function buildConfig() {
  const settingsEnv = readSettingsEnv();
  const apiUrl = settingsEnv.BYAN_API_URL || process.env.BYAN_API_URL || null;
  const apiToken = settingsEnv.BYAN_API_TOKEN || process.env.BYAN_API_TOKEN || null;
  const mergedEnv = { ...process.env, ...settingsEnv };
  const memorySync = applyEnvEnable(readMemorySyncConfig() || {}, mergedEnv);
  return {
    byan_api_url: apiUrl,
    byan_api_token: apiToken,
    memory_sync: memorySync,
  };
}

function extractTurn(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // Resolve from any payload shape: inline array (fixtures) or transcript_path
  // JSONL (production). The last 4 user/assistant messages are the staged turn.
  const messages = extractRecentMessages(payload, 4);
  if (!messages) return null;

  return {
    sessionId: payload.session_id || payload.sessionId || null,
    messages,
  };
}

if (require.main === module) (async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const config = buildConfig();
  const turn = extractTurn(payload);

  if (!turn) {
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  try {
    const { processTurn } = require(path.join(projectDir, 'src', 'staging', 'staging.js'));
    await processTurn({
      turn,
      cliSource: 'claude-code',
      config,
      projectRoot: projectDir,
      flushNow: true,
    });
  } catch {
    // staging must never break the session
  }

  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
})();

module.exports = { applyEnvEnable, buildConfig, readMemorySyncConfig };
