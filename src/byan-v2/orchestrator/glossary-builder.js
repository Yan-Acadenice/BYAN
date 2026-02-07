/**
 * GlossaryBuilder - Interactive business glossary creation
 * Mantra #33: Data Dictionary First
 * 
 * Principles: KISS, DRY, SOLID
 */

const Logger = require('../observability/logger');

class GlossaryBuilder {
  constructor(sessionState, logger = null) {
    this.sessionState = sessionState;
    this.logger = logger || new Logger('glossary-builder');
    this.concepts = [];
    this.minConcepts = 5;
    this.minDefinitionLength = 20;
    this.clarityThreshold = 0.7;
  }

  start() {
    this.logger.info('Starting glossary creation');
    
    return {
      prompt: "Let's build a business glossary - a shared vocabulary that ensures clear communication.",
      instructions: [
        `I need at least ${this.minConcepts} core concepts from your domain.`,
        'For each concept, provide:',
        '  - Name (e.g., "order", "customer", "product")',
        '  - Clear definition (minimum 20 characters)',
        '  - Examples are helpful but not required',
        '',
        'I will validate each definition and suggest related concepts you might have missed.'
      ].join('\n')
    };
  }

  addConcept(name, definition) {
    const validatedName = this._validateName(name);
    if (!validatedName.valid) {
      return { valid: false, issues: validatedName.issues };
    }

    // Check for duplicates
    if (this.concepts.some(c => c.name === validatedName.normalized)) {
      return { valid: false, issues: ['Concept already exists'] };
    }

    const validatedDef = this.validateDefinition(definition);
    if (!validatedDef.valid) {
      return { 
        valid: false, 
        issues: validatedDef.issues,
        challenge: this.challengeDefinition(definition)
      };
    }

    const concept = {
      name: validatedName.normalized,
      definition: definition.trim(),
      clarityScore: validatedDef.clarityScore,
      relatedConcepts: [],
      addedAt: new Date().toISOString()
    };

    this.concepts.push(concept);
    this.logger.info('Concept added', { name: concept.name, clarityScore: concept.clarityScore });

    const suggestions = this.suggestRelatedConcepts(this.concepts);

    return {
      valid: true,
      concept,
      suggestions,
      progress: `${this.concepts.length}/${this.minConcepts} concepts`
    };
  }

  validateDefinition(definition) {
    const issues = [];
    
    if (!definition || typeof definition !== 'string') {
      return { valid: false, clarityScore: 0, issues: ['Definition is required'] };
    }

    const trimmed = definition.trim();
    
    if (trimmed.length < this.minDefinitionLength) {
      issues.push(`Definition too short (min ${this.minDefinitionLength} characters)`);
    }

    const clarityScore = this._calculateClarityScore(trimmed);
    
    if (clarityScore < this.clarityThreshold) {
      issues.push('Definition is too vague or ambiguous');
    }

    return {
      valid: issues.length === 0,
      clarityScore,
      issues
    };
  }

  _calculateClarityScore(definition) {
    let score = 0;
    let weights = 0;

    const lengthScore = this._calculateLengthScore(definition.length);
    score += lengthScore * 0.3;
    weights += 0.3;

    const specificityScore = this._calculateSpecificityScore(definition);
    score += specificityScore * 0.3;
    weights += 0.3;

    const exampleScore = this._hasExamples(definition) ? 1.0 : 0.0;
    score += exampleScore * 0.2;
    weights += 0.2;

    const ambiguityPenalty = this._calculateAmbiguityPenalty(definition);
    score += ambiguityPenalty * 0.2;
    weights += 0.2;

    return Math.max(0, Math.min(1, score / weights));
  }

  _calculateLengthScore(length) {
    if (length < 20) return 0.0;
    if (length >= 50 && length <= 200) return 1.0;
    if (length > 200) return 0.5;
    return length / 50;
  }

  _calculateSpecificityScore(definition) {
    const specificTerms = [
      'when', 'after', 'before', 'contains', 'includes',
      'must', 'should', 'can', 'will', 'has', 'is',
      'created', 'updated', 'deleted', 'processed'
    ];
    
    const lowerDef = definition.toLowerCase();
    const foundTerms = specificTerms.filter(term => lowerDef.includes(term));
    
    return Math.min(1.0, foundTerms.length / 3);
  }

