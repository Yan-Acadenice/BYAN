#!/usr/bin/env node
/**
 * PreToolUse hook — fact-check absolutes guard.
 *
 * Scans Edit/Write tool inputs on markdown/documentation paths for
 * absolute claims (`always`, `never`, `obviously`, `faster`, `better`,
 * `toujours`, `jamais`, `forcement`) without an accompanying source
 * reference.
 *
 * When an unsourced absolute is detected on a doc file, the hook exits
 * with decision=block and a clear reason, forcing the author to cite a
 * source (matching `_byan/knowledge/sources.md`, `RFC`, `CVE-`, a URL,
 * or a `[CLAIM L<n>]` prefix) before writing.
 *
 * Non-blocking outside of Edit/Write tools or when the target is code
 * (not documentation).
 */

const fs = require('fs');
const path = require('path');

const ABSOLUTES = [
  /\btoujours\b/i,
  /\bjamais\b/i,
  /\bforc[eé]ment\b/i,
  /\bobviously\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  /\bclearly\b/i,
  /\bundoubtedly\b/i,
  /\bfaster than\b/i,
  /\bbetter than\b/i,
  /\bplus rapide que\b/i,
  /\bmeilleur que\b/i,
];

const SOURCE_MARKERS = [
  /\bRFC\s*\d+/i,
  /\bCVE-\d{4}-\d+/i,
  /https?:\/\//,
  /\[CLAIM\s+L[1-5]\]/i,
  /\[FACT\s+USER-VERIFIED/i,
  /\bsource\s*:/i,
  /_byan\/knowledge\/sources\.md/,
];

const DOC_EXTS = ['.md', '.mdx', '.rst', '.txt'];

// Paths exempted from scanning — these files DESCRIBE the rule or meta-docs
// where absolutes appear as examples, not as claims.
const EXEMPT_PATH_PATTERNS = [
  /\.claude\/hooks\//,
  /\.claude\/agents\/bmad-compliance\.md$/,
  /_byan\/mcp\/byan-mcp-server\/lib\/(peer-review|fd-state)\.js$/,
  /_byan\/mcp\/byan-mcp-server\/test\//,
  /_byan\/knowledge\/(fact-check|mantras)/i,
  /\/fact-check-absolutes\.js$/,
  /\.claude\/skills\/byan-fact-check\//,
  /install\/__tests__\/.*fact-check/i,
  /__tests__\/.*fact-check/i,
];

function isExemptPath(filePath) {
  if (!filePath) return false;
  return EXEMPT_PATH_PATTERNS.some((re) => re.test(filePath));
}

// Strip content that cannot be a claim :
//   - fenced code blocks ``` ... ```
//   - inline backticks `...`
//   - block quotes (lines starting with >)
//   - regex / array syntax that contains the word as a token
function stripNonClaimZones(text) {
  if (!text) return '';
  return text
    // Fenced code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Inline code
    .replace(/`[^`\n]+`/g, '')
    // Markdown block quotes
    .replace(/^> .*$/gm, '')
    // Lines that look like list of patterns (e.g. "- toujours")
    .replace(/^[\s-]*['"]?\b(toujours|jamais|forc[eé]ment|obviously|always|never|clearly|undoubtedly)\b['"]?/gim, '');
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function isDoc(filePath) {
  if (!filePath) return false;
  return DOC_EXTS.some((ext) => filePath.toLowerCase().endsWith(ext));
}

function extractText(toolName, input) {
  if (!input) return '';
  if (toolName === 'Write') return String(input.content || '');
  if (toolName === 'Edit') {
    return [input.new_string, input.old_string].filter(Boolean).join('\n');
  }
  return '';
}

function findUnsourced(text) {
  if (!text) return null;
  for (const re of ABSOLUTES) {
    const match = text.match(re);
    if (!match) continue;
    const idx = match.index || 0;
    const windowStart = Math.max(0, idx - 240);
    const windowEnd = Math.min(text.length, idx + match[0].length + 240);
    const ctx = text.slice(windowStart, windowEnd);
    const hasSource = SOURCE_MARKERS.some((sm) => sm.test(ctx));
    if (!hasSource) {
      return { absolute: match[0], context: text.slice(Math.max(0, idx - 80), idx + 80) };
    }
  }
  return null;
}

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const toolName = payload.tool_name || payload.toolName || '';
  const input = payload.tool_input || payload.toolInput || {};
  const target = input.file_path || '';

  if (!['Edit', 'Write'].includes(toolName) || !isDoc(target) || isExemptPath(target)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      })
    );
    process.exit(0);
  }

  const rawText = extractText(toolName, input);
  const text = stripNonClaimZones(rawText);
  const hit = findUnsourced(text);

  if (!hit) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      })
    );
    process.exit(0);
  }

  const reason = [
    `BYAN fact-check guard : unsourced absolute "${hit.absolute}" detected in ${path.basename(target)}.`,
    `Context : ...${hit.context}...`,
    `Add a source (RFC, CVE, URL, [CLAIM L<n>], or entry in _byan/knowledge/sources.md) before writing this. `,
    `Alternative : reformulate with hedging ("often", "in my tests", "tends to") to drop the absolute claim.`,
  ].join('\n');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
})();
