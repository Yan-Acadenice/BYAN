#!/usr/bin/env node
'use strict';

// PreToolUse hook — WI-1, the DENT for the armed Codex-delegation lane.
//
// When the Codex lane is ARMED (yanstaller option on AND Codex linked) and the
// current turn is about to WRITE delegable code without having delegated to Codex
// first, DENY ONCE with the exact instruction to delegate. This is the tooth that
// makes "delegate to Codex when armed" govern instead of being prose Claude can
// double with a polite excuse (the session incident).
//
// Speed-bump, not a wall (the user's red line) :
//   - escape-hatch : `.byan-codex-autodelegate/off` silences it (shared with the
//     nudge hook — one switch for the whole Codex-delegation posture).
//   - `// BYAN-DELEGATE: reviewed` in the file acknowledges a deliberate
//     Claude-lane choice (Codex unavailable, judgment/verify) and passes.
//   - deny-once : an identical resubmission passes, and a grace window after a
//     deny lets a multi-file build proceed without nagging on every file.
//
// Never traps a turn, always exits 0. Pure decision in lib/codex-delegate-gate.js;
// armed/linked detection reused from codex-autodelegate.js; delegability from
// autodelegate-decision.js; the turn transcript via transcript-read.js.

const fs = require('fs');
const path = require('path');
const gate = require('./lib/codex-delegate-gate');
const { loadConfig, codexLinked, toggledOff } = require('./codex-autodelegate');
const { looksDelegable } = require('./lib/autodelegate-decision');
const { extractRecentMessages, extractLastAssistantText, contentToText } = require('./lib/transcript-read');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GRACE_MS = 120000;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function allow() {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function sidecarPath(root) {
  return path.join(root, '.byan-codex-delegate', 'last-deny.json');
}

function readPriorDeny(root) {
  try {
    const p = JSON.parse(fs.readFileSync(sidecarPath(root), 'utf8'));
    return p && typeof p === 'object' ? p : null;
  } catch (_e) {
    return null;
  }
}

function writePriorDeny(root, entry) {
  try {
    fs.mkdirSync(path.dirname(sidecarPath(root)), { recursive: true });
    fs.writeFileSync(sidecarPath(root), JSON.stringify(entry));
  } catch (_e) {
    // best-effort : losing the deny memory only costs one extra deny, never a trap
  }
}

// The last user message text this turn, for the delegability signal (a code
// target already suffices, this only broadens it).
function lastUserText(payload) {
  const msgs = extractRecentMessages(payload, 12);
  if (!Array.isArray(msgs)) return '';
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === 'user') return contentToText(msgs[i].content);
  }
  return '';
}

// Pure-ish assembly of the decision from a payload (exported for tests, fs
// injected via opts.root + opts.now).
function runGuard(payload, { root = ROOT, now = Date.now() } = {}) {
  const toolName = payload.tool_name || payload.toolName || '';
  if (toolName !== 'Write' && toolName !== 'Edit') return allow();

  const config = loadConfig(root);
  const armed = config.enabled === true && codexLinked();
  const escaped = toggledOff(root);

  const input = payload.tool_input || payload.toolInput || {};
  const filePath = input.file_path || input.filePath || '';
  const content = toolName === 'Edit'
    ? String(input.new_string || input.newString || '')
    : String(input.content || '');

  const userText = lastUserText(payload);
  const delegable = gate.targetIsCode(filePath) || looksDelegable(userText);
  const reviewedMarker = gate.hasReviewedMarker(content) || gate.hasReviewedMarker(extractLastAssistantText(payload));
  const delegationSeen = gate.delegationSeenThisTurn(extractRecentMessages(payload, 12) || []);
  const turnHash = gate.hashTurn(filePath, content);

  const decision = gate.decideDelegateGate({
    armed,
    delegable,
    delegationSeen,
    escaped,
    reviewedMarker,
    priorDeny: readPriorDeny(root),
    turnHash,
    now,
    graceMs: GRACE_MS,
  });

  if (decision.decision === 'deny') {
    writePriorDeny(root, { hash: turnHash, ts: now });
    return deny(decision.reason);
  }
  return allow();
}

if (require.main === module) {
  (async () => {
    let out;
    try {
      const payload = JSON.parse((await readStdin()) || '{}');
      out = runGuard(payload);
    } catch (_e) {
      out = allow();
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })();
}

module.exports = { runGuard, sidecarPath, readPriorDeny, writePriorDeny, lastUserText };
