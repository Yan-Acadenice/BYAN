/**
 * UPDATER Module
 *
 * Orchestrates the BYAN update lifecycle:
 * version check -> diff -> backup -> apply -> manifest -> validate.
 *
 * @module yanstaller/updater
 */

const fs = require('fs-extra');
const path = require('path');
const { compareVersions, getLatestVersion } = require('../utils/version-compare');
const { diffFiles } = require('../utils/file-differ');
const { readManifest, writeManifest, generateManifest, detectUserModifications } = require('../utils/manifest');
const backuper = require('./backuper');
const logger = require('../utils/logger');

/**
 * Resolve the template directory containing the canonical _byan/ files.
 * Same logic as getTemplateDir() in create-byan-agent-v2.js.
 *
 * @returns {string|null} Absolute path to templates/ or null
 */
function getTemplateDir() {
  const npmPackagePath = path.join(__dirname, '..', '..', 'templates');
  if (fs.existsSync(npmPackagePath)) return npmPackagePath;

  const devPath = path.join(__dirname, '..', '..', '..');
  if (fs.existsSync(devPath)) return devPath;

  return null;
}

/**
 * @typedef {Object} UpdateCheck
 * @property {boolean} updateAvailable
 * @property {string} installed - Currently installed version
 * @property {string} latest - Latest version on npm
 * @property {string[]} changes - List of files that would change
 */

/**
 * Check whether an update is available.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<UpdateCheck>}
 */
async function checkForUpdate(projectRoot) {
  const installedVersion = await getInstalledVersion(projectRoot);
  const latest = await getLatestVersion('create-byan-agent');
  const cmp = compareVersions(installedVersion, latest);

  let changes = [];
  if (cmp < 0) {
    const templateDir = getTemplateDir();
    if (templateDir) {
      const templateByan = path.join(templateDir, '_byan');
      const installedByan = path.join(projectRoot, '_byan');
      if (await fs.pathExists(templateByan) && await fs.pathExists(installedByan)) {
        const diff = await diffFiles(installedByan, templateByan);
        changes = [...diff.toUpdate, ...diff.toAdd];
      }
    }
  }

  return {
    updateAvailable: cmp < 0,
    installed: installedVersion,
    latest,
    changes
  };
}

/**
 * Preview what an update would do without applying changes.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<{diff: import('../utils/file-differ').DiffResult, userModified: string[], installed: string, latest: string}>}
 */
async function preview(projectRoot) {
  const installedVersion = await getInstalledVersion(projectRoot);
  const latest = await getLatestVersion('create-byan-agent');

  const templateDir = getTemplateDir();
  if (!templateDir) {
    throw new Error('Template directory not found. Is the package installed correctly?');
  }

  const templateByan = path.join(templateDir, '_byan');
  const installedByan = path.join(projectRoot, '_byan');

  if (!await fs.pathExists(installedByan)) {
    throw new Error('No _byan/ directory found. Run install first.');
  }

  const diff = await diffFiles(installedByan, templateByan);
  const userModified = await detectUserModifications(projectRoot);

  return { diff, userModified, installed: installedVersion, latest };
}

/**
 * @typedef {Object} UpdateOptions
 * @property {boolean} [force=false] - Force update even if same version
 * @property {boolean} [preview=false] - Only show diff, don't apply
 */

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} success
 * @property {string} previousVersion
 * @property {string} newVersion
 * @property {string} backupPath
 * @property {number} filesUpdated
 * @property {number} filesAdded
 * @property {number} filesSkipped - User-modified files left untouched
 */

/**
 * Execute the full update flow.
 *
 * @param {string} projectRoot - Project root directory
 * @param {UpdateOptions} [options={}]
 * @returns {Promise<UpdateResult>}
 */
