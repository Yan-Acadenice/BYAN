#!/usr/bin/env node
/**
 * PostToolUse hook — blocks Claude from silently retrying when tools
 * flake. Reads the PostToolUse payload on stdin, detects failure
 * signals (is_error, "tool result missing", "internal error"), appends
 * to a rolling log, and EXITS 2 (blocking) when a threshold is reached:
 *   - 3 failures of the same tool in 2 min
 *   - 2 "internal error" matches in 5 min
 *   - 2 "tool result missing" matches in 5 min
 *
 * Exit 2 forces Claude to surface the issue to the user instead of
 * pressing on.
 */

const fs = require('fs');
const path = require('path');
const {
  detectFailure,
  appendFailure,
  readRecent,
  evaluate,
} = require(path.join(__dirname, 'lib', 'failure-detector.js'));

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TOOL_LOG_PATH = path.join(projectDir, '_byan-output', 'tool-log.jsonl');

function appendToolLog(entry) {
  try {
    fs.mkdirSync(path.dirname(TOOL_LOG_PATH), { recursive: true });
    fs.appendFileSync(TOOL_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // visibility log must never block the hook
  }
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

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const toolName = payload.tool_name || payload.toolName || 'unknown';
  const hit = detectFailure(payload);

  appendToolLog({
    timestamp: new Date().toISOString(),
    phase: 'post',
    tool: toolName,
    ok: !hit,
    failure_kind: hit ? hit.kind : null,
  });

  if (!hit) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: '' },
      })
    );
    process.exit(0);
  }

  const event = { timestamp: new Date(), tool_name: toolName, kind: hit.kind, detail: hit.detail };
  appendFailure(event);

  const entries = readRecent();
  const verdict = evaluate({ entries, toolName });

  if (verdict.blocked) {
    const msg = [
      `BLOCKED by tool-failure-guard: ${verdict.reason} (${verdict.count} events).`,
      'Surface this to the user before any further tool call. Do not retry silently.',
      'Recent events:',
      ...verdict.recent.map(
        (e) => `  - ${e.timestamp} ${e.tool_name}: ${(e.detail || '').slice(0, 120)}`
      ),
    ].join('\n');

    process.stderr.write(msg + '\n');
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: verdict.reason,
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg },
      })
    );
    process.exit(2);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Tool failure recorded (${hit.kind}). Continuing, but be explicit with the user if a retry fails.`,
      },
    })
  );
  process.exit(0);
})();
