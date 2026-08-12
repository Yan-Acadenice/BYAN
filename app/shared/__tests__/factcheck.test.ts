// factcheck.test.ts — LOT L7 : port du fact-check BYAN (src/byan-v2/fact-check).
//
// Chaque bloc cible une regle precise de .claude/rules/fact-check.md et prouve
// qu'un defaut serait attrape : un texte neutre ne doit declencher aucun
// motif (pas de faux positif), un domaine strict sous son plancher doit etre
// BLOQUE (pas devine), et aucune fonction n'a le droit de rendre un verdict
// de verite qu'elle n'a pas les moyens d'etablir.

import { describe, expect, it } from 'vitest';
import {
  scoreForLevel,
  describeLevel,
  isStrictDomain,
  isBlockedInDomain,
  strictFloorFor,
  detectPatterns,
  containsPattern,
  check,
  verify,
  chain,
  expiresAt,
  checkExpiration,
  DEFAULT_HALF_LIVES,
  isProofLevel,
  type ProofLevel,
  type CheckOptions,
} from '../factcheck';

describe('level-scorer: score et plancher de preuve', () => {
  it('scores chaque niveau selon la table de doctrine BYAN', () => {
    expect(scoreForLevel(1)).toBe(95);
    expect(scoreForLevel(2)).toBe(80);
    expect(scoreForLevel(3)).toBe(65);
    expect(scoreForLevel(4)).toBe(50);
    expect(scoreForLevel(5)).toBe(20);
  });

  it('decrit chaque niveau en mots', () => {
    expect(describeLevel(1)).toMatch(/spec officielle/i);
    expect(describeLevel(5)).toMatch(/opinion/i);
  });

  it('reconnait exactement les trois domaines stricts de la doctrine', () => {
    expect(isStrictDomain('security')).toBe(true);
    expect(isStrictDomain('performance')).toBe(true);
    expect(isStrictDomain('compliance')).toBe(true);
    expect(isStrictDomain('javascript')).toBe(false);
  });

  it('bloque un domaine strict sous son plancher, et seulement sous lui', () => {
    // security/performance : plancher LEVEL-2 -> niveau 3 (preuve plus
    // faible) bloque, niveau 2 (au plancher) et niveau 1 ne bloquent pas.
    expect(isBlockedInDomain(3, 'security')).toBe(true);
    expect(isBlockedInDomain(2, 'security')).toBe(false);
    expect(isBlockedInDomain(1, 'security')).toBe(false);
    // compliance : plancher LEVEL-1 -> tout ce qui n'est pas niveau 1 bloque.
    expect(isBlockedInDomain(2, 'compliance')).toBe(true);
    expect(isBlockedInDomain(1, 'compliance')).toBe(false);
  });

  it('ne bloque jamais un domaine absent de la table stricte — le garde-fou anti-sur-blocage', () => {
    expect(isBlockedInDomain(5, 'javascript')).toBe(false);
    expect(isBlockedInDomain(5, 'general')).toBe(false);
    expect(strictFloorFor('javascript')).toBeNull();
    expect(strictFloorFor('security')).toBe(2);
  });
});

describe('isProofLevel: garde de type au runtime', () => {
  it("accepte uniquement les entiers 1..5", () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isProofLevel(v)).toBe(true);
    expect(isProofLevel(0)).toBe(false);
    expect(isProofLevel(6)).toBe(false);
    expect(isProofLevel(2.5)).toBe(false);
    expect(isProofLevel('2')).toBe(false);
  });
});

describe('claim-parser: repere des motifs, ne verifie aucun fait', () => {
  it("ne detecte aucun motif dans une phrase neutre — le garde-fou anti-faux-positif", () => {
    expect(detectPatterns('Le fichier contient trois fonctions exportees.')).toEqual([]);
    expect(containsPattern('Le fichier contient trois fonctions exportees.')).toBe(false);
  });

  it('detecte un mot absolu (fr/en) avec sa position et son extrait', () => {
    const found = detectPatterns('Ce composant ne crashe jamais en production.');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].matched.toLowerCase()).toBe('jamais');
    expect(found[0].position).toBeGreaterThanOrEqual(0);
    expect(found[0].excerpt).toContain('jamais');
  });

  it('detecte un superlatif comparatif et une best-practice non sourcee', () => {
    expect(containsPattern('Redis is faster than Postgres for this.')).toBe(true);
    expect(containsPattern('This is a well known best practice.')).toBe(true);
  });

  it("un motif detecte n'est PAS un verdict de fausseté — le type ne porte que la position", () => {
    const [hit] = detectPatterns('Cette approche est toujours la meilleure.');
    expect(hit).not.toHaveProperty('isFalse');
    expect(hit).not.toHaveProperty('verified');
  });
});

