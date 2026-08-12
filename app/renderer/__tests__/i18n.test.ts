// i18n tests.
//
// Two of the assertions below used to read the other way round, and that was the
// defect, not the test: `detectLocale('de-DE')` was pinned to 'en' because
// DEFAULT_LOCALE was 'en'. The app is French-first, so an unknown browser tag
// must land on French. The tests now pin DEFAULT_LOCALE itself, so the decision
// cannot be reverted by accident somewhere else in the file.

/* eslint-disable no-restricted-imports --
   The renderer lockdown forbids Node modules because the SPA runs sandboxed and
   must reach main through window.byanApi. This file is not SPA runtime and is
   never bundled: it is a SOURCE-SCANNING test, which reads locales.ts off disk
   to prove the `DECISION EN ATTENTE` marker for the adversarial reviewer's name
   is still findable. That assertion cannot be made from the imported module —
   a comment does not survive into the exported values. Same exemption, same
   reason, as renderer/__tests__/TokenLayer.test.ts just next door. */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LOCALE,
  detectLocale,
  formatMessage,
  MESSAGES,
  translate,
  type Locale,
  type MessageKey,
} from '../i18n/locales';

// Resolved from the vitest root rather than from import.meta.url: under the
// jsdom transform the module URL is not a file: URL. Same helper shape as
// TokenLayer.test.ts, for the same reason.
function fromApp(rel: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`cannot locate ${rel} from ${process.cwd()}`);
}

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
    // The placeholder names in `work.*` were picked to dodge these traps on
    // purpose: `{detail}` would match /\bdetail\b/ through its own braces, so
    // the minute line carries `{what}` instead.
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

// ── work.* — le chantier : the locked vocabulary of the work screens ─────────
//
// The design handoff decided these words and marked them non-negotiable. The
// tests below name each rule, so a regression reads as "someone put a model
// name back on screen", not as "a string changed".
//
// The scan is scoped to `work.*` DELIBERATELY. The chat and usage screens
// legitimately say "modèle", "agent" and "tokens" — those strings name the
// engine the user picked, they are not this vocabulary, and they belong to
// other screens. Widening the scan would turn this suite into a veto over
// strings it was never asked to arbitrate.
describe('MESSAGES — work.* keeps every technical word off the screen', () => {
  const workKeys = (Object.keys(MESSAGES.en) as MessageKey[]).filter((k) => k.startsWith('work.'));

  function scan(locale: 'en' | 'fr', traps: readonly RegExp[]): string[] {
    const out: string[] = [];
    for (const key of workKeys) {
      const value = MESSAGES[locale][key];
      for (const re of traps) {
        if (re.test(value)) out.push(`${key}: ${value} (matched ${re})`);
      }
    }
    return out;
  }

  it('has a populated namespace — every scan below would pass vacuously on an empty set', () => {
    // This is the guard that makes the rest of this block falsifiable. Delete
    // the work.* block and this fails first, instead of the scans going green
    // over nothing.
    expect(workKeys.length).toBeGreaterThan(120);
  });

  it('never names a model tier — the seniority ladder replaces it', () => {
    const TIERS = [/\bhaiku\b/i, /\bsonnet\b/i, /\bopus\b/i, /\bfable\b/i];
    // `fable` is not hypothetical: it is a real rung, 5 occurrences in
    // _byan/mcp/byan-mcp-server/lib/native-tiers.js. It must still never show.
    expect(scan('fr', TIERS)).toEqual([]);
    expect(scan('en', TIERS)).toEqual([]);
  });

  it('never says "agent", "worker", "model" or "token"', () => {
    expect(scan('fr', [
      /\bagents?\b/i, /\bworkers?\b/i, /\bmod[èe]les?\b/i, /\btokens?\b/i, /\bprompts?\b/i,
    ])).toEqual([]);
    expect(scan('en', [
      /\bagents?\b/i, /\bworkers?\b/i, /\bmodels?\b/i, /\btokens?\b/i, /\bprompts?\b/i,
    ])).toEqual([]);
  });

  it('never calls a stop a failure', () => {
    expect(scan('fr', [/\b[ée]checs?\b/i, /\b[ée]chou/i])).toEqual([]);
    expect(scan('en', [/\bfail(s|ed|ure|ures|ing)?\b/i])).toEqual([]);
  });

  it('never shows a percentage — confidence is binary', () => {
    expect(scan('fr', [/%/])).toEqual([]);
    expect(scan('en', [/%/])).toEqual([]);
  });

  it('never claims money was spent', () => {
    expect(scan('fr', [/total\s+d[ée]pens/i])).toEqual([]);
    expect(scan('en', [/total\s+spent/i])).toEqual([]);
  });

  it('calls a person a "collaborateur", never an agent', () => {
    expect(MESSAGES.fr['work.people.one']).toBe('collaborateur');
    expect(MESSAGES.fr['work.people.many']).toBe('collaborateurs');
    expect(MESSAGES.en['work.people.one']).toBe('teammate');
  });
});

