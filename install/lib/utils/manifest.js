/**
 * Manifest Manager
 *
 * Tracks installed BYAN files and their hashes in _byan/.manifest.json.
 * Used by the update system to detect user modifications.
 *
 * @module utils/manifest
 */

const fs = require('fs-extra');
const path = require('path');
const { hashFile, collectFiles } = require('./file-differ');

const MANIFEST_FILENAME = '.manifest.json';

/**
 * @typedef {Object} FileEntry
 * @property {string} hash - SHA-256 hex hash at install time
 * @property {boolean} userModified - Whether user changed the file after install
 */

/**
 * @typedef {Object} Manifest
 * @property {string} version - BYAN version when manifest was created
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {Object<string, FileEntry>} files - Map of relative path to file entry
 */

/**
 * Read the manifest file from a project.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<Manifest|null>} Manifest object or null if not found
 */
async function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, '_byan', MANIFEST_FILENAME);

  if (!await fs.pathExists(manifestPath)) {
    return null;
  }

  return fs.readJSON(manifestPath);
}

/**
 * Write manifest to _byan/.manifest.json.
 *
 * @param {string} projectRoot - Project root directory
 * @param {Manifest} manifest - Manifest object to write
 * @returns {Promise<void>}
 */
async function writeManifest(projectRoot, manifest) {
  const manifestPath = path.join(projectRoot, '_byan', MANIFEST_FILENAME);
  manifest.updatedAt = new Date().toISOString();
  await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
}

/**
 * Generate a fresh manifest by scanning the _byan/ directory.
 *
 * @param {string} byanDir - Absolute path to _byan/ directory
 * @param {string} version - BYAN version string
 * @returns {Promise<Manifest>}
 */
async function generateManifest(byanDir, version) {
  const files = await collectFiles(byanDir);
  const fileEntries = {};
  const now = new Date().toISOString();

  for (const relPath of files) {
    if (relPath === MANIFEST_FILENAME) continue;
    const hash = await hashFile(path.join(byanDir, relPath));
    fileEntries[relPath] = { hash, userModified: false };
  }

  return {
    version,
    createdAt: now,
    updatedAt: now,
    files: fileEntries
  };
}

/**
 * Detect which files the user has modified since installation.
 * Compares current file hashes against those recorded in the manifest.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<string[]>} Array of relative paths that were modified by the user
 */
async function detectUserModifications(projectRoot) {
  const manifest = await readManifest(projectRoot);
  if (!manifest) return [];

  const byanDir = path.join(projectRoot, '_byan');
  const modified = [];

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    const fullPath = path.join(byanDir, relPath);
    if (!await fs.pathExists(fullPath)) continue;

    const currentHash = await hashFile(fullPath);
    if (currentHash !== entry.hash) {
      modified.push(relPath);
    }
  }

  return modified;
}

module.exports = {
  readManifest,
  writeManifest,
  generateManifest,
  detectUserModifications,
  MANIFEST_FILENAME
};
