/**
 * File Utilities
 * 
 * Wrapper around fs-extra for common file operations.
 * 
 * @module utils/file-utils
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Copy file or directory
 * 
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @returns {Promise<void>}
 */
async function copy(src, dest) {
  await fs.copy(src, dest);
}

/**
 * Check if path exists
 * 
 * @param {string} filePath - File or directory path
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  return fs.pathExists(filePath);
}

/**
 * Ensure directory exists (create if not)
 * 
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  await fs.ensureDir(dirPath);
}

/**
 * Remove file or directory
 * 
 * @param {string} filePath - File or directory path
 * @returns {Promise<void>}
 */
async function remove(filePath) {
  await fs.remove(filePath);
}

/**
 * Read JSON file
 * 
 * @param {string} filePath - JSON file path
 * @returns {Promise<Object>}
 */
async function readJSON(filePath) {
  return fs.readJSON(filePath);
}

/**
 * Write JSON file
 * 
 * @param {string} filePath - JSON file path
 * @param {Object} data - Data to write
 * @returns {Promise<void>}
 */
async function writeJSON(filePath, data) {
  await fs.writeJSON(filePath, data, { spaces: 2 });
}

/**
 * Read text file
 * 
 * @param {string} filePath - Text file path
 * @returns {Promise<string>}
 */
async function readFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

/**
 * Write text file
 * 
 * @param {string} filePath - Text file path
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
async function writeFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf8');
}

module.exports = {
  copy,
  exists,
  ensureDir,
  remove,
  readJSON,
  writeJSON,
  readFile,
  writeFile
};
