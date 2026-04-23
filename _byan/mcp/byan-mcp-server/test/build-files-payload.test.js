import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import nodePath from 'node:path';
import os from 'node:os';
import { buildFilesPayload } from '../server.js';

async function makeTmpDir() {
  return fsPromises.mkdtemp(nodePath.join(os.tmpdir(), 'bfp-test-'));
}

test('buildFilesPayload: includes .md files as utf8', async () => {
  const root = await makeTmpDir();
  try {
    await fsPromises.writeFile(nodePath.join(root, 'readme.md'), '# Hello\n', 'utf8');
    const { files } = await buildFilesPayload(root);
    const md = files.find((f) => f.path === 'readme.md');
    assert.ok(md, 'readme.md should be included');
    assert.equal(md.encoding, 'utf8');
    assert.equal(md.content, '# Hello\n');
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: skips node_modules directory', async () => {
  const root = await makeTmpDir();
  try {
    await fsPromises.mkdir(nodePath.join(root, 'node_modules', 'pkg'), { recursive: true });
    await fsPromises.writeFile(nodePath.join(root, 'node_modules', 'pkg', 'index.js'), 'x', 'utf8');
    await fsPromises.writeFile(nodePath.join(root, 'keep.md'), 'keep', 'utf8');
    const { files } = await buildFilesPayload(root);
    const paths = files.map((f) => f.path);
    assert.ok(!paths.some((p) => p.startsWith('node_modules')), 'node_modules should be skipped');
    assert.ok(paths.includes('keep.md'), 'keep.md should be present');
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: skips .log files', async () => {
  const root = await makeTmpDir();
  try {
    await fsPromises.writeFile(nodePath.join(root, 'app.log'), 'log content', 'utf8');
    await fsPromises.writeFile(nodePath.join(root, 'notes.md'), 'notes', 'utf8');
    const { files } = await buildFilesPayload(root);
    const paths = files.map((f) => f.path);
    assert.ok(!paths.includes('app.log'), '.log file should be skipped');
    assert.ok(paths.includes('notes.md'), 'notes.md should be present');
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: binary file (with NUL) gets base64 encoding', async () => {
  const root = await makeTmpDir();
  try {
    // Write a buffer containing a NUL byte to trigger binary detection.
    const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]);
    await fsPromises.writeFile(nodePath.join(root, 'image.png'), binaryBuf);
    const { files } = await buildFilesPayload(root);
    const img = files.find((f) => f.path === 'image.png');
    assert.ok(img, 'image.png should be included');
    assert.equal(img.encoding, 'base64');
    assert.equal(img.content, binaryBuf.toString('base64'));
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: throws when maxFiles exceeded', async () => {
  const root = await makeTmpDir();
  try {
    // Create 3 files but set maxFiles to 2.
    await fsPromises.writeFile(nodePath.join(root, 'a.md'), 'a', 'utf8');
    await fsPromises.writeFile(nodePath.join(root, 'b.md'), 'b', 'utf8');
    await fsPromises.writeFile(nodePath.join(root, 'c.md'), 'c', 'utf8');
    await assert.rejects(
      () => buildFilesPayload(root, { maxFiles: 2 }),
      /Too many files/
    );
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: throws when maxBytes exceeded', async () => {
  const root = await makeTmpDir();
  try {
    // Write a file larger than the tiny limit.
    await fsPromises.writeFile(nodePath.join(root, 'big.md'), 'x'.repeat(100), 'utf8');
    await assert.rejects(
      () => buildFilesPayload(root, { maxBytes: 10 }),
      /Total size exceeds/
    );
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: throws if path is not a directory', async () => {
  const root = await makeTmpDir();
  try {
    const file = nodePath.join(root, 'file.md');
    await fsPromises.writeFile(file, 'x', 'utf8');
    await assert.rejects(
      () => buildFilesPayload(file),
      /Path is not a directory/
    );
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});

test('buildFilesPayload: returns correct count and totalBytes', async () => {
  const root = await makeTmpDir();
  try {
    const content = 'hello world';
    await fsPromises.writeFile(nodePath.join(root, 'a.md'), content, 'utf8');
    const { count, totalBytes } = await buildFilesPayload(root);
    assert.equal(count, 1);
    assert.equal(totalBytes, Buffer.byteLength(content, 'utf8'));
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
});
