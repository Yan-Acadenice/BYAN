// i18n tests.
//
// Two of the assertions below used to read the other way round, and that was the
// defect, not the test: `detectLocale('de-DE')` was pinned to 'en' because
// DEFAULT_LOCALE was 'en'. The app is French-first, so an unknown browser tag
// must land on French. The tests now pin DEFAULT_LOCALE itself, so the decision
// cannot be reverted by accident somewhere else in the file.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  detectLocale,
  formatMessage,
  MESSAGES,
  translate,
  type Locale,
} from '../i18n/locales';

describe('DEFAULT_LOCALE', () => {
  it('is French — the app is French-first', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
  });
});

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

  it('falls back to French, not English, for an unsupported locale tag', () => {
    // Casting is intentional: this is the runtime path taken when a stored
    // locale no longer exists in LOCALES.
    expect(translate('de' as Locale, 'nav.dashboard')).toBe('Tableau de bord');
  });

  it('returns the key itself when both the locale and the default are missing the key', () => {
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

  it('falls back to French for unsupported locales', () => {
    // The previous version of this test asserted 'en' here. It was not testing
    // the fallback, it was pinning the wrong default.
    expect(detectLocale('de-DE')).toBe('fr');
    expect(detectLocale('ja')).toBe('fr');
    expect(detectLocale('')).toBe('fr');
    expect(detectLocale(undefined)).toBe('fr');
  });

  it('never returns a tag outside LOCALES', () => {
    for (const tag of ['de-DE', 'ja', 'pt-BR', '', undefined]) {
      expect(['en', 'fr']).toContain(detectLocale(tag));
    }
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

  it('every French value is a non-empty string', () => {
    for (const [key, value] of Object.entries(MESSAGES.fr)) {
      expect(typeof value).toBe('string');
      expect(value.length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every {placeholder} in an English string exists in its French twin', () => {
    // A placeholder dropped in translation renders as a silently missing value,
    // which is exactly the kind of hole i18n is supposed to close.
    const slots = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      const frValue = MESSAGES.fr[key as keyof typeof MESSAGES.en];
      expect(slots(frValue), `${key} placeholders must match`).toEqual(slots(value));
    }
  });
});

describe('MESSAGES.fr — tutoiement', () => {
  // Vouvoiement survived in the connectivity and MCP strings long after the rest
  // of the app switched to "tu". A scan is the only thing that keeps it out: the
  // next hand-written string is where it comes back.
  const FORBIDDEN = [/\bvous\b/i, /\bvotre\b/i, /\bvos\b/i, /-vous\b/i];

  it('addresses the user with "tu", never "vous"', () => {
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(MESSAGES.fr)) {
      if (FORBIDDEN.some((re) => re.test(value))) offenders.push(`${key}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('MESSAGES.fr — accents', () => {
  // The usage panel shipped "Cout", "Duree", "Entree", "Ecriture de cache".
  // Unaccented French is the defect this pins: the accented form is the string,
  // and a regression would have to delete a character that is asserted here.
  it('keeps the accent on the usage metric labels', () => {
    expect(MESSAGES.fr['usage.metric.cost']).toBe('Coût');
    expect(MESSAGES.fr['usage.metric.duration']).toBe('Durée');
    expect(MESSAGES.fr['usage.metric.input']).toBe('Entrée');
    expect(MESSAGES.fr['usage.metric.cachedInput']).toBe('Entrée en cache');
    expect(MESSAGES.fr['usage.metric.cacheWrite']).toBe('Écriture de cache');
  });

  it('has no French value carrying a known unaccented spelling', () => {
    // Whole words only: "Cout" must not match inside "Coûteux", and "Duree" must
    // not match a legitimate substring.
    const TRAPS = [
      /\bcout\b/i, /\bcouts\b/i, /\bduree\b/i, /\bentree\b/i, /\becriture\b/i,
      /\bmodele\b/i, /\bdefaut\b/i, /\bannulee\b/i, /\brefuse par\b/i, /\bverifiez\b/i,
      /\bdetail\b/i, /\brapportes\b/i, /\bdemarrer\b/i,
    ];
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(MESSAGES.fr)) {
      for (const re of TRAPS) {
        if (re.test(value)) offenders.push(`${key}: ${value} (matched ${re})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
