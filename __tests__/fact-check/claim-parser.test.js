const ClaimParser = require('../../src/byan-v2/fact-check/claim-parser');

describe('ClaimParser', () => {
  let parser;
  beforeEach(() => { parser = new ClaimParser(); });

  test('detects "toujours"', () => {
    const results = parser.parse('Redis est toujours plus rapide');
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "always"', () => {
    const results = parser.parse('This approach always works better');
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "best practice"', () => {
    const results = parser.parse('This is a best practice in the industry');
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "il est bien connu que"', () => {
    const results = parser.parse('Il est bien connu que les microservices sont mieux');
    expect(results.length).toBeGreaterThan(0);
  });

  test('does not trigger on neutral text', () => {
    const results = parser.parse('Je vais creer un service Node.js pour cette API');
    expect(results).toHaveLength(0);
  });

  test('returns matched word', () => {
    const results = parser.parse('Redis est toujours plus rapide que Postgres');
    expect(results[0]).toHaveProperty('matched');
  });

  test('returns excerpt', () => {
    const results = parser.parse('Redis est toujours plus rapide');
    expect(results[0]).toHaveProperty('excerpt');
  });

  test('containsClaim returns true on trigger', () => {
    expect(parser.containsClaim('This is obviously better')).toBe(true);
  });

  test('containsClaim returns false on clean text', () => {
    expect(parser.containsClaim('Voici le plan de la feature')).toBe(false);
  });

  test('throws on non-string input', () => {
    expect(parser.parse(null)).toEqual([]);
    expect(parser.parse('')).toEqual([]);
  });

  test('accepts custom patterns', () => {
    const custom = new ClaimParser(['manifestement']);
    const results = custom.parse('C\'est manifestement la bonne approche');
    expect(results.length).toBeGreaterThan(0);
  });
});
