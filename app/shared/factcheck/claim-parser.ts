// claim-parser.ts — repere des MOTIFS declencheurs dans un texte.
//
// Ligne rouge de ce module : il ne verifie aucun fait. Il signale des tours de
// phrase qui, par experience BYAN (.claude/rules/fact-check.md, section
// "Auto-detection patterns"), accompagnent souvent un claim non source — un
// mot absolu, un superlatif, un appel a l'autorite non cite. Un motif detecte
// est une invitation a demander la source, jamais une accusation de fausseté.
//
// Source : src/byan-v2/fact-check/claim-parser.js.

import type { DetectedPattern } from './types';

const DEFAULT_PATTERNS: readonly RegExp[] = [
  /\b(toujours|jamais|forcement|evidemment|clairement)\b/i,
  /\b(always|never|obviously|clearly|certainly|definitely)\b/i,
  /\b(plus rapide|plus sur|mieux|optimal|meilleur|superieur)\b/i,
  /\b(faster|safer|better|optimal|superior|best)\b/i,
  /\b(il est bien connu que|tout le monde sait|generalement accepte)\b/i,
  /\b(it is well known that|everyone knows|generally accepted)\b/i,
  /\b(bonne pratique|best practice|standard de facto|industry standard)\b/i,
  /\b(prouve que|demontre que|il est clair que)\b/i,
  /\b(proven|demonstrates that|it is clear that)\b/i,
];

// detectPatterns — rend, pour CHAQUE motif de la liste, sa premiere occurrence
// dans le texte (au plus une entree par motif ; un texte sans aucun motif rend
// un tableau vide). `extraPatterns` permet a l'appelant d'ajouter ses propres
// declencheurs sans remplacer la liste par defaut.
export function detectPatterns(text: string, extraPatterns: readonly RegExp[] = []): DetectedPattern[] {
  if (typeof text !== 'string' || !text) return [];
  const patterns = [...DEFAULT_PATTERNS, ...extraPatterns];
  const detected: DetectedPattern[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      detected.push({
        pattern: pattern.source,
        matched: match[0],
        position: match.index,
        excerpt: text.slice(Math.max(0, match.index - 30), match.index + 60).trim(),
      });
    }
  }
  return detected;
}

export function containsPattern(text: string, extraPatterns: readonly RegExp[] = []): boolean {
  return detectPatterns(text, extraPatterns).length > 0;
}
