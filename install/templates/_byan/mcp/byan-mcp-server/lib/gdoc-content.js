// gdoc-content -- PURE content -> Google Docs API request builders.
//
// No network, no googleapis, no I/O : this module turns a plain content object
// into the deterministic arrays of Docs `batchUpdate` requests that gdoc-client
// sends. Kept pure so the whole shaping logic is unit-tested without a service
// account or a network (see test/gdoc-content.test.js).
//
// Two modes, mirroring gdoc-client's two paths :
//   - TEMPLATE mode  : buildReplaceRequests() -> replaceAllText over a branded
//     template Doc (logo + palette live IN the template ; we only fill text).
//   - NO-TEMPLATE     : buildDocumentRequests() -> insert a structured text doc
//     and colour the title + headings from the AcadeNice palette. A logo is
//     inserted at the top when a PNG URL is provided (opts.logoPngUrl /
//     GDOC_LOGO_PNG_URL) ; Docs accepts a raster URL (PNG/JPG/GIF), not SVG, so
//     the URL must point at a PNG. Absent -> the doc is text branded by colour
//     only (graceful, no image request).

// AcadeNice palette (from the brand charter). Hex here ; converted to the Docs
// API rgbColor (0..1 floats) by hexToRgbColor.
const BRANDING = {
  marine: '#0e2656',
  teal: '#24947a',
  turquoise: '#4cccb8',
};

/**
 * hexToRgbColor('#0e2656') -> { red, green, blue } each in [0,1], the shape the
 * Docs API expects under textStyle.foregroundColor.color.rgbColor. Accepts an
 * optional leading '#' and 3- or 6-digit hex. Throws on malformed input (a bad
 * palette constant is a programming error, surfaced loudly in tests).
 * @param {string} hex
 */
