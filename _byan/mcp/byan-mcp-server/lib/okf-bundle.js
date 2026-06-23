// okf-bundle — pure converter that turns BYAN knowledge files into an Open
// Knowledge Format bundle (normalized frontmatter + index.md + log.md).
//
// PURE (no fs): the bin (byan-okf.js) does the I/O and hands content in/out.
// buildEntry is a FIXPOINT on its own output — feeding a normalized file back in
// keeps its fields verbatim (no duplication, no churn). Note: the FIRST build of a
// frontmatter-less source stamps a fresh timestamp, but once a file carries one,
// rebuilds preserve it. Unknown/extension keys are always preserved (OKF spec).

import path from 'node:path';
import {
  parseFrontmatter,
  serializeFrontmatter,
  validateOkf,
  byanTypeFor,
  deriveTitle,
  deriveDescription,
  OKF_VERSION,
  OKF_RESERVED,
} from './okf-format.js';

const PREFERRED_ORDER = ['type', 'title', 'description', 'resource', 'tags', 'timestamp'];

function basenameTitle(relPath) {
  return path.basename(String(relPath || '')).replace(/\.md$/, '');
}

/**
 * buildEntry(relPath, text, { timestamp }) -> { path, data, body, serialized,
 * validation }. Fills the OKF frontmatter from existing values FIRST (idempotent),
 * deriving type/title/description only when absent. Existing + unknown keys are
 * preserved; keys are emitted in a stable, readable order.
 */
export function buildEntry(relPath, text, { timestamp } = {}) {
  const { data: existing, body } = parseFrontmatter(text);
  const data = { ...existing };

  if (!data.type) data.type = byanTypeFor(relPath);
  if (!data.title) data.title = deriveTitle(body) || basenameTitle(relPath);
  if (data.description === undefined) {
    const d = deriveDescription(body);
    if (d) data.description = d;
  }
  if (!data.timestamp && timestamp) data.timestamp = timestamp;
  // A YAML-coerced Date (unquoted source timestamp) -> canonical ISO string, so
  // the emitted bundle always carries a string timestamp.
  if (data.timestamp instanceof Date) data.timestamp = data.timestamp.toISOString();

  const ordered = {};
  for (const k of PREFERRED_ORDER) if (data[k] !== undefined) ordered[k] = data[k];
  for (const k of Object.keys(data)) if (ordered[k] === undefined) ordered[k] = data[k];

  return {
    path: relPath,
    data: ordered,
    body,
    serialized: serializeFrontmatter(ordered, body),
    validation: validateOkf(ordered),
  };
}

/**
 * buildIndex(entries) -> the bundle-root index.md content. Carries the
 * `okf_version` frontmatter (the one place the spec allows it) and groups entries
 * by type with relative links — the progressive-disclosure listing.
 */
export function buildIndex(entries) {
  const byType = new Map();
  for (const e of entries) {
    const t = (e.data && e.data.type) || 'Knowledge';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(e);
  }
  const lines = [
    '# BYAN Knowledge',
    '',
    'Open Knowledge Format bundle generated from `_byan/connaissance`.',
    '',
  ];
  for (const t of [...byType.keys()].sort()) {
    lines.push(`## ${t}`, '');
    for (const e of byType.get(t).slice().sort((a, b) => a.path.localeCompare(b.path))) {
      const title = (e.data && e.data.title) || e.path;
      const desc = e.data && e.data.description ? ` — ${e.data.description}` : '';
      lines.push(`- [${title}](${e.path})${desc}`);
    }
    lines.push('');
  }
  return serializeFrontmatter({ okf_version: OKF_VERSION }, lines.join('\n'));
}

/**
 * buildLog(entries, timestamp) -> log.md content. Reserved file, no frontmatter,
 * plain update history.
 */
export function buildLog(entries, timestamp) {
  const stamp = timestamp || '(unstamped)';
  return `# Update Log\n\n## ${stamp}\n\nGenerated OKF bundle from _byan/connaissance: ${entries.length} entries.\n`;
}

/**
 * buildBundle(files, { timestamp }) -> { entries, index, log, errors }. `files`
 * is [{ relPath, text }]. Reserved names (index.md/log.md) and non-markdown are
 * skipped. `errors` lists entries that fail OKF validation (should be none, since
 * we always set `type`).
 */
export function buildBundle(files, { timestamp } = {}) {
  const entries = (files || [])
    .filter((f) => f && typeof f.relPath === 'string' && /\.md$/.test(f.relPath))
    .filter((f) => !OKF_RESERVED.includes(path.basename(f.relPath)))
    .map((f) => buildEntry(f.relPath, f.text, { timestamp }));
  const index = buildIndex(entries);
  const log = buildLog(entries, timestamp);
  const errors = entries
    .filter((e) => !e.validation.ok)
    .map((e) => ({ path: e.path, errors: e.validation.errors }));
  return { entries, index, log, errors };
}
