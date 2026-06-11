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

const path = require('path');
const { stripNonClaimZones, findUnsourced } = require('./lib/fact-check-core');

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