describe('MESSAGES — work.* the four states of a teammate', () => {
  it('names the four, and the fourth is "handed in but worth a second look"', () => {
    expect(MESSAGES.fr['work.state.running.badge']).toBe('au travail');
    expect(MESSAGES.fr['work.state.delivered.badge']).toBe('a rendu');
    expect(MESSAGES.fr['work.state.stopped.badge']).toBe("s'est arrêté en route");
    // Verbatim from the handoff, and the same literal shared/workmanship.ts
    // uses for the same state — one wording, one place to change it.
    expect(MESSAGES.fr['work.state.suspect.badge']).toBe('rendu mais suspect');
  });

  it('keeps the four badges distinct — a duplicate would collapse a state', () => {
    const badges = [
      MESSAGES.fr['work.state.running.badge'],
      MESSAGES.fr['work.state.delivered.badge'],
      MESSAGES.fr['work.state.stopped.badge'],
      MESSAGES.fr['work.state.suspect.badge'],
    ];
    expect(new Set(badges).size).toBe(4);
  });

  it('gives each state a sentence naming the person', () => {
    for (const state of ['running', 'delivered', 'stopped', 'suspect'] as const) {
      const key = `work.state.${state}.sentence` as MessageKey;
      expect(MESSAGES.fr[key], key).toContain('{name}');
      expect(MESSAGES.en[key], key).toContain('{name}');
    }
  });
});

describe('MESSAGES — work.* the four seniority rungs', () => {
  it('reads junior / confirmé / senior / expert in French', () => {
    expect(MESSAGES.fr['work.level.junior']).toBe('junior');
    expect(MESSAGES.fr['work.level.confirmed']).toBe('confirmé');
    expect(MESSAGES.fr['work.level.senior']).toBe('senior');
    expect(MESSAGES.fr['work.level.expert']).toBe('expert');
  });

  it('gives each rung a hint that says what it is for', () => {
    for (const rung of ['junior', 'confirmed', 'senior', 'expert'] as const) {
      const key = `work.level.${rung}.hint` as MessageKey;
      expect(MESSAGES.fr[key].length, key).toBeGreaterThan(20);
      expect(MESSAGES.en[key].length, key).toBeGreaterThan(20);
    }
  });

  it('says the ladder is the cost lever, so the rung is readable as a price', () => {
    expect(MESSAGES.fr['work.level.scale']).toMatch(/junior/);
    expect(MESSAGES.fr['work.level.scale']).toMatch(/expert/);
    expect(MESSAGES.fr['work.level.scale']).toMatch(/co[ûu]t estim/i);
  });
});

describe('MESSAGES — work.* the three contamination signals', () => {
  it('names all three, and none of them is a quality verdict', () => {
    expect(MESSAGES.fr['work.doubt.empty']).toBe('les mains vides');
    expect(MESSAGES.fr['work.doubt.duration']).toBe('temps inhabituel');
    expect(MESSAGES.fr['work.doubt.downstream']).toBe("tout le reste s'appuie dessus");
  });

  it('carries the disclaimer in both languages — the signals are mechanical', () => {
    expect(MESSAGES.fr['work.doubt.disclaimer']).toMatch(/ne juge la qualité/);
    expect(MESSAGES.en['work.doubt.disclaimer']).toMatch(/judges the quality/);
  });

  it('gives each signal a detail line that says what was measured', () => {
    expect(MESSAGES.fr['work.doubt.empty.detail']).toContain('{target}');
    expect(MESSAGES.fr['work.doubt.duration.detail']).toContain('{reference}');
    expect(MESSAGES.fr['work.doubt.downstream.detail']).toContain('{count}');
  });
});

