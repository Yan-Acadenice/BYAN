import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OKF_VERSION,
  OKF_RESERVED,
  parseFrontmatter,
  serializeFrontmatter,
  isIsoTimestamp,
  validateOkf,
  byanTypeFor,
  deriveTitle,
  deriveDescription,
} from '../lib/okf-format.js';

test('OKF_VERSION + reserved names match the spec', () => {
  assert.equal(OKF_VERSION, '0.1');
  assert.deepEqual([...OKF_RESERVED], ['index.md', 'log.md']);
});

test('parseFrontmatter: extracts the YAML block and the body', () => {
  const { data, body } = parseFrontmatter('---\ntype: Axiom\ntitle: X\n---\n\n# Body\ntext\n');
  assert.equal(data.type, 'Axiom');
  assert.equal(data.title, 'X');
  assert.match(body, /^# Body/);
});

test('parseFrontmatter: no frontmatter -> empty data, full body (BOM stripped)', () => {
  const { data, body } = parseFrontmatter('﻿# Just markdown\nhello');
  assert.deepEqual(data, {});
  assert.match(body, /^# Just markdown/);
});

test('parseFrontmatter: malformed YAML degrades to {} (never throws)', () => {
  const { data } = parseFrontmatter('---\n: : : bad\n  - nope\n---\nbody');
  assert.deepEqual(data, {});
});

test('serializeFrontmatter round-trips with parseFrontmatter', () => {
  const data = { type: 'Knowledge', title: 'T', tags: ['a', 'b'], timestamp: '2026-06-23T10:00:00Z' };
  const out = serializeFrontmatter(data, '# Heading\n\nprose.');
  const back = parseFrontmatter(out);
  assert.deepEqual(back.data, data);
  assert.match(back.body, /^# Heading/);
});

test('serializeFrontmatter preserves unknown/extension keys (spec: consumers must preserve)', () => {
  const data = { type: 'Knowledge', byan_mantra: 'IA-16', custom: { nested: true } };
  assert.deepEqual(parseFrontmatter(serializeFrontmatter(data, 'x')).data, data);
});

test('isIsoTimestamp', () => {
  assert.equal(isIsoTimestamp('2026-06-23'), true);
  assert.equal(isIsoTimestamp('2026-06-23T14:30:00Z'), true);
  assert.equal(isIsoTimestamp('2026-06-23T14:30:00+02:00'), true);
  assert.equal(isIsoTimestamp('hier'), false);
  assert.equal(isIsoTimestamp(42), false);
});

test('validateOkf: type is required (error when missing)', () => {
  const r = validateOkf({ title: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /type/.test(e)));
});

test('validateOkf: a full valid entry is ok with no warnings', () => {
  const r = validateOkf({ type: 'Axiom', title: 'T', description: 'd', timestamp: '2026-06-23T00:00:00Z' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('validateOkf: type-only is ok but warns on missing recommended fields', () => {
  const r = validateOkf({ type: 'Knowledge' });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /title/.test(w)));
  assert.ok(r.warnings.some((w) => /description/.test(w)));
  assert.ok(r.warnings.some((w) => /timestamp/.test(w)));
});

test('validateOkf: tags must be a string list; timestamp must be ISO', () => {
  assert.ok(validateOkf({ type: 'K', tags: 'sales' }).errors.some((e) => /tags/.test(e)));
  assert.ok(validateOkf({ type: 'K', tags: [1, 2] }).errors.some((e) => /tags/.test(e)));
  assert.ok(validateOkf({ type: 'K', timestamp: 'yesterday' }).errors.some((e) => /timestamp/.test(e)));
});

test('validateOkf + isIsoTimestamp accept a YAML-coerced Date (unquoted source timestamp)', () => {
  const { data } = parseFrontmatter('---\ntype: K\ntimestamp: 2026-06-23T10:00:00Z\n---\nbody');
  assert.ok(data.timestamp instanceof Date, 'js-yaml should coerce the unquoted timestamp to a Date');
  assert.equal(isIsoTimestamp(data.timestamp), true);
  assert.equal(validateOkf(data).ok, true);
});

test('byanTypeFor maps connaissance files to a stable vocabulary', () => {
  assert.equal(byanTypeFor('_byan/connaissance/sources.md'), 'Reference: Source Registry');
  assert.equal(byanTypeFor('_byan/connaissance/blacklisted-sources.md'), 'Reference: Blacklist');
  assert.equal(byanTypeFor('_byan/connaissance/mantras-sources.md'), 'Reference: Mantra Sources');
  assert.equal(byanTypeFor('_byan/connaissance/axioms.md'), 'Axiom');
  assert.equal(byanTypeFor('_byan/connaissance/testarch/knowledge/overview.md'), 'Knowledge: Test Architecture');
  assert.equal(byanTypeFor('_byan/connaissance/excalidraw/README.md'), 'Knowledge: Excalidraw');
  assert.equal(byanTypeFor('_byan/connaissance/whatever.md'), 'Knowledge');
});

test('deriveTitle picks the first H1, deriveDescription the first prose sentence', () => {
  const body = '# Axiomes — Verites BYAN\n\n**Statut :** Stable\n\nUn axiome est une verite non-challengeable. Et le reste.';
  assert.equal(deriveTitle(body), 'Axiomes — Verites BYAN');
  assert.equal(deriveDescription(body), 'Un axiome est une verite non-challengeable.');
});

test('deriveDescription skips metadata/headings and returns null on no prose', () => {
  assert.equal(deriveDescription('# Title\n\n## Sub\n\n'), null);
  assert.equal(deriveTitle('no heading here'), null);
});
