#!/usr/bin/env node
'use strict';

// PreToolUse hook — WI-1, the DENT for the armed Codex-delegation lane (option B).
//
// When the Codex lane is ARMED (yanstaller option on AND Codex linked) and the
// current turn is about to WRITE delegable code without having delegated to Codex
// first, DENY with the exact instruction to delegate. Option B closed the
// self-dodge : BYAN can no longer bypass by writing a marker into the file or by
// resubmitting. The only passes are genuine and mostly HUMAN-controlled :
//   - escape-hatch file `.byan-codex-autodelegate/off` (human switch, shared with
//     the nudge hook — one switch for the whole Codex posture),
//   - a HUMAN opt-out phrase in the request ("reste sur Claude" / "sans codex"...),
//   - Codex genuinely unavailable (probed here : `codex --version`),
//   - a real Codex delegation already attempted this turn.
// Otherwise it denies, and STAYS denied on resubmit — a wall against BYAN's silent
// self-dodge, never a trap for the user (who always has the switch / opt-out).
//
// Never traps a turn on an internal error, always exits 0. Pure decision in
// lib/codex-delegate-gate.js ; armed/linked detection reused from
// codex-autodelegate.js ; delegability from autodelegate-decision.js ; the turn
// transcript via transcript-read.js.

const { spawnSync } = require('child_process');
const gate = require('./lib/codex-delegate-gate');
const { loadConfig, codexLinked, toggledOff } = require('./codex-autodelegate');
const { extractRecentMessages, contentToText } = require('./lib/transcript-read');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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

// Light Codex availability probe : `codex --version`. Codex genuinely absent /
// broken -> the guard must NOT deny (staying on Claude is the legit fallback). Run
// ONLY in the would-deny branch (see runGuard) so the common paths pay nothing.
function probeCodexAvailable(runner = spawnSync) {
  try {
    const res = runner('codex', ['--version'], { timeout: 8000, encoding: 'utf8' });
    return res && res.status === 0;
  } catch (_e) {
    return false;
  }
}

// The last user message text this turn — the source for the human opt-out signal
// AND a secondary delegability signal.
function lastUserText(payload) {
  const msgs = extractRecentMessages(payload, 12);
  if (!Array.isArray(msgs)) return '';
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === 'user') return contentToText(msgs[i].content);
  }
  return '';
}

// runGuard(payload, opts) — the decision. opts.codexProbe is injectable for tests.
function runGuard(payload, { root = ROOT, codexProbe = probeCodexAvailable } = {}) {
  const toolName = payload.tool_name || payload.toolName || '';
  if (toolName !== 'Write' && toolName !== 'Edit') return allow();

  const config = loadConfig(root);
  const armed = config.enabled === true && codexLinked();
  if (!armed) return allow(); // fast path, no transcript work when the lane is off

  const escaped = toggledOff(root);
  const input = payload.tool_input || payload.toolInput || {};
  const filePath = input.file_path || input.filePath || '';
  const humanOptOut = gate.humanOptOutFromText(lastUserText(payload));
  // The delegable signal at a Write is the TARGET type only : writing a code file
  // is delegable, writing a doc/config is not. The request VERB ("ecris la doc")
  // is NOT used here — it false-fires on doc writes (a .md is never delegated).
  const delegable = gate.targetIsCode(filePath);
  const delegationSeen = gate.delegationSeenThisTurn(extractRecentMessages(payload, 12) || []);

  // Probe Codex ONLY when every cheaper signal points to a deny — so an unavailable
  // Codex still yields the legit Claude fallback, without probing on every write.
  const wouldDeny = !escaped && !humanOptOut && delegable && !delegationSeen;
  const codexAvailable = wouldDeny ? codexProbe() : true;

  const decision = gate.decideDelegateGate({
    armed,
    delegable,
    delegationSeen,
    escaped,
    humanOptOut,
    codexAvailable,
  });

  return decision.decision === 'deny' ? deny(decision.reason) : allow();
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

module.exports = { runGuard, probeCodexAvailable, lastUserText };
