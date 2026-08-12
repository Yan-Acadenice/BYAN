// suitability.test.ts — LOT L7 : port du registre de suitability BYAN
// (_byan/mcp/byan-mcp-server/lib/suitability.js, design D1).
//
// Le registre repond a UNE question par couple (modele, type de tache) :
// d-apres les observations vues, ce modele convient-il ici ? Ces tests pinnent
// les statistiques (beta incomplete + quantile), la mise a jour immuable, et
// les seuils de verdict — la partie qu'un modele degrade se tromperait sur,
// silencieusement, ce qui est precisement pourquoi ce calcul reste sur un
// modele fort.

import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  entryKey,
  recordOutcome,
  posterior,
  rating,
  report,
  formatRating,
  betai,
  betaQuantile,
  type SuitabilityLedger,
} from '../suitability';

describe('betai: fonction beta incomplete reguliere', () => {
  it('est la CDF identite pour la loi uniforme Beta(1,1)', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(Math.abs(betai(x, 1, 1) - x)).toBeLessThan(1e-9);
    }
  });

  it('correspond a la forme fermee de Beta(a,1) : CDF = x^a', () => {
    expect(Math.abs(betai(0.5, 4, 1) - 0.0625)).toBeLessThan(1e-6); // 0.5^4
    expect(Math.abs(betai(0.8, 3, 1) - 0.512)).toBeLessThan(1e-6); // 0.8^3
  });

  it('est bornee et croissante en x', () => {
    expect(betai(0, 3, 5)).toBe(0);
    expect(betai(1, 3, 5)).toBe(1);
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const v = betai(Math.min(x, 1), 3, 5);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('betaQuantile: inverse de betai', () => {
  it('inverse betai (aller-retour)', () => {
    for (const [a, b] of [[1, 1], [4, 1], [21, 1], [11, 11], [6, 16]]) {
      for (const p of [0.025, 0.5, 0.975]) {
        const x = betaQuantile(p, a, b);
        expect(Math.abs(betai(x, a, b) - p)).toBeLessThan(1e-6);
      }
    }
  });

  it('ramene les cas degeneres a 0 et 1', () => {
    expect(betaQuantile(0, 4, 2)).toBe(0);
    expect(betaQuantile(1, 4, 2)).toBe(1);
  });
});

describe('entryKey: deterministe, une paire (modele, type de tache) par cle', () => {
  it('rend la meme cle pour la meme paire, une cle differente sinon', () => {
    expect(entryKey('haiku', 'resume-court')).toBe(entryKey('haiku', 'resume-court'));
    expect(entryKey('haiku', 'resume-court')).not.toBe(entryKey('sonnet', 'resume-court'));
    expect(entryKey('haiku', 'resume-court')).not.toBe(entryKey('haiku', 'gros-diff'));
  });
});

describe('recordOutcome: mise a jour immuable', () => {
  it('incremente successes/failures et ne modifie jamais le registre d-origine', () => {
    const l0: SuitabilityLedger = {};
    const l1 = recordOutcome(l0, { model: 'haiku', taskKind: 'resume-court', success: true });
    const l2 = recordOutcome(l1, { model: 'haiku', taskKind: 'resume-court', success: false });

    expect(l0).toEqual({});
    const k = entryKey('haiku', 'resume-court');
    expect(l1[k].successes).toBe(1);
    expect(l1[k].failures).toBe(0);
    expect(l2[k].successes).toBe(1);
    expect(l2[k].failures).toBe(1);
    // l1 doit rester intact apres que l2 en a ete derive.
    expect(l1[k].failures).toBe(0);
  });

  it('rejette une entree malformee — erreur de programmation, signalee, jamais avalee', () => {
    expect(() => recordOutcome({}, { model: 'haiku', success: true } as never)).toThrow();
    expect(() => recordOutcome({}, { taskKind: 'x', success: true } as never)).toThrow();
    expect(() => recordOutcome({}, { model: 'haiku', taskKind: 'x' } as never)).toThrow();
    expect(() => recordOutcome({}, { model: 'haiku', taskKind: 'x', success: 'yes' } as never)).toThrow();
  });
});

describe('posterior: application du prior configurable', () => {
  it('applique le prior aux comptes bruts', () => {
    const entry = { model: 'haiku', taskKind: 'x', successes: 3, failures: 2 };
    const p = posterior(entry, { priorAlpha: 1, priorBeta: 1 });
    expect(p.alpha).toBe(4); // 1 + 3
    expect(p.beta).toBe(3); // 1 + 2
  });
});

function ledgerWith(successes: number, failures: number, taskKind = 'x'): SuitabilityLedger {
  let l: SuitabilityLedger = {};
  for (let i = 0; i < successes; i++) l = recordOutcome(l, { model: 'haiku', taskKind, success: true });
  for (let i = 0; i < failures; i++) l = recordOutcome(l, { model: 'haiku', taskKind, success: false });
  return l;
}

describe('rating(): la moyenne monte sur un succes, baisse sur un echec', () => {
  it('un succes releve strictement la moyenne ET la borne basse ; un echec les baisse', () => {
    const l = ledgerWith(5, 0);
    const before = rating(l, { model: 'haiku', taskKind: 'x' });

    const afterOk = rating(recordOutcome(l, { model: 'haiku', taskKind: 'x', success: true }), { model: 'haiku', taskKind: 'x' });
    const afterKo = rating(recordOutcome(l, { model: 'haiku', taskKind: 'x', success: false }), { model: 'haiku', taskKind: 'x' });

    expect(afterOk.mean).toBeGreaterThan(before.mean);
    expect(afterKo.mean).toBeLessThan(before.mean);
    // Strict : une vraie posterior Beta deplace la borne basse a chaque
    // observation fraiche pour n>0. Une borne constante (un mock qui ne
    // calcule rien) passerait un test non strict — celui-ci l-attraperait.
    expect(afterOk.lower).toBeGreaterThan(before.lower);
    expect(afterKo.lower).toBeLessThan(before.lower);
  });
});

describe('rating(): les seuils de verdict — la decision de securite', () => {
  it("une preuve propre mais A PEU D-OBSERVATIONS reste WATCH, jamais keep-cheap — le coeur conservateur", () => {
    // 3 succes, 0 echec : moyenne 0.8, l-air bon, mais l-intervalle est large.
    const r = rating(ledgerWith(3, 0), { model: 'haiku', taskKind: 'x' });
    expect(r.n).toBe(3);
    expect(r.lower).toBeLessThan(DEFAULTS.keepThreshold);
    expect(r.verdict).toBe('watch');
  });

  it('une preuve propre et abondante merite KEEP-CHEAP', () => {
    const r = rating(ledgerWith(30, 0), { model: 'haiku', taskKind: 'x' });
    expect(r.lower).toBeGreaterThanOrEqual(DEFAULTS.keepThreshold);
    expect(r.verdict).toBe('keep-cheap');
  });

  it('une preuve fortement negative merite DEMOTE', () => {
    const r = rating(ledgerWith(5, 15), { model: 'haiku', taskKind: 'x' });
    expect(r.upper).toBeLessThanOrEqual(DEFAULTS.demoteThreshold);
    expect(r.verdict).toBe('demote');
  });

  it('les verdicts sont mutuellement exclusifs et deterministes', () => {
    const seen = new Set<string>();
    for (const [s, f] of [[0, 0], [3, 0], [30, 0], [5, 15], [10, 10], [50, 3]] as const) {
      const r1 = rating(ledgerWith(s, f), { model: 'haiku', taskKind: 'x' });
      const r2 = rating(ledgerWith(s, f), { model: 'haiku', taskKind: 'x' });
      expect(r1).toEqual(r2);
      expect(['keep-cheap', 'watch', 'demote']).toContain(r1.verdict);
      seen.add(r1.verdict);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('un couple (modele, type de tache) jamais vu retombe sur n=0 et watch', () => {
    const r = rating({}, { model: 'haiku', taskKind: 'jamais-observe' });
    expect(r.n).toBe(0);
    expect(r.verdict).toBe('watch');
  });
});

describe('report(): liste chaque couple, severite d-abord, avec borne basse et n', () => {
  it('trie demote puis watch puis keep-cheap, et porte n + lower sur chaque ligne', () => {
    let l: SuitabilityLedger = {};
    l = { ...l, ...ledgerWith(30, 0, 'tache-sure') };
    l = { ...l, ...ledgerWith(5, 15, 'tache-a-risque') };
    l = { ...l, ...ledgerWith(3, 0, 'tache-peu-observee') };

    const rows = report(l);
    expect(rows.length).toBe(3);
    expect(rows[0].verdict).toBe('demote');
    expect(rows[rows.length - 1].verdict).toBe('keep-cheap');
    for (const row of rows) {
      expect(typeof row.lower).toBe('number');
      expect(typeof row.n).toBe('number');
    }
  });
});

describe("formatRating(): jamais un pourcentage brut — toujours la borne basse et n", () => {
  it('affiche n, la borne basse et le verdict — jamais seulement la moyenne', () => {
    const r = rating(ledgerWith(3, 0), { model: 'haiku', taskKind: 'x' });
    const s = formatRating(r);
    expect(s).toMatch(/n=3/);
    expect(s).toMatch(/borne basse/i);
    expect(s).toMatch(/watch/);
  });
});

describe('seuils configurables', () => {
  it("les seuils par defaut ne sont pas la seule verite — un seuil plus laxiste change le verdict", () => {
    const r = rating(ledgerWith(8, 0), { model: 'haiku', taskKind: 'x' }, { keepThreshold: 0.5 });
    expect(r.verdict).toBe('keep-cheap');
  });
});
