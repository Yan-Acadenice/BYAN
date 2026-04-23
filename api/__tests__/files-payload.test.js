'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { decodeFilesPayload } = require('../services/files-payload');

test('decodeFilesPayload: utf8 content', () => {
  const map = decodeFilesPayload([
    { path: 'README.md', content: '# hello', encoding: 'utf8' }
  ]);
  assert.equal(map.size, 1);
  const entry = map.get('README.md');
  assert.ok(Buffer.isBuffer(entry.content));
  assert.equal(entry.content.toString('utf8'), '# hello');
  assert.equal(entry.size, 7);
});

test('decodeFilesPayload: default encoding is utf8', () => {
  const map = decodeFilesPayload([
    { path: 'a.txt', content: 'hi' }
  ]);
  assert.equal(map.get('a.txt').content.toString('utf8'), 'hi');
});

test('decodeFilesPayload: base64 content', () => {
  const b64 = Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64');
  const map = decodeFilesPayload([
    { path: 'bin/logo.bin', content: b64, encoding: 'base64' }
  ]);
  const entry = map.get('bin/logo.bin');
  assert.deepEqual(Array.from(entry.content), [0xde, 0xad, 0xbe, 0xef]);
});

test('decodeFilesPayload: mixed utf8 + base64', () => {
  const map = decodeFilesPayload([
    { path: 'readme.md', content: 'x', encoding: 'utf8' },
    { path: 'icon.png', content: Buffer.from('png').toString('base64'), encoding: 'base64' }
  ]);
  assert.equal(map.size, 2);
});

test('decodeFilesPayload: rejects path traversal', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: '../etc/passwd', content: 'x' }]),
    /traversal/i
  );
});

test('decodeFilesPayload: rejects absolute paths', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: '/etc/passwd', content: 'x' }]),
    /Absolute paths/i
  );
});

test('decodeFilesPayload: rejects windows drive paths', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: 'C:\\Windows\\System32\\config', content: 'x' }]),
    /Absolute paths/i
  );
});

test('decodeFilesPayload: rejects null bytes', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: 'a\0b', content: 'x' }]),
    /null byte/i
  );
});

test('decodeFilesPayload: normalizes backslashes', () => {
  const map = decodeFilesPayload([
    { path: 'docs\\readme.md', content: 'x' }
  ]);
  assert.ok(map.has('docs/readme.md'));
});

test('decodeFilesPayload: strips leading slashes (rejects as absolute)', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: '/a/b', content: 'x' }]),
    /Absolute/i
  );
});

test('decodeFilesPayload: empty array rejected', () => {
  assert.throws(() => decodeFilesPayload([]), /empty/i);
});

test('decodeFilesPayload: non-array rejected', () => {
  assert.throws(() => decodeFilesPayload({}), /array/i);
  assert.throws(() => decodeFilesPayload(null), /array/i);
});

test('decodeFilesPayload: missing content rejected', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: 'a.txt' }]),
    /content/i
  );
});

test('decodeFilesPayload: enforces maxFiles limit', () => {
  const many = Array.from({ length: 11 }, (_, i) => ({
    path: `f${i}.txt`,
    content: 'x'
  }));
  assert.throws(
    () => decodeFilesPayload(many, { maxFiles: 10 }),
    /Too many/i
  );
});

test('decodeFilesPayload: enforces maxTotalBytes limit', () => {
  const big = 'x'.repeat(1000);
  const files = [
    { path: 'a.txt', content: big },
    { path: 'b.txt', content: big }
  ];
  assert.throws(
    () => decodeFilesPayload(files, { maxTotalBytes: 1500 }),
    /size exceeds/i
  );
});

test('decodeFilesPayload: unsupported encoding', () => {
  assert.throws(
    () => decodeFilesPayload([{ path: 'a', content: 'x', encoding: 'hex' }]),
    /Unsupported encoding/i
  );
});

test('decodeFilesPayload: error has status 400 and INVALID_PAYLOAD code', () => {
  try {
    decodeFilesPayload([{ path: '../a', content: 'x' }]);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.code, 'INVALID_PAYLOAD');
    assert.equal(err.status, 400);
  }
});
