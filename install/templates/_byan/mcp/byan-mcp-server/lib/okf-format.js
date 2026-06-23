// okf-format — Open Knowledge Format v0.1 primitives (parse / serialize /
// validate) + the BYAN knowledge type mapping.
//
// OKF (GoogleCloudPlatform/knowledge-catalog) represents knowledge as plain
// markdown + YAML frontmatter, vendor-neutral and dependency-free for consumers.
// We ADOPT the FORMAT for _byan/connaissance (the GCP reference AGENT, which needs
// BigQuery/Gemini, is deliberately NOT vendored — see docs). This module is the
// single source of truth for the frontmatter contract; the converter
// (okf-bundle.js) builds on it.
//
// Spec v0.1: required `type` (free string); recommended `title`, `description`,
// `resource`, `tags` (list), `timestamp` (ISO-8601); unknown keys MUST be
// preserved. Reserved filenames: index.md (listing, okf_version at bundle root)
// and log.md (history).

import yaml from 'js-yaml';

export const OKF_VERSION = '0.1';
export const OKF_RESERVED = Object.freeze(['index.md', 'log.md']);

const FM_RE = /^﻿?---\n([\s\S]*?)\n---\n?/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * parseFrontmatter(text) -> { data, body }. A leading `---\n...\n---` block is
 * YAML-parsed into `data`; the rest is `body`. No block -> { data:{}, body:text }.
 * Malformed YAML degrades to {} rather than throwing (a knowledge file is never
 * worth crashing the tool over).
 */
export function parseFrontmatter(text) {
  const s = String(text == null ? '' : text);
  const m = s.match(FM_RE);
  if (!m) return { data: {}, body: s.replace(/^﻿/, '') };
  let data;
  try {
    data = yaml.load(m[1]);
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  // Strip the blank line(s) the convention puts between `---` and the body, so
  // body starts at real content and round-trips cleanly with serializeFrontmatter.
  return { data, body: s.slice(m[0].length).replace(/^\n+/, '') };
}

/**
 * serializeFrontmatter(data, body) -> a markdown string with a clean YAML
 * frontmatter block followed by the body. Round-trips with parseFrontmatter.
 */
export function serializeFrontmatter(data, body) {
  const fm = yaml.dump(data || {}, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd();
  const b = String(body == null ? '' : body).replace(/^\n+/, '');
  return `---\n${fm}\n---\n\n${b}`.replace(/\n*$/, '\n');
}

/**
 * isIsoTimestamp(v) -> true for an ISO-8601 date/datetime string OR a Date.
 * js-yaml coerces an UNQUOTED YAML timestamp (`timestamp: 2026-06-23T10:00:00Z`)
 * into a JS Date, so a valid hand-authored OKF file must not be rejected for it.
 */
export function isIsoTimestamp(v) {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return typeof v === 'string' && ISO_RE.test(v);
}

/**
 * validateOkf(data) -> { ok, errors, warnings }. Enforces the v0.1 contract:
 * `type` is required; title/description must be strings if present; tags must be
 * a string list; timestamp must be ISO-8601. Missing recommended fields are
 * WARNINGS, not errors (the spec only hard-requires `type`).
 */
export function validateOkf(data) {
  const errors = [];
  const warnings = [];
  const d = data && typeof data === 'object' ? data : {};

  if (typeof d.type !== 'string' || !d.type.trim()) {
    errors.push('missing required field: type (non-empty string)');
  }
  for (const k of ['title', 'description', 'resource']) {
    if (d[k] !== undefined && typeof d[k] !== 'string') errors.push(`${k} must be a string`);
  }
  if (d.tags !== undefined && (!Array.isArray(d.tags) || d.tags.some((t) => typeof t !== 'string'))) {
    errors.push('tags must be a list of strings');
  }
  if (d.timestamp !== undefined && !isIsoTimestamp(d.timestamp)) {
    errors.push('timestamp must be ISO-8601');
  }
  for (const k of ['title', 'description', 'timestamp']) {
    if (d[k] === undefined) warnings.push(`recommended field absent: ${k}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * byanTypeFor(relPath) -> a sensible OKF `type` for a _byan/connaissance file.
 * Types are free strings in OKF; this keeps BYAN's vocabulary consistent.
 */
export function byanTypeFor(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/');
  const base = p.split('/').pop();
  if (base === 'sources.md') return 'Reference: Source Registry';
  if (base === 'blacklisted-sources.md') return 'Reference: Blacklist';
  if (base === 'mantras-sources.md') return 'Reference: Mantra Sources';
  if (base === 'axioms.md') return 'Axiom';
  // Match by path SEGMENT (not '/testarch/') so it works for relative paths
  // ('testarch/...') the converter passes AND absolute ones.
  const segs = p.split('/');
  if (segs.includes('testarch')) return 'Knowledge: Test Architecture';
  if (segs.includes('excalidraw')) return 'Knowledge: Excalidraw';
  return 'Knowledge';
}

/** deriveTitle(body) -> the first `# ` heading text, or null. */
export function deriveTitle(body) {
  const m = String(body || '').match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

/**
 * deriveDescription(body) -> the first prose sentence (skipping headings, the
 * bold `**key:**` metadata lines, blockquotes and rules), capped at 200 chars,
 * or null when the body has no prose. Best-effort only (description is a
 * RECOMMENDED field): the sentence split is naive (an abbreviation like "e.g."
 * truncates early) and a leading bullet is taken verbatim — acceptable for a
 * derived default a human can override in the frontmatter.
 */
export function deriveDescription(body) {
  for (const raw of String(body || '').split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith('---') || t.startsWith('**') || t.startsWith('>') || t.startsWith('|')) continue;
    const sentence = t.split(/(?<=[.!?])\s/)[0];
    return sentence.length > 200 ? `${sentence.slice(0, 197)}...` : sentence;
  }
  return null;
}
