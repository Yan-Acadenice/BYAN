/**
 * challenge-evaluator.js — Decides HOW to challenge a claim based on ELO context
 *
 * Does NOT decide if a claim is true or false (that's the LLM's job).
 * Returns challenge configuration: scaffold level, style, flags, LLM instructions.
 */

const config = require('./domain-config');

class ChallengeEvaluator {
  /**
   * Build the challenge context for a given domain/rating.
   * Called BEFORE the LLM evaluates the claim.
   *
   * @param {string} domain
   * @param {object} domainProfile - from EloStore.getDomain()
   * @returns {ChallengeContext}
   */
  evaluateContext(domain, domainProfile) {
    const rating  = domainProfile.rating ?? config.INITIAL_RATING;
    const scaffold = config.getScaffoldLevel(rating);
    const style    = config.getChallengeStyle(rating);
    const inDeadZone    = config.isInDeadZone(rating);
    const firstBlood    = !domainProfile.first_claim_made;
    const tiltDetected  = (domainProfile.blocked_streak ?? 0) >= config.TILT_THRESHOLD;
    const shouldSoftChallenge = rating < 500 || inDeadZone;

    return {
      domain,
      rating,
      rd:               domainProfile.rd ?? config.INITIAL_RD,
      scaffoldLevel:    scaffold.level,
      scaffoldIncludes: scaffold.includes,
      challengeStyle:   style,
      shouldSoftChallenge,
      firstBlood,
      inDeadZone,
      tiltDetected,
      promptInstructions: this._buildPromptInstructions({
        scaffoldLevel: scaffold.level,
        scaffoldIncludes: scaffold.includes,
        style,
        shouldSoftChallenge,
        firstBlood,
        inDeadZone,
        tiltDetected,
        domain,
        rating
      })
    };
  }

  /**
   * Map a raw LLM evaluation outcome to a canonical result.
   * @param {'validated'|'blocked'|'partial'|'soft'} outcome
   * @returns {'VALIDATED'|'BLOCKED'|'PARTIALLY_VALID'|'SOFT_CHALLENGED'}
   */
  normalizeResult(outcome) {
    const map = {
      validated: 'VALIDATED',
      blocked:   'BLOCKED',
      partial:   'PARTIALLY_VALID',
      soft:      'SOFT_CHALLENGED'
    };
    return map[outcome?.toLowerCase()] ?? 'SOFT_CHALLENGED';
  }

  /**
   * Convert a canonical result to a numeric Glicko score.
   * @param {'VALIDATED'|'BLOCKED'|'PARTIALLY_VALID'|'SOFT_CHALLENGED'} result
   * @returns {number} 0 | 0.5 | 1
   */
  resultToScore(result) {
    switch (result) {
      case 'VALIDATED':       return 1;
      case 'PARTIALLY_VALID': return 0.5;
      case 'BLOCKED':         return 0;
      default:                return 0.5;  // neutral for soft challenges
    }
  }

  // --- Private ---

  _buildPromptInstructions({ scaffoldLevel, scaffoldIncludes, style, shouldSoftChallenge,
                              firstBlood, inDeadZone, tiltDetected, domain, rating }) {
    const lines = [];

    if (tiltDetected) {
      lines.push(`TILT_DETECTED: User has ${3}+ consecutive BLOCKED in ${domain}. Use maximum empathy. Suggest a pause before continuing.`);
    }

    if (firstBlood) {
      lines.push(`FIRST_BLOOD: This is the user's first claim in ${domain}. Always challenge regardless of global ELO. Zero Trust per domain.`);
    }

    if (shouldSoftChallenge) {
      lines.push(`SOFT_CHALLENGE: Do not BLOCK immediately. Ask "what led you to this conclusion?" first. Only BLOCK if the explanation reveals a real gap.`);
    }

    if (inDeadZone) {
      lines.push(`DEAD_ZONE: User is at ${rating} (450–550 Dunning-Kruger peak). Maximum nuance required. Challenge precisely.`);
    }

    lines.push(`CHALLENGE_STYLE: ${style.toUpperCase()}`);
    lines.push(`SCAFFOLD_LEVEL: ${scaffoldLevel} — include: [${scaffoldIncludes.join(', ')}]`);

    if (style === 'guide') {
      lines.push('TONE: Encourage and simplify. User is significantly below benchmark.');
    } else if (style === 'learner') {
      lines.push('TONE: Adopt learner mode. User may exceed your benchmark — ask questions.');
    } else if (style === 'peer') {
      lines.push('TONE: Peer-to-peer. Be technically precise and nuanced.');
    }

    lines.push('INVARIANT: Tone is always curious, never accusatory. No "That\'s wrong." Use "What led you to think...?" or "You\'re on the right track — the nuance is..."');

    return lines.join('\n');
  }
}

module.exports = ChallengeEvaluator;
