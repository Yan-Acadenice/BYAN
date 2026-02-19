/**
 * pedagogy-layer.js — Bienveillant response formatting
 *
 * Transforms raw ELO events into human-readable, pedagogically sound messages.
 * Tone invariant: curiosity, never accusation.
 */

const { BLOCKED_REASONS, getBlockedLabel } = require('./domain-config');

const BLOCKED_REASON_MESSAGES = {
  [BLOCKED_REASONS.TERMINOLOGY_GAP]: {
    label: 'terminologie',
    prompt: "Tu utilises le bon concept mais avec le mauvais mot. Voici la terminologie exacte, et pourquoi elle compte :"
  },
  [BLOCKED_REASONS.PREREQUISITE_GAP]: {
    label: 'prerequis manquant',
    prompt: "Ce concept s'appuie sur une base que l'on n'a pas encore vue ensemble. Voici ce qui manque :"
  },
  [BLOCKED_REASONS.CONTEXT_MISMATCH]: {
    label: 'mismatch de contexte',
    prompt: "C'est vrai dans un certain contexte — pas dans le tien. Voici ce qui change :"
  },
  [BLOCKED_REASONS.OUTDATED_KNOWLEDGE]: {
    label: 'connaissance perimee',
    prompt: "C'etait correct avant — voici ce qui a change depuis :"
  },
  [BLOCKED_REASONS.LAZY_CLAIM]: {
    label: 'raisonnement incomplet',
    prompt: "Tu as la premiere couche. La couche suivante, c'est ce qui fait toute la difference :"
  },
  [BLOCKED_REASONS.OVERCONFIDENCE]: {
    label: 'overconfidence partielle',
    prompt: "L'essentiel est correct. Voici le cas limite que 80% des praticiens manquent :"
  }
};

class PedagogyLayer {
  /**
   * Format a BLOCKED result into a bienveillant, targeted response.
   * @param {string} blockedReason - one of BLOCKED_REASONS values
   * @param {number} rating        - current domain rating
   * @param {string} domain
   * @returns {{ label, opening, blockedReasonLabel }}
   */
  formatBlocked(blockedReason, rating, domain) {
    const label  = getBlockedLabel(rating);
    const reason = BLOCKED_REASON_MESSAGES[blockedReason] ?? BLOCKED_REASON_MESSAGES[BLOCKED_REASONS.LAZY_CLAIM];

    return {
      label,
      opening:            reason.prompt,
      blockedReasonLabel: reason.label
    };
  }

  /**
   * Format a VALIDATED result with growth narrative.
   * @param {number} newRating
   * @param {number} delta
   * @param {string} domain
   * @param {Array}  history - domain history array
   * @returns {{ message }}
   */
  formatValidated(newRating, delta, domain, history = []) {
    const prevRating = newRating - delta;
    const weekAgo = this._ratingNWeeksAgo(history, 3);

    if (weekAgo !== null && weekAgo < prevRating) {
      return {
        message: `Tu etais a ${weekAgo} en ${domain} il y a quelques semaines. Tu es a ${newRating} maintenant (+${delta} sur ce claim). La progression est reelle.`
      };
    }

    if (delta > 0) {
      return { message: `[${domain}] +${delta} pts → ${newRating}. Ce claim confirme ta maitrise.` };
    }

    return { message: `[${domain}] Claim valide. Score stable a ${newRating}.` };
  }

  /**
   * Format a tilt intervention message.
   * @param {string} domain
   * @param {number} streakCount
   * @returns {string}
   */
  formatTiltIntervention(domain, streakCount) {
    return `Je remarque ${streakCount} claims bloques consecutivement en ${domain}. Ce n'est pas un probleme — c'est souvent la zone ou les concepts commencent vraiment a se lier. Tu veux qu'on reprenne un concept de base ensemble, ou tu preferes continuer ?`;
  }

  /**
   * Format the ELO 0 intervention.
   * @param {string} domain
   * @returns {string}
   */
  formatZeroIntervention(domain) {
    return `Ton score en ${domain} est a 0 apres plusieurs sessions. Je te propose 5 questions de calibration pour identifier exactement ou construire la base — pas une punition, juste un point de depart solide.`;
  }

  /**
   * Format the full [ELO] dashboard: why + how.
   * @param {string} domain
   * @param {object} domainProfile - from EloStore.getDomain()
   * @returns {string} formatted dashboard text
   */
  formatDashboard(domain, domainProfile) {
    const { rating, rd, history = [], blocked_streak, consecutive_correct } = domainProfile;
    const recent = history.slice(-10);

    // Aggregate blocked reasons
    const reasonCounts = {};
    for (const h of recent) {
      if (h.result === 'BLOCKED' && h.blocked_reason) {
        reasonCounts[h.blocked_reason] = (reasonCounts[h.blocked_reason] || 0) + 1;
      }
    }

    const weekDelta = this._deltaOverHistory(recent, 7);
    const trend = weekDelta > 5 ? `↑ +${weekDelta}` : weekDelta < -5 ? `↓ ${weekDelta}` : `→ ${weekDelta >= 0 ? '+' : ''}${weekDelta}`;

    const lines = [
      `Domaine: ${domain} | Score: ${rating} | RD: ${rd} | Tendance: ${trend}`,
      ''
    ];

    if (Object.keys(reasonCounts).length > 0) {
      lines.push('Pourquoi ce score ?');
      for (const [reason, count] of Object.entries(reasonCounts)) {
        const meta = BLOCKED_REASON_MESSAGES[reason];
        lines.push(`  - ${count}× ${meta?.label ?? reason}`);
      }
      lines.push('');
    }

    lines.push('Prochaines etapes :');
    if (rating < 200) {
      lines.push(`  Les fondamentaux de ${domain} sont le bon point de depart.`);
    } else if (rating < 500) {
      lines.push(`  Les cas limites et contextes specifiques sont ce qui fait progresser ici.`);
    } else {
      lines.push(`  Pour progresser, joue des claims difficiles — les evidents ne font plus bouger le score.`);
    }

    if (rd > 150) {
      lines.push(`  (RD eleve = score incertain — quelques sessions de plus pour le stabiliser)`);
    }

    return lines.join('\n');
  }

  // --- Private ---

  _ratingNWeeksAgo(history, weeks) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);
    const old = history.filter(h => new Date(h.date) < cutoff);
    if (!old.length) return null;
    return old.reduce((sum, h) => sum - (h.delta || 0), history.reduce((sum, h) => sum + (h.delta || 0), 0));
  }

  _deltaOverHistory(history, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return history
      .filter(h => new Date(h.date) >= cutoff)
      .reduce((sum, h) => sum + (h.delta || 0), 0);
  }
}

module.exports = PedagogyLayer;
