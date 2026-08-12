// challenge-evaluator.ts — decide COMMENT challenger un claim, jamais SI le
// claim est vrai. Cette derniere decision reste hors de ce module : c'est le
// travail du dialogue humain/agent, pas d'un calcul sur un rating.
//
// Source : src/byan-v2/elo/challenge-evaluator.js. La mise en forme du texte
// destine a l'utilisateur (_buildPromptInstructions dans la source) n'est PAS
// portee ici : ce module rend une DECISION structuree (styles, niveaux,
// drapeaux), pas un gabarit de phrase — voir le compte-rendu de livraison.

import {
  getScaffoldLevel,
  getChallengeStyle,
  isInDeadZone,
  TILT_THRESHOLD,
  INITIAL_RATING,
  INITIAL_RD,
} from './domain-config';
import type { ChallengeContext, ClaimResult, EloDomainProfile } from './types';

export function evaluateContext(domain: string, profile: EloDomainProfile): ChallengeContext {
  const rating = profile.rating ?? INITIAL_RATING;
  const scaffold = getScaffoldLevel(rating);
  const style = getChallengeStyle(rating);
  const inDeadZone = isInDeadZone(rating);
  const firstBlood = !profile.firstClaimMade;
  const tiltDetected = (profile.blockedStreak ?? 0) >= TILT_THRESHOLD;
  const shouldSoftChallenge = rating < 500 || inDeadZone;

  return {
    domain,
    rating,
    rd: profile.rd ?? INITIAL_RD,
    scaffoldLevel: scaffold.level,
    scaffoldIncludes: scaffold.includes,
    challengeStyle: style,
    shouldSoftChallenge,
    firstBlood,
    inDeadZone,
    tiltDetected,
  };
}

const RESULT_MAP: Readonly<Record<string, ClaimResult>> = {
  validated: 'VALIDATED',
  blocked: 'BLOCKED',
  partial: 'PARTIALLY_VALID',
  soft: 'SOFT_CHALLENGED',
};

// normalizeResult — traduit une reponse informelle (issue d'un dialogue) vers
// le vocabulaire canonique. Une reponse non reconnue degrade en
// SOFT_CHALLENGED (le choix le plus neutre : ni recompense, ni sanction)
// plutot que de lever une exception sur une entree imprevue.
export function normalizeResult(outcome: string | null | undefined): ClaimResult {
  return RESULT_MAP[outcome?.toLowerCase() ?? ''] ?? 'SOFT_CHALLENGED';
}

export function resultToScore(result: ClaimResult): number {
  switch (result) {
    case 'VALIDATED':
      return 1;
    case 'PARTIALLY_VALID':
      return 0.5;
    case 'BLOCKED':
      return 0;
    default:
      return 0.5;
  }
}