describe('MESSAGES — work.* money is always an estimate', () => {
  it('labels the amount "coût estimé"', () => {
    expect(MESSAGES.fr['work.cost.label']).toBe('coût estimé');
    expect(MESSAGES.en['work.cost.label']).toBe('estimated cost');
  });

  it('says on screen that the amounts are estimates and the subscription does not move', () => {
    expect(MESSAGES.fr['work.cost.estimate']).toMatch(/estimation/i);
    expect(MESSAGES.fr['work.cost.estimate']).toMatch(/abonnement/i);
    expect(MESSAGES.en['work.cost.estimate']).toMatch(/estimate/i);
    expect(MESSAGES.en['work.cost.estimate']).toMatch(/subscription/i);
  });

  it('says an idle person costs nothing', () => {
    expect(MESSAGES.fr['work.cost.idle']).toMatch(/ne consomme rien/);
    expect(MESSAGES.en['work.cost.idle']).toMatch(/costs nothing/);
  });

  it('renders an unreported amount as a dash with its reason, never a zero', () => {
    // Both locales, because a mutation run showed the English dash sliding to
    // "0,00" while a French-only assertion stayed green. A zero here would be a
    // measurement the engine never took.
    for (const locale of ['fr', 'en'] as const) {
      expect(MESSAGES[locale]['work.cost.unknown'], locale).toBe('—');
      expect(MESSAGES[locale]['work.duration.unknown'], locale).toBe('—');
      expect(MESSAGES[locale]['work.cost.unknown.reason'].length, locale).toBeGreaterThan(10);
      expect(MESSAGES[locale]['work.duration.unknown.reason'].length, locale).toBeGreaterThan(10);
    }
    expect(MESSAGES.fr['work.cost.unknown.reason']).toMatch(/tiret, pas un zéro/);
    expect(MESSAGES.en['work.cost.unknown.reason']).toMatch(/dash, not a zero/);
  });
});

describe('MESSAGES — work.* confidence is binary', () => {
  it('offers the two decided phrases and nothing in between', () => {
    expect(MESSAGES.fr['work.confidence.sure']).toBe('je suis sûre');
    expect(MESSAGES.fr['work.confidence.unsure']).toBe('je ne suis pas sûre');
  });

  it('agrees in gender, so a masculine first name is not made to say "sûre"', () => {
    expect(MESSAGES.fr['work.confidence.sure.masculine']).toBe('je suis sûr');
    expect(MESSAGES.fr['work.confidence.unsure.masculine']).toBe('je ne suis pas sûr');
    expect(MESSAGES.fr['work.confidence.unsure.about.masculine']).toContain('{target}');
  });

  it('always names WHAT it hesitates about — that is the useful half', () => {
    expect(MESSAGES.fr['work.confidence.unsure.about']).toContain('{target}');
    expect(MESSAGES.fr['work.confidence.unsure.detail']).toContain('{target}');
    expect(MESSAGES.en['work.confidence.unsure.about']).toContain('{target}');
  });
});

describe('MESSAGES — work.* the people', () => {
  const NAMES: Record<string, string> = {
    winston: 'Winston',
    amelia: 'Amelia',
    quinn: 'Quinn',
    barry: 'Barry',
    murat: 'Murat',
    carmack: 'Carmack',
    rachid: 'Rachid',
    hermes: 'Hermes',
    byan: 'BYAN',
  };

  it('gives every named person a first name and a plain-language trade', () => {
    for (const [slug, first] of Object.entries(NAMES)) {
      expect(MESSAGES.fr[`work.people.${slug}.name` as MessageKey], slug).toBe(first);
      expect(MESSAGES.fr[`work.people.${slug}.role` as MessageKey].length, slug).toBeGreaterThan(10);
    }
  });

  it('never translates a first name — a name is the same in both languages', () => {
    // Found by mutation: renaming the reviewer in the English map alone stayed
    // green while only the French value was pinned. A person cannot be called
    // two different things depending on the locale.
    const nameKeys = (Object.keys(MESSAGES.en) as MessageKey[])
      .filter((k) => k.startsWith('work.people.') && k.endsWith('.name'));
    expect(nameKeys.length).toBe(10);
    for (const key of nameKeys) {
      expect(MESSAGES.en[key], key).toBe(MESSAGES.fr[key]);
    }
  });

  it('sets Hermes and BYAN apart as not billed', () => {
    expect(MESSAGES.fr['work.people.notBilled']).toBe("n'est pas facturé");
    expect(MESSAGES.fr['work.people.notBilled.detail']).toContain('Hermes');
    expect(MESSAGES.fr['work.people.notBilled.detail']).toContain('BYAN');
  });

  it('keeps the adversarial reviewer name pending and findable in the source', () => {
    // The designer marked this blocking. "Cassandre" is a proposed default, not
    // a decision — the marker below is what makes it retrievable later.
    expect(MESSAGES.fr['work.people.reviewer.name']).toBe('Cassandre');
    const source = fs.readFileSync(fromApp('renderer/i18n/locales.ts'), 'utf8');
    expect(source).toContain('DECISION EN ATTENTE: prenom du relecteur adverse');
  });
});

