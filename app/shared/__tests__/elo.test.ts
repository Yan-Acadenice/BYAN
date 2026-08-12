// elo.test.ts — LOT L7 : port de l'ELO Trust System BYAN (src/byan-v2/elo).
//
// Rappel doctrinal verifie par ces tests (.claude/rules/elo-trust.md) : le
// rating mesure la fiabilite PASSEE d'un claim dans un domaine, jamais
// l'intelligence de la personne — un score bas doit toujours produire PLUS de
// scaffold (accompagnement), jamais moins, et le rating doit rester borne
// [0, 1000] quel que soit l'enchainement d'appels.

import { describe, expect, it } from 'vitest';
import {
  getKFactor,
  isInDeadZone,
  getScaffoldLevel,
  getChallengeStyle,
  getBlockedLabel,
  TILT_THRESHOLD,
  INTERVENTION_RATING,
  DECLARED_EXPERTISE_RATINGS,
  update,
  decayRd,
  evaluateContext,
  normalizeResult,
  resultToScore,
  applyClaimResult,
  incrementSession,
  declareExpertise,
  INITIAL_DOMAIN_PROFILE,
  type EloDomainProfile,
} from '../elo';

describe('domain-config: K-factor et seuils', () => {
  it('met a l-echelle le K-factor par multiplicateur de domaine, arrondi', () => {
    expect(getKFactor('security')).toBe(48); // round(32 * 1.5)
    expect(getKFactor('algorithms')).toBe(26); // round(32 * 0.8) = round(25.6)
    expect(getKFactor('javascript')).toBe(32);
  });

  it("retombe sur le multiplicateur general pour un domaine inconnu", () => {
    expect(getKFactor('domaine-jamais-liste')).toBe(32);
  });

  it('signale la zone morte sur ses bornes exactes', () => {
    expect(isInDeadZone(449)).toBe(false);
    expect(isInDeadZone(450)).toBe(true);
    expect(isInDeadZone(550)).toBe(true);
    expect(isInDeadZone(551)).toBe(false);
  });

  it("donne PLUS de scaffold quand le rating est PLUS BAS — la doctrine appliquee mecaniquement", () => {
    expect(getScaffoldLevel(0).includes.length).toBe(4);
    expect(getScaffoldLevel(300).includes.length).toBe(2);
    expect(getScaffoldLevel(650).includes.length).toBe(1);
    expect(getScaffoldLevel(999).includes.length).toBe(1);
    // Monotone non-croissant : un rating plus bas ne doit jamais produire
    // moins d'accompagnement — c'est la regression que ce test attraperait.
    const levels = [0, 150, 300, 450, 600, 750, 900].map((r) => getScaffoldLevel(r).includes.length);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    }
  });

  it("resout le style de challenge par l-ecart a la base BYAN (500)", () => {
    expect(getChallengeStyle(0)).toBe('guide'); // gap -500 < -400
    expect(getChallengeStyle(300)).toBe('standard'); // gap -200
    expect(getChallengeStyle(500)).toBe('peer'); // gap 0
    expect(getChallengeStyle(650)).toBe('learner'); // gap +150
  });

  it('nomme le label BLOCKED selon le rating, sans jamais de mot accusatoire', () => {
    expect(getBlockedLabel(100)).toMatch(/apprentissage/i);
    expect(getBlockedLabel(400)).toMatch(/precision/i);
    expect(getBlockedLabel(800)).toMatch(/non valide/i);
    for (const r of [0, 100, 400, 800]) {
      expect(getBlockedLabel(r).toLowerCase()).not.toMatch(/stupide|bete|idiot/);
    }
  });

  it("classe les ratings d-expertise declaree dans l-ordre attendu", () => {
    expect(DECLARED_EXPERTISE_RATINGS.beginner).toBeLessThan(DECLARED_EXPERTISE_RATINGS.intermediate);
    expect(DECLARED_EXPERTISE_RATINGS.intermediate).toBeLessThan(DECLARED_EXPERTISE_RATINGS.expert);
  });
});

