import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOutcome,
  readBuffer,
  readCursor,
  writeCursor,
  BUFFER_REL,
  CURSOR_REL,
} from '../lib/outcome-buffer.js';
import path from 'node:path';

// In-memory io: mkdirSync is a no-op, appendFileSync accumulates per path,
// readFileSync returns accumulated text or throws ENOENT, writeFileSync sets text.
function makeIo() {
  const files = {};
  return {
    mkdirSync() {},
    appendFileSync(p, data) {
      files[p] = (files[p] ?? '') + data;
    },
    readFileSync(p, _enc) {
      if (!(p in files)) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return files[p];
    },
    writeFileSync(p, data) {
      files[p] = data;
    },
    _files: files,
  };
}

// Throwing io: every call throws, simulating all possible io errors.
function makeThrowingIo(msg = 'disk error') {
  return {
    mkdirSync() { throw new Error(msg); },
    appendFileSync() { throw new Error(msg); },
    readFileSync() { throw new Error(msg); },
    writeFileSync() { throw new Error(msg); },
  };
}

const ROOT = '/fake/root';

// --- appendOutcome ---

test('appendOutcome writes a jsonl line at rootDir+BUFFER_REL', () => {
  const io = makeIo();
  const outcome = { agent: 'analyst', rating: 5 };
  const result = appendOutcome(outcome, { rootDir: ROOT, io });
  assert.equal(result, true);
  const expectedPath = path.join(ROOT, BUFFER_REL);
  assert.ok(expectedPath in io._files, `expected file at ${expectedPath}`);
  const written = io._files[expectedPath];
  assert.equal(written, JSON.stringify(outcome) + '\n');
});

test('appendOutcome appends multiple lines sequentially', () => {
  const io = makeIo();
  const o1 = { agent: 'dev', rating: 4 };
  const o2 = { agent: 'pm', rating: 3 };
  appendOutcome(o1, { rootDir: ROOT, io });
  appendOutcome(o2, { rootDir: ROOT, io });
  const text = io._files[path.join(ROOT, BUFFER_REL)];
  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), o1);
  assert.deepEqual(JSON.parse(lines[1]), o2);
});

test('appendOutcome returns false when io throws (never throws)', () => {
  const result = appendOutcome({ x: 1 }, { rootDir: ROOT, io: makeThrowingIo() });
  assert.equal(result, false);
});

// --- readBuffer ---

test('readBuffer round-trips lines appended by appendOutcome', () => {
  const io = makeIo();
  const outcomes = [{ a: 1 }, { b: 2 }, { c: 3 }];
  for (const o of outcomes) appendOutcome(o, { rootDir: ROOT, io });

  const text = readBuffer({ rootDir: ROOT, io });
  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines.length, outcomes.length);
  for (let i = 0; i < outcomes.length; i++) {
    assert.deepEqual(JSON.parse(lines[i]), outcomes[i]);
  }
});

test('readBuffer returns empty string when buffer file is missing', () => {
  const io = makeIo(); // empty, no files
  const text = readBuffer({ rootDir: ROOT, io });
  assert.equal(text, '');
});

test('readBuffer returns empty string when io throws (never throws)', () => {
  const text = readBuffer({ rootDir: ROOT, io: makeThrowingIo() });
  assert.equal(text, '');
});

// --- readCursor ---

test('readCursor returns 0 when cursor file is missing', () => {
  const io = makeIo();
  const val = readCursor({ rootDir: ROOT, io });
  assert.equal(val, 0);
});

test('readCursor reads {drained:N} written by writeCursor', () => {
  const io = makeIo();
  writeCursor(7, { rootDir: ROOT, io });
  const val = readCursor({ rootDir: ROOT, io });
  assert.equal(val, 7);
});

test('readCursor returns 0 when io throws (never throws)', () => {
  const val = readCursor({ rootDir: ROOT, io: makeThrowingIo() });
  assert.equal(val, 0);
});

test('readCursor returns 0 for malformed cursor file', () => {
  const io = makeIo();
  io._files[path.join(ROOT, CURSOR_REL)] = 'not-json';
  const val = readCursor({ rootDir: ROOT, io });
  assert.equal(val, 0);
});

test('readCursor returns 0 when drained field is absent', () => {
  const io = makeIo();
  io._files[path.join(ROOT, CURSOR_REL)] = JSON.stringify({ other: 5 }) + '\n';
  const val = readCursor({ rootDir: ROOT, io });
  assert.equal(val, 0);
});

test('readCursor returns 0 when drained is negative', () => {
  const io = makeIo();
  io._files[path.join(ROOT, CURSOR_REL)] = JSON.stringify({ drained: -1 }) + '\n';
  const val = readCursor({ rootDir: ROOT, io });
  assert.equal(val, 0);
});

// --- writeCursor ---

test('writeCursor persists {drained} readable by readCursor', () => {
  const io = makeIo();
  const result = writeCursor(42, { rootDir: ROOT, io });
  assert.equal(result, true);
  assert.equal(readCursor({ rootDir: ROOT, io }), 42);
});

test('writeCursor overwrites previous cursor value', () => {
  const io = makeIo();
  writeCursor(3, { rootDir: ROOT, io });
  writeCursor(10, { rootDir: ROOT, io });
  assert.equal(readCursor({ rootDir: ROOT, io }), 10);
});

test('writeCursor returns false when io throws (never throws)', () => {
  const result = writeCursor(5, { rootDir: ROOT, io: makeThrowingIo() });
  assert.equal(result, false);
});

// --- BUFFER_REL / CURSOR_REL exports ---

test('BUFFER_REL is a non-empty string', () => {
  assert.equal(typeof BUFFER_REL, 'string');
  assert.ok(BUFFER_REL.length > 0);
});

test('CURSOR_REL is a non-empty string', () => {
  assert.equal(typeof CURSOR_REL, 'string');
  assert.ok(CURSOR_REL.length > 0);
});

test('BUFFER_REL and CURSOR_REL are different paths', () => {
  assert.notEqual(BUFFER_REL, CURSOR_REL);
});
