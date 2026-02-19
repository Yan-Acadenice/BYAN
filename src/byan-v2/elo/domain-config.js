/**
 * domain-config.js — Static configuration for the ELO Trust System
 *
 * All thresholds, multipliers and routing rules live here.
 * Pure data — no side effects.
 */

// K-factor multipliers per domain.
// Base K = 32. Final K = BASE_K × multiplier.
const BASE_K = 32;

const K_FACTOR_MULTIPLIERS = {
  security:    1.5,  // high stakes — errors are costly
  compliance:  1.5,
  performance: 1.2,
  general:     1.0,  // neutral reference
  javascript:  1.0,
  typescript:  1.0,
  nodejs:      1.0,
  algorithms:  0.8,  // fundamentals are stable — mistakes are normal
  cryptography:1.2,
  devops:      1.0,
  react:       1.0
};

// Dunning-Kruger dead zone: maximum challenge intensity here
const DEAD_ZONE = { min: 450, max: 550 };

// LLM routing thresholds (max rating across active domains)
const LLM_ROUTING = [
  { maxRating: 200, model: 'claude-opus-4.5',   label: 'Apprenti'  },
  { maxRating: 600, model: 'claude-sonnet-4.5', label: 'Praticien' },
  { maxRating: Infinity, model: 'claude-haiku-4.5', label: 'Expert' }
];

// Scaffold levels: how much help is provided with a challenge
const SCAFFOLD_LEVELS = [
  { maxRating: 200, level: 3, label: 'full',    includes: ['challenge', 'hint', 'analogy', 'concept_link'] },
  { maxRating: 500, level: 2, label: 'guided',  includes: ['challenge', 'hint'] },
  { maxRating: 700, level: 1, label: 'standard',includes: ['challenge'] },
  { maxRating: Infinity, level: 0, label: 'adversarial', includes: ['challenge'] }
];

// Challenge style based on ELO gap (user rating - domain baseline 500)
const CHALLENGE_STYLES = [
  { minGap: -Infinity, maxGap: -400, style: 'guide'    }, // beginner vs expert
  { minGap: -400,      maxGap: -100, style: 'standard' },
  { minGap: -100,      maxGap: 100,  style: 'peer'     },
  { minGap: 100,       maxGap: Infinity, style: 'learner' } // user exceeds BYAN benchmark
];

// The 6 root causes of a BLOCKED claim
const BLOCKED_REASONS = {
  TERMINOLOGY_GAP:     'terminology_gap',
  PREREQUISITE_GAP:    'prerequisite_gap',
  CONTEXT_MISMATCH:    'context_mismatch',
  OUTDATED_KNOWLEDGE:  'outdated_knowledge',
  LAZY_CLAIM:          'lazy_claim',
  OVERCONFIDENCE:      'overconfidence'
};

// Adapted label for BLOCKED result based on user rating
const BLOCKED_LABELS = [
  { maxRating: 300, label: "Moment d'apprentissage" },
  { maxRating: 600, label: 'Point de precision'      },
  { maxRating: Infinity, label: 'Claim non valide'   }
];

// Tilt threshold: consecutive BLOCKs in same domain triggering soft intervention
const TILT_THRESHOLD = 3;

// Intervention mode threshold: total rating at 0 across N sessions
const INTERVENTION_RATING = 0;

// Initial rating for a new domain
const INITIAL_RATING = 0;
const INITIAL_RD     = 200;  // high uncertainty at start

// Provisional ELO when user self-declares expertise level
const DECLARED_EXPERTISE_RATINGS = {
  beginner:     100,
  intermediate: 400,
  advanced:     650,
  expert:       800,
  principal:    900
};

function getKFactor(domain) {
  const multiplier = K_FACTOR_MULTIPLIERS[domain] ?? K_FACTOR_MULTIPLIERS.general;
  return Math.round(BASE_K * multiplier);
}

function getScaffoldLevel(rating) {
  return SCAFFOLD_LEVELS.find(s => rating <= s.maxRating) ?? SCAFFOLD_LEVELS[SCAFFOLD_LEVELS.length - 1];
}

function getChallengeStyle(rating, byanBaseline = 500) {
  const gap = rating - byanBaseline;
  return CHALLENGE_STYLES.find(s => gap >= s.minGap && gap < s.maxGap)?.style ?? 'standard';
}

function getBlockedLabel(rating) {
  return BLOCKED_LABELS.find(b => rating <= b.maxRating)?.label ?? 'Claim non valide';
}

function isInDeadZone(rating) {
  return rating >= DEAD_ZONE.min && rating <= DEAD_ZONE.max;
}

module.exports = {
  BASE_K,
  K_FACTOR_MULTIPLIERS,
  DEAD_ZONE,
  LLM_ROUTING,
  SCAFFOLD_LEVELS,
  CHALLENGE_STYLES,
  BLOCKED_REASONS,
  BLOCKED_LABELS,
  TILT_THRESHOLD,
  INTERVENTION_RATING,
  INITIAL_RATING,
  INITIAL_RD,
  DECLARED_EXPERTISE_RATINGS,
  getKFactor,
  getScaffoldLevel,
  getChallengeStyle,
  getBlockedLabel,
  isInDeadZone
};
