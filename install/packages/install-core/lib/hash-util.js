'use strict';

// hash-util.js — the single SHA-256 file-hashing impl shared by apply.js (which
// WRITES the manifest ledger) and verify.js (which RE-HASHES tracked files to
// detect drift). WHY one impl: if the writer and the verifier hashed differently
// every install would look tampered. Builtins only (crypto, fs); read-only.

const crypto = require('crypto');
const fs = require('fs-extra');

// sha256File(absPath) -> Promise<hex digest>. Reads the file as a buffer and
// returns its lowercase 64-char hex sha256. Used for the manifest hash ledger.
async function sha256File(absPath) {
  const buf = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = { sha256File };
