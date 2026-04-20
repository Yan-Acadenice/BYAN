#!/usr/bin/env node
/**
 * PreCompact hook — snapshot critical BYAN state before Claude Code
 * compacts the context window.
 *
 * Writes _byan-output/compact-snapshots/<timestamp>.md with :
 *   - active FD state (phase, backlog, dispatch table)
 *   - last 50 tool-log.jsonl entries (activity trail)
 *   - soul-memory.md head (who BYAN is, red lines)
 *   - recent commits (git log -10)
 *
 * Emits a short systemMessage telling Claude : compact happened, key
 * state preserved at <path>, read it if you lose track mid-session.
 *
 * Never blocks compaction. Exit 0 always, even on partial failure.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const outDir = path.join(projectDir, '_byan-output', 'compact-snapshots');

function readTextSafe(filePath, maxBytes = 4000) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.length > maxBytes ? raw.slice(0, maxBytes) + '\n\n... [truncated]' : raw;
  } catch {
    return null;
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function tailJsonl(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function recentCommits() {
  try {
    return execSync('git log -10 --oneline', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '(git log unavailable)';
  }
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function renderSnapshot() {
  const lines = [];
  lines.push(`# BYAN pre-compact snapshot — ${new Date().toISOString()}`);
  lines.push('');

  const fd = readJsonSafe(path.join(projectDir, '_byan-output', 'fd-state.json'));
  if (fd) {
    lines.push('## Active FD state');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(fd, null, 2).slice(0, 3000));
    lines.push('```');
    lines.push('');
  } else {
    lines.push('## Active FD state');
    lines.push('');
    lines.push('(none)');
    lines.push('');
  }

  lines.push('## Recent commits');
  lines.push('');
  lines.push('```');
  lines.push(recentCommits());
  lines.push('```');
  lines.push('');

  const tool = tailJsonl(path.join(projectDir, '_byan-output', 'tool-log.jsonl'), 50);
  lines.push(`## Last ${tool.length} tool calls`);
  lines.push('');
  for (const e of tool) {
    const ts = e.timestamp || '?';
    const phase = e.phase || '?';
    const summary = e.summary || (e.ok === false ? `FAIL ${e.failure_kind}` : 'ok');
    lines.push(`- ${ts} ${phase} ${e.tool || '?'} — ${String(summary).slice(0, 120)}`);
  }
  lines.push('');

  const soul = readTextSafe(path.join(projectDir, '_byan', 'soul.md'), 2000);
  if (soul) {
    lines.push('## Soul (head)');
    lines.push('');
    lines.push(soul);
    lines.push('');
  }

  return lines.join('\n');
}

(function main() {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${stamp()}.md`);
    fs.writeFileSync(outPath, renderSnapshot());

    const relative = path.relative(projectDir, outPath);
    process.stdout.write(
      JSON.stringify({
        systemMessage: `BYAN pre-compact snapshot written to ${relative}. Critical state (FD phase, commits, tool activity, soul) preserved outside the context window. Read it after compaction if you lose track.`,
      })
    );
  } catch (err) {
    // Must never block compaction
    process.stdout.write(
      JSON.stringify({
        systemMessage: `pre-compact-save hook error (non-blocking) : ${err.message}`,
      })
    );
  }
  process.exit(0);
})();
