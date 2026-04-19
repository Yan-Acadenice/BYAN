#!/usr/bin/env node
/**
 * PreToolUse hook — tool-transparency.
 *
 * Copilot-CLI-style visibility : before each tool runs, emit a short
 * systemMessage that Claude Code shows inline in the chat ("Tool X:
 * <brief>"), AND append a detailed JSON line to
 * _byan-output/tool-log.jsonl so the user can `tail -f` it in another
 * pane to see the full flow.
 *
 * Never blocks (always permissionDecision: allow). Never crashes on bad
 * input — a logging hook must not interfere with work.
 */

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const logPath = path.join(projectDir, '_byan-output', 'tool-log.jsonl');
const MAX_SUMMARY = 120;

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function summarizeInput(toolName, input) {
  if (!input || typeof input !== 'object') return '';
  const summaries = {
    Bash: (i) => (i.description ? `${i.description}` : (i.command || '').slice(0, MAX_SUMMARY)),
    Read: (i) => i.file_path || '',
    Edit: (i) => i.file_path || '',
    Write: (i) => i.file_path || '',
    Glob: (i) => i.pattern || '',
    Grep: (i) => `"${(i.pattern || '').slice(0, 60)}"${i.path ? ' in ' + i.path : ''}`,
    Agent: (i) => i.description || '',
    TaskCreate: (i) => i.subject || '',
    TaskUpdate: (i) => `#${i.taskId || ''} → ${i.status || ''}`,
  };
  const fn = summaries[toolName];
  const raw = fn ? fn(input) : JSON.stringify(input).slice(0, MAX_SUMMARY);
  return String(raw).slice(0, MAX_SUMMARY);
}

function appendLog(entry) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // logging must never block the hook
  }
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
  const input = payload.tool_input || payload.toolInput || {};
  const summary = summarizeInput(toolName, input);

  appendLog({
    timestamp: new Date().toISOString(),
    phase: 'pre',
    tool: toolName,
    summary,
  });

  const systemMessage = summary ? `${toolName}: ${summary}` : `${toolName}`;

  process.stdout.write(
    JSON.stringify({
      systemMessage,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    })
  );
  process.exit(0);
})();
