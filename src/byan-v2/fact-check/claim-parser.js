/**
 * ClaimParser - Detects implicit claims in text using trigger patterns
 *
 * Auto-triggers fact-check when danger patterns are found :
 * absolute words, superlatives, unverified best practices, etc.
 */

const DEFAULT_PATTERNS = [
  /\b(toujours|jamais|forcement|evidemment|clairement)\b/i,
  /\b(always|never|obviously|clearly|certainly|definitely)\b/i,
  /\b(plus rapide|plus sur|mieux|optimal|meilleur|superieur)\b/i,
  /\b(faster|safer|better|optimal|superior|best)\b/i,
  /\b(il est bien connu que|tout le monde sait|generalement accepte)\b/i,
  /\b(it is well known that|everyone knows|generally accepted)\b/i,
  /\b(bonne pratique|best practice|standard de facto|industry standard)\b/i,
  /\b(prouve que|demontre que|il est clair que)\b/i,
  /\b(proven|demonstrates that|it is clear that)\b/i
];

class ClaimParser {
  constructor(customPatterns = []) {
    this.patterns = [
      ...DEFAULT_PATTERNS,
      ...customPatterns.map(p => new RegExp(p, 'i'))
    ];
  }

  parse(text) {
    if (typeof text !== 'string' || !text) return [];

    const detected = [];
    for (const pattern of this.patterns) {
      const match = pattern.exec(text);
      if (match) {
        detected.push({
          pattern: pattern.source,
          matched: match[0],
          position: match.index,
          excerpt: text.slice(Math.max(0, match.index - 30), match.index + 60).trim()
        });
      }
    }
    return detected;
  }

  containsClaim(text) {
    return this.parse(text).length > 0;
  }
}

module.exports = ClaimParser;
