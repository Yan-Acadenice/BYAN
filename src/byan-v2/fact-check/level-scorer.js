/**
 * LevelScorer - Scores a fact's confidence based on its proof level
 * 
 * LEVEL-1 : Official spec / RFC / Primary documentation  → 95
 * LEVEL-2 : Reproducible benchmark / Executable code     → 80
 * LEVEL-3 : Peer-reviewed article / Independent source   → 65
 * LEVEL-4 : Community consensus (> 1000 votes)           → 50
 * LEVEL-5 : Opinion / Personal experience                → 20
 */

const LEVEL_SCORES = { 1: 95, 2: 80, 3: 65, 4: 50, 5: 20 };

const STRICT_DOMAIN_MIN_LEVEL = {
  security:    2,
  performance: 2,
  compliance:  1
};

class LevelScorer {
  score(level) {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      throw new Error('Level must be an integer between 1 and 5');
    }
    return LEVEL_SCORES[level];
  }

  isBlockedInDomain(level, domain) {
    const minLevel = STRICT_DOMAIN_MIN_LEVEL[domain];
    if (!minLevel) return false;
    return level > minLevel;
  }

  describeLevel(level) {
    const descriptions = {
      1: 'Official spec / RFC / Primary documentation',
      2: 'Reproducible benchmark / Executable proof',
      3: 'Peer-reviewed / Independent source',
      4: 'Community consensus',
      5: 'Opinion / Personal experience'
    };
    return descriptions[level] || 'Unknown level';
  }
}

module.exports = LevelScorer;
