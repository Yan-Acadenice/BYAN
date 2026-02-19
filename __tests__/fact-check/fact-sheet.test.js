const FactSheet = require('../../src/byan-v2/fact-check/fact-sheet');

describe('FactSheet', () => {
  let sheet;
  const SESSION = 'test-session-123';
  const FACTS = {
    verified: [{ claim: 'Redis > 100k ops/sec', status: 'VERIFIED' }],
    claims: [{ claim: 'Node.js is single-threaded', level: 1, source: { url: 'nodejs.org/api' }, proof: { content: 'node -e "..."' } }],
    disputed: [{ claim: 'Postgres is slow at scale' }],
    opinions: [{ claim: 'This arch is more maintainable', status: 'OPINION' }]
  };

  beforeEach(() => { sheet = new FactSheet('/tmp/byan-test-facts'); });

  test('generates content string', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  test('includes session id in header', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain(SESSION);
  });

  test('includes trust score', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain('Truth Score');
  });

  test('includes verified section', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain('USER-VERIFIED');
    expect(content).toContain('Redis > 100k ops/sec');
  });

  test('includes claims section', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain('[CLAIM L1]');
  });

  test('includes disputed section', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain('[DISPUTED]');
  });

  test('includes opinions section', () => {
    const content = sheet.generate(SESSION, FACTS);
    expect(content).toContain('[OPINION]');
  });

  test('trust score 100% when all sourced', () => {
    const allSourced = { verified: [{ claim: 'A' }], claims: [{ claim: 'B', level: 1 }], disputed: [], opinions: [] };
    const content = sheet.generate(SESSION, allSourced);
    expect(content).toContain('100%');
  });

  test('shows warning when trust score < 80%', () => {
    const mostlyOpinions = { verified: [], claims: [], disputed: [], opinions: [{ claim: 'A' }, { claim: 'B' }, { claim: 'C' }] };
    const content = sheet.generate(SESSION, mostlyOpinions);
    expect(content).toContain('Avertissement');
  });

  test('throws on missing sessionId', () => {
    expect(() => sheet.generate(null, FACTS)).toThrow();
  });

  test('throws on missing facts', () => {
    expect(() => sheet.generate(SESSION, null)).toThrow();
  });

  test('handles empty facts gracefully', () => {
    const content = sheet.generate(SESSION, { verified: [], claims: [], disputed: [], opinions: [] });
    expect(content).toContain('100%');
  });
});
