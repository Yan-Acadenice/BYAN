const MantraValidator = require('../../../src/byan-v2/generation/mantra-validator');
const fs = require('fs');
const path = require('path');

describe('MantraValidator', () => {
  let validator;
  let sampleCompliantAgent;
  let sampleNonCompliantAgent;

  beforeEach(() => {
    validator = new MantraValidator();
    
    sampleCompliantAgent = {
      name: 'test-agent',
      description: 'Test agent with owner and responsibility',
      responsable: 'John Doe',
      actor: 'Developer',
      measurable: 'Code quality improved by 50%',
      story: 'As a developer',
      task: 'Implement feature',
      epic: 'Project delivery',
      test: 'Unit tests included',
      acceptance: 'All tests pass',
      README: 'Getting started guide',
      verify: 'Validation complete',
      validate: 'Output verified',
      fact: 'Based on evidence'
    };

    sampleNonCompliantAgent = {
      name: 'bad-agent',
      description: 'Missing critical fields'
    };
  });

  describe('constructor', () => {
    test('loads mantras data from file by default', () => {
      const validator = new MantraValidator();
      expect(validator.mantras).toBeDefined();
      expect(validator.mantras.length).toBe(64);
    });

    test('accepts custom mantras data', () => {
      const customData = {
        mantras: [
          {
            id: 'TEST-1',
            number: 1,
            category: 'test',
            title: 'Test Mantra',
            description: 'Test description',
            validation: {
              type: 'keyword',
              keywords: ['test'],
              required: true
            },
            priority: 'high'
          }
        ]
      };
      
      const customValidator = new MantraValidator(customData);
      expect(customValidator.mantras.length).toBe(1);
      expect(customValidator.mantras[0].id).toBe('TEST-1');
    });

    test('initializes results as null', () => {
      expect(validator.results).toBeNull();
    });
  });

  describe('validate', () => {
    test('validates compliant agent successfully', () => {
      const results = validator.validate(sampleCompliantAgent);
      
      expect(results).toBeDefined();
      expect(results.totalMantras).toBe(64);
      expect(results.compliant).toBeInstanceOf(Array);
      expect(results.nonCompliant).toBeInstanceOf(Array);
      expect(results.score).toBeGreaterThan(0);
    });

    test('validates non-compliant agent', () => {
      const results = validator.validate(sampleNonCompliantAgent);
      
      expect(results).toBeDefined();
      expect(results.score).toBeLessThan(50);
      expect(results.nonCompliant.length).toBeGreaterThan(results.compliant.length);
    });

    test('validates string content', () => {
      const stringAgent = JSON.stringify(sampleCompliantAgent);
      const results = validator.validate(stringAgent);
      
      expect(results).toBeDefined();
      expect(results.compliant.length).toBeGreaterThan(0);
    });

    test('throws error if no agent definition provided', () => {
      expect(() => validator.validate(null)).toThrow('Agent definition is required');
    });

    test('includes timestamp in results', () => {
      const results = validator.validate(sampleCompliantAgent);
      
      expect(results.timestamp).toBeDefined();
      expect(new Date(results.timestamp)).toBeInstanceOf(Date);
    });

    test('includes execution time in results', () => {
      const results = validator.validate(sampleCompliantAgent);
      
      expect(results.executionTimeMs).toBeDefined();
      expect(typeof results.executionTimeMs).toBe('number');
      expect(results.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('identifies critical errors', () => {
      const results = validator.validate(sampleNonCompliantAgent);
      
      expect(results.errors).toBeInstanceOf(Array);
      expect(results.errors.length).toBeGreaterThan(0);
    });

    test('identifies warnings', () => {
      const results = validator.validate(sampleNonCompliantAgent);
      
      expect(results.warnings).toBeInstanceOf(Array);
    });

    test('completes validation within performance threshold', () => {
      const startTime = Date.now();
      validator.validate(sampleCompliantAgent);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(200);
    });
  });

  describe('checkMantra', () => {
    test('checks individual mantra by id', () => {
      validator.validate(sampleCompliantAgent);
      const result = validator.checkMantra('M1');
      
      expect(result).toBeDefined();
      expect(result.compliant).toBeDefined();
      expect(typeof result.compliant).toBe('boolean');
    });

    test('returns false for non-existent mantra', () => {
      const result = validator.checkMantra('INVALID-ID');
      
      expect(result.compliant).toBe(false);
      expect(result.reason).toBe('Mantra not found');
    });

    test('accepts agent definition parameter', () => {
      const result = validator.checkMantra('M1', sampleCompliantAgent);
      
      expect(result).toBeDefined();
      expect(result.compliant).toBeDefined();
    });

    test('validates keyword type mantras', () => {
      const result = validator.checkMantra('M1', sampleCompliantAgent);
      
      expect(result).toBeDefined();
      if (result.compliant) {
        expect(result.reason).toContain('Keywords found');
      }
    });

    test('validates pattern type mantras', () => {
      const agentWithEmoji = { description: 'Test with emoji: \uD83D\uDE00' };
      const result = validator.checkMantra('IA-23', agentWithEmoji);
      
      expect(result).toBeDefined();
      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('Forbidden pattern found');
    });

    test('validates pattern type with mustNotMatch', () => {
      const cleanAgent = { description: 'Clean text without emojis' };
      const result = validator.checkMantra('IA-23', cleanAgent);
      
      expect(result.compliant).toBe(true);
    });

    test('validates coverage type mantras', () => {
      const agentWithCoverage = { 
        description: 'Test coverage: 85%',
        test: 'included'
      };
      const result = validator.checkMantra('M22', agentWithCoverage);
      
      expect(result).toBeDefined();
      if (result.reason.includes('Coverage')) {
        expect(result.compliant).toBe(true);
      }
    });

    test('fails coverage validation below threshold', () => {
      const agentWithLowCoverage = { 
        description: 'Test coverage: 50%',
        test: 'included'
      };
      const result = validator.checkMantra('M22', agentWithLowCoverage);
      
      if (result.reason.includes('Coverage')) {
        expect(result.compliant).toBe(false);
      }
    });
  });

  describe('calculateScore', () => {
    test('calculates correct score percentage', () => {
      validator.validate(sampleCompliantAgent);
      const score = validator.calculateScore();
      
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('returns 0 if no results available', () => {
      const score = validator.calculateScore();
      expect(score).toBe(0);
    });

    test('calculates score based on compliant count', () => {
      validator.validate(sampleCompliantAgent);
      const expectedScore = Math.round(
        (validator.results.compliant.length / validator.results.totalMantras) * 100
      );
      
      expect(validator.calculateScore()).toBe(expectedScore);
    });
  });

  describe('getMissingMantras', () => {
    test('returns array of missing mantras', () => {
      validator.validate(sampleNonCompliantAgent);
      const missing = validator.getMissingMantras();
      
      expect(Array.isArray(missing)).toBe(true);
      expect(missing.length).toBeGreaterThan(0);
    });

    test('returns empty array if no results', () => {
      const missing = validator.getMissingMantras();
      expect(missing).toEqual([]);
    });

    test('includes mantra details', () => {
      validator.validate(sampleNonCompliantAgent);
      const missing = validator.getMissingMantras();
      
      if (missing.length > 0) {
        expect(missing[0]).toHaveProperty('id');
        expect(missing[0]).toHaveProperty('title');
        expect(missing[0]).toHaveProperty('description');
        expect(missing[0]).toHaveProperty('priority');
        expect(missing[0]).toHaveProperty('reason');
      }
    });
  });

  describe('getCompliantMantras', () => {
    test('returns array of compliant mantras', () => {
      validator.validate(sampleCompliantAgent);
      const compliant = validator.getCompliantMantras();
      
      expect(Array.isArray(compliant)).toBe(true);
      expect(compliant.length).toBeGreaterThan(0);
    });

    test('returns empty array if no results', () => {
      const compliant = validator.getCompliantMantras();
      expect(compliant).toEqual([]);
    });

    test('includes mantra details', () => {
      validator.validate(sampleCompliantAgent);
      const compliant = validator.getCompliantMantras();
      
      if (compliant.length > 0) {
        expect(compliant[0]).toHaveProperty('id');
        expect(compliant[0]).toHaveProperty('title');
        expect(compliant[0]).toHaveProperty('description');
        expect(compliant[0]).toHaveProperty('priority');
      }
    });
  });

  describe('generateReport', () => {
    test('generates text report', () => {
      validator.validate(sampleCompliantAgent);
      const report = validator.generateReport();
      
      expect(typeof report).toBe('string');
      expect(report).toContain('MANTRA VALIDATION REPORT');
      expect(report).toContain('Score:');
    });

    test('returns message if no results available', () => {
      const report = validator.generateReport();
      expect(report).toContain('No validation results available');
    });

    test('includes status in report', () => {
      validator.validate(sampleCompliantAgent);
      const report = validator.generateReport();
      
      expect(report).toMatch(/Status: (PASS|WARNING|FAIL)/);
    });

    test('includes execution time in report', () => {
      validator.validate(sampleCompliantAgent);
      const report = validator.generateReport();
      
      expect(report).toContain('Execution Time:');
      expect(report).toContain('ms');
    });

    test('includes critical errors section if present', () => {
      validator.validate(sampleNonCompliantAgent);
      const report = validator.generateReport();
      
      if (validator.results.errors.length > 0) {
        expect(report).toContain('CRITICAL ERRORS');
      }
    });

    test('includes warnings section if present', () => {
      validator.validate(sampleNonCompliantAgent);
      const report = validator.generateReport();
      
      if (validator.results.warnings.length > 0) {
        expect(report).toContain('WARNINGS');
      }
    });

    test('includes missing mantras section', () => {
      validator.validate(sampleNonCompliantAgent);
      const report = validator.generateReport();
      
      if (validator.getMissingMantras().length > 0) {
        expect(report).toContain('MISSING MANTRAS');
      }
    });

    test('categorizes missing mantras by priority', () => {
      validator.validate(sampleNonCompliantAgent);
      const report = validator.generateReport();
      const missing = validator.getMissingMantras();
      
      const hasCritical = missing.some(m => m.priority === 'critical');
      const hasHigh = missing.some(m => m.priority === 'high');
      
      if (hasCritical) {
        expect(report).toContain('CRITICAL PRIORITY:');
      }
      if (hasHigh) {
        expect(report).toContain('HIGH PRIORITY:');
      }
    });
  });

  describe('suggestImprovements', () => {
    test('returns array of suggestions', () => {
      validator.validate(sampleNonCompliantAgent);
      const suggestions = validator.suggestImprovements();
      
      expect(Array.isArray(suggestions)).toBe(true);
    });

    test('returns empty array if no results', () => {
      const suggestions = validator.suggestImprovements();
      expect(suggestions).toEqual([]);
    });

    test('prioritizes critical improvements', () => {
      validator.validate(sampleNonCompliantAgent);
      const suggestions = validator.suggestImprovements();
      
      if (suggestions.length > 0) {
        const criticalSuggestions = suggestions.find(s => s.priority === 'critical');
        if (criticalSuggestions) {
          expect(criticalSuggestions.category).toContain('Critical');
        }
      }
    });

    test('includes high priority improvements', () => {
      validator.validate(sampleNonCompliantAgent);
      const suggestions = validator.suggestImprovements();
      
      const highSuggestions = suggestions.find(s => s.priority === 'high');
      if (highSuggestions) {
        expect(highSuggestions.items).toBeInstanceOf(Array);
      }
    });

    test('limits quick wins to 5 items', () => {
      validator.validate(sampleNonCompliantAgent);
      const suggestions = validator.suggestImprovements();
      
      const quickWins = suggestions.find(s => s.category === 'Quick Wins');
      if (quickWins) {
        expect(quickWins.items.length).toBeLessThanOrEqual(5);
      }
    });

    test('includes suggestion text for each item', () => {
      validator.validate(sampleNonCompliantAgent);
      const suggestions = validator.suggestImprovements();
      
      if (suggestions.length > 0 && suggestions[0].items.length > 0) {
        expect(suggestions[0].items[0]).toHaveProperty('suggestion');
        expect(typeof suggestions[0].items[0].suggestion).toBe('string');
      }
    });
  });

  describe('export', () => {
    test('exports to JSON format', () => {
      validator.validate(sampleCompliantAgent);
      const exported = validator.export('json');
      
      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveProperty('totalMantras');
      expect(parsed).toHaveProperty('missingMantras');
      expect(parsed).toHaveProperty('suggestions');
    });

    test('exports to text format', () => {
      validator.validate(sampleCompliantAgent);
      const exported = validator.export('text');
      
      expect(typeof exported).toBe('string');
      expect(exported).toContain('MANTRA VALIDATION REPORT');
    });

    test('exports to summary format', () => {
      validator.validate(sampleCompliantAgent);
      const exported = validator.export('summary');
      
      expect(typeof exported).toBe('object');
      expect(exported).toHaveProperty('score');
      expect(exported).toHaveProperty('status');
      expect(exported).toHaveProperty('compliant');
      expect(exported).toHaveProperty('nonCompliant');
      expect(exported).toHaveProperty('criticalErrors');
      expect(exported).toHaveProperty('executionTimeMs');
    });

    test('throws error if no results available', () => {
      expect(() => validator.export('json')).toThrow('No validation results available');
    });

    test('throws error for unsupported format', () => {
      validator.validate(sampleCompliantAgent);
      expect(() => validator.export('invalid')).toThrow('Unsupported export format');
    });

    test('summary includes correct status', () => {
      validator.validate(sampleCompliantAgent);
      const summary = validator.export('summary');
      
      if (summary.score >= 80) {
        expect(summary.status).toBe('PASS');
      } else if (summary.score >= 60) {
        expect(summary.status).toBe('WARNING');
      } else {
        expect(summary.status).toBe('FAIL');
      }
    });
  });

  describe('getMantraById', () => {
    test('returns mantra by id', () => {
      const mantra = validator.getMantraById('M1');
      
      expect(mantra).toBeDefined();
      expect(mantra.id).toBe('M1');
      expect(mantra).toHaveProperty('title');
      expect(mantra).toHaveProperty('description');
    });

    test('returns undefined for non-existent id', () => {
      const mantra = validator.getMantraById('INVALID');
      expect(mantra).toBeUndefined();
    });
  });

  describe('getMantrasByCategory', () => {
    test('returns mantras by category', () => {
      const mantras = validator.getMantrasByCategory('merise-agile');
      
      expect(Array.isArray(mantras)).toBe(true);
      expect(mantras.length).toBe(39);
      mantras.forEach(m => expect(m.category).toBe('merise-agile'));
    });

    test('returns IA category mantras', () => {
      const mantras = validator.getMantrasByCategory('ia');
      
      expect(Array.isArray(mantras)).toBe(true);
      expect(mantras.length).toBe(25);
      mantras.forEach(m => expect(m.category).toBe('ia'));
    });

    test('returns empty array for non-existent category', () => {
      const mantras = validator.getMantrasByCategory('invalid');
      expect(mantras).toEqual([]);
    });
  });

  describe('getMantrasByPriority', () => {
    test('returns mantras by priority', () => {
      const mantras = validator.getMantrasByPriority('critical');
      
      expect(Array.isArray(mantras)).toBe(true);
      expect(mantras.length).toBeGreaterThan(0);
      mantras.forEach(m => expect(m.priority).toBe('critical'));
    });

    test('returns high priority mantras', () => {
      const mantras = validator.getMantrasByPriority('high');
      
      expect(Array.isArray(mantras)).toBe(true);
      mantras.forEach(m => expect(m.priority).toBe('high'));
    });

    test('returns empty array for non-existent priority', () => {
      const mantras = validator.getMantrasByPriority('invalid');
      expect(mantras).toEqual([]);
    });
  });

  describe('edge cases', () => {
    test('handles empty agent definition', () => {
      const results = validator.validate('');
      
      expect(results).toBeDefined();
      expect(results.score).toBe(0);
    });

    test('handles malformed JSON', () => {
      const results = validator.validate('{ invalid json }');
      
      expect(results).toBeDefined();
    });

    test('handles very large agent definitions', () => {
      const largeAgent = {
        description: 'x'.repeat(100000),
        owner: 'test',
        test: 'included'
      };
      
      const startTime = Date.now();
      validator.validate(largeAgent);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(200);
    });

    test('handles special characters in content', () => {
      const specialAgent = {
        description: 'Test with special chars: @#$%^&*()',
        owner: 'test'
      };
      
      const results = validator.validate(specialAgent);
      expect(results).toBeDefined();
    });

    test('handles unicode characters', () => {
      const unicodeAgent = {
        description: 'Test with unicode: 你好世界',
        owner: 'test'
      };
      
      const results = validator.validate(unicodeAgent);
      expect(results).toBeDefined();
    });
  });

  describe('performance tests', () => {
    test('validates within 200ms for typical agent', () => {
      const startTime = Date.now();
      validator.validate(sampleCompliantAgent);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(200);
    });

    test('handles multiple validations efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const v = new MantraValidator();
        v.validate(sampleCompliantAgent);
      }
      
      const duration = Date.now() - startTime;
      const avgDuration = duration / 10;
      
      expect(avgDuration).toBeLessThan(200);
    });
  });

  describe('self-validation (Mantra IA-23)', () => {
    test('validator code is emoji-free', () => {
      const validatorPath = path.join(__dirname, '../../../src/byan-v2/generation/mantra-validator.js');
      const code = fs.readFileSync(validatorPath, 'utf8');
      
      const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiPattern.test(code)).toBe(false);
    });

    test('mantras data is emoji-free', () => {
      const mantrasPath = path.join(__dirname, '../../../src/byan-v2/data/mantras.json');
      const data = fs.readFileSync(mantrasPath, 'utf8');
      
      const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiPattern.test(data)).toBe(false);
    });

    test('test file is emoji-free', () => {
      const testPath = path.join(__dirname, '../../../__tests__/byan-v2/generation/mantra-validator.test.js');
      const code = fs.readFileSync(testPath, 'utf8');
      
      const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiPattern.test(code)).toBe(false);
    });
  });
});