describe('MESSAGES — work.* the three reading depths', () => {
  it('has a one-line sentence for each shape of outcome', () => {
    for (const key of [
      'work.phrase.running',
      'work.phrase.running.one',
      'work.phrase.done',
      'work.phrase.partial',
      'work.phrase.suspect',
      'work.phrase.waiting',
    ] as MessageKey[]) {
      expect(MESSAGES.fr[key].length, key).toBeGreaterThan(10);
    }
  });

  it('has the delivery note with its five columns', () => {
    expect(MESSAGES.fr['work.delivery.title']).toBe('Le bon de livraison');
    for (const col of ['who', 'what', 'level', 'duration', 'cost'] as const) {
      const key = `work.delivery.column.${col}` as MessageKey;
      expect(MESSAGES.fr[key].length, key).toBeGreaterThan(0);
    }
  });

  it('puts the minute behind a button, as the third depth', () => {
    expect(MESSAGES.fr['work.minute.open']).toBe('Voir la minute');
    expect(MESSAGES.fr['work.minute.close']).toBe('Replier la minute');
    expect(MESSAGES.fr['work.minute.step']).toContain('{what}');
  });
});

describe('MESSAGES — work.* the raised hand and the permission log', () => {
  it('asks for a go-ahead in plain words, with three answers', () => {
    expect(MESSAGES.fr['work.hand.title']).toBe("Quelqu'un a levé la main");
    expect(MESSAGES.fr['work.hand.body']).toContain('{action}');
    expect(MESSAGES.fr['work.hand.allow']).toBe('Vas-y');
    expect(MESSAGES.fr['work.hand.deny']).toBe('Non, laisse');
    expect(MESSAGES.fr['work.hand.allowAlways'].length).toBeGreaterThan(10);
  });

  it('says a raised hand consumes nothing while it waits', () => {
    expect(MESSAGES.fr['work.hand.idle']).toMatch(/ne consomme rien/);
  });

  it('keeps a reversible log of every answer given', () => {
    expect(MESSAGES.fr['work.permissions.title']).toBe('Ce que tu as autorisé');
    expect(MESSAGES.fr['work.permissions.allowed']).toContain('{name}');
    expect(MESSAGES.fr['work.permissions.denied']).toContain('{name}');
    expect(MESSAGES.fr['work.permissions.revoke'].length).toBeGreaterThan(0);
    expect(MESSAGES.fr['work.permissions.revoked']).toMatch(/redemandera/);
  });
});

describe('MESSAGES — work.* going back has a price', () => {
  it('names the cost of a rewind, and says it is an estimate too', () => {
    expect(MESSAGES.fr['work.rewind.cost']).toContain('{amount}');
    expect(MESSAGES.fr['work.rewind.cost']).toMatch(/estimé/);
    expect(MESSAGES.fr['work.rewind.estimate']).toMatch(/estimation/);
  });

  it('says what else would have to be redone', () => {
    expect(MESSAGES.fr['work.rewind.warning']).toContain('{name}');
    expect(MESSAGES.fr['work.rewind.people']).toContain('{count}');
    expect(MESSAGES.fr['work.rewind.duration']).toContain('{duration}');
  });

  it('has the empty case — nothing leaned on this work yet', () => {
    expect(MESSAGES.fr['work.rewind.nothing']).toMatch(/Rien à refaire/);
  });
});