function hexToRgbColor(hex) {
  if (typeof hex !== 'string') throw new TypeError('hex must be a string');
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`invalid hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return {
    red: ((n >> 16) & 255) / 255,
    green: ((n >> 8) & 255) / 255,
    blue: (n & 255) / 255,
  };
}

/**
 * Normalize + validate the content object. Returns { title, sections, resources,
 * fields }. Throws a clear error when the minimum (a non-empty title) is missing
 * -- the caller turns that into a tool error, never a crash.
 * @param {object} content
 */
function normalizeContent(content) {
  const c = content || {};
  const title = typeof c.title === 'string' ? c.title.trim() : '';
  if (!title) throw new Error('content.title is required (non-empty string)');
  const sections = Array.isArray(c.sections)
    ? c.sections
        .map((s) => ({
          heading: typeof s?.heading === 'string' ? s.heading.trim() : '',
          body: typeof s?.body === 'string' ? s.body : '',
        }))
        .filter((s) => s.heading || s.body)
    : [];
  const resources = Array.isArray(c.resources)
    ? c.resources
        .map((r) => ({
          label: typeof r?.label === 'string' ? r.label.trim() : '',
          url: typeof r?.url === 'string' ? r.url.trim() : '',
        }))
        .filter((r) => r.label || r.url)
    : [];
  const fields = c.fields && typeof c.fields === 'object' ? c.fields : {};
  return { title, sections, resources, fields };
}

/**
 * TEMPLATE mode. Map the content onto {{PLACEHOLDER}} tokens and emit one
 * replaceAllText request per token. The template Doc carries the branding ; we
 * only substitute text. `fields` lets a caller fill arbitrary {{KEY}} tokens
 * (e.g. {{CANDIDAT}}). Deterministic order (stable for tests).
 * @param {object} content
 */
function buildReplaceRequests(content) {
  const { title, sections, resources, fields } = normalizeContent(content);
  const map = {
    TITLE: title,
    BLOCS: sections.map((s) => `${s.heading}\n${s.body}`.trim()).join('\n\n'),
    RESSOURCES: resources.map((r) => (r.url ? `${r.label} : ${r.url}` : r.label)).join('\n'),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v != null) map[String(k).toUpperCase()] = String(v);
  }
  return Object.entries(map).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: value,
    },
  }));
}

/**
 * Assemble the flat document text + the index ranges to colour, for NO-TEMPLATE
 * mode. Docs is 1-indexed (index 1 = first insertable position), so every range
 * is offset by +1 against the assembled string. Returns { text, titleRange,
 * headingRanges } with ranges as { startIndex, endIndex } in Docs coordinates.
 * @param {object} content
 */
function assembleDocument(content) {
  const { title, sections, resources } = normalizeContent(content);
  const headingRanges = [];
  let text = '';
  const DOC_START = 1; // Docs body first insertable index

  const titleStart = DOC_START + text.length;
  text += `${title}\n\n`;
  const titleRange = { startIndex: titleStart, endIndex: titleStart + title.length };

  for (const s of sections) {
    if (s.heading) {
      const hs = DOC_START + text.length;
      text += `${s.heading}\n`;
      headingRanges.push({ startIndex: hs, endIndex: hs + s.heading.length });
    }
    if (s.body) text += `${s.body}\n`;
    text += '\n';
  }

  if (resources.length) {
    const rh = 'Ressources';
    const rhs = DOC_START + text.length;
    text += `${rh}\n`;
    headingRanges.push({ startIndex: rhs, endIndex: rhs + rh.length });
    for (const r of resources) {
      text += `${r.url ? `${r.label} : ${r.url}` : r.label}\n`;
    }
  }

  return { text, titleRange, headingRanges };
}

/**
 * NO-TEMPLATE mode. Insert the assembled text at index 1, then colour the title
 * (marine, bold, larger) and each heading (teal, bold) from the palette. Indices
 * are valid because the single insertText happens first and every style range is
 * computed against that one block. Returns the batchUpdate requests array.
 * @param {object} content
 * @param {object} [opts]
 * @param {object} [opts.branding=BRANDING]
 * @param {string} [opts.logoPngUrl]  PNG URL inserted at the top ; absent -> skipped
 */
function buildDocumentRequests(content, opts = {}) {
  const branding = opts.branding || BRANDING;
  const { text, titleRange, headingRanges } = assembleDocument(content);

  const requests = [{ insertText: { location: { index: 1 }, text } }];

  requests.push({
    updateTextStyle: {
      range: titleRange,
      textStyle: {
        bold: true,
        fontSize: { magnitude: 20, unit: 'PT' },
        foregroundColor: { color: { rgbColor: hexToRgbColor(branding.marine) } },
      },
      fields: 'bold,fontSize,foregroundColor',
    },
  });

  for (const range of headingRanges) {
    requests.push({
      updateTextStyle: {
        range,
        textStyle: {
          bold: true,
          fontSize: { magnitude: 14, unit: 'PT' },
          foregroundColor: { color: { rgbColor: hexToRgbColor(branding.teal) } },
        },
        fields: 'bold,fontSize,foregroundColor',
      },
    });
  }

  // Logo last : inserted at index 1 AFTER text+styles, so it lands at the very
  // top and the already-styled text simply shifts down (styles stay bound to the
  // characters). Skipped when no PNG URL is configured (graceful). Docs needs a
  // raster URL (PNG/JPG/GIF) -- a non-PNG/SVG URL is rejected by the API and
  // surfaces as gdoc-client's api-error, not a crash here.
  const logoPngUrl = typeof opts.logoPngUrl === 'string' ? opts.logoPngUrl.trim() : '';
  if (logoPngUrl) {
    requests.push({ insertInlineImage: { location: { index: 1 }, uri: logoPngUrl } });
  }

  return requests;
}

export {
  BRANDING,
  hexToRgbColor,
  normalizeContent,
  buildReplaceRequests,
  assembleDocument,
  buildDocumentRequests,
};
