/**
 * env-writer — adapter over byan-platform-config envConfig.
 *
 * Project-scoped writes (.env, .claude/settings.local.json) are delegated to
 * envConfig.updateDotenv / updateSettingsLocal — they are already idempotent
 * (READ-MERGE-WRITE, key-replace not append), so we do NOT reimplement them.
 *
 * The ONE recon gap this fills is USER/MACHINE-scoped env, which envConfig has
 * no path for: it only writes the project .env. writeUserEnvVar provides a
 * distinct per-OS backend:
 *   - win32        -> execFileSync('setx', [key, val])   (setx is idempotent
 *                     at the OS level: it overwrites the user var)
 *   - linux/darwin -> an idempotent MARKER BLOCK appended to a shell profile;
 *                     re-running replaces the block in place, never duplicates.
 *
 * Secret values flow through these functions but are NEVER returned or logged
 * (the return objects carry path/scope/backend metadata only).
 */

const childProcess = require('child_process');
const fs = require('fs-extra');
const { envConfig } = require('../../platform-config');

// Marker delimiting the managed block in a POSIX shell profile. The block is
// the unit of idempotency: we slice it out and rewrite it on every call.
const USER_ENV_MARKER = {
  begin: '# >>> BYAN env (managed) >>>',
  end: '# <<< BYAN env (managed) <<<',
};

/**
 * Project-scoped .env write. Pure delegation to envConfig.updateDotenv.
 *
 * @param {string} cwd — project root
 * @param {Record<string,string>} vars
 * @returns {Promise<{ path: string, scope: string }>}
 */
async function writeProjectEnv(cwd, vars) {
  const { path: filePath } = await envConfig.updateDotenv(cwd, vars);
  return { path: filePath, scope: 'project' };
}

/**
 * .claude/settings.local.json env-block write. Delegates to envConfig.
 *
 * @param {string} cwd — project root
 * @param {Record<string,string>} vars
 * @returns {Promise<{ path: string, scope: string }>}
 */
async function writeSettingsLocalEnv(cwd, vars) {
  const { path: filePath } = await envConfig.updateSettingsLocal(cwd, vars);
  return { path: filePath, scope: 'project' };
}

/**
 * User-scoped env var, per-OS backend. The recon gap envConfig does not cover.
 *
 * @param {string} key
 * @param {string} value — may be a secret; never returned/logged
 * @param {{ platform?: string, profilePath?: string }} [opts]
 *        platform defaults to process.platform; profilePath overrides the
 *        POSIX profile target (test injection point).
 * @returns {Promise<{ scope: string, backend: string }>}
 */
async function writeUserEnvVar(key, value, opts = {}) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('writeUserEnvVar: key must be a non-empty string');
  }
  if (typeof value !== 'string') {
    throw new Error('writeUserEnvVar: value must be a string');
  }

  const platform = opts.platform || process.platform;

  if (platform === 'win32') {
    return writeUserEnvWindows(key, value);
  }
  return writeUserEnvPosix(key, value, opts.profilePath);
}

/**
 * Windows backend: setx writes a persistent per-user env var. No privilege
 * escalation (no /M, no sudo). setx itself overwrites, so it is idempotent.
 */
function writeUserEnvWindows(key, value) {
  childProcess.execFileSync('setx', [key, value], { stdio: 'ignore' });
  return { scope: 'user', backend: 'setx' };
}

/**
 * POSIX backend: rewrite a single managed marker block in the shell profile.
 * Re-running replaces the block (idempotent — never appends a second one).
 */
async function writeUserEnvPosix(key, value, profilePath) {
  const target = profilePath || defaultPosixProfile();

  let existing = '';
  if (await fs.pathExists(target)) {
    existing = await fs.readFile(target, 'utf8');
  }
  const withoutBlock = stripManagedBlock(existing);
  const block = renderManagedBlock(key, value);

  const head = withoutBlock.replace(/\n*$/, '');
  const next = (head ? head + '\n\n' : '') + block + '\n';

  await fs.ensureDir(require('path').dirname(target));
  await fs.writeFile(target, next, 'utf8');
  return { scope: 'user', backend: 'profile', path: target };
}

function renderManagedBlock(key, value) {
  return [USER_ENV_MARKER.begin, `export ${key}="${value}"`, USER_ENV_MARKER.end].join('\n');
}

/**
 * Removes the existing managed block (begin..end inclusive) if present.
 * WHY a regex over begin/end: keeps everything the user wrote outside the
 * block untouched, so we own exactly our block and nothing else.
 */
function stripManagedBlock(content) {
  if (!content.includes(USER_ENV_MARKER.begin)) return content;
  const re = new RegExp(
    escapeRegExp(USER_ENV_MARKER.begin) + '[\\s\\S]*?' + escapeRegExp(USER_ENV_MARKER.end) + '\\n?',
    'g'
  );
  return content.replace(re, '');
}

function defaultPosixProfile() {
  const home = require('os').homedir();
  // .profile is the portable login-shell file present on both linux and macos.
  return require('path').join(home, '.profile');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  writeProjectEnv,
  writeSettingsLocalEnv,
  writeUserEnvVar,
  USER_ENV_MARKER,
};
