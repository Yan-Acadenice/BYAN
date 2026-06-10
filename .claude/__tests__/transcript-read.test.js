/**
 * Tests for the shared Stop-hook transcript reader.
 *
 * This is the single canonical reader four Stop hooks delegate to. The bug it
 * exists to prevent: the real Stop payload carries no inline transcript (only a
 * last_assistant_message string + a transcript_path JSONL file), so reading
 * payload.transcript||messages extracted nothing in production and the hooks
 * silently never fired. These tests pin the production access path.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const tr = require(path.join(ROOT, '.claude', 'hooks', 'lib', 'transcript-read.js'));

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-read-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTranscript(lines) {
  const p = path.join(tmpDir, 'transcript.jsonl');
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return p;
}

const ASSISTANT_TEXT = {
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text: 'the final prose' }] },
};
const ASSISTANT_ARTIFACT = {
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: 'choose one' },
      { type: 'tool_use', id: 'x', name: 'AskUserQuestion', input: {} },
    ],
  },
};
const USER = { type: 'user', message: { role: 'user', content: 'go' } };

describe('contentToText', () => {
  test('string passes through; array joins text blocks; other -> empty', () => {
    expect(tr.contentToText('hi')).toBe('hi');
    expect(tr.contentToText([{ type: 'text', text: 'a' }, { type: 'tool_use', name: 'X' }, { type: 'text', text: 'b' }])).toBe('a  b');
    expect(tr.contentToText(null)).toBe('');
    expect(tr.contentToText(42)).toBe('');
  });
});

describe('extractLastAssistantText', () => {
  test('prefers last_assistant_message', () => {
    expect(tr.extractLastAssistantText({ last_assistant_message: 'done here', transcript_path: '/nope' })).toBe('done here');
    expect(tr.extractLastAssistantText({ lastAssistantMessage: 'camel done' })).toBe('camel done');
  });

  test('reads transcript_path JSONL (real {type,message:{role,content}} shape)', () => {
    const tp = writeTranscript([USER, ASSISTANT_TEXT]);
    expect(tr.extractLastAssistantText({ transcript_path: tp })).toContain('the final prose');
  });

  test('inline transcript/messages fallback (string and array content)', () => {
    expect(tr.extractLastAssistantText({ messages: [{ role: 'assistant', content: 'plain' }] })).toBe('plain');
    expect(tr.extractLastAssistantText({ transcript: [{ role: 'assistant', content: [{ type: 'text', text: 'arr' }] }] })).toBe('arr');
  });

  test('empty / unreadable -> empty string, never throws', () => {
    expect(tr.extractLastAssistantText({})).toBe('');
    expect(tr.extractLastAssistantText(null)).toBe('');
    expect(tr.extractLastAssistantText({ transcript_path: '/no/such/file.jsonl' })).toBe('');
  });
});

describe('extractLastAssistantContent', () => {
  test('transcript_path content keeps tool_use blocks (artifact detection survives)', () => {
    const tp = writeTranscript([USER, ASSISTANT_ARTIFACT]);
    const content = tr.extractLastAssistantContent({ transcript_path: tp });
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((b) => b.type === 'tool_use' && /askuserquestion/i.test(b.name))).toBe(true);
  });

  test('inline array fallback; empty -> null', () => {
    const c = tr.extractLastAssistantContent({ transcript: [{ role: 'assistant', content: [{ type: 'tool_use', name: 'AskUserQuestion' }] }] });
    expect(Array.isArray(c)).toBe(true);
    expect(tr.extractLastAssistantContent({})).toBeNull();
    expect(tr.extractLastAssistantContent({ transcript_path: '/no/file' })).toBeNull();
  });
});

describe('extractRecentMessages', () => {
  test('transcript_path -> last N user/assistant {role,content}', () => {
    const tp = writeTranscript([USER, ASSISTANT_TEXT, USER, ASSISTANT_ARTIFACT]);
    const msgs = tr.extractRecentMessages({ transcript_path: tp }, 2);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });

  test('inline fallback + filters non user/assistant; empty -> null', () => {
    const msgs = tr.extractRecentMessages({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] }, 4);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(tr.extractRecentMessages({}, 4)).toBeNull();
    expect(tr.extractRecentMessages({ transcript_path: '/no/file' }, 4)).toBeNull();
  });
});

describe('readTranscriptLines', () => {
  test('skips blank and malformed lines, keeps the rest', () => {
    const p = path.join(tmpDir, 't.jsonl');
    fs.writeFileSync(p, '\n{"type":"user","message":{"role":"user","content":"a"}}\nnot json {\n' + JSON.stringify(ASSISTANT_TEXT) + '\n');
    const lines = tr.readTranscriptLines(p);
    expect(lines).toHaveLength(2);
    expect(lines[1].type).toBe('assistant');
  });

  test('missing file -> null', () => {
    expect(tr.readTranscriptLines('/no/such/file')).toBeNull();
  });
});
