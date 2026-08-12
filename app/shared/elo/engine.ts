// engine.ts — combine Glicko-2 et la reconfiguration du profil pour UN
// resultat de claim. PUR : rend un nouveau profil, n'ecrit rien nulle part.
//
// Source : src/byan-v2/elo/index.js (EloEngine.recordResult) et elo-store.js
// (EloStore.recordResult), fusionnes ici SANS la partie disque ni la partie
// mise en forme de message (pedagogy-layer.js) : ce lot porte le calcul, pas
// le stockage ni les gabarits de texte. Aucun historique horodate n'est
// conserve ici — un futur lot qui persisterait ce profil (comme
// main/suitability-store.ts le fait pour la suitability) le porterait a ce
// niveau-la, pas dans ce module.

import { update as glickoUpdate } from './glicko2';
import { getKFactor, TILT_THRESHOLD, INTERVENTION_RATING, DECLARED_EXPERTISE_RATINGS, INITIAL_RD } from './domain-config';
import { resultToScore } from './challenge-evaluator';
import type { ApplyResultOutcome, ClaimResult, EloDomainProfile } from './types';

export const INITIAL_DOMAIN_PROFILE: EloDomainProfile = {
  rating: 0,
  rd: INITIAL_RD,
  sessionCount: 0,
  blockedStreak: 0,
  consecutiveCorrect: 0,
  firstClaimMade: false,
};

// applyClaimResult — le reducer : profil + resultat -> nouveau profil. Le
// rating suit toujours la mise a jour Glicko (jamais decide a la main), les
// compteurs de serie sont remis a zero ou incrementes selon le meme resultat.
export function applyClaimResult(domain: string, profile: EloDomainProfile, result: ClaimResult): ApplyResultOutcome {
  const kFactor = getKFactor(domain);
  const score = resultToScore(result);
  const { newRating, newRd, delta } = glickoUpdate(profile.rating, profile.rd, score, kFactor);

  const blockedStreak = result === 'BLOCKED' ? profile.blockedStreak + 1 : 0;
  const consecutiveCorrect = result === 'BLOCKED' ? 0 : profile.consecutiveCorrect + 1;

  const nextProfile: EloDomainProfile = {
    rating: newRating,
    rd: newRd,
    sessionCount: profile.sessionCount,
    blockedStreak,
    consecutiveCorrect,
    firstClaimMade: true,
  };

  return {
    profile: nextProfile,
    delta,
    tiltDetected: blockedStreak >= TILT_THRESHOLD,
    interventionMode: newRating <= INTERVENTION_RATING && profile.sessionCount > 1,
  };
}

// incrementSession — a appeler une fois par debut de session sur chaque
// domaine actif (mirroir de EloStore.incrementSession, sans le disque).
export function incrementSession(profile: EloDomainProfile): EloDomainProfile {
  return { ...profile, sessionCount: profile.sessionCount + 1 };
}

// declareExpertise — rating provisoire depuis une auto-declaration. Le RD est
// remis a INITIAL_RD (incertitude haute) : une auto-declaration n'est pas une
// preuve, elle reste a confirmer par des claims reels.
export function declareExpertise(profile: EloDomainProfile, level: string): EloDomainProfile {
  const rating = DECLARED_EXPERTISE_RATINGS[level] ?? DECLARED_EXPERTISE_RATINGS.intermediate;
  return { ...profile, rating, rd: INITIAL_RD };
}
