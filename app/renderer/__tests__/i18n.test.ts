import { describe, expect, it } from 'vitest';
import { detectLocale, formatMessage, MESSAGES, translate } from '../i18n/locales';

describe('translate', () => {
  it('returns the English message for a known key', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard');
  });

  it('returns the French message for the same key', () => {
    expect(translate('fr', 'nav.dashboard')).toBe('Tableau de bord');
  });

  it('substitutes {placeholder} params', () => {
    const msg = translate('en', 'update.available', { version: '0.2.0' });
    expect(msg).toContain('v0.2.0');
  });

  it('handles missing param by rendering empty string for the slot', () => {
    const msg = translate('en', 'update.available', {});
    expect(msg).toContain('v ');
  });

  it('returns the key itself when both locale and EN are missing the key', () => {
    // Casting to bypass the keyof constraint is intentional — we are exercising
    // the runtime fallback path that protects against typos in production.
    expect(translate('en', 'nonexistent.key' as unknown as keyof typeof MESSAGES.en))
      .toBe('nonexistent.key');
  });
});

describe('detectLocale', () => {
  it('returns en for English browser tags', () => {
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('en')).toBe('en');
    expect(detectLocale('EN_GB')).toBe('en');
  });

  it('returns fr for French browser tags', () => {
    expect(detectLocale('fr-FR')).toBe('fr');
    expect(detectLocale('fr')).toBe('fr');
  });

  it('falls back to en for unsupported locales', () => {
    expect(detectLocale('de-DE')).toBe('en');
    expect(detectLocale('ja')).toBe('en');
    expect(detectLocale('')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });
});

describe('formatMessage', () => {
  it('returns the template untouched when no params are given', () => {
    expect(formatMessage('hello world')).toBe('hello world');
  });

  it('replaces multiple placeholders', () => {
    expect(formatMessage('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('renders empty string for missing keys instead of crashing', () => {
    expect(formatMessage('{a}{b}', { a: 'x' })).toBe('x');
  });
});

describe('MESSAGES — shape parity', () => {
  it('French map has every English key', () => {
    const enKeys = Object.keys(MESSAGES.en).sort();
    const frKeys = Object.keys(MESSAGES.fr).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('every English value is a non-empty string', () => {
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      expect(typeof value).toBe('string');
      expect(value.length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });
});
