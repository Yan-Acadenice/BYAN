#!/usr/bin/env node
/**
 * Stop hook — BYAN punt-guard (F3).
 *
 * Goal : catch the laziness pattern where the agent ends its turn by telling the
 * user to run a command and paste the output back, when the agent could have run
 * it itself (a Bash tool-call) this turn. The pure detection lives in
 * lib/punt-detect.js; this hook wires it to the real Stop payload and the arm
 * flag.
 *
 * Ships DISARMED (puntGuard.armed=false in _byan/_config/delivery-default.json),
 * same posture as the autobench Stop guard. Arming a Stop blocker without first
 * measuring false positives breaks the flow. So by default the hook only
 * OBSERVES: it appends one line to _byan-output/punt-ledger.jsonl
 * (observed-disarmed / observed-disarmed-punt) and exits 0. Only when armed does
 * it block (exit 2) on a detected punt.
 *
 * Carve-out (in punt-detect): git push / npm publish are never flagged — the
 * server has no creds, so delegating those to the user is legitimate.
 *
 * Non-blocking on any IO/parse error : the hook never traps a turn it cannot read.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { decide } = require('./lib/punt-detect');
const { loadConfig } = require('./lib/delivery-contract');
// transcript-read is the canonical Stop-payload reader (text + raw content); it
// does NOT carry stdin helpers, so readStdin/parseJson come from strict-runtime
// like the other Stop/prompt hooks.
const { extractLastAssistantText, extractLastAssistantContent } = require('./lib/transcript-read');
const { readStdin, parseJson } = require('./lib/strict-runtime');

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function isArmed(config) {
  const pg = config && config.puntGuard;
  return !!(pg && pg.armed === true);
}

// Pull the Bash tool-calls out of the finished assistant turn's RAW content.
// transcript-read gives the block array; a Bash tool_use is
// { type:'tool_use', name:'Bash', input:{ command } }. Returns [{ name, command }].
function bashToolCalls(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (b && b.type === 'tool_use' && typeof b.name === 'string') {
      const command = b.input && typeof b.input.command === 'string' ? b.input.command : '';
      out.push({ name: b.name, command });
    }
  }
  return out;
}

function ledgerPath() {
  return path.join(projectRoot(), '_byan-output', 'punt-ledger.jsonl');
}

function appendLedger(entry) {
  try {
    const p = ledgerPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
    return true;
  } catch {
    return false;
  }
}

if (require.main === module) {
  (async () => {
    // Wrap everything : the hook must NEVER trap a turn it cannot read.
    try {
      const config = loadConfig(projectRoot());
      const payload = parseJson(await readStdin());
      const lastAssistantText = extractLastAssistantText(payload);
      const toolCallsThisTurn = bashToolCalls(extractLastAssistantContent(payload));

      const result = decide({ lastAssistantText, toolCallsThisTurn });
      const armed = isArmed(config);

      const event = armed
        ? result.punt
          ? 'fired-block'
          : 'no-punt'
        : result.punt
          ? 'observed-disarmed-punt'
          : 'observed-disarmed';

      appendLedger({
        event,
        punt: result.punt,
        cmd: result.cmd || undefined,
        reason: result.reason,
        armed,
        ts: process.env.BYAN_HOOK_TS || undefined,
        session: process.env.CLAUDE_SESSION_ID || undefined,
      });

      if (armed && result.punt) {
        const reason =
          `Punt-guard: you asked the user to run "${result.cmd}" and paste the output, ` +
          `but you did not run it via Bash this turn. Run it yourself, then report the result. ` +
          `(git push / npm publish are exempt — the server has no creds for those.)`;
        process.stdout.write(
          JSON.stringify({ decision: 'block', reason, systemMessage: reason })
        );
        process.exit(2);
      }

      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    } catch {
      // Last-resort net : on any unexpected failure, let the turn end.
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  })();
}

module.exports = { bashToolCalls, isArmed, ledgerPath, appendLedger };
