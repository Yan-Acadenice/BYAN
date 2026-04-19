const fs = require('fs');
const os = require('os');
const path = require('path');
const detector = require('../.claude/hooks/lib/failure-detector');

let logRoot;
let logPath;

beforeEach(() => {
  logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-fail-'));
  logPath = path.join(logRoot, '.tool-failures.jsonl');
});

afterEach(() => {
  fs.rmSync(logRoot, { recursive: true, force: true });
});

describe('detectFailure', () => {
  test('detects is_error=true on tool_response', () => {
    const hit = detector.detectFailure({
      tool_response: { is_error: true, content: 'boom' },
    });
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('is_error');
  });

  test('detects "tool result missing" string', () => {
    const hit = detector.detectFailure({
      tool_response: { content: 'tool result missing due to internal error' },
    });
    expect(hit.kind).toBe('pattern');
  });

  test('detects "internal error" inside tool_response', () => {
    const hit = detector.detectFailure({
      tool_response: { content: 'something internal error happened' },
    });
    expect(hit).toBeTruthy();
  });

  test('returns null on success payload', () => {
    const hit = detector.detectFailure({
      tool_response: { content: 'OK', is_error: false },
    });
    expect(hit).toBeNull();
  });
});

describe('evaluate — thresholds', () => {
  const now = new Date('2026-04-19T12:00:00Z');

  test('3 same-tool failures in 2 min → blocked', () => {
    const entries = [
      { timestamp: '2026-04-19T11:59:30.000Z', tool_name: 'Bash', detail: 'x' },
      { timestamp: '2026-04-19T11:58:45.000Z', tool_name: 'Bash', detail: 'y' },
      { timestamp: '2026-04-19T11:58:15.000Z', tool_name: 'Bash', detail: 'z' },
    ];
    const v = detector.evaluate({ now, entries, toolName: 'Bash' });
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/3 Bash/);
  });

  test('2 "internal error" in 5 min → blocked', () => {
    const entries = [
      { timestamp: '2026-04-19T11:57:00.000Z', tool_name: 'Bash', detail: 'some internal error here' },
      { timestamp: '2026-04-19T11:55:00.000Z', tool_name: 'Write', detail: 'internal error again' },
    ];
    const v = detector.evaluate({ now, entries, toolName: 'Write' });
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/internal errors/);
  });

  test('2 "tool result missing" in 5 min → blocked', () => {
    const entries = [
      { timestamp: '2026-04-19T11:58:00.000Z', tool_name: 'Bash', detail: 'tool result missing here' },
      { timestamp: '2026-04-19T11:56:00.000Z', tool_name: 'Bash', detail: 'tool result missing again' },
    ];
    const v = detector.evaluate({ now, entries, toolName: 'Bash' });
    expect(v.blocked).toBe(true);
  });

  test('isolated single failure → not blocked', () => {
    const entries = [{ timestamp: '2026-04-19T11:58:00.000Z', tool_name: 'Bash', detail: 'one off' }];
    const v = detector.evaluate({ now, entries, toolName: 'Bash' });
    expect(v.blocked).toBe(false);
  });

  test('stale failures (outside window) → not counted', () => {
    const entries = [
      { timestamp: '2026-04-19T11:50:00.000Z', tool_name: 'Bash', detail: 'a' },
      { timestamp: '2026-04-19T11:49:00.000Z', tool_name: 'Bash', detail: 'b' },
      { timestamp: '2026-04-19T11:48:00.000Z', tool_name: 'Bash', detail: 'c' },
    ];
    const v = detector.evaluate({ now, entries, toolName: 'Bash' });
    expect(v.blocked).toBe(false);
  });

  test('different tools do not accumulate toward same-tool threshold', () => {
    const entries = [
      { timestamp: '2026-04-19T11:59:30.000Z', tool_name: 'Bash', detail: 'x' },
      { timestamp: '2026-04-19T11:59:00.000Z', tool_name: 'Write', detail: 'y' },
      { timestamp: '2026-04-19T11:58:30.000Z', tool_name: 'Edit', detail: 'z' },
    ];
    const v = detector.evaluate({ now, entries, toolName: 'Bash' });
    expect(v.blocked).toBe(false);
  });
});

describe('appendFailure + readRecent', () => {
  test('round-trips entries', () => {
    detector.appendFailure(
      { timestamp: new Date('2026-04-19T12:00:00Z'), tool_name: 'Bash', kind: 'pattern', detail: 'x' },
      { logPath }
    );
    detector.appendFailure(
      { timestamp: new Date('2026-04-19T12:01:00Z'), tool_name: 'Bash', kind: 'pattern', detail: 'y' },
      { logPath }
    );
    const recent = detector.readRecent({ logPath });
    expect(recent).toHaveLength(2);
    expect(recent[0].tool_name).toBe('Bash');
    expect(recent[1].detail).toBe('y');
  });

  test('creates log directory if missing', () => {
    const deep = path.join(logRoot, 'a', 'b', 'c.jsonl');
    detector.appendFailure(
      { timestamp: new Date(), tool_name: 'X', kind: 'pattern', detail: 'd' },
      { logPath: deep }
    );
    expect(fs.existsSync(deep)).toBe(true);
  });
});
