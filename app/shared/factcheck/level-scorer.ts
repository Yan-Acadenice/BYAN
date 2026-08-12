// level-scorer.ts — score de confiance associe a un niveau de preuve, et
// plancher de preuve par domaine strict.
//
// Source : src/byan-v2/fact-check/level-scorer.js, et la table documentee
// dans .claude/rules/fact-check.md :
//   LEVEL-1 95% (spec officielle / RFC)     LEVEL-2 80% (benchmark reproductible)
//   LEVEL-3 65% (article evalue par les pairs)  LEVEL-4 50% (consensus communaute)
//   LEVEL-5 20% (opinion / experience personnelle)
//
// Les scores sont un CLASSEMENT DECLARATIF, pas une mesure : ils disent "un
// claim qui cite un niveau de preuve 2 merite 80% de confiance PAR CONVENTION
// BYAN", jamais "ce claim precis est vrai a 80%". Aucune fonction de ce
// fichier n'evalue le contenu d'un claim — seulement le niveau de preuve que
// l'appelant a lui-meme declare.

import type { ProofLevel, StrictDomain } from './types';

const LEVEL_SCORES: Readonly<Record<ProofLevel, number>> = { 1: 95, 2: 80, 3: 65, 4: 50, 5: 20 };

const LEVEL_DESCRIPTIONS: Readonly<Record<ProofLevel, string>> = {
  1: 'Spec officielle / RFC / documentation primaire',
  2: 'Benchmark reproductible / preuve executable',
  3: 'Article evalue par les pairs / source independante',
  4: 'Consensus communautaire (ex : plus de 1000 votes)',
  5: 'Opinion / experience personnelle',
};

// Plancher de preuve par domaine strict — niveau MAXIMUM accepte avant
// blocage (un niveau plus grand = une preuve plus faible). security et
// performance s'arretent a LEVEL-2 (benchmark reproductible) ; compliance
// s'arrete a LEVEL-1 (texte reglementaire). Un domaine absent de cette table
// n'a aucun plancher : ce module bloque les trois domaines que la doctrine
// designe comme stricts, aucun autre.
const STRICT_DOMAIN_MIN_LEVEL: Readonly<Record<StrictDomain, ProofLevel>> = {
  security: 2,
  performance: 2,
  compliance: 1,
};

export function scoreForLevel(level: ProofLevel): number {
  return LEVEL_SCORES[level];
}

export function describeLevel(level: ProofLevel): string {
  return LEVEL_DESCRIPTIONS[level] ?? 'Niveau inconnu';
}

export function isStrictDomain(domain: string): domain is StrictDomain {
  return Object.prototype.hasOwnProperty.call(STRICT_DOMAIN_MIN_LEVEL, domain);
}

// isBlockedInDomain — un domaine SANS plancher connu ne bloque rien (l'absence
// de regle n'est pas une preuve de laxisme, juste l'etat par defaut) ; un
// domaine avec plancher bloque tout niveau strictement en dessous de son
// exigence.
export function isBlockedInDomain(level: ProofLevel, domain: string): boolean {
  if (!isStrictDomain(domain)) return false;
  return level > STRICT_DOMAIN_MIN_LEVEL[domain];
}

// Le plancher exact d'un domaine strict, ou null si le domaine n'en a pas.
export function strictFloorFor(domain: string): ProofLevel | null {
  return isStrictDomain(domain) ? STRICT_DOMAIN_MIN_LEVEL[domain] : null;
}
