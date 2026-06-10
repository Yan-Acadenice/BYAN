#!/usr/bin/env node
/**
 * Stop hook — BYAN Strict Mode end-of-turn guard.
 *
 * When a strict session is engaged (active + scope locked + not completed),
 * block the turn from ending IF the assistant's last message claims the work
 * is done. Completion must be earned through byan_strict_complete (3 passes,
 * last verdict "ok"), which flips state.completed and disengages this guard.
 *
 * A mid-task yield (asking the user a question, reporting progress without a
 * completion claim) is allowed — the guard only fires on a premature "done".
 *
 * Non-blocking on any IO/parse error : the hook never traps a turn when it
 * cannot read the state.
 */

const fs = require('fs');
const { loadConfig, loadState, isEngaged, passCount, lastVerdict, readStdin, parseJson } =
  require('./lib/strict-runtime');

const DEFAULT_MARKERS = ['done', 'finished', 'complete', 'delivered', 'ready'];

function claimsCompletion(text, markers) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (markers || DEFAULT_MARKERS).some((m) => {
    const marker = String(m).toLowerCase();
    if (/^[a-z]+$/.test(marker)) {
      return new RegExp(`\\b${marker}\\b`).test(lower);
    }
    return lower.includes(marker);
  });
}

// Flatten an assistant message content (string or block array) to plain text.
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join(' ');
  }
  return '';
}

// Read a transcript JSONL file (the real Claude Code shape: one object per line,
// an assistant turn is {type:'assistant', message:{role, content:[...]}}) from
// the end and return the last assistant message's content, or null. Best-effort.
function lastAssistantContentFromTranscriptFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = lines[i];
      if (!raw || !raw.trim()) continue;
      let o;
      try {
        o = JSON.parse(raw);
      } catch {
        continue;
      }
      const m = o && o.message;
      const isAssistant = (o && o.type === 'assistant') || (m && m.role === 'assistant');
      if (isAssistant && m && m.content != null) return m.content;
    }
  } catch {
    // ignore — unreadable transcript yields null
  }
  return null;
}

// Resolve the finished assistant turn as plain text. The real Stop-hook payload
// carries NO inline transcript: it hands a `last_assistant_message` string and a
// `transcript_path` (JSONL file). Reading `payload.transcript || payload.messages`
// alone (the prior shape) extracted nothing in production, so the completion-claim
// guard never fired live — the pre-commit gate was the only net. Resolution order:
// last_assistant_message, then an inline array (fixtures), then the transcript_path
// JSONL. Empty string when nothing is readable, so the hook never traps a turn.
function extractLastAssistantText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;
  if (typeof payload.lastAssistantMessage === 'string') return payload.lastAssistantMessage;

  const inline = payload.transcript || payload.messages;
  if (Array.isArray(inline)) {
    for (let i = inline.length - 1; i >= 0; i--) {
      const m = inline[i];
      if (m && m.role === 'assistant') return contentToText(m.content);
    }
  }

  const tp = payload.transcript_path || payload.transcriptPath;
  if (typeof tp === 'string') return contentToText(lastAssistantContentFromTranscriptFile(tp));

  return '';
}

// Pure decision : returns { block, reason }.
function decideStop({ state, config, lastAssistantText }) {
  if (!isEngaged(state)) return { block: false };

  const markers = config && config.completion_claim_markers;
  if (!claimsCompletion(lastAssistantText, markers)) return { block: false };

  const minPasses = (config && config.min_passes) || 3;
  const done = passCount(state);
  const verdict = lastVerdict(state);

  // Defensive : if somehow 3 ok passes are recorded but complete() was not
  // called, still block and tell the agent to call complete.
  const base =
    (config && config.banners && config.banners.stop_block) ||
    'Strict mode: the turn cannot end. The locked scope has not been completed.';

  const reason =
    `${base}\n` +
    `Progress: ${done}/${minPasses} self-verify passes, last verdict=${verdict || 'none'}.\n` +
    `You claimed completion but byan_strict_complete has not produced an audit token. ` +
    `Run byan_strict_self_verify until the scope is satisfied (last pass verdict "ok"), ` +
    `then call byan_strict_complete. If the scope changed, re-lock it.`;

  return { block: true, reason };
}

if (require.main === module) {
  (async () => {
    const state = loadState();
    if (!isEngaged(state)) {
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
    const config = loadConfig();
    const payload = parseJson(await readStdin());
    const lastAssistantText = extractLastAssistantText(payload);

    const decision = decideStop({ state, config, lastAssistantText });
    if (!decision.block) {
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: decision.reason, systemMessage: decision.reason })
    );
    process.exit(2);
  })();
}

module.exports = {
  decideStop,
  claimsCompletion,
  extractLastAssistantText,
  contentToText,
  lastAssistantContentFromTranscriptFile,
};
