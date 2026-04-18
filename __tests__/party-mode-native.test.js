const path = require('path');
const fs = require('fs');
const os = require('os');
const coord = require('../_byan/core/workflows/party-mode-native/coordination');

let sessionsRoot;

beforeEach(() => {
  sessionsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'party-native-'));
});

afterEach(() => {
  fs.rmSync(sessionsRoot, { recursive: true, force: true });
});

describe('sessionId', () => {
  test('builds timestamp-slug format', () => {
    const id = coord.sessionId('F2 feat', new Date('2026-04-18T09:05:07Z'));
    expect(id).toMatch(/^2026\d{4}-\d{6}-f2-feat$/);
  });

  test('defaults slug when empty', () => {
    const id = coord.sessionId(undefined, new Date('2026-04-18T09:05:07Z'));
    expect(id).toMatch(/session$/);
  });
});

describe('initSession', () => {
  test('creates directory and briefing with 3 roles', () => {
    const roles = [
      { role: 'researcher', goal: 'find X' },
      { role: 'writer', goal: 'draft Y' },
      { role: 'reviewer', goal: 'check Z' },
    ];
    const session = coord.initSession(roles, { sessionsRoot, slug: 'test' });
    expect(fs.existsSync(session.dir)).toBe(true);
    expect(fs.existsSync(path.join(session.dir, 'briefing.json'))).toBe(true);
    expect(session.briefing.roles).toHaveLength(3);
    expect(session.briefing.roles[0].output_file).toContain('agent-researcher.json');
  });

  test('rejects empty roles array', () => {
    expect(() => coord.initSession([], { sessionsRoot })).toThrow();
  });
});

describe('writeAgentReport / readAgentReport', () => {
  test('round-trips a report', () => {
    const session = coord.initSession([{ role: 'alpha' }], { sessionsRoot });
    coord.writeAgentReport(session.dir, 'alpha', {
      status: 'ok',
      summary: 'done',
      files_changed: ['a.js'],
    });
    const loaded = coord.readAgentReport(session.dir, 'alpha');
    expect(loaded.status).toBe('ok');
    expect(loaded.files_changed).toEqual(['a.js']);
  });

  test('returns null when no report exists', () => {
    const session = coord.initSession([{ role: 'alpha' }], { sessionsRoot });
    expect(coord.readAgentReport(session.dir, 'alpha')).toBeNull();
  });
});

describe('validateReport', () => {
  test('accepts a minimal valid report', () => {
    const { ok, errors } = coord.validateReport({ status: 'ok', summary: 'ok' });
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  test('rejects invalid status', () => {
    const { ok, errors } = coord.validateReport({ status: 'maybe', summary: 'x' });
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/status/);
  });

  test('rejects non-array files_changed', () => {
    const { ok, errors } = coord.validateReport({
      status: 'ok',
      summary: 'x',
      files_changed: 'a.js',
    });
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/files_changed/);
  });
});

describe('aggregate + writeSummary (e2e with 3 fictif roles)', () => {
  test('produces allOk=true when 3 agents report ok', () => {
    const roles = [
      { role: 'r1', subagent_type: 'Explore', goal: 'g1' },
      { role: 'r2', subagent_type: 'Plan', goal: 'g2' },
      { role: 'r3', subagent_type: 'general-purpose', goal: 'g3' },
    ];
    const session = coord.initSession(roles, { sessionsRoot });
    for (const r of roles) {
      coord.writeAgentReport(session.dir, r.role, {
        status: 'ok',
        summary: `${r.role} done`,
        files_changed: [`${r.role}.md`],
      });
    }

    const agg = coord.aggregate(session.dir, session.briefing);
    expect(agg.total).toBe(3);
    expect(agg.allOk).toBe(true);
    expect(agg.anyFailed).toBe(false);

    const summaryPath = coord.writeSummary(session.dir, agg);
    expect(fs.existsSync(summaryPath)).toBe(true);
    const md = fs.readFileSync(summaryPath, 'utf8');
    expect(md).toContain('r1');
    expect(md).toContain('r2');
    expect(md).toContain('r3');
    expect(md).toContain('all ok: true');
  });

  test('flags anyFailed when one agent missing', () => {
    const roles = [
      { role: 'r1' },
      { role: 'r2' },
      { role: 'r3' },
    ];
    const session = coord.initSession(roles, { sessionsRoot });
    coord.writeAgentReport(session.dir, 'r1', { status: 'ok', summary: 'done' });
    coord.writeAgentReport(session.dir, 'r2', { status: 'failed', summary: 'crashed' });
    // r3 missing

    const agg = coord.aggregate(session.dir, session.briefing);
    expect(agg.allOk).toBe(false);
    expect(agg.anyFailed).toBe(true);
    expect(agg.results.find((r) => r.role === 'r3').present).toBe(false);
  });
});

describe('listSessions', () => {
  test('returns sorted session ids', () => {
    coord.initSession([{ role: 'x' }], { sessionsRoot, id: '20260101-000000-a' });
    coord.initSession([{ role: 'y' }], { sessionsRoot, id: '20260102-000000-b' });
    const list = coord.listSessions(sessionsRoot);
    expect(list).toEqual(['20260101-000000-a', '20260102-000000-b']);
  });

  test('returns empty array when root missing', () => {
    expect(coord.listSessions(path.join(sessionsRoot, 'nonexistent'))).toEqual([]);
  });
});
