// domain-config.ts — configuration statique de l'ELO Trust System.
//
// Source : src/byan-v2/elo/domain-config.js, et la doctrine
// .claude/rules/elo-trust.md (tables K-factor / paliers / zone morte).
// Donnees et fonctions pures — aucun effet de bord, aucun acces disque.

import type { ChallengeStyle, ScaffoldInclude } from './types';

export const BASE_K = 32;

// Multiplicateur de K-factor par domaine. K final = BASE_K x multiplicateur.
// security/compliance : enjeu eleve, une erreur y coute cher -> K plus fort.
// algorithms : les fondamentaux bougent peu -> K plus faible (une erreur y est
// courante et ne doit pas faire trop bouger le score d'un coup).
export const K_FACTOR_MULTIPLIERS: Readonly<Record<string, number>> = {
  security: 1.5,
  compliance: 1.5,
  performance: 1.2,
  general: 1.0,
  javascript: 1.0,
  typescript: 1.0,
  nodejs: 1.0,
  python: 1.0,
  rust: 1.0,
  go: 1.0,
  algorithms: 0.8,
  cryptography: 1.2,
  devops: 1.0,
  react: 1.0,
};

export function getKFactor(domain: string): number {
  const multiplier = K_FACTOR_MULTIPLIERS[domain] ?? K_FACTOR_MULTIPLIERS.general;
  return Math.round(BASE_K * multiplier);
}

// Zone morte de Dunning-Kruger : intensite de challenge maximale ici — le
// palier ou la confiance depasse le plus la competence reelle.
export const DEAD_ZONE = { min: 450, max: 550 } as const;

export function isInDeadZone(rating: number): boolean {
  return rating >= DEAD_ZONE.min && rating <= DEAD_ZONE.max;
}

interface ScaffoldLevel {
  readonly maxRating: number;
  readonly level: number;
  readonly includes: readonly ScaffoldInclude[];
}

// Paliers de scaffold : plus le rating est bas, plus la liste `includes` est
// riche. C'est la traduction mecanique de la doctrine "score bas = plus
// d'accompagnement, pas moins" — pas une punition qui se durcit avec le score.
const SCAFFOLD_LEVELS: readonly ScaffoldLevel[] = [
  { maxRating: 200, level: 3, includes: ['challenge', 'hint', 'analogy', 'concept_link'] },
  { maxRating: 500, level: 2, includes: ['challenge', 'hint'] },
  { maxRating: 700, level: 1, includes: ['challenge'] },
  { maxRating: Infinity, level: 0, includes: ['challenge'] },
];

export function getScaffoldLevel(rating: number): { level: number; includes: readonly ScaffoldInclude[] } {
  const found = SCAFFOLD_LEVELS.find((s) => rating <= s.maxRating) ?? SCAFFOLD_LEVELS[SCAFFOLD_LEVELS.length - 1];
  return { level: found.level, includes: found.includes };
}

interface ChallengeStyleBand {
  readonly minGap: number;
  readonly maxGap: number;
  readonly style: ChallengeStyle;
}

// Style de challenge selon l'ecart au rating de reference BYAN (500 par
// defaut). borne haute EXCLUSIVE (`gap < maxGap`), borne basse INCLUSIVE
// (`gap >= minGap`) — reprend exactement la comparaison de la source pour que
// les bandes ne se chevauchent ni ne laissent de trou.
const CHALLENGE_STYLES: readonly ChallengeStyleBand[] = [
  { minGap: -Infinity, maxGap: -400, style: 'guide' },
  { minGap: -400, maxGap: -100, style: 'standard' },
  { minGap: -100, maxGap: 100, style: 'peer' },
  { minGap: 100, maxGap: Infinity, style: 'learner' },
];

export function getChallengeStyle(rating: number, byanBaseline = 500): ChallengeStyle {
  const gap = rating - byanBaseline;
  return CHALLENGE_STYLES.find((s) => gap >= s.minGap && gap < s.maxGap)?.style ?? 'standard';
}

// Les 6 causes racines documentees d'un BLOCKED (.claude/rules/elo-trust.md ne
// les detaille pas toutes, mais src/byan-v2/elo/domain-config.js si). Ce lot
// porte l'enum : le choix de LAQUELLE s'applique reste un jugement humain/LLM,
// jamais calcule ici.
export const BLOCKED_REASONS = {
  TERMINOLOGY_GAP: 'terminology_gap',
  PREREQUISITE_GAP: 'prerequisite_gap',
  CONTEXT_MISMATCH: 'context_mismatch',
  OUTDATED_KNOWLEDGE: 'outdated_knowledge',
  LAZY_CLAIM: 'lazy_claim',
  OVERCONFIDENCE: 'overconfidence',
} as const;

export type BlockedReason = (typeof BLOCKED_REASONS)[keyof typeof BLOCKED_REASONS];

const BLOCKED_LABELS: readonly { maxRating: number; label: string }[] = [
  { maxRating: 300, label: "Moment d'apprentissage" },
  { maxRating: 600, label: 'Point de precision' },
  { maxRating: Infinity, label: 'Claim non valide' },
];

export function getBlockedLabel(rating: number): string {
  return BLOCKED_LABELS.find((b) => rating <= b.maxRating)?.label ?? 'Claim non valide';
}

// TILT_THRESHOLD BLOCKED consecutifs dans le meme domaine -> proposer une
// pause pedagogique plutot que d'enchainer un quatrieme challenge.
export const TILT_THRESHOLD = 3;

// Rating a 0 apres plus d'une session dans le domaine -> mode intervention
// (proposer des questions de calibration plutot que continuer a bloquer).
export const INTERVENTION_RATING = 0;

export const INITIAL_RATING = 0;
export const INITIAL_RD = 200;

// Rating provisoire quand l'utilisateur declare lui-meme son niveau — reste
// provisoire (RD remis a INITIAL_RD) jusqu'a ce que des claims le confirment.
export const DECLARED_EXPERTISE_RATINGS: Readonly<Record<string, number>> = {
  beginner: 100,
  intermediate: 400,
  advanced: 650,
  expert: 800,
  principal: 900,
};
