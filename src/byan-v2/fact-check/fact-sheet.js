/**
 * FactSheet - Generates a Markdown fact sheet from session facts
 */

const fs = require('fs');
const path = require('path');

class FactSheet {
  constructor(outputPath = '_byan-output/fact-sheets') {
    this.outputPath = outputPath;
  }

  generate(sessionId, facts) {
    if (!sessionId) throw new Error('sessionId is required');
    if (!facts || typeof facts !== 'object') throw new Error('facts must be an object');

    const { verified = [], claims = [], disputed = [], opinions = [] } = facts;
    const total = verified.length + claims.length + disputed.length + opinions.length;
    const sourced = verified.length + claims.length;
    const trustScore = total > 0 ? Math.round((sourced / total) * 100) : 100;

    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `# Fact Sheet — Session ${sessionId}`,
      `**Date :** ${date}`,
      `**Truth Score :** ${trustScore}% (${sourced}/${total} claims sourced)`,
      ''
    ];

    if (verified.length > 0) {
      lines.push('## Facts verifies par l\'utilisateur');
      verified.forEach(f => lines.push(`- [FACT USER-VERIFIED] ${f.claim}`));
      lines.push('');
    }

    if (claims.length > 0) {
      lines.push('## Claims sources (LEVEL-1 a LEVEL-3)');
      claims.forEach(f => {
        const src = f.source ? ` — ${f.source.url || f.source}` : '';
        const proof = f.proof ? ` — proof: ${f.proof.content || f.proof}` : '';
        lines.push(`- [CLAIM L${f.level || '?'}] ${f.claim}${src}${proof}`);
      });
      lines.push('');
    }

    if (disputed.length > 0) {
      lines.push('## Claims disputes (sources contradictoires)');
      disputed.forEach(f => lines.push(`- [DISPUTED] ${f.claim}`));
      lines.push('');
    }

    if (opinions.length > 0) {
      lines.push('## Opinions et hypotheses declarees');
      opinions.forEach(f => {
        const prefix = f.status === 'HYPOTHESIS' ? '[HYPOTHESIS]' : '[OPINION]';
        lines.push(`- ${prefix} ${f.claim}`);
      });
      lines.push('');
    }

    if (trustScore < 80) {
      lines.push('## Avertissement');
      lines.push(`Truth Score de ${trustScore}% — plus de ${100 - trustScore}% des assertions ne sont pas sourcees.`);
      lines.push('');
    }

    return lines.join('\n');
  }

  save(sessionId, facts) {
    const content = this.generate(sessionId, facts);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `session-${date}-${sessionId.slice(0, 8)}.md`;
    const fullPath = path.join(this.outputPath, filename);

    fs.mkdirSync(this.outputPath, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return fullPath;
  }
}

module.exports = FactSheet;
