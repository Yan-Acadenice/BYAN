import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANDING,
  hexToRgbColor,
  normalizeContent,
  buildReplaceRequests,
  assembleDocument,
  buildDocumentRequests,
} from '../lib/gdoc-content.js';

test('hexToRgbColor converts the AcadeNice marine to 0..1 floats', () => {
  const c = hexToRgbColor(BRANDING.marine); // #0e2656
  assert.ok(Math.abs(c.red - 14 / 255) < 1e-9);
  assert.ok(Math.abs(c.green - 38 / 255) < 1e-9);
  assert.ok(Math.abs(c.blue - 86 / 255) < 1e-9);
});

test('hexToRgbColor accepts 3-digit hex and a missing #', () => {
  assert.deepEqual(hexToRgbColor('fff'), { red: 1, green: 1, blue: 1 });
  assert.deepEqual(hexToRgbColor('#000000'), { red: 0, green: 0, blue: 0 });
});

test('hexToRgbColor throws on malformed input (loud, not silent)', () => {
  assert.throws(() => hexToRgbColor('nothex'));
  assert.throws(() => hexToRgbColor('#12'));
});

test('normalizeContent requires a non-empty title', () => {
  assert.throws(() => normalizeContent({}), /title is required/);
  assert.throws(() => normalizeContent({ title: '   ' }), /title is required/);
  const n = normalizeContent({ title: '  Bilan  ' });
  assert.equal(n.title, 'Bilan');
  assert.deepEqual(n.sections, []);
  assert.deepEqual(n.resources, []);
});

test('normalizeContent keeps only non-empty sections/resources', () => {
  const n = normalizeContent({
    title: 'T',
    sections: [{ heading: 'A', body: 'b' }, { heading: '', body: '' }],
    resources: [{ label: 'L', url: 'http://u' }, {}],
  });
  assert.equal(n.sections.length, 1);
  assert.equal(n.resources.length, 1);
});

test('buildReplaceRequests maps content + extra fields to {{PLACEHOLDER}} requests', () => {
  const reqs = buildReplaceRequests({
    title: 'Titre',
    sections: [{ heading: 'Bloc 1', body: 'corps' }],
    resources: [{ label: 'Doc', url: 'http://x' }],
    fields: { candidat: 'Alice' },
  });
  const byToken = Object.fromEntries(
    reqs.map((r) => [r.replaceAllText.containsText.text, r.replaceAllText.replaceText])
  );
  assert.equal(byToken['{{TITLE}}'], 'Titre');
  assert.equal(byToken['{{BLOCS}}'], 'Bloc 1\ncorps');
  assert.equal(byToken['{{RESSOURCES}}'], 'Doc : http://x');
  assert.equal(byToken['{{CANDIDAT}}'], 'Alice');
  // every request is a well-formed replaceAllText with matchCase
  for (const r of reqs) {
    assert.equal(r.replaceAllText.containsText.matchCase, true);
    assert.equal(typeof r.replaceAllText.replaceText, 'string');
  }
});

test('assembleDocument places the title range at Docs index 1', () => {
  const { text, titleRange, headingRanges } = assembleDocument({
    title: 'Hello',
    sections: [{ heading: 'Sec', body: 'body' }],
  });
  assert.equal(titleRange.startIndex, 1);
  assert.equal(titleRange.endIndex, 1 + 'Hello'.length);
  // the heading range points at the actual heading substring in the text
  const h = headingRanges[0];
  assert.equal(text.slice(h.startIndex - 1, h.endIndex - 1), 'Sec');
});

test('buildDocumentRequests inserts text first, then colours title + headings', () => {
  const reqs = buildDocumentRequests({
    title: 'T',
    sections: [{ heading: 'H', body: 'B' }],
  });
  // first request is the single insertText at index 1
  assert.equal(reqs[0].insertText.location.index, 1);
  assert.ok(reqs[0].insertText.text.startsWith('T\n'));
  // a title style request uses the marine colour + bold
  const styles = reqs.filter((r) => r.updateTextStyle);
  assert.ok(styles.length >= 2); // title + 1 heading
  const titleStyle = styles[0];
  assert.equal(titleStyle.updateTextStyle.textStyle.bold, true);
  const marine = hexToRgbColor(BRANDING.marine);
  assert.deepEqual(
    titleStyle.updateTextStyle.textStyle.foregroundColor.color.rgbColor,
    marine
  );
  // fields mask is set (Docs API requires it)
  assert.match(titleStyle.updateTextStyle.fields, /foregroundColor/);
});

test('buildDocumentRequests inserts the logo last when a PNG URL is given, skips it otherwise', () => {
  const withLogo = buildDocumentRequests({ title: 'T' }, { logoPngUrl: 'https://x/logo.png' });
  const last = withLogo[withLogo.length - 1];
  assert.ok(last.insertInlineImage, 'last request should be the inline image');
  assert.equal(last.insertInlineImage.location.index, 1);
  assert.equal(last.insertInlineImage.uri, 'https://x/logo.png');

  const noLogo = buildDocumentRequests({ title: 'T' });
  assert.ok(!noLogo.some((r) => r.insertInlineImage), 'no image request without a URL');

  const blank = buildDocumentRequests({ title: 'T' }, { logoPngUrl: '   ' });
  assert.ok(!blank.some((r) => r.insertInlineImage), 'whitespace URL is treated as absent');
});
