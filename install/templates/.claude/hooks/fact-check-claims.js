#!/usr/bin/env node
/**
 * Stop hook — fact-check conversation claims (non-blocking).
 *
 * The PreToolUse twin (fact-check-absolutes.js) only fires when the agent
 * WRITES an unsourced absolute into a doc file. This hook covers the other,
 * more frequent surface : an unsourced absolute spoken in the assistant's
 * final turn text. It NUDGES (systemMessage, continue) and never blocks —
 * spoken claims are noisier than written docs, so a block would trap
 * legitimate hypotheses/quotes. Same detection engine (fact-check-core).
 */

'use strict';

const { stripNonClaimZones, findUnsourced } = require('./lib/fact-check-core');
const { extractLastAssistantText } = require('./lib/transcript-read');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

// Pure decision — no IO. Returns { nudge:false } or { nudge:true, absolute, context }.
function decideClaim({ lastAssistantText }) {
  const text = stripNonClaimZones(lastAssistantText || '');
  const hit = findUnsourced(text);
  if (!hit) return { nudge: false };
  return { nudge: true, absolute: hit.absolute, context: hit.context };
}

function nudgeMessage(hit) {
  return [
    `BYAN fact-check : unsourced absolute "${hit.absolute}" in this turn.`,
    `Context : ...${hit.context}...`,
    `Consider a source (RFC, CVE, URL, [CLAIM L<n>]) or hedge ("often", "in my tests", "tends to"). Advisory — not blocking.`,
  ].join('\n');
}

if (require.main === module) {
  (async () => {
    let payload = {};
    try {
      const raw = await readStdin();
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    let decision = { nudge: false };
    try {
      decision = decideClaim({ lastAssistantText: extractLastAssistantText(payload) });
    } catch {
      decision = { nudge: false };
    }

    if (decision.nudge) {
      process.stdout.write(JSON.stringify({ systemMessage: nudgeMessage(decision), continue: true }));
    } else {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  })();
}

module.exports = { decideClaim, nudgeMessage };