describe('glicko2.update(): borne et correct en direction', () => {
  it('reste dans [0, 1000] quelle que soit la longueur de la serie', () => {
    let rating = 990;
    let rd = 60;
    for (let i = 0; i < 50; i++) {
      const r = update(rating, rd, 1, 48);
      rating = r.newRating;
      rd = r.newRd;
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(1000);
    }
    // Bloque en boucle depuis le bas : ne doit jamais descendre sous 0.
    rating = 10;
    rd = 60;
    for (let i = 0; i < 50; i++) {
      const r = update(rating, rd, 0, 48);
      rating = r.newRating;
      rd = r.newRd;
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(1000);
    }
  });

  it('un resultat VALIDATED ne baisse jamais le rating ; un BLOCKED ne le monte jamais', () => {
    const validated = update(400, 100, 1, 32);
    expect(validated.delta).toBeGreaterThanOrEqual(0);
    const blocked = update(400, 100, 0, 32);
    expect(blocked.delta).toBeLessThanOrEqual(0);
  });

  it('rejette un resultat hors {0, 0.5, 1}', () => {
    expect(() => update(400, 100, 1.5, 32)).toThrow();
    expect(() => update(400, 100, -0.1, 32)).toThrow();
  });
});

describe("glicko2.decayRd(): l-incertitude grandit avec l-inactivite, plafonnee", () => {
  it('ne change rien pour un nombre de jours nul ou negatif', () => {
    expect(decayRd(80, 0)).toBe(80);
    expect(decayRd(80, -5)).toBe(80);
  });

  it('augmente le RD avec le temps d-inactivite, plafonne a INITIAL_RD (200)', () => {
    const decayed = decayRd(60, 400);
    expect(decayed).toBeGreaterThan(60);
    expect(decayed).toBeLessThanOrEqual(200);
  });
});

describe('challenge-evaluator: decide COMMENT challenger, jamais SI le claim est vrai', () => {
  const baseProfile: EloDomainProfile = { ...INITIAL_DOMAIN_PROFILE };

  it('signale le premier sang sur un domaine sans claim anterieur — Zero Trust par domaine', () => {
    const ctx = evaluateContext('security', baseProfile);
    expect(ctx.firstBlood).toBe(true);
  });

  it('ne signale plus le premier sang une fois un claim fait', () => {
    const ctx = evaluateContext('security', { ...baseProfile, firstClaimMade: true });
    expect(ctx.firstBlood).toBe(false);
  });

  it('detecte le tilt au seuil exact, pas avant', () => {
    const notYet = evaluateContext('security', { ...baseProfile, blockedStreak: TILT_THRESHOLD - 1 });
    expect(notYet.tiltDetected).toBe(false);
    const now = evaluateContext('security', { ...baseProfile, blockedStreak: TILT_THRESHOLD });
    expect(now.tiltDetected).toBe(true);
  });

  it('challenge en douceur sous la base et dans la zone morte', () => {
    expect(evaluateContext('security', { ...baseProfile, rating: 200 }).shouldSoftChallenge).toBe(true);
    // rating 500 est hors de "rating < 500" mais DANS la zone morte (450-550).
    expect(evaluateContext('security', { ...baseProfile, rating: 500 }).shouldSoftChallenge).toBe(true);
    expect(evaluateContext('security', { ...baseProfile, rating: 800 }).shouldSoftChallenge).toBe(false);
  });

  it('normalise un resultat informel, et degrade un resultat inconnu en SOFT_CHALLENGED plutot que de lever', () => {
    expect(normalizeResult('validated')).toBe('VALIDATED');
    expect(normalizeResult('BLOCKED')).toBe('BLOCKED');
    expect(normalizeResult('partial')).toBe('PARTIALLY_VALID');
    expect(normalizeResult('gibberish')).toBe('SOFT_CHALLENGED');
    expect(normalizeResult(undefined)).toBe('SOFT_CHALLENGED');
  });

  it('convertit un resultat canonique en score Glicko', () => {
    expect(resultToScore('VALIDATED')).toBe(1);
    expect(resultToScore('PARTIALLY_VALID')).toBe(0.5);
    expect(resultToScore('BLOCKED')).toBe(0);
    expect(resultToScore('SOFT_CHALLENGED')).toBe(0.5);
  });
});

