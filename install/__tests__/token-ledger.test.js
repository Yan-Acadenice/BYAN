const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { readLog, summarize, renderReport } = require('../lib/token-ledger');

describe('token-ledger', () => {
  let tmp;
  let logPath;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-ledger-'));
    logPath = path.join(tmp, 'tool-log.jsonl');
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  function writeLog(entries) {
    fs.writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }

  test('empty log → empty stats', () => {
    const stats = summarize(readLog(logPath));
    expect(stats.total_entries).toBe(0);
    expect(stats.est_total_tokens).toBe(0);
    expect(stats.failures).toEqual([]);
  });

  test('sums pre and post tokens separately', () => {
    writeLog([
      { timestamp: '2026-04-19T10:00:00Z', phase: 'pre', tool: 'Bash', est_input_tokens: 100 },
      { timestamp: '2026-04-19T10:00:01Z', phase: 'post', tool: 'Bash', ok: true, est_output_tokens: 500 },
    ]);
    const stats = summarize(readLog(logPath));
    expect(stats.est_input_tokens).toBe(100);
    expect(stats.est_output_tokens).toBe(500);
    expect(stats.est_total_tokens).toBe(600);
  });

  test('per-tool breakdown with sorted order by total', () => {
    writeLog([
      { timestamp: '2026-04-19T10:00:00Z', phase: 'pre', tool: 'Read', est_input_tokens: 10 },
      { timestamp: '2026-04-19T10:00:01Z', phase: 'post', tool: 'Read', ok: true, est_output_tokens: 20 },
      { timestamp: '2026-04-19T10:01:00Z', phase: 'pre', tool: 'Bash', est_input_tokens: 100 },
      { timestamp: '2026-04-19T10:01:01Z', phase: 'post', tool: 'Bash', ok: true, est_output_tokens: 2000 },
    ]);
    const stats = summarize(readLog(logPath));
    expect(stats.by_tool.Read).toEqual({ calls: 1, input: 10, output: 20, failures: 0 });
    expect(stats.by_tool.Bash).toEqual({ calls: 1, input: 100, output: 2000, failures: 0 });
  });

  test('tracks failures by tool', () => {
    writeLog([
      { timestamp: '2026-04-19T10:00:00Z', phase: 'pre', tool: 'Bash' },
      { timestamp: '2026-04-19T10:00:01Z', phase: 'post', tool: 'Bash', ok: false, failure_kind: 'pattern' },
    ]);
    const stats = summarize(readLog(logPath));
    expect(stats.failures).toHaveLength(1);
    expect(stats.failures[0].kind).toBe('pattern');
    expect(stats.by_tool.Bash.failures).toBe(1);
  });

  test('--since filters entries before cutoff', () => {
    writeLog([
      { timestamp: '2026-04-19T09:00:00Z', phase: 'pre', tool: 'Bash', est_input_tokens: 100 },
      { timestamp: '2026-04-19T11:00:00Z', phase: 'pre', tool: 'Bash', est_input_tokens: 200 },
    ]);
    const stats = summarize(readLog(logPath), { since: '2026-04-19T10:00:00Z' });
    expect(stats.est_input_tokens).toBe(200);
    expect(stats.pre_count).toBe(1);
  });

  test('renderReport contains key headers and per-tool line', () => {
    writeLog([
      { timestamp: '2026-04-19T10:00:00Z', phase: 'pre', tool: 'Bash', est_input_tokens: 50 },
      { timestamp: '2026-04-19T10:00:01Z', phase: 'post', tool: 'Bash', ok: true, est_output_tokens: 150 },
    ]);
    const stats = summarize(readLog(logPath));
    const report = renderReport(stats);
    expect(report).toContain('BYAN token ledger');
    expect(report).toContain('Tool calls');
    expect(report).toContain('Per tool');
    expect(report).toContain('Bash');
  });
});