  _hasExamples(definition) {
    const exampleIndicators = ['e.g.', 'example:', 'for example', 'such as', 'like'];
    const lowerDef = definition.toLowerCase();
    return exampleIndicators.some(indicator => lowerDef.includes(indicator));
  }

  _calculateAmbiguityPenalty(definition) {
    const ambiguousTerms = ['maybe', 'could be', 'sometimes', 'might', 'possibly', 'perhaps'];
    const lowerDef = definition.toLowerCase();
    const ambiguousCount = ambiguousTerms.filter(term => lowerDef.includes(term)).length;
    
    return Math.max(0, 1.0 - (ambiguousCount * 0.3));
  }

  challengeDefinition(definition) {
    const suggestions = [
      'Specify what makes it unique',
      'Add concrete examples',
      'Describe the boundaries or constraints',
      'Explain relationships to other concepts'
    ];

    // Check length first (most specific)
    if (definition.length < 30) {
      return {
        reason: 'Definition is too vague and needs more detail',
        suggestions: ['Expand on the definition with more context', ...suggestions]
      };
    }

    // Then check for ambiguous terms
    const ambiguousTerms = ['maybe', 'could be', 'sometimes', 'might', 'possibly', 'perhaps'];
    const lowerDef = definition.toLowerCase();
    if (ambiguousTerms.some(term => lowerDef.includes(term))) {
      return {
        reason: 'Definition contains ambiguous terms',
        suggestions: ['Remove uncertain language', 'Be more precise', ...suggestions]
      };
    }

    // Then check for examples
    if (!this._hasExamples(definition)) {
      return {
        reason: 'Definition lacks concrete examples',
        suggestions: ['Provide a concrete example', ...suggestions]
      };
    }

    const challenges = [
      'Can you be more specific about when or how this is used?',
      'What distinguishes this from related concepts?',
      'What are the key characteristics that define this?',
      'When does something become this vs something else?'
    ];

    return {
      reason: 'Definition could be clearer',
      suggestions: [challenges[Math.floor(Math.random() * challenges.length)], ...suggestions]
    };
  }

  suggestRelatedConcepts(existingConcepts) {
    if (existingConcepts.length === 0) return [];

    const domainPatterns = {
      ecommerce: {
        triggers: ['order', 'product', 'cart', 'customer', 'payment'],
        suggestions: [
          { name: 'inventory', rationale: 'Track product availability and stock levels' },
          { name: 'shipping', rationale: 'Manage delivery and logistics for orders' },
          { name: 'discount', rationale: 'Apply promotional pricing to products' },
          { name: 'refund', rationale: 'Process returns and money back to customers' },
          { name: 'checkout', rationale: 'Complete the purchase transaction' }
        ]
      },
      finance: {
        triggers: ['account', 'transaction', 'balance', 'transfer', 'payment'],
        suggestions: [
          { name: 'reconciliation', rationale: 'Match transactions with bank records' },
          { name: 'statement', rationale: 'Summarize account activity' },
          { name: 'fee', rationale: 'Track service charges' },
          { name: 'interest', rationale: 'Calculate earnings on balances' },
          { name: 'deposit', rationale: 'Add funds to accounts' }
        ]
      },
      healthcare: {
        triggers: ['patient', 'appointment', 'prescription', 'diagnosis', 'treatment'],
        suggestions: [
          { name: 'medication', rationale: 'Prescribed drugs for treatment' },
          { name: 'provider', rationale: 'Healthcare professional giving care' },
          { name: 'insurance', rationale: 'Coverage for medical costs' },
          { name: 'record', rationale: 'Patient medical history' },
          { name: 'visit', rationale: 'Patient-provider encounter' }
        ]
      },
      software: {
        triggers: ['user', 'session', 'authentication', 'authorization', 'role'],
        suggestions: [
          { name: 'permission', rationale: 'Access rights to features' },
          { name: 'token', rationale: 'Credential for API access' },
          { name: 'profile', rationale: 'User information and preferences' },
          { name: 'settings', rationale: 'User configuration options' },
          { name: 'notification', rationale: 'Alert user of events' }
        ]
      }
    };

    const existingNames = existingConcepts.map(c => c.name.toLowerCase());
    
    for (const [domain, pattern] of Object.entries(domainPatterns)) {
      const matchCount = pattern.triggers.filter(t => existingNames.includes(t)).length;
      
      if (matchCount >= 2) {
        const suggestions = pattern.suggestions
          .filter(s => !existingNames.includes(s.name))
          .slice(0, 5);
        
        if (suggestions.length > 0) {
          this.logger.info('Domain detected', { domain, suggestions: suggestions.map(s => s.name) });
          return suggestions;
        }
      }
    }

    return [];
  }

