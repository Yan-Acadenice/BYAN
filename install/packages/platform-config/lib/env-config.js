/**
 * .env and .claude/settings.local.json management.
 *
 * updateSettingsLocal : merge env vars into .claude/settings.local.json,
 *                       preserving unrelated keys (permissions, hooks, etc.).
 * updateDotenv        : append/update .env lines, preserving comments and
 *                       blank lines, replacing (not duplicating) existing keys.
 * readEnvToken        : fallback chain to read BYAN_API_TOKEN for migrations.
 */

const path = require('path');
const fs = require('fs-extra');

async function readJsonOrEmpty(filePath) {
  if (await fs.pathExists(filePath)) {
    try {
      return await fs.readJson(filePath);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {string} projectRoot
 * @param {Record<string,string>} envVars
 * @returns {Promise<{ path: string }>}
 */
async function updateSettingsLocal(projectRoot, envVars) {
  const filePath = path.join(projectRoot, '.claude', 'settings.local.json');
  const current = await readJsonOrEmpty(filePath);
  current.env = { ...(current.env || {}), ...envVars };
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, current, { spaces: 2 });
  return { path: filePath };
}

/**
 * @param {string} projectRoot
 * @param {Record<string,string>} envVars
 * @returns {Promise<{ path: string }>}
 */
async function updateDotenv(projectRoot, envVars) {
  const filePath = path.join(projectRoot, '.env');
  let content = '';
  if (await fs.pathExists(filePath)) {
    content = await fs.readFile(filePath, 'utf8');
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const keys = Object.keys(envVars);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return true;
    const key = trimmed.slice(0, eq).trim();
    return !keys.includes(key);
  });

  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  for (const key of keys) {
    const val = envVars[key] ?? '';
    kept.push(`${key}=${val}`);
  }
  kept.push('');

  await fs.writeFile(filePath, kept.join('\n'), 'utf8');
  return { path: filePath };
}

/**
 * Parses a single `KEY=value` line, respecting surrounding double quotes.
 * Returns null for comment/empty/malformed lines.
 */
function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1);
  }
  return { key, value: val };
}

/**
 * Reads BYAN_API_TOKEN from .env first, falls back to
 * .claude/settings.local.json env.BYAN_API_TOKEN. Returns null if neither
 * contains a non-empty value.
 *
 * @param {string} projectRoot
 * @returns {Promise<string|null>}
 */
async function readEnvToken(projectRoot) {
  const dotenvPath = path.join(projectRoot, '.env');
  if (await fs.pathExists(dotenvPath)) {
    const content = await fs.readFile(dotenvPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotenvLine(line);
      if (parsed && parsed.key === 'BYAN_API_TOKEN' && parsed.value) {
        return parsed.value;
      }
    }
  }

  const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
  if (await fs.pathExists(settingsPath)) {
    try {
      const settings = await fs.readJson(settingsPath);
      const tok = settings && settings.env && settings.env.BYAN_API_TOKEN;
      if (typeof tok === 'string' && tok.length > 0) return tok;
    } catch {
      // ignore malformed json
    }
  }

  return null;
}

module.exports = {
  updateSettingsLocal,
  updateDotenv,
  readEnvToken,
};