describe('check(): classe le niveau de preuve, ne juge jamais la verite', () => {
  it('classe CLAIM un claim au niveau ou sous le plancher configure', () => {
    const result = check('Le cache expire au bout de 5 minutes', { level: 2 });
    expect(result.status).toBe('CLAIM');
    expect(result.assertionType).toBe('CLAIM');
    expect(result.score).toBe(80);
    expect(result.message).toContain('[CLAIM L2]');
  });

  it('degrade en OPINION/HYPOTHESIS sous le plancher configure', () => {
    const result = check('Je pense que ca devrait marcher', { level: 5 }, 3);
    expect(result.status).toBe('OPINION');
    expect(result.assertionType).toBe('HYPOTHESIS');
  });

  it('BLOQUE un claim de domaine strict sous son plancher — preuve requise, jamais devinee', () => {
    const result = check('Cet endpoint est securise', { level: 3, domain: 'security' });
    expect(result.status).toBe('BLOCKED');
    // Jamais une valeur hors des 4 types canoniques (ecart deliberement
    // corrige versus la source amont — voir fact-check.ts).
    expect(result.assertionType).toBe('HYPOTHESIS');
    expect(result.message).toContain('security');
  });

  it('ne bloque PAS un claim de domaine strict qui atteint son plancher', () => {
    const result = check('Benchmark reproductible a l-appui', { level: 2, domain: 'security' });
    expect(result.status).toBe('CLAIM');
  });

  it("ne bloque PAS un domaine non strict, quel que soit le niveau — le garde-fou d'absence de regle", () => {
    const result = check('Ce framework est plus simple', { level: 5, domain: 'javascript' }, 5);
    expect(result.status).not.toBe('BLOCKED');
  });

  it('leve une exception sur un claim vide, et sur un niveau hors 1..5', () => {
    expect(() => check('', { level: 1 })).toThrow();
    expect(() => check('x', { level: 6 as unknown as ProofLevel } as CheckOptions)).toThrow();
  });

  it('reporte la source dans le message quand elle est fournie', () => {
    const result = check('Le protocole suit RFC 7234', { level: 1, source: 'https://rfc.example/7234' });
    expect(result.message).toContain('https://rfc.example/7234');
  });
});

describe('verify(): enregistre une declaration utilisateur, ne verifie rien elle-meme', () => {
  it('formate un FACT USER-VERIFIED avec la date fournie', () => {
    const now = new Date('2026-08-07T10:00:00.000Z');
    const result = verify('La commande retourne bien 0', 'output.txt:0', now);
    expect(result.status).toBe('VERIFIED');
    expect(result.message).toBe('[FACT USER-VERIFIED 2026-08-07] La commande retourne bien 0');
  });

  it('leve une exception sans preuve — une simple affirmation n-est pas un FACT', () => {
    expect(() => verify('ca marche', null, new Date())).toThrow();
  });

  it('leve une exception sur un claim vide', () => {
    expect(() => verify('', 'preuve', new Date())).toThrow();
  });
});

describe('chain(): propagation multiplicative de la confiance', () => {
  it('degrade multiplicativement, jamais par moyenne', () => {
    // 80% x 80% x 80% x 80% = 40.96% -> 41, PAS 80% : la moyenne masquerait
    // la fragilite reelle d'une longue chaine de deduction.
    const result = chain([80, 80, 80, 80]);
    expect(result.finalScore).toBe(41);
    expect(result.steps).toBe(4);
    expect(result.warning).toMatch(/4 etapes/);
  });

  it('avertit quand une chaine courte finit sous 60%', () => {
    const result = chain([50]);
    expect(result.finalScore).toBe(50);
    expect(result.warning).toMatch(/60%/);
  });

  it("n'avertit sur aucun des deux criteres pour une chaine courte et confiante", () => {
    const result = chain([90, 90]);
    expect(result.finalScore).toBe(81);
    expect(result.warning).toBeNull();
  });

  it('leve une exception sur un tableau vide et sur un score hors bornes', () => {
    expect(() => chain([])).toThrow();
    expect(() => chain([101])).toThrow();
    expect(() => chain([-1])).toThrow();
  });
});

describe("expiresAt() / checkExpiration(): l'heure est toujours un parametre, jamais lue en cachette", () => {
  it("n'expire jamais un domaine explicitement marque null (algorithms)", () => {
    expect(expiresAt('algorithms', new Date('2020-01-01T00:00:00.000Z'))).toBeNull();
  });

  it("n'expire jamais un domaine absent de la table de demi-vie — meme defaut que la source", () => {
    expect(expiresAt('domaine-inconnu', new Date('2020-01-01T00:00:00.000Z'))).toBeNull();
  });

  it("calcule une date d'expiration exacte depuis la demi-vie", () => {
    // security = 180 jours
    const created = new Date('2026-01-01T00:00:00.000Z');
    expect(expiresAt('security', created)).toBe('2026-06-30');
    expect(DEFAULT_HALF_LIVES.security).toBe(180);
  });

  it('signale un fait expire, avec daysLeft ramene a 0 (jamais un nombre negatif)', () => {
    const result = checkExpiration(
      { createdAt: new Date('2020-01-01T00:00:00.000Z'), domain: 'security' },
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(result.expired).toBe(true);
    expect(result.daysLeft).toBe(0);
    expect(result.warning).toMatch(/EXPIRE/);
  });

  it('signale un fait qui expire bientot, sans le marquer expire', () => {
    const created = new Date('2026-01-01T00:00:00.000Z'); // expire le 2026-06-30
    const now = new Date('2026-06-20T00:00:00.000Z'); // 10 jours avant
    const result = checkExpiration({ createdAt: created, domain: 'security' }, now);
    expect(result.expired).toBe(false);
    expect(result.daysLeft).toBe(10);
    expect(result.warning).toMatch(/BIENTOT/);
  });

  it("n'avertit pas pour un fait frais, loin de son expiration", () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-10T00:00:00.000Z');
    const result = checkExpiration({ createdAt: created, domain: 'security' }, now);
    expect(result.expired).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('un fait dans un domaine qui n-expire jamais reste non-expire, quelle que soit la distance de "now"', () => {
    const result = checkExpiration(
      { createdAt: new Date('2000-01-01T00:00:00.000Z'), domain: 'algorithms' },
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(result.expired).toBe(false);
    expect(result.daysLeft).toBeNull();
  });
});
