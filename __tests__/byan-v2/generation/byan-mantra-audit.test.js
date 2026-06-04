const path = require('path');
const fs = require('fs');
const os = require('os');
const audit = require('../../../src/byan-v2/generation/mantra-audit');

describe('byan-mantra-audit (N2 embodiment)', () => {
  let agentFile;

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
    agentFile = path.join(dir, 'dev.md');
    fs.writeFileSync(agentFile, 'name: dev\nloads _byan/bmm/config.yaml\nclean code with tests');
  });

  test('buildPacket resolves scopes and lists applicable mantras', () => {
    const p = audit.buildPacket(agentFile);
    expect(p.agent).toBe('dev');
    expect(p.scopes).toEqual(['universal', 'sdlc-code', 'sdlc-test']);
    const ids = p.mantras.map(m => m.id);
    expect(ids).toContain('IA-16');       // universal applies
    expect(ids).not.toContain('M27');     // sdlc-process excluded for dev
    expect(ids).not.toContain('IA-23');   // behavioral excluded from scoring
  });

  test('buildPrompt embeds the rubric, mantras, and persona', () => {
    const p = audit.buildPacket(agentFile);
    const prompt = audit.buildPrompt(p);
    expect(prompt).toContain('embodied | partial | absent');
    expect(prompt).toContain('IA-16');
    expect(prompt).toContain('loads _byan/bmm/config.yaml');
  });

  test('scoreVerdicts weights embodied=1 partial=0.5 absent=0', () => {
    const p = { agent: 'x', scopes: ['universal'], mantras: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }] };
    const r = audit.scoreVerdicts(p, { A: 'embodied', B: 'partial', C: 'absent', D: 'embodied' });
    expect(r.embodimentScore).toBe(63); // (1 + 0.5 + 0 + 1) / 4 = 0.625
    expect(r.embodied).toEqual(['A', 'D']);
    expect(r.partial).toEqual(['B']);
    expect(r.absent).toEqual(['C']);
  });

  test('scoreVerdicts tracks unjudged mantras', () => {
    const p = { agent: 'x', scopes: ['universal'], mantras: [{ id: 'A' }, { id: 'B' }] };
    const r = audit.scoreVerdicts(p, { A: 'embodied' });
    expect(r.unjudged).toEqual(['B']);
    expect(r.embodimentScore).toBe(50);
  });
});
