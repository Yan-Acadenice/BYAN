/**
 * BYAN update lifecycle helper for the MCP server.
 *
 * Read-only check: compares the installed BYAN version (from
 * <projectRoot>/_byan/.manifest.json, falling back to package.json) against
 * the latest published version on the npm registry.
 *
 * Apply path: returns *instructions* (a shell command) rather than executing
 * anything itself. Update is destructive (overwrites files) and must remain
 * an explicit user action, gated through the regular yanstaller pipeline
 * (`npx create-byan-agent update`).
 */

import fsPromises from 'node:fs/promises';
import nodePath from 'node:path';
import https from 'node:https';

export async function checkForUpdate(projectRoot) {
  const installed = await getInstalledVersion(projectRoot);
  let latest;
  let networkError;
  try {
    latest = await getLatestVersion('create-byan-agent');
  } catch (err) {
    networkError = err.message || String(err);
  }
  if (!latest) {
    return {
      installed,
      latest: null,
      updateAvailable: false,
      networkError,
      note: 'Latest version unknown — npm registry unreachable. Skipped silently.',
    };
  }
  if (installed === 'unknown') {
    return {
      installed,
      latest,
      updateAvailable: false,
      note: '_byan/.manifest.json missing — installed version cannot be determined. The project may be a fresh manual setup; consider running `npx create-byan-agent` to write the manifest.',
    };
  }
  const cmp = compareVersions(installed, latest);
  return {
    installed,
    latest,
    updateAvailable: cmp < 0,
    isCurrent: cmp >= 0,
    delta: cmp < 0 ? 'behind' : cmp > 0 ? 'ahead' : 'same',
  };
}

export function formatApplyInstructions({ preview = false, force = false } = {}) {
  const args = ['update'];
  if (preview) args.push('--preview');
  if (force) args.push('--force');
  return {
    command: `npx create-byan-agent ${args.join(' ')}`,
    rationale: preview
      ? 'Preview mode — no files are written. Inspects diff against the latest npm template.'
      : 'Apply update via the yanstaller pipeline. yanstaller backs up the project, diffs vs latest npm template, and merges only non-user-modified files unless --force is set.',
    safety: [
      'Backup is automatic before any write.',
      'User-modified files are preserved (unless --force).',
      'A rollback command (`npx create-byan-agent rollback`) is available afterwards.',
    ],
    next: 'Ask the user to run the command above. Do not execute it from inside this tool.',
  };
}

async function getInstalledVersion(projectRoot) {
  // _byan/.manifest.json is the canonical source — written by yanstaller after
  // every install/update. byan-mcp-server/package.json carries an unrelated
  // local version and would lie if used as fallback, so we don't fall back at
  // all: return 'unknown' and let callers surface that honestly.
  const manifestPath = nodePath.join(projectRoot, '_byan', '.manifest.json');
  try {
    const raw = await fsPromises.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    if (manifest && manifest.version) return manifest.version;
  } catch {}
  return 'unknown';
}

function getLatestVersion(packageName, { timeoutMs = 5000 } = {}) {
  const url = `https://registry.npmjs.org/${packageName}/latest`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { Accept: 'application/json' } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`npm registry returned ${res.statusCode} for ${packageName}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).version);
          } catch (err) {
            reject(new Error(`Failed to parse npm registry response: ${err.message}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error(`Failed to reach npm registry: ${err.message}`)));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`npm registry request timed out after ${timeoutMs}ms`));
    });
  });
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}
