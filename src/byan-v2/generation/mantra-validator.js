const fs = require('fs');
const path = require('path');

class MantraValidator {
  constructor(mantrasData = null) {
    if (mantrasData) {
      this.mantrasData = mantrasData;
    } else {
      const mantrasPath = path.join(__dirname, '../data/mantras.json');
      this.mantrasData = JSON.parse(fs.readFileSync(mantrasPath, 'utf8'));
    }
    
    this.mantras = this.mantrasData.mantras;
    this.results = null;
    this.agentContent = null;
  }

  validate(agentDefinition) {
    if (agentDefinition === null || agentDefinition === undefined) {
      throw new Error('Agent definition is required');
    }

    this.agentContent = typeof agentDefinition === 'string' 
      ? agentDefinition 
      : JSON.stringify(agentDefinition);

    this.results = {
      totalMantras: this.mantras.length,
      compliant: [],
      nonCompliant: [],
      warnings: [],
      errors: [],
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();

    for (const mantra of this.mantras) {
      const result = this.checkMantra(mantra.id, agentDefinition);
      
      if (result.compliant) {
        this.results.compliant.push({
          id: mantra.id,
          title: mantra.title,
          priority: mantra.priority
        });
      } else {
        this.results.nonCompliant.push({
          id: mantra.id,
          title: mantra.title,
          priority: mantra.priority,
          reason: result.reason
        });

        if (mantra.priority === 'critical') {
          this.results.errors.push(`Critical mantra ${mantra.id} not met: ${mantra.title}`);
        } else if (mantra.priority === 'high') {
          this.results.warnings.push(`High priority mantra ${mantra.id} not met: ${mantra.title}`);
        }
      }
    }

    this.results.executionTimeMs = Date.now() - startTime;
    this.results.score = this.calculateScore();

    return this.results;
  }

  checkMantra(mantraId, agentDefinition = null) {
    const mantra = this.mantras.find(m => m.id === mantraId);
    
    if (!mantra) {
      return { compliant: false, reason: 'Mantra not found' };
    }

    const content = agentDefinition 
      ? (typeof agentDefinition === 'string' ? agentDefinition : JSON.stringify(agentDefinition))
      : this.agentContent;

    if (!content) {
      return { compliant: false, reason: 'No agent content to validate' };
    }

    const validation = mantra.validation;

    if (validation.type === 'keyword') {
      return this._validateKeywords(content, validation, mantra);
    } else if (validation.type === 'pattern') {
      return this._validatePattern(content, validation, mantra);
    } else if (validation.type === 'coverage') {
      return this._validateCoverage(content, validation, mantra);
    }

    return { compliant: false, reason: 'Unknown validation type' };
  }

  _validateKeywords(content, validation, mantra) {
    const contentLower = content.toLowerCase();
    const keywordsFound = validation.keywords.filter(keyword => 
      contentLower.includes(keyword.toLowerCase())
    );

    const isCompliant = keywordsFound.length > 0;

    if (!isCompliant && validation.required) {
      return {
        compliant: false,
        reason: `Required keywords not found: ${validation.keywords.join(', ')}`
      };
    }

    return {
      compliant: isCompliant,
      reason: isCompliant 
        ? `Keywords found: ${keywordsFound.join(', ')}` 
        : 'Optional keywords not found'
    };
  }

  _validatePattern(content, validation, mantra) {
    try {
      const regex = new RegExp(validation.pattern, validation.flags || '');
      const matches = content.match(regex);
      const hasMatches = matches && matches.length > 0;

      if (validation.mustNotMatch) {
        const isCompliant = !hasMatches;
        return {
          compliant: isCompliant,
          reason: isCompliant 
            ? 'Pattern correctly not found' 
            : `Forbidden pattern found: ${matches ? matches[0] : 'match'}`
        };
      } else {
        return {
          compliant: hasMatches,
          reason: hasMatches 
            ? `Pattern matched ${matches.length} times` 
            : 'Required pattern not found'
        };
      }
    } catch (error) {
      return {
        compliant: false,
        reason: `Pattern validation error: ${error.message}`
      };
    }
  }

  _validateCoverage(content, validation, mantra) {
    const coverageMatch = content.match(/coverage[:\s]+(\d+(?:\.\d+)?)%?/i);
    
    if (!coverageMatch) {
      return {
        compliant: false,
        reason: 'No coverage information found'
      };
    }

    const coverage = parseFloat(coverageMatch[1]);
    const isCompliant = coverage >= validation.threshold;

    return {
      compliant: isCompliant,
      reason: isCompliant 
        ? `Coverage ${coverage}% meets threshold ${validation.threshold}%` 
        : `Coverage ${coverage}% below threshold ${validation.threshold}%`
    };
  }

  calculateScore() {
    if (!this.results) {
      return 0;
    }

    const compliantCount = this.results.compliant.length;
    const totalCount = this.results.totalMantras;

    return totalCount > 0 
      ? Math.round((compliantCount / totalCount) * 100) 
      : 0;
  }

  getMissingMantras() {
    if (!this.results) {
      return [];
    }

    return this.results.nonCompliant.map(nc => {
      const mantra = this.mantras.find(m => m.id === nc.id);
      return {
        id: nc.id,
        title: nc.title,
        description: mantra ? mantra.description : '',
        priority: nc.priority,
        reason: nc.reason
      };
    });
  }

  getCompliantMantras() {
    if (!this.results) {
      return [];
    }

    return this.results.compliant.map(c => {
      const mantra = this.mantras.find(m => m.id === c.id);
      return {
        id: c.id,
        title: c.title,
        description: mantra ? mantra.description : '',
        priority: c.priority
      };
    });
  }

  generateReport() {
    if (!this.results) {
      return 'No validation results available. Run validate() first.';
    }

    const score = this.results.score;
    const level = score >= 80 ? 'PASS' : score >= 60 ? 'WARNING' : 'FAIL';

    let report = '';
    report += '='.repeat(60) + '\n';
    report += 'MANTRA VALIDATION REPORT\n';
    report += '='.repeat(60) + '\n\n';
    report += `Validation Date: ${this.results.timestamp}\n`;
    report += `Execution Time: ${this.results.executionTimeMs}ms\n`;
    report += `Status: ${level}\n`;
    report += `Score: ${score}% (${this.results.compliant.length}/${this.results.totalMantras})\n\n`;

    report += '-'.repeat(60) + '\n';
    report += 'COMPLIANCE SUMMARY\n';
    report += '-'.repeat(60) + '\n';
    report += `Compliant Mantras: ${this.results.compliant.length}\n`;
    report += `Non-Compliant Mantras: ${this.results.nonCompliant.length}\n`;
    report += `Critical Errors: ${this.results.errors.length}\n`;
    report += `Warnings: ${this.results.warnings.length}\n\n`;

    if (this.results.errors.length > 0) {
      report += '-'.repeat(60) + '\n';
      report += 'CRITICAL ERRORS\n';
      report += '-'.repeat(60) + '\n';
      this.results.errors.forEach(error => {
        report += `- ${error}\n`;
      });
      report += '\n';
    }

    if (this.results.warnings.length > 0) {
      report += '-'.repeat(60) + '\n';
      report += 'WARNINGS\n';
      report += '-'.repeat(60) + '\n';
      this.results.warnings.forEach(warning => {
        report += `- ${warning}\n`;
      });
      report += '\n';
    }

    const missing = this.getMissingMantras();
    if (missing.length > 0) {
      report += '-'.repeat(60) + '\n';
      report += 'MISSING MANTRAS\n';
      report += '-'.repeat(60) + '\n';
      
      const criticalMissing = missing.filter(m => m.priority === 'critical');
      const highMissing = missing.filter(m => m.priority === 'high');
      const otherMissing = missing.filter(m => m.priority !== 'critical' && m.priority !== 'high');

      if (criticalMissing.length > 0) {
        report += '\nCRITICAL PRIORITY:\n';
        criticalMissing.forEach(m => {
          report += `  ${m.id} - ${m.title}\n`;
          report += `    Reason: ${m.reason}\n`;
        });
      }

      if (highMissing.length > 0) {
        report += '\nHIGH PRIORITY:\n';
        highMissing.forEach(m => {
          report += `  ${m.id} - ${m.title}\n`;
          report += `    Reason: ${m.reason}\n`;
        });
      }

      if (otherMissing.length > 0) {
        report += '\nOTHER:\n';
        otherMissing.forEach(m => {
          report += `  ${m.id} - ${m.title}\n`;
        });
      }
      report += '\n';
    }

    report += '='.repeat(60) + '\n';

    return report;
  }

  suggestImprovements() {
    if (!this.results) {
      return [];
    }

    const suggestions = [];
    const missing = this.getMissingMantras();

    const criticalMissing = missing.filter(m => m.priority === 'critical');
    if (criticalMissing.length > 0) {
      suggestions.push({
        priority: 'critical',
        category: 'Critical Improvements',
        items: criticalMissing.map(m => ({
          mantra: m.id,
          title: m.title,
          suggestion: this._getSuggestionForMantra(m)
        }))
      });
    }

    const highMissing = missing.filter(m => m.priority === 'high');
    if (highMissing.length > 0) {
      suggestions.push({
        priority: 'high',
        category: 'High Priority Improvements',
        items: highMissing.map(m => ({
          mantra: m.id,
          title: m.title,
          suggestion: this._getSuggestionForMantra(m)
        }))
      });
    }

    const mediumMissing = missing.filter(m => m.priority === 'medium');
    if (mediumMissing.length > 0 && mediumMissing.length <= 5) {
      suggestions.push({
        priority: 'medium',
        category: 'Quick Wins',
        items: mediumMissing.slice(0, 5).map(m => ({
          mantra: m.id,
          title: m.title,
          suggestion: this._getSuggestionForMantra(m)
        }))
      });
    }

    return suggestions;
  }

  _getSuggestionForMantra(mantra) {
    const mantraData = this.mantras.find(m => m.id === mantra.id);
    
    if (!mantraData) {
      return 'Review mantra requirements and update agent definition';
    }

    const validation = mantraData.validation;

    if (validation.type === 'keyword') {
      return `Include one or more of these keywords: ${validation.keywords.join(', ')}`;
    } else if (validation.type === 'pattern') {
      if (validation.mustNotMatch) {
        return `Remove forbidden patterns matching: ${validation.pattern}`;
      } else {
        return `Add content matching pattern: ${validation.pattern}`;
      }
    } else if (validation.type === 'coverage') {
      return `Increase test coverage to at least ${validation.threshold}%`;
    }

    return mantraData.description;
  }

  export(format = 'json') {
    if (!this.results) {
      throw new Error('No validation results available. Run validate() first.');
    }

    if (format === 'json') {
      return JSON.stringify({
        ...this.results,
        missingMantras: this.getMissingMantras(),
        suggestions: this.suggestImprovements()
      }, null, 2);
    } else if (format === 'text') {
      return this.generateReport();
    } else if (format === 'summary') {
      return {
        score: this.results.score,
        status: this.results.score >= 80 ? 'PASS' : this.results.score >= 60 ? 'WARNING' : 'FAIL',
        compliant: this.results.compliant.length,
        nonCompliant: this.results.nonCompliant.length,
        criticalErrors: this.results.errors.length,
        executionTimeMs: this.results.executionTimeMs
      };
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  getMantraById(mantraId) {
    return this.mantras.find(m => m.id === mantraId);
  }

  getMantrasByCategory(category) {
    return this.mantras.filter(m => m.category === category);
  }

  getMantrasByPriority(priority) {
    return this.mantras.filter(m => m.priority === priority);
  }
}

module.exports = MantraValidator;
