import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry, buildIndex, buildLog, buildBundle } from '../lib/okf-bundle.js';
import { parseFrontmatter } from '../lib/okf-format.js';

const TS = '2026-06-23T10:00:00Z';

test('buildEntry: fills type/title/description/timestamp from a bare knowledge file', () => {
  const e = buildEntry('_byan/connaissance/axioms.md', '# Axiomes BYAN\n\nUn axiome est non-challengeable. Suite.', { timestamp: TS });
  assert.equal(e.data.type, 'Axiom');
  assert.equal(e.data.title, 'Axiomes BYAN');
  assert.equal(e.data.description, 'Un axiome est non-challengeable.');
  assert.equal(e.data.timestamp, TS);
  assert.equal(e.validation.ok, true);
});

test('buildEntry: existing frontmatter wins; unknown keys preserved (idempotent fields)', () => {
  const src = '---\ntype: Custom Type\ntitle: Kept\nbyan_mantra: IA-16\n---\n\n# Ignored Heading\n\nprose.';
  const e = buildEntry('_byan/connaissance/x.md', src, { timestamp: TS });
  assert.equal(e.data.type, 'Custom Type'); // not overwritten by byanTypeFor
  assert.equal(e.data.title, 'Kept'); // not overwritten by the H1
  assert.equal(e.data.byan_mantra, 'IA-16'); // extension key preserved
});

test('buildEntry is IDEMPOTENT: re-running on its own output is a fixpoint', () => {
  const first = buildEntry('_byan/connaissance/sources.md', '# Sources\n\nLes sources primaires.', { timestamp: TS });
  const second = buildEntry('_byan/connaissance/sources.md', first.serialized, { timestamp: '2099-01-01T00:00:00Z' });
  assert.deepEqual(second.data, first.data); // timestamp not re-stamped, nothing churns
  assert.equal(second.serialized, first.serialized);
});

test('buildEntry: type key is emitted first (stable, readable order)', () => {
  const e = buildEntry('_byan/connaissance/x.md', '# T\n\nprose.', { timestamp: TS });
  assert.equal(Object.keys(e.data)[0], 'type');
});

test('buildIndex: carries okf_version frontmatter and groups by type with links', () => {
  const entries = [
    buildEntry('a.md', '# A\n\naa.', { timestamp: TS }),
    buildEntry('axioms.md', '# Ax\n\nbb.', { timestamp: TS }),
  ];
  const idx = buildIndex(entries);
  const { data, body } = parseFrontmatter(idx);
  assert.equal(data.okf_version, '0.1');
  assert.match(body, /## Axiom/);
  assert.match(body, /\[Ax\]\(axioms\.md\)/);
});

test('buildLog: no frontmatter, reports the entry count + stamp', () => {
  const log = buildLog([{}, {}], TS);
  assert.equal(parseFrontmatter(log).data.okf_version, undefined); // no frontmatter
  assert.match(log, /2 entries/);
  assert.match(log, new RegExp(TS));
});

test('buildEntry normalizes a YAML-coerced Date timestamp to an ISO string', () => {
  const e = buildEntry('x.md', '---\ntype: K\ntimestamp: 2026-06-23T10:00:00Z\n---\n# T\n\nprose.', { timestamp: TS });
  assert.equal(typeof e.data.timestamp, 'string');
  assert.equal(e.validation.ok, true);
});

test('buildBundle: skips reserved names + non-markdown, validates all entries', () => {
  const files = [
    { relPath: 'axioms.md', text: '# Ax\n\nx.' },
    { relPath: 'index.md', text: '# nope' }, // reserved -> skipped
    { relPath: 'log.md', text: '# nope' }, // reserved -> skipped
    { relPath: 'data.csv', text: 'a,b' }, // non-md -> skipped
    { relPath: 'sub/note.md', text: '# Note\n\ny.' },
  ];
  const b = buildBundle(files, { timestamp: TS });
  assert.equal(b.entries.length, 2);
  assert.deepEqual(b.errors, []); // type always set -> all valid
  assert.ok(b.entries.every((e) => e.validation.ok));
  assert.match(b.index, /okf_version/);
});

test('buildBundle: every produced entry passes OKF validation (type guaranteed)', () => {
  const files = [{ relPath: 'testarch/knowledge/overview.md', text: '# Overview\n\n## Principle\n' }];
  const b = buildBundle(files, { timestamp: TS });
  assert.equal(b.entries[0].data.type, 'Knowledge: Test Architecture');
  assert.equal(b.entries[0].validation.ok, true);
});