async function update(projectRoot, options = {}) {
  const installedVersion = await getInstalledVersion(projectRoot);
  const latest = await getLatestVersion('create-byan-agent');
  const cmp = compareVersions(installedVersion, latest);

  if (cmp >= 0 && !options.force) {
    logger.info(`Already up to date (${installedVersion})`);
    return {
      success: true,
      previousVersion: installedVersion,
      newVersion: installedVersion,
      backupPath: null,
      filesUpdated: 0,
      filesAdded: 0,
      filesSkipped: 0
    };
  }

  const templateDir = getTemplateDir();
  if (!templateDir) {
    throw new Error('Template directory not found. Is the package installed correctly?');
  }

  const templateByan = path.join(templateDir, '_byan');
  const installedByan = path.join(projectRoot, '_byan');

  if (!await fs.pathExists(templateByan)) {
    throw new Error('Template _byan/ directory not found.');
  }
  if (!await fs.pathExists(installedByan)) {
    throw new Error('No _byan/ directory found. Run install first.');
  }

  const diff = await diffFiles(installedByan, templateByan);
  const userModified = new Set(await detectUserModifications(projectRoot));

  if (options.preview) {
    return formatPreviewResult(diff, userModified, installedVersion, latest);
  }

  // Backup before applying changes
  const backupResult = await backuper.backup(installedByan);
  logger.debug(`Backup created: ${backupResult.backupPath} (${backupResult.filesBackedUp} files)`);

  let filesUpdated = 0;
  let filesAdded = 0;
  let filesSkipped = 0;

  try {
    // Apply updated files (skip user-modified unless forced)
    for (const file of diff.toUpdate) {
      if (userModified.has(file) && !options.force) {
        filesSkipped++;
        logger.debug(`Skipped (user-modified): ${file}`);
        continue;
      }
      const src = path.join(templateByan, file);
      const dest = path.join(installedByan, file);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(src, dest);
      filesUpdated++;
    }

    // Add new files
    for (const file of diff.toAdd) {
      const src = path.join(templateByan, file);
      const dest = path.join(installedByan, file);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(src, dest);
      filesAdded++;
    }

    // Regenerate manifest with new state
    const newManifest = await generateManifest(installedByan, latest);
    await writeManifest(projectRoot, newManifest);

    // Prune old backups
    await backuper.pruneBackups(projectRoot);

  } catch (error) {
    // Rollback on failure
    logger.error(`Update failed, restoring backup: ${error.message}`);
    await backuper.restore(backupResult.backupPath, installedByan);
    throw error;
  }

  return {
    success: true,
    previousVersion: installedVersion,
    newVersion: latest,
    backupPath: backupResult.backupPath,
    filesUpdated,
    filesAdded,
    filesSkipped
  };
}

/**
 * Read the installed BYAN version from the manifest or package.json fallback.
 *
 * @param {string} projectRoot - Project root
 * @returns {Promise<string>}
 */
async function getInstalledVersion(projectRoot) {
  const manifest = await readManifest(projectRoot);
  if (manifest && manifest.version) return manifest.version;

  // Fallback: read from the package that shipped this code
  const pkgPath = path.join(__dirname, '..', '..', 'package.json');
  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJSON(pkgPath);
    return pkg.version;
  }

  return '0.0.0';
}

/**
 * Format a preview-only result for display.
 *
 * @param {import('../utils/file-differ').DiffResult} diff
 * @param {Set<string>} userModified
 * @param {string} installedVersion
 * @param {string} latest
 * @returns {UpdateResult}
 */
function formatPreviewResult(diff, userModified, installedVersion, latest) {
  const skippable = diff.toUpdate.filter(f => userModified.has(f));
  return {
    success: true,
    previousVersion: installedVersion,
    newVersion: latest,
    backupPath: null,
    filesUpdated: diff.toUpdate.length - skippable.length,
    filesAdded: diff.toAdd.length,
    filesSkipped: skippable.length
  };
}

module.exports = {
  checkForUpdate,
  preview,
  update,
  getInstalledVersion,
  getTemplateDir
};