describe('engine.applyClaimResult(): le reducer pur', () => {
  it('remet a zero la serie de blocages sur un claim valide, l-incremente sur un claim bloque', () => {
    const afterBlock = applyClaimResult('security', INITIAL_DOMAIN_PROFILE, 'BLOCKED');
    expect(afterBlock.profile.blockedStreak).toBe(1);
    expect(afterBlock.profile.consecutiveCorrect).toBe(0);

    const afterValidate = applyClaimResult('security', afterBlock.profile, 'VALIDATED');
    expect(afterValidate.profile.blockedStreak).toBe(0);
    expect(afterValidate.profile.consecutiveCorrect).toBe(1);
  });

  it('detecte le tilt apres TILT_THRESHOLD blocages consecutifs', () => {
    let profile: EloDomainProfile = INITIAL_DOMAIN_PROFILE;
    let outcome;
    for (let i = 0; i < TILT_THRESHOLD; i++) {
      outcome = applyClaimResult('security', profile, 'BLOCKED');
      profile = outcome.profile;
    }
    expect(outcome!.tiltDetected).toBe(true);
  });

  it("n-entre en mode intervention QUE sous/au niveau d-INTERVENTION_RATING ET apres plus d-une session", () => {
    const freshProfile: EloDomainProfile = { ...INITIAL_DOMAIN_PROFILE, sessionCount: 0, rating: 0 };
    const first = applyClaimResult('security', freshProfile, 'BLOCKED');
    // sessionCount trop bas : pas d-intervention meme a rating 0.
    expect(first.interventionMode).toBe(false);

    const seasonedProfile: EloDomainProfile = { ...INITIAL_DOMAIN_PROFILE, sessionCount: 5, rating: 0 };
    const second = applyClaimResult('security', seasonedProfile, 'BLOCKED');
    expect(second.profile.rating).toBeLessThanOrEqual(INTERVENTION_RATING);
    expect(second.interventionMode).toBe(true);
  });

  it('ne laisse jamais le rating sortir de [0, 1000], meme sur une longue serie', () => {
    let profile: EloDomainProfile = { ...INITIAL_DOMAIN_PROFILE, rating: 990, rd: 60 };
    for (let i = 0; i < 30; i++) {
      profile = applyClaimResult('security', profile, 'VALIDATED').profile;
      expect(profile.rating).toBeGreaterThanOrEqual(0);
      expect(profile.rating).toBeLessThanOrEqual(1000);
    }
  });
});

describe('engine.incrementSession() / declareExpertise()', () => {
  it('incremente uniquement le compteur de sessions', () => {
    const next = incrementSession(INITIAL_DOMAIN_PROFILE);
    expect(next.sessionCount).toBe(INITIAL_DOMAIN_PROFILE.sessionCount + 1);
    expect(next.rating).toBe(INITIAL_DOMAIN_PROFILE.rating);
  });

  it("pose un rating provisoire depuis un niveau declare, avec une incertitude haute (RD remis a zero)", () => {
    const next = declareExpertise(INITIAL_DOMAIN_PROFILE, 'expert');
    expect(next.rating).toBe(DECLARED_EXPERTISE_RATINGS.expert);
    expect(next.rd).toBe(200); // INITIAL_RD — la declaration reste a confirmer par des claims reels
  });

  it('retombe sur intermediate pour un niveau inconnu plutot que de lever une exception', () => {
    const next = declareExpertise(INITIAL_DOMAIN_PROFILE, 'not-a-real-level');
    expect(next.rating).toBe(DECLARED_EXPERTISE_RATINGS.intermediate);
  });
});
