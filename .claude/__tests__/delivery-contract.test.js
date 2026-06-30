/**
 * Tests for the BYAN delivery-default contract lib (F1).
 *
 * F1 ships LIVE: a pure injected anchor that sets the baseline delivery posture
 * (grade=PROD, scope=MAXIMAL, AI-2026 cost yardstick) every turn, with a single
 * escape — an explicit opt-out word the user types this message. These tests pin
 * the wordlist detection, the anchor content, and the per-turn decision.
 */

'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const dc = require(path.join(ROOT, '.claude', 'hooks', 'lib', 'delivery-contract.js'));

// Use the lib's own default config (no fs read) so the test is hermetic.
const CONFIG = { optOutWords: dc.DEFAULT_OPT_OUT_WORDS };

describe('parseOptOut', () => {
  test('detects every configured opt-out word', () => {
    const cases = {
      mvp: 'fais-moi juste un mvp pour demo',
      quick: 'a quick draft is fine',
      brouillon: 'reste en brouillon ok',
      jette: 'jette un truc vite',
      prototype: 'on veut un prototype',
      'vite fait': 'fais ca vite fait stp',
      'pas besoin que ce soit parfait': 'pas besoin que ce soit parfait',
      poc: 'just a poc for now',
      draft: 'leave it as a draft',
    };
    for (const word of dc.DEFAULT_OPT_OUT_WORDS) {
      const msg = cases[word];
      expect(typeof msg).toBe('string');
      expect(dc.parseOptOut(msg, CONFIG)).toBe(true);
    }
  });

  test('negative: a normal prod request is not an opt-out', () => {
    expect(dc.parseOptOut('build the complete production app with auth and billing', CONFIG)).toBe(
      false
    );
  });

  test('negative: a substring inside a larger word does not trip a single-word token', () => {
    // "improvise" contains "mvp"? no — but guard against loose matches like
    // "mvprototype". A word that merely embeds a token must not match.
    expect(dc.parseOptOut('please improvise a robust solution', CONFIG)).toBe(false);
    expect(dc.parseOptOut('the mvprototyped variant', CONFIG)).toBe(false);
  });

  test('case-insensitive', () => {
    expect(dc.parseOptOut('Give me an MVP', CONFIG)).toBe(true);
    expect(dc.parseOptOut('a DRAFT please', CONFIG)).toBe(true);
  });

  test('empty / non-string input is not an opt-out', () => {
    expect(dc.parseOptOut('', CONFIG)).toBe(false);
    expect(dc.parseOptOut(null, CONFIG)).toBe(false);
    expect(dc.parseOptOut(undefined, CONFIG)).toBe(false);
  });

  test('a long meta message that merely MENTIONS the words is not an opt-out (the live false-positive)', () => {
    // The bug caught in production: a system notification / meta discussion that
    // talks ABOUT mvp/prototype/poc/draft silenced the prod anchor. A long
    // message with no directive cue before any opt-out word must stay PROD.
    const meta =
      'voici le diagnostic complet du systeme anti downgrade de byan on parle du mot mvp ' +
      'du prototype du poc et du draft comme exemples a bannir mais ceci est une notification ' +
      'meta qui ne demande surtout pas de descoper le travail en cours au contraire on veut du ' +
      'prod complet et maximal sur toute la chaine de bout en bout';
    expect(dc.parseOptOut(meta, CONFIG)).toBe(false);
  });

  test('a negated opt-out word stays PROD', () => {
    expect(dc.parseOptOut('je veux pas de mvp, fais le vrai truc complet', CONFIG)).toBe(false);
    expect(dc.parseOptOut('sans prototype, du prod direct', CONFIG)).toBe(false);
  });

  test('a genuine opt-out inside a longer message is still caught via a directive cue', () => {
    const msg =
      'pour cette tache precise et celle ci uniquement fais juste un poc rapide histoire de ' +
      'tester l idee avant de partir sur le gros morceau plus tard une fois la direction ' +
      'validee par toute l equipe produit et technique reunie';
    expect(dc.parseOptOut(msg, CONFIG)).toBe(true);
  });
});

describe('buildAnchor', () => {
  const anchor = dc.buildAnchor();

  test('contains the PROD grade marker', () => {
    expect(anchor).toMatch(/grade=PROD/);
  });

  test('contains the MAXIMAL scope marker', () => {
    expect(anchor).toMatch(/scope=MAXIMAL/);
  });

  test('contains the AI-2026 cost yardstick', () => {
    expect(anchor).toMatch(/AI-2026/);
    expect(anchor).toMatch(/temps-agent/);
  });

  test('contains the ban on the MVP / short-deliverable / dont-block-the-heavy split', () => {
    expect(anchor).toMatch(/INTERDIT/);
    expect(anchor).toMatch(/MVP/);
    expect(anchor).toMatch(/decoupage-pour-ne-pas-bloquer-le-lourd/);
  });
});

describe('decideContext', () => {
  test('non-opt-out turn returns the full anchor', () => {
    const r = dc.decideContext({ userMsg: 'build the whole feature, prod-ready', config: CONFIG });
    expect(r.optOut).toBe(false);
    expect(r.text).toBe(dc.buildAnchor());
  });

  test('opt-out turn returns a single descope-authorized line, not the anchor', () => {
    const r = dc.decideContext({ userMsg: 'just an mvp for the demo', config: CONFIG });
    expect(r.optOut).toBe(true);
    expect(r.text).toMatch(/OPT-OUT/);
    expect(r.text).toMatch(/descope autorise/);
    expect(r.text).not.toBe(dc.buildAnchor());
  });

  test('missing config falls back to the built-in wordlist', () => {
    // No config passed -> still detects an opt-out via DEFAULT_OPT_OUT_WORDS.
    const r = dc.decideContext({ userMsg: 'leave it as a draft' });
    expect(r.optOut).toBe(true);
  });
});
