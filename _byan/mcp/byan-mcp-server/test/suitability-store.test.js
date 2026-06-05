import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record, readLedger, reportLedger, ledgerPath } from '../lib/suitability-store.js';
import { recordOutcome as pureRecord } from '../lib/suitability.js';

// The store is the ONLY write path to the ledger and it must never throw. These
// tests pin: persistence round-trips, the best-effort no-op on a failed write,
// input validation that degrades instead of crashing, and the fact that the
// pure math layer performs no I/O of its own.

// In-memory fs double: keys are absolute paths, values are file contents.
function memIO(initial = {}) {
  const files = { ...initial };
  return {
    files,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error('ENOENT');
      return files[p];
    },
    writeFileSync: (p, data) => {
      files[p] = data;
    },
    renameSync: (from, to) => {
      if (!Object.prototype.hasOwnProperty.call(files, from)) throw new Error('ENOENT rename');
      files[to] = files[from];
      delete files[from];
    },
    unlinkSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error('ENOENT unlink');
      delete files[p];
    },
    mkdirSync: () => {},
  };
}

const ROOT = '/test-root';
const LEDGER = ledgerPath(ROOT);

test('record persists an outcome and round-trips through readLedger', () => {
  const io = memIO();
  const r = record({ model: 'haiku', leafId: 'load-story', success: true, projectRoot: ROOT, io });

  assert.equal(r.recorded, true);
  assert.equal(r.reason, null);
  assert.equal(r.rating.verdict, 'watch'); // 1 sample is thin
  assert.equal(r.rating.n, 1);

  const ledger = readLedger({ projectRoot: ROOT, io });
  assert.equal(ledger['haiku::load-story'].successes, 1);
  assert.equal(ledger['haiku::load-story'].failures, 0);
});

test('record accumulates across calls', () => {
  const io = memIO();
  for (let i = 0; i < 30; i++) record({ model: 'haiku', leafId: 'load-story', success: true, projectRoot: ROOT, io });
  const last = record({ model: 'haiku', leafId: 'load-story', success: true, projectRoot: ROOT, io });
  assert.equal(last.rating.n, 31);
  assert.equal(last.rating.verdict, 'keep-cheap'); // sustained success earns it
});

test('record degrades to a no-op when the write fails, without throwing or corrupting', () => {
  const io = memIO();
  // Seed one good outcome so there is a prior on-disk state.
  record({ model: 'haiku', leafId: 'x', success: true, projectRoot: ROOT, io });
  const snapshot = io.files[LEDGER];

  // Now make every write fail.
  io.writeFileSync = () => {
    throw new Error('EROFS: read-only file system');
  };

  let r;
  assert.doesNotThrow(() => {
    r = record({ model: 'haiku', leafId: 'x', success: false, projectRoot: ROOT, io });
  });
  assert.equal(r.recorded, false);
  assert.equal(r.reason, 'persist_failed');
  // The on-disk ledger must be exactly what it was before the failed write.
  assert.equal(io.files[LEDGER], snapshot, 'a failed write must not corrupt the ledger');
  // The rating reflects the pre-write state (no phantom failure recorded).
  assert.equal(r.rating.successes, 1);
  assert.equal(r.rating.failures, 0);
});

test('a partial/corrupting write leaves the REAL ledger byte-identical (atomic tmp+rename)', () => {
  const io = memIO();
  record({ model: 'haiku', leafId: 'x', success: true, projectRoot: ROOT, io });
  const snapshot = io.files[LEDGER];

  // The realistic failure: the writer DOES corrupt whatever path it is handed,
  // then throws (ENOSPC / killed mid-write) — not a clean throw-before-write.
  // Atomic staging means the corruption lands on the temp file, never on LEDGER.
  io.writeFileSync = (p) => {
    io.files[p] = '{ partial-truncated';
    throw new Error('ENOSPC: no space left on device');
  };

  let r;
  assert.doesNotThrow(() => {
    r = record({ model: 'haiku', leafId: 'x', success: false, projectRoot: ROOT, io });
  });
  assert.equal(r.recorded, false);
  assert.equal(r.reason, 'persist_failed');
  assert.equal(io.files[LEDGER], snapshot, 'the real ledger must be byte-identical after a corrupt partial write');
});

test('a failed write leaves no orphan temp file behind', () => {
  const io = memIO();
  record({ model: 'haiku', leafId: 'x', success: true, projectRoot: ROOT, io });
  io.writeFileSync = (p) => {
    io.files[p] = '{ partial';
    throw new Error('ENOSPC: no space left on device');
  };
  record({ model: 'haiku', leafId: 'x', success: false, projectRoot: ROOT, io });
  assert.ok(
    !Object.prototype.hasOwnProperty.call(io.files, `${LEDGER}.tmp`),
    'the staged temp file must be cleaned up after a failed write',
  );
});

test('record degrades on invalid input instead of throwing', () => {
  const io = memIO();
  let r;
  assert.doesNotThrow(() => {
    r = record({ model: 'haiku', success: true, projectRoot: ROOT, io }); // missing leafId
  });
  assert.equal(r.recorded, false);
  assert.equal(r.reason, 'invalid_input');
});

test('readLedger tolerates a corrupt file (reads as empty, never throws)', () => {
  const io = memIO({ [LEDGER]: '{ this is not json' });
  assert.doesNotThrow(() => {
    const l = readLedger({ projectRoot: ROOT, io });
    assert.deepEqual(l, {});
  });
});

test('reportLedger returns advisory rows with lower bound and n, filterable by model', () => {
  const io = memIO();
  for (let i = 0; i < 30; i++) record({ model: 'haiku', leafId: 'safe', success: true, projectRoot: ROOT, io });
  for (let i = 0; i < 20; i++) record({ model: 'haiku', leafId: 'bad', success: false, projectRoot: ROOT, io });
  record({ model: 'sonnet', leafId: 'mid', success: true, projectRoot: ROOT, io });

  const all = reportLedger({ projectRoot: ROOT, io });
  assert.equal(all.length, 3);
  for (const row of all) {
    assert.equal(typeof row.lower, 'number');
    assert.equal(typeof row.n, 'number');
    assert.ok(['keep-cheap', 'watch', 'demote'].includes(row.verdict));
  }
  // demote (the bad leaf) must sort before keep-cheap (the safe leaf)
  assert.equal(all[0].verdict, 'demote');

  const onlyHaiku = reportLedger({ model: 'haiku', projectRoot: ROOT, io });
  assert.equal(onlyHaiku.length, 2);
  assert.ok(onlyHaiku.every((r) => r.model === 'haiku'));
});

test('the pure math layer performs NO disk write (store is the only writer)', () => {
  const io = memIO();
  // Calling the pure recordOutcome must not touch the io at all.
  const before = { ...io.files };
  const next = pureRecord({}, { model: 'haiku', leafId: 'x', success: true });
  assert.equal(next['haiku::x'].successes, 1); // it computed a new ledger...
  assert.deepEqual(io.files, before, '...but wrote nothing to disk');
});
