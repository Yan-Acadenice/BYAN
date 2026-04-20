#!/usr/bin/env node
// BYAN FD response-check — Stop hook.
// Blocks model output if FD is active and the last assistant message
// is missing its mandatory `[FD:<phase>]` header.

import fs from 'node:fs';
import path from 'node:path';

const TERMINAL = new Set(['COMPLETED', 'ABORTED']);

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadState(root) {
  try {
    const p = path.join(root, '_byan-output', 'fd-state.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function extractText(block) {
  if (block == null) return '';
  if (typeof block === 'string') return block;
  if (typeof block.text === 'string') return block.text;
  if (Array.isArray(block.content)) return block.content.map(extractText).join('\n');
  if (typeof block.content === 'string') return block.content;
  return '';
}

function lastAssistantText(payload) {
  const candidates = [];
  if (Array.isArray(payload.messages)) candidates.push(...payload.messages);
  if (Array.isArray(payload.transcript)) candidates.push(...payload.transcript);
  if (payload.last_assistant_message) candidates.push(payload.last_assistant_message);
  // Walk from the end, pick the latest assistant-role entry.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const m = candidates[i];
    if (!m) continue;
    const role = m.role || (m.message && m.message.role);
    if (role !== 'assistant') continue;
    const content = m.content != null ? m.content : m.message && m.message.content;
    if (Array.isArray(content)) return content.map(extractText).join('\n');
    if (typeof content === 'string') return content;
    return extractText(m);
  }
  return '';
}

function allow() {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

function block(phase, reason) {
  const body = {
    decision: 'block',
    reason,
    systemMessage: `BYAN FD guard : assistant response missing mandatory \`[FD:${phase}]\` header. Rewrite the previous message with the header on its first line.`,
  };
  process.stdout.write(JSON.stringify(body));
  process.exit(2);
}

function main() {
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const state = loadState(root);
    if (!state || !state.phase || TERMINAL.has(state.phase)) return allow();
    const phase = state.phase;

    const raw = readStdin();
    let payload = {};
    if (raw && raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        return allow();
      }
    }
    const text = lastAssistantText(payload);
    const header = `[FD:${phase}]`;
    if (text && text.includes(header)) return allow();
    return block(phase, `Last assistant message does not contain ${header}.`);
  } catch {
    return allow();
  }
}

main();
