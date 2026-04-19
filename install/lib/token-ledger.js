/**
 * BYAN token ledger.
 *
 * Reads _byan-output/tool-log.jsonl produced by the transparency hooks
 * and aggregates per-session token estimates :
 *   - total tool calls
 *   - total est input + output tokens
 *   - per-tool breakdown (count + tokens)
 *   - failure summary
 *
 * Estimates are based on char/4 heuristic. Real token counts would need
 * Anthropic's count_tokens API which requires authentication — skipped
 * for now, good-enough for budget reasoning.
 */

const fs = require('fs');
const path = require('path');

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function summarize(entries, { since } = {}) {
  const cutoff = since ? Date.parse(since) : 0;
  const filtered = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return Number.isFinite(t) && t >= cutoff;
  });

  const stats = {
    total_entries: filtered.length,
    pre_count: 0,
    post_count: 0,
    est_input_tokens: 0,
    est_output_tokens: 0,
    by_tool: {},
    failures: [],
  };

  for (const e of filtered) {
    if (e.phase === 'pre') {
      stats.pre_count += 1;
      stats.est_input_tokens += Number(e.est_input_tokens || 0);
    } else if (e.phase === 'post') {
      stats.post_count += 1;
      stats.est_output_tokens += Number(e.est_output_tokens || 0);
      if (e.ok === false) {
        stats.failures.push({
          timestamp: e.timestamp,
          tool: e.tool,
          kind: e.failure_kind,
        });
      }
    }

    const tool = e.tool || 'unknown';
    if (!stats.by_tool[tool]) {
      stats.by_tool[tool] = { calls: 0, input: 0, output: 0, failures: 0 };
    }
    if (e.phase === 'pre') stats.by_tool[tool].calls += 1;
    stats.by_tool[tool].input += Number(e.est_input_tokens || 0);
    stats.by_tool[tool].output += Number(e.est_output_tokens || 0);
    if (e.ok === false) stats.by_tool[tool].failures += 1;
  }

  stats.est_total_tokens = stats.est_input_tokens + stats.est_output_tokens;
  return stats;
}

function renderReport(stats) {
  const lines = [];
  lines.push('BYAN token ledger');
  lines.push('');
  lines.push(`  Tool calls         : ${stats.pre_count}`);
  lines.push(`  Completed          : ${stats.post_count}`);
  lines.push(`  Est. input tokens  : ${stats.est_input_tokens.toLocaleString()}`);
  lines.push(`  Est. output tokens : ${stats.est_output_tokens.toLocaleString()}`);
  lines.push(`  Est. total tokens  : ${stats.est_total_tokens.toLocaleString()}`);
  lines.push(`  Failures           : ${stats.failures.length}`);

  lines.push('');
  lines.push('  Per tool :');
  const rows = Object.entries(stats.by_tool).sort(
    (a, b) => b[1].input + b[1].output - (a[1].input + a[1].output)
  );
  for (const [tool, s] of rows) {
    const total = s.input + s.output;
    const failNote = s.failures > 0 ? ` [${s.failures} fail]` : '';
    lines.push(
      `    ${tool.padEnd(16)} calls=${String(s.calls).padStart(3)}  in=${s.input
        .toString()
        .padStart(6)}  out=${s.output.toString().padStart(6)}  total=${total
        .toString()
        .padStart(7)}${failNote}`
    );
  }

  if (stats.failures.length > 0) {
    lines.push('');
    lines.push('  Recent failures :');
    for (const f of stats.failures.slice(-5)) {
      lines.push(`    ${f.timestamp} ${f.tool} (${f.kind})`);
    }
  }

  return lines.join('\n');
}

function defaultLogPath(projectRoot) {
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(root, '_byan-output', 'tool-log.jsonl');
}

module.exports = {
  readLog,
  summarize,
  renderReport,
  defaultLogPath,
};
