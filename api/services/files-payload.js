'use strict';

const path = require('path');

const MAX_FILES = 10000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function bad(message) {
  return Object.assign(new Error(message), { code: 'INVALID_PAYLOAD', status: 400 });
}

function normalizeRelPath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw bad('Each file must have a non-empty string path');
  }
  if (input.includes('\0')) {
    throw bad(`Invalid path (null byte): ${input}`);
  }
  if (path.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input)) {
    throw bad(`Absolute paths not allowed: ${input}`);
  }

  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') {
      throw bad(`Path traversal not allowed: ${input}`);
    }
  }

  const clean = parts.filter(p => p !== '' && p !== '.').join('/');
  if (!clean) {
    throw bad(`Empty normalized path: ${input}`);
  }
  return clean;
}

function decodeFilesPayload(files, limits = {}) {
  const maxFiles = limits.maxFiles || MAX_FILES;
  const maxTotalBytes = limits.maxTotalBytes || MAX_TOTAL_BYTES;

  if (!Array.isArray(files)) {
    throw bad('files must be an array');
  }
  if (files.length === 0) {
    throw bad('files array is empty');
  }
  if (files.length > maxFiles) {
    throw bad(`Too many files (> ${maxFiles})`);
  }

  const map = new Map();
  let totalBytes = 0;

  for (const raw of files) {
    if (!raw || typeof raw !== 'object') {
      throw bad('Each file must be an object { path, content, encoding? }');
    }
    if (typeof raw.content !== 'string') {
      throw bad(`Missing or invalid content for file: ${raw.path}`);
    }

    const rel = normalizeRelPath(raw.path);
    const encoding = raw.encoding || 'utf8';

    let buffer;
    if (encoding === 'utf8') {
      buffer = Buffer.from(raw.content, 'utf8');
    } else if (encoding === 'base64') {
      buffer = Buffer.from(raw.content, 'base64');
    } else {
      throw bad(`Unsupported encoding: ${encoding}`);
    }

    totalBytes += buffer.length;
    if (totalBytes > maxTotalBytes) {
      throw bad(`Total decoded size exceeds ${maxTotalBytes} bytes`);
    }

    map.set(rel, { content: buffer, size: buffer.length });
  }

  return map;
}

module.exports = {
  decodeFilesPayload,
  MAX_FILES,
  MAX_TOTAL_BYTES
};
