const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { archive, deleteHard, timestampDir } = require('../../lib/cleanup/executor');

describe('cleanup/executor', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-exec-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  describe('archive', () => {
    test('moves files to timestamped subdir of archiveRoot', async () => {
      const src1 = path.join(tmp, 'old-doc.md');
      const src2 = path.join(tmp, 'byan-test');
      await fs.writeFile(src1, 'old');
      await fs.mkdirp(src2);
      await fs.writeFile(path.join(src2, 'SKILL.md'), 'stub');

      const archiveRoot = path.join(tmp, '_byan-output', 'archive');
      const r = archive([{ path: src1 }, { path: src2 }], {
        archiveRoot,
        now: new Date('2026-04-19T12:34:56Z'),
      });

      expect(r.moved).toHaveLength(2);
      expect(r.errors).toHaveLength(0);
      expect(r.archiveDir).toContain('20260419-');
      expect(await fs.pathExists(src1)).toBe(false);
      expect(await fs.pathExists(src2)).toBe(false);
      expect(await fs.pathExists(path.join(r.archiveDir, 'old-doc.md'))).toBe(true);
      expect(await fs.pathExists(path.join(r.archiveDir, 'byan-test', 'SKILL.md'))).toBe(true);
    });

    test('records errors for non-existent sources', () => {
      const archiveRoot = path.join(tmp, '_byan-output', 'archive');
      const r = archive([{ path: '/nonexistent/path' }], { archiveRoot });
      expect(r.moved).toHaveLength(0);
      expect(r.errors).toHaveLength(1);
    });

    test('empty items list → no-op', () => {
      const r = archive([]);
      expect(r.moved).toEqual([]);
      expect(r.errors).toEqual([]);
    });
  });

  describe('deleteHard', () => {
    test('removes files and dirs recursively', async () => {
      const f = path.join(tmp, 'doc.md');
      const d = path.join(tmp, 'byan-test');
      await fs.writeFile(f, 'x');
      await fs.mkdirp(d);
      await fs.writeFile(path.join(d, 'SKILL.md'), 'y');

      const r = deleteHard([{ path: f }, { path: d }]);
      expect(r.deleted).toHaveLength(2);
      expect(r.errors).toHaveLength(0);
      expect(await fs.pathExists(f)).toBe(false);
      expect(await fs.pathExists(d)).toBe(false);
    });

    test('empty items list → no-op', () => {
      const r = deleteHard([]);
      expect(r.deleted).toEqual([]);
      expect(r.errors).toEqual([]);
    });
  });

  describe('timestampDir', () => {
    test('returns a valid YYYYMMDD-HHmmss format', () => {
      const t = timestampDir();
      expect(t).toMatch(/^\d{8}-\d{6}$/);
    });
  });
});