  isComplete() {
    if (this.concepts.length < this.minConcepts) {
      return false;
    }

    const validConcepts = this.concepts.filter(c => c.clarityScore >= this.clarityThreshold);
    return validConcepts.length >= this.minConcepts;
  }

  getConceptCount() {
    return this.concepts.length;
  }

  getConcepts() {
    return [...this.concepts];
  }

  getCompletionStatus() {
    return {
      current: this.concepts.length,
      required: this.minConcepts,
      percentage: Math.round((this.concepts.length / this.minConcepts) * 100),
      complete: this.isComplete()
    };
  }

  _shouldTriggerForDomain(sessionData) {
    if (!sessionData || !sessionData.domain) {
      return false;
    }
    
    const supportedDomains = ['ecommerce', 'finance', 'healthcare', 'software'];
    return supportedDomains.includes(sessionData.domain.toLowerCase());
  }

  getDomainSuggestions(domain) {
    const domainSuggestions = {
      ecommerce: ['order', 'product', 'cart', 'customer', 'payment', 'inventory', 'shipping'],
      finance: ['account', 'transaction', 'balance', 'transfer', 'payment', 'reconciliation'],
      healthcare: ['patient', 'appointment', 'prescription', 'diagnosis', 'treatment', 'medication'],
      software: ['user', 'session', 'authentication', 'authorization', 'role', 'permission']
    };

    return domainSuggestions[domain.toLowerCase()] || [];
  }

  export() {
    const domain = this._detectDomain();
    
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      domain,
      conceptCount: this.concepts.length,
      concepts: this.concepts.map(c => ({
        name: c.name,
        definition: c.definition,
        clarityScore: c.clarityScore,
        addedAt: c.addedAt
      })),
      metadata: {
        totalConcepts: this.concepts.length,
        complete: this.isComplete(),
        minRequired: this.minConcepts
      }
    };
  }

  exportAsMarkdown() {
    const domain = this._detectDomain();
    const lines = [
      '# Business Glossary',
      '',
      `**Domain:** ${domain}`,
      `**Concepts:** ${this.concepts.length}`,
      `**Status:** ${this.isComplete() ? 'Complete' : 'In Progress'}`,
      '',
      '---',
      ''
    ];

    this.concepts.forEach(concept => {
      lines.push(`## ${concept.name}`);
      lines.push('');
      lines.push(concept.definition);
      lines.push('');
      lines.push(`*Clarity Score: ${concept.clarityScore.toFixed(2)}*`);
      lines.push('');
    });

    return lines.join('\n');
  }

  exportAsJSON() {
    return JSON.stringify(this.export(), null, 2);
  }

  _detectDomain() {
    const conceptNames = this.concepts.map(c => c.name.toLowerCase());
    
    const domainKeywords = {
      ecommerce: ['order', 'product', 'cart', 'customer', 'payment', 'shipping'],
      finance: ['account', 'transaction', 'balance', 'payment', 'transfer'],
      healthcare: ['patient', 'appointment', 'prescription', 'diagnosis'],
      software: ['user', 'session', 'authentication', 'role', 'permission']
    };

    let maxMatch = 0;
    let detectedDomain = 'general';

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const matchCount = keywords.filter(k => conceptNames.includes(k)).length;
      if (matchCount > maxMatch) {
        maxMatch = matchCount;
        detectedDomain = domain;
      }
    }

    return maxMatch >= 2 ? detectedDomain : 'general';
  }

  _validateName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, issues: ['Name is required'] };
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { valid: false, issues: ['Name is required'] };
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, '-');
    
    // Allow alphanumeric and hyphens, must start with letter
    if (!/^[a-z]/.test(normalized)) {
      return { 
        valid: false, 
        issues: ['Name must start with a letter'] 
      };
    }

    // Check for invalid characters (allow letters, numbers, hyphens)
    if (!/^[a-z][a-z0-9-]*$/.test(normalized)) {
      return { 
        valid: false, 
        issues: ['Name contains invalid characters. Use only letters, numbers, and hyphens'] 
      };
    }

    if (this.concepts.some(c => c.name === normalized)) {
      return { valid: false, issues: ['Concept already exists'] };
    }

    return { valid: true, normalized };
  }
}

module.exports = GlossaryBuilder;
