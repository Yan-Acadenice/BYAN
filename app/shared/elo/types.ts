// types.ts — vocabulaire de l'ELO Trust System.
//
// RAPPEL DOCTRINAL (.claude/rules/elo-trust.md) : ce score mesure la
// fiabilite PASSEE des claims d'un interlocuteur dans UN domaine technique —
// pas son intelligence, pas sa valeur. "Un score bas signifie que BYAN va
// expliquer plus, pas moins." Le nom des champs doit porter cette nuance :
// `rating` (jamais "intelligence" ni "niveau"), et un `label` de palier reste
// descriptif d'un comportement d'accompagnement, jamais d'un jugement sur la
// personne.
//
// Source portee : src/byan-v2/elo/*.js.

export type ClaimResult = 'VALIDATED' | 'BLOCKED' | 'PARTIALLY_VALID' | 'SOFT_CHALLENGED';

export type ChallengeStyle = 'guide' | 'standard' | 'peer' | 'learner';

export type ScaffoldInclude = 'challenge' | 'hint' | 'analogy' | 'concept_link';

// Le profil d'un domaine. NE PORTE PAS d'historique horodate ni de date de
// derniere activite : ce lot porte le CALCUL (glicko2 + evaluation de
// challenge), pas la persistance — voir engine.ts pour la raison exacte.
//
// `consecutiveCorrect` est compte fidelement a la source (elo-store.js) meme
// si, mesure faite, aucun code de src/byan-v2/elo/ ne le LIT pour ajuster un
// K-factor : la mecanique "hot hand" documentee dans
// .claude/rules/elo-trust.md (§ Mecaniques speciales V2) n'a pas d'implementation
// trouvee dans le depot BYAN a la date de ce portage. Voir le compte-rendu de
// livraison.
export interface EloDomainProfile {
  readonly rating: number;
  readonly rd: number;
  readonly sessionCount: number;
  readonly blockedStreak: number;
  readonly consecutiveCorrect: number;
  readonly firstClaimMade: boolean;
}

export interface ChallengeContext {
  readonly domain: string;
  readonly rating: number;
  readonly rd: number;
  readonly scaffoldLevel: number;
  readonly scaffoldIncludes: readonly ScaffoldInclude[];
  readonly challengeStyle: ChallengeStyle;
  // "Ne pas bloquer immediatement, demander d'abord ce qui a mene a la
  // conclusion" — vrai des que le rating est sous la base (500) ou dans la
  // zone morte (450-550).
  readonly shouldSoftChallenge: boolean;
  // Premier claim jamais fait dans ce domaine par cet interlocuteur : Zero
  // Trust par domaine, toujours challenger independamment du rating global.
  readonly firstBlood: boolean;
  readonly inDeadZone: boolean;
  readonly tiltDetected: boolean;
}

export interface ApplyResultOutcome {
  readonly profile: EloDomainProfile;
  readonly delta: number;
  readonly tiltDetected: boolean;
  readonly interventionMode: boolean;
}
