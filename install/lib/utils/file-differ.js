/**
 * File Differ Utility
 *
 * Compares installed files against template files using SHA-256 hashes.
 *
 * @module utils/file-differ
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

/**
 * Compute SHA-256 hash of a file.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively collect all file paths relative to a root directory.
 *
 * @param {string} dir - Root directory to scan
 * @param {string} [base] - Base path for recursion (internal)
 * @returns {Promise<string[]>} Array of relative POSIX paths
 */
async function collectFiles(dir, base) {
  base = base || dir;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, base);
      files = files.concat(nested);
    } else if (entry.isFile()) {
      const rel = path.relative(base, fullPath).split(path.sep).join('/');
      files.push(rel);
    }
  }

  return files;
}

/**
 * @typedef {Object} DiffResult
 * @property {string[]} toUpdate - Files that exist in both dirs but differ
 * @property {string[]} toAdd - Files only in template (new files)
 * @property {string[]} toSkip - Files identical in both dirs
 * @property {string[]} toKeep - Files only in installed dir (user-created)
 */

/**
 * Compare an installed directory against a template directory.
 *
 * @param {string} installedDir - Path to the installed _byan/ directory
 * @param {string} templateDir - Path to the template _byan/ directory
 * @returns {Promise<DiffResult>}
 */
async function diffFiles(installedDir, templateDir) {
  const [installedFiles, templateFiles] = await Promise.all([
    collectFiles(installedDir),
    collectFiles(templateDir)
  ]);

  const installedSet = new Set(installedFiles);
  const templateSet = new Set(templateFiles);

  const toUpdate = [];
  const toAdd = [];
  const toSkip = [];
  const toKeep = [];

  for (const file of templateFiles) {
    if (!installedSet.has(file)) {
      toAdd.push(file);
      continue;
    }

    const [installedHash, templateHash] = await Promise.all([
      hashFile(path.join(installedDir, file)),
      hashFile(path.join(templateDir, file))
    ]);

    if (installedHash === templateHash) {
      toSkip.push(file);
    } else {
      toUpdate.push(file);
    }
  }

  for (const file of installedFiles) {
    if (!templateSet.has(file)) {
      toKeep.push(file);
    }
  }

  return { toUpdate, toAdd, toSkip, toKeep };
}

module.exports = {
  hashFile,
  collectFiles,
  diffFiles
};
