#!/usr/bin/env node
'use strict';

// PreToolUse hook — the armed Codex-delegation guard (v3 : router-obedient +
// pressure-gated). See lib/codex-delegate-gate.js for the policy.
//
// It DENIES a code Write/Edit only when ALL hold : the lane is armed (yanstaller
// option on AND Codex linked), the ROUTER routes the task to Codex, we are under
// Claude budget PRESSURE, Codex is available, and no delegation happened this turn
// — and the human has not opted out. Otherwise it allows. Never traps a turn on an
// internal error (fails open), always exits 0.
//
// The two computed signals (router decision, budget pressure) are only evaluated
// in the would-deny branch, so the common allow paths pay nothing. Both fail open
// (an unresolvable signal -> allow, never a wrong block).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const gate = require('./lib/codex-delegate-gate');
const { loadConfig, codexLinked, toggledOff } = require('./codex-autodelegate');
const { estimateClaudeUsage } = require('./lib/usage-estimator');
const { extractRecentMessages, contentToText } = require('./lib/transcript-read');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ROUTER_PATH = path.resolve(__dirname, '../../_byan/mcp/byan-mcp-server/lib/dispatch-router.js');
const DEFAULT_PRESSURE_THRESHOLD = 75; // % of the Claude budget window

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

const allow = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

// Codex availability probe : `codex --version` exits 0. Absent/broken -> false ->
// the guard must NOT deny (staying on Claude is the legit fallback).
function probeCodexAvailable(runner = spawnSync) {
  try {
    const res = runner('codex', ['--version'], { timeout: 8000, encoding: 'utf8' });
    return res && res.status === 0;
  } catch (_e) {
    return false;
  }
}

// routerSaysCodex(text) : does dispatch-router route this task's text to Codex?
// The router keyword-matches on the text (execution/shell/deploy/script...). ESM
// module dynamically imported from this CJS hook. Fails open (false = don't block)
// if the router cannot be loaded.
async function defaultRouteProbe(text) {
  try {
    const mod = await import(pathToFileURL(ROUTER_PATH).href);
    return mod.routeRuntime(String(text || '')) === 'codex';
  } catch (_e) {
    return false;
  }
}

// underPressure : Claude budget usage >= threshold. Needs a budget in the config
// (no budget -> pct null -> not under pressure -> no delegation, documented).
function computeUnderPressure(config) {
  try {
    const budget = config && config.budget ? config.budget : null;
    if (!budget) return false;
    const threshold = typeof config.threshold === 'number' ? config.threshold : DEFAULT_PRESSURE_THRESHOLD;
    const usage = estimateClaudeUsage({ budget });
    return typeof usage.pct === 'number' && usage.pct >= threshold;
  } catch (_e) {
    return false;
  }
}

function lastUserText(payload) {
  const msgs = extractRecentMessages(payload, 12);
  if (!Array.isArray(msgs)) return '';
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === 'user') return contentToText(msgs[i].content);
  }
  return '';
}

// runGuard — async (the router import is async). opts inject the probes for tests.
async function runGuard(payload, {
  root = ROOT,
  codexProbe = probeCodexAvailable,
  routeProbe = defaultRouteProbe,
  pressureProbe = computeUnderPressure,
} = {}) {
  const toolName = payload.tool_name || payload.toolName || '';
  if (toolName !== 'Write' && toolName !== 'Edit') return allow();

  const config = loadConfig(root);
  const armed = config.enabled === true && codexLinked();
  if (!armed) return allow(); // fast path, no transcript/probe work when off

  const escaped = toggledOff(root);
  const input = payload.tool_input || payload.toolInput || {};
  const filePath = input.file_path || input.filePath || '';
  const isCode = gate.targetIsCode(filePath);
  const humanOptOut = gate.humanOptOutFromText(lastUserText(payload));
  const delegationSeen = gate.delegationSeenThisTurn(extractRecentMessages(payload, 12) || []);

  // Only compute the two expensive signals when a deny is otherwise possible.
  const maybeDeny = !escaped && !humanOptOut && isCode && !delegationSeen;
  const routerSaysCodex = maybeDeny ? await routeProbe(lastUserText(payload)) : false;
  const underPressure = (maybeDeny && routerSaysCodex) ? pressureProbe(config) : false;
  const codexAvailable = (maybeDeny && routerSaysCodex && underPressure) ? codexProbe() : true;

  const decision = gate.decideDelegateGate({
    armed, routerSaysCodex, targetIsCode: isCode, underPressure,
    delegationSeen, escaped, humanOptOut, codexAvailable,
  });
  return decision.decision === 'deny' ? deny(decision.reason) : allow();
}

if (require.main === module) {
  (async () => {
    let out;
    try {
      const payload = JSON.parse((await readStdin()) || '{}');
      out = await runGuard(payload);
    } catch (_e) {
      out = allow();
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })();
}

module.exports = { runGuard, probeCodexAvailable, defaultRouteProbe, computeUnderPressure, lastUserText };
