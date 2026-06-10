// Shared transcript reader for Claude Code Stop hooks.
//
// The real Stop-hook payload carries NO inline transcript: the runtime hands a
// `last_assistant_message` string and a `transcript_path` pointing at a JSONL
// file. A hook that reads `payload.transcript || payload.messages` (an inline
// array) extracts nothing in production and silently never fires — the bug this
// module exists to prevent, in one place instead of four divergent copies.
//
// Transcript JSONL shape (one object per line): a turn is
//   { type: 'user'|'assistant', message: { role, content: string | block[] } }
// where a block is { type: 'text', text } or { type: 'tool_use', name, input, ... }.
//
// Every function is best-effort: an unreadable/short file or a malformed line
// yields empty/null so a hook never traps a turn it cannot read.

'use strict';

const fs = require('fs');

// Flatten an assistant message content (string or block array) to plain text.
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join(' ');
  }
  return '';
}

// Parse a transcript JSONL file into the array of its message objects
// ({ type, message:{role, content} }), skipping blank/malformed lines.
function readTranscriptLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line || !line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // skip a malformed line, keep the rest
      }
    }
    return out;
  } catch {
    return null;
  }
}

function isAssistantLine(o) {
  return Boolean((o && o.type === 'assistant') || (o && o.message && o.message.role === 'assistant'));
}

// The RAW content (string or block array) of the last assistant turn in the
// file, or null. Used for artifact detection (tool_use blocks survive here).
function lastAssistantContentFromTranscriptFile(filePath) {
  const lines = readTranscriptLines(filePath);
  if (!lines) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = lines[i];
    if (isAssistantLine(o) && o.message && o.message.content != null) return o.message.content;
  }
  return null;
}

// The user/assistant messages from the file as { role, content } objects, in
// order, or null. Lets a hook reconstruct the last N turns of a conversation.
function messagesFromTranscriptFile(filePath) {
  const lines = readTranscriptLines(filePath);
  if (!lines) return null;
  const out = [];
  for (const o of lines) {
    const m = o && o.message;
    if (m && (m.role === 'user' || m.role === 'assistant')) {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out.length ? out : null;
}

// The RAW content of the finished assistant turn from ANY payload shape: an
// inline array (test fixtures / legacy) first, then the transcript_path file.
// last_assistant_message is text-only, so it cannot feed artifact detection and
// is handled in extractLastAssistantText, not here.
function extractLastAssistantContent(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const inline = payload.transcript || payload.messages;
  if (Array.isArray(inline)) {
    for (let i = inline.length - 1; i >= 0; i--) {
      const m = inline[i];
      if (m && m.role === 'assistant') return m.content;
    }
  }

  const tp = payload.transcript_path || payload.transcriptPath;
  if (typeof tp === 'string') {
    const content = lastAssistantContentFromTranscriptFile(tp);
    if (content != null) return content;
  }

  return null;
}

// The finished assistant turn as plain text (the primary signal for most hooks).
// Prefer the runtime-provided last_assistant_message; else derive from content.
function extractLastAssistantText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;
  if (typeof payload.lastAssistantMessage === 'string') return payload.lastAssistantMessage;
  return contentToText(extractLastAssistantContent(payload));
}

// The last N user/assistant messages as { role, content }, from any payload
// shape (inline array or transcript_path file), or null when none are readable.
function extractRecentMessages(payload, limit) {
  if (!payload || typeof payload !== 'object') return null;
  let msgs = payload.transcript || payload.messages;
  if (!Array.isArray(msgs)) {
    const tp = payload.transcript_path || payload.transcriptPath;
    if (typeof tp === 'string') msgs = messagesFromTranscriptFile(tp);
  }
  if (!Array.isArray(msgs)) return null;
  const filtered = msgs.filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
  if (!filtered.length) return null;
  return typeof limit === 'number' ? filtered.slice(-limit) : filtered;
}

module.exports = {
  contentToText,
  readTranscriptLines,
  lastAssistantContentFromTranscriptFile,
  messagesFromTranscriptFile,
  extractLastAssistantContent,
  extractLastAssistantText,
  extractRecentMessages,
};
