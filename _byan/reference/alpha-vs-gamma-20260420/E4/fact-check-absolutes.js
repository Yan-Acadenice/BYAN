#!/usr/bin/env node
/**
 * PreToolUse hook : blocks Edit/Write on doc files that introduce
 * unsourced absolutes (toujours/always/faster than/...).
 *
 * Contract :
 *   stdin  : { tool_name, tool_input }
 *   stdout : { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason? } }
 *   exit 0 always (malformed/unknown input → allow).
 */

const DOC_EXT = /\.(md|mdx|rst|txt)$/i;

const ABSOLUTES = [
  'toujours', 'jamais', 'forcement',
  'obviously', 'always', 'never', 'clearly', 'undoubtedly',
  'faster than', 'better than',
  'plus rapide que', 'meilleur que'
];

const SOURCE_MARKERS = [
  /RFC\s+\d+/i,
  /CVE-\d{4}-\d+/i,
  /https?:\/\//i,
  /\[CLAIM L[1-5]\]/,
  /\[FACT USER-VERIFIED/,
  /source\s*:/i,
  /_byan\/knowledge\/sources\.md/i
];

const WINDOW = 240;

function buildPattern() {
  const parts = ABSOLUTES.map(a => a.replace(/\s+/g, '\\s+'));
  // \b at boundaries — word chars only, so we anchor manually for multi-word phrases.
  return new RegExp(`\\b(${parts.join('|')})\\b`, 'gi');
}
const ABS_RE = buildPattern();

function extractTextToScan(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const fp = toolInput.file_path;
  if (typeof fp !== 'string' || !DOC_EXT.test(fp)) return null;

  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    const oldS = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newS = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    // Scan the union — catches both pre-existing context and introduced text.
    return `${oldS}\n---\n${newS}`;
  }
  return null;
}

function hasNearbySource(text, idx) {
  const start = Math.max(0, idx - WINDOW);
  const end = Math.min(text.length, idx + WINDOW);
  const window = text.slice(start, end);
  return SOURCE_MARKERS.some(re => re.test(window));
}

function snippet(text, idx, matchLen) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + matchLen + 40);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function scan(text) {
  const offenders = [];
  let m;
  ABS_RE.lastIndex = 0;
  while ((m = ABS_RE.exec(text)) !== null) {
    const idx = m.index;
    if (!hasNearbySource(text, idx)) {
      offenders.push({
        absolute: m[0],
        context: snippet(text, idx, m[0].length)
      });
    }
  }
  return offenders;
}

function allow() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  };
}

function deny(offenders, filePath) {
  const first = offenders[0];
  const lines = [
    `fact-check-absolutes : ${offenders.length} unsourced absolute(s) in ${filePath}.`,
    `First offender: "${first.absolute}" in : "${first.context}"`,
    'Fix: add a source marker nearby (URL, RFC 9110, CVE-YYYY-N, [CLAIM L2], [FACT USER-VERIFIED], source:) or reformulate without absolutes.'
  ];
  if (offenders.length > 1) {
    lines.push(`Other absolutes: ${offenders.slice(1, 4).map(o => `"${o.absolute}"`).join(', ')}${offenders.length > 4 ? ', ...' : ''}`);
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: lines.join('\n')
    }
  };
}

async function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { process.stdout.write(JSON.stringify(allow())); return; }

    let payload;
    try { payload = JSON.parse(raw); } catch { process.stdout.write(JSON.stringify(allow())); return; }

    const toolName = payload && payload.tool_name;
    if (toolName !== 'Edit' && toolName !== 'Write') {
      process.stdout.write(JSON.stringify(allow())); return;
    }

    const text = extractTextToScan(toolName, payload.tool_input);
    if (text === null) { process.stdout.write(JSON.stringify(allow())); return; }

    const offenders = scan(text);
    if (offenders.length === 0) {
      process.stdout.write(JSON.stringify(allow()));
    } else {
      process.stdout.write(JSON.stringify(deny(offenders, payload.tool_input.file_path)));
    }
  } catch {
    // Never crash — always allow on internal error.
    process.stdout.write(JSON.stringify(allow()));
  }
})();
