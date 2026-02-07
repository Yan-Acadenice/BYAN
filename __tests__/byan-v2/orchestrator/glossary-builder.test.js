/**
 * GlossaryBuilder Tests
 * MANTRAS: KISS, DRY, SOLID, Zero Emoji
 */

const GlossaryBuilder = require('../../../src/byan-v2/orchestrator/glossary-builder');
const SessionState = require('../../../src/byan-v2/context/session-state');
const Logger = require('../../../src/byan-v2/observability/logger');

describe('GlossaryBuilder', () => {
  let sessionState;
  let logger;
  let glossary;

  beforeEach(() => {
    sessionState = new SessionState();
    logger = new Logger('test');
    glossary = new GlossaryBuilder(sessionState, logger);
  });

  describe('constructor', () => {
    it('should initialize with sessionState and logger', () => {
      expect(glossary.sessionState).toBe(sessionState);
      expect(glossary.logger).toBe(logger);
      expect(glossary.concepts).toEqual([]);
    });

    it('should create default logger if not provided', () => {
      const gb = new GlossaryBuilder(sessionState);
      expect(gb.logger).toBeDefined();
    });
  });

  describe('start()', () => {
    it('should return prompt and instructions', () => {
      const result = glossary.start();
      
      expect(result.prompt).toContain('glossary');
      expect(result.instructions).toContain('5 core concepts');
      expect(result.instructions).toContain('minimum 20 characters');
    });
  });

  describe('addConcept()', () => {
    it('should add valid concept', () => {
      const result = glossary.addConcept(
        'order',
        'A confirmed purchase request created when a customer completes checkout with payment.'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('order');
      expect(result.concept.clarityScore).toBeGreaterThan(0.7);
      expect(glossary.getConceptCount()).toBe(1);
    });

    it('should reject concept with short definition', () => {
      const result = glossary.addConcept('order', 'A purchase');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Definition too short (min 20 characters)');
    });

    it('should reject concept with vague definition', () => {
      const result = glossary.addConcept(
        'order',
        'Maybe something that could be used sometimes'
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should normalize concept name to kebab-case', () => {
      const result = glossary.addConcept(
        'Purchase Order',
        'A confirmed purchase request created when a customer completes checkout.'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('purchase-order');
    });

    it('should reject duplicate concept names', () => {
      glossary.addConcept('order', 'A confirmed purchase request created when a customer completes checkout.');
      const result = glossary.addConcept('order', 'Another definition of order with different wording for testing.');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Concept already exists');
    });

    it('should return suggestions for related concepts', () => {
      glossary.addConcept('order', 'A confirmed purchase request created when checkout completes.');
      const result = glossary.addConcept('product', 'An item that is available for purchase in the online catalog system.');

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should track progress', () => {
      const result = glossary.addConcept('order', 'A confirmed purchase request created when checkout is completed.');

      expect(result.progress).toBe('1/5 concepts');
    });
  });

  describe('validateDefinition()', () => {
    it('should validate good definition', () => {
      const result = glossary.validateDefinition(
        'A confirmed purchase request created when a customer completes checkout with payment.'
      );

      expect(result.valid).toBe(true);
      expect(result.clarityScore).toBeGreaterThan(0.7);
      expect(result.issues).toEqual([]);
    });

    it('should reject undefined definition', () => {
      const result = glossary.validateDefinition(undefined);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Definition is required');
    });

    it('should reject empty definition', () => {
      const result = glossary.validateDefinition('');

      expect(result.valid).toBe(false);
      expect(result.clarityScore).toBe(0);
    });

    it('should reject too short definition', () => {
      const result = glossary.validateDefinition('Short');

      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('too short');
    });

    it('should reject vague definition', () => {
      const result = glossary.validateDefinition('Maybe something that could be sometimes used');

      expect(result.valid).toBe(false);
      expect(result.clarityScore).toBeLessThan(0.7);
    });

    it('should give high score to definition with examples', () => {
      const result = glossary.validateDefinition(
        'A confirmed purchase request, e.g., when customer pays for items in their cart.'
      );

      expect(result.clarityScore).toBeGreaterThan(0.8);
    });

    it('should give high score to specific definition', () => {
      const result = glossary.validateDefinition(
        'A record created when customer completes checkout and payment is processed successfully.'
      );

      expect(result.clarityScore).toBeGreaterThan(0.7);
    });
  });

  describe('_calculateClarityScore()', () => {
    it('should give low score for very short definition', () => {
      const score = glossary._calculateClarityScore('A thing');
      expect(score).toBeLessThan(0.5);
    });

    it('should give high score for optimal length', () => {
      const definition = 'A confirmed purchase request that is created when a customer successfully completes the checkout process and payment is verified.';
      const score = glossary._calculateClarityScore(definition);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should penalize very long definitions', () => {
      const longDef = 'A'.repeat(250);
      const score = glossary._calculateClarityScore(longDef);
      expect(score).toBeLessThan(0.8);
    });

    it('should reward definitions with examples', () => {
      const withExample = 'A purchase request, e.g., when customer buys products online.';
      const withoutExample = 'A purchase request when customer buys products online.';
      
      const scoreWith = glossary._calculateClarityScore(withExample);
      const scoreWithout = glossary._calculateClarityScore(withoutExample);
      
      expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('should penalize ambiguous terms', () => {
      const ambiguous = 'Maybe something that could be used sometimes when needed.';
      const score = glossary._calculateClarityScore(ambiguous);
      expect(score).toBeLessThan(0.5);
    });
  });

  describe('challengeDefinition()', () => {
    it('should challenge definition without examples', () => {
      const challenge = glossary.challengeDefinition('A purchase request from customers');
      expect(challenge).toContain('example');
    });

    it('should challenge very short definition', () => {
      const challenge = glossary.challengeDefinition('A thing');
      expect(challenge).toContain('expand');
    });

    it('should challenge ambiguous definition', () => {
      const challenge = glossary.challengeDefinition('Maybe something that could be used');
      expect(challenge).toContain('ambiguous');
    });

    it('should return generic challenge for unclear issues', () => {
      const challenge = glossary.challengeDefinition('A validated purchase request created after payment');
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(10);
    });
  });

  describe('suggestRelatedConcepts()', () => {
    it('should return empty for no concepts', () => {
      const suggestions = glossary.suggestRelatedConcepts([]);
      expect(suggestions).toEqual([]);
    });

    it('should suggest e-commerce concepts', () => {
      const concepts = [
        { name: 'order', definition: 'Purchase request' },
        { name: 'product', definition: 'Item for sale' },
        { name: 'cart', definition: 'Shopping basket' }
      ];

      const suggestions = glossary.suggestRelatedConcepts(concepts);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(5);
      expect(suggestions).toEqual(expect.arrayContaining([
        expect.stringMatching(/inventory|shipping|discount|refund|checkout/)
      ]));
    });

    it('should suggest finance concepts', () => {
      const concepts = [
        { name: 'account', definition: 'User account' },
        { name: 'transaction', definition: 'Money transfer' },
        { name: 'balance', definition: 'Account balance' }
      ];

      const suggestions = glossary.suggestRelatedConcepts(concepts);
      
      expect(suggestions).toEqual(expect.arrayContaining([
        expect.stringMatching(/reconciliation|statement|fee|interest|deposit/)
      ]));
    });

    it('should not suggest existing concepts', () => {
      const concepts = [
        { name: 'order', definition: 'Purchase' },
        { name: 'product', definition: 'Item' },
        { name: 'inventory', definition: 'Stock' }
      ];

      const suggestions = glossary.suggestRelatedConcepts(concepts);
      
      expect(suggestions).not.toContain('order');
      expect(suggestions).not.toContain('product');
      expect(suggestions).not.toContain('inventory');
    });

    it('should return max 5 suggestions', () => {
      const concepts = [
        { name: 'order', definition: 'Purchase' },
        { name: 'product', definition: 'Item' }
      ];

      const suggestions = glossary.suggestRelatedConcepts(concepts);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('isComplete()', () => {
    it('should return false with less than 5 concepts', () => {
      glossary.addConcept('order', 'A confirmed purchase request with payment verification.');
      expect(glossary.isComplete()).toBe(false);
    });

    it('should return true with 5 valid concepts', () => {
      const concepts = [
        ['order', 'A confirmed purchase request that is created when the checkout process completes successfully.'],
        ['product', 'An item that is available for purchase and listed in the online catalog system.'],
        ['customer', 'A registered user who can place orders and make purchases in the system.'],
        ['cart', 'A temporary container that holds selected products before the checkout process is initiated.'],
        ['payment', 'A financial transaction that processes customer funds when an order is confirmed.']
      ];

      concepts.forEach(([name, def]) => glossary.addConcept(name, def));
      
      expect(glossary.isComplete()).toBe(true);
    });

    it('should return false if concepts have low clarity scores', () => {
      for (let i = 0; i < 5; i++) {
        glossary.concepts.push({
          name: `concept${i}`,
          definition: 'Short',
          clarityScore: 0.5,
          addedAt: new Date().toISOString()
        });
      }

      expect(glossary.isComplete()).toBe(false);
    });
  });

  describe('getConceptCount()', () => {
    it('should return 0 initially', () => {
      expect(glossary.getConceptCount()).toBe(0);
    });

    it('should return correct count after adding concepts', () => {
      glossary.addConcept('order', 'A confirmed purchase request that is created when a customer completes the checkout process.');
      glossary.addConcept('product', 'An item that is available for purchase and listed in the catalog system.');
      
      expect(glossary.getConceptCount()).toBe(2);
    });
  });

  describe('getConcepts()', () => {
    it('should return empty array initially', () => {
      expect(glossary.getConcepts()).toEqual([]);
    });

    it('should return copy of concepts array', () => {
      glossary.addConcept('order', 'A confirmed purchase request created when checkout is completed.');
      
      const concepts = glossary.getConcepts();
      concepts.push({ name: 'fake', definition: 'Fake' });
      
      expect(glossary.getConceptCount()).toBe(1);
    });

    it('should return all added concepts', () => {
      glossary.addConcept('order', 'A confirmed purchase request that is created when the checkout completes successfully.');
      glossary.addConcept('product', 'An item that is available for purchase when it is listed in the catalog system.');
      
      const concepts = glossary.getConcepts();
      expect(concepts.length).toBe(2);
      expect(concepts[0].name).toBe('order');
      expect(concepts[1].name).toBe('product');
    });
  });

  describe('export()', () => {
    it('should export glossary with metadata', () => {
      glossary.addConcept('order', 'A confirmed purchase request created when a customer completes the checkout process.');
      glossary.addConcept('product', 'An item available for purchase that is listed in the online catalog system.');

      const exported = glossary.export();

      expect(exported.version).toBe('1.0.0');
      expect(exported.createdAt).toBeDefined();
      expect(exported.conceptCount).toBe(2);
      expect(exported.concepts).toHaveLength(2);
    });

    it('should detect e-commerce domain', () => {
      glossary.addConcept('order', 'A purchase request that is submitted by a customer when the checkout process completes successfully.');
      glossary.addConcept('product', 'An item that is available for sale and listed in the catalog system.');
      glossary.addConcept('cart', 'A shopping basket container that holds selected products before the checkout process is initiated.');

      const exported = glossary.export();
      expect(exported.domain).toBe('ecommerce');
    });

    it('should detect finance domain', () => {
      glossary.addConcept('account', 'A user financial account that contains the balance information and transaction history.');
      glossary.addConcept('transaction', 'A money transfer operation that moves funds between different accounts or external entities.');
      glossary.addConcept('balance', 'The current account balance that is calculated from all completed and processed transactions.');

      const exported = glossary.export();
      expect(exported.domain).toBe('finance');
    });

    it('should default to general domain', () => {
      glossary.addConcept('thing', 'A generic entity that exists in the system without any specific domain context.');
      
      const exported = glossary.export();
      expect(exported.domain).toBe('general');
    });

    it('should include concept details', () => {
      glossary.addConcept('order', 'A confirmed purchase request that is created when the checkout process is completed.');

      const exported = glossary.export();
      const concept = exported.concepts[0];

      expect(concept.name).toBe('order');
      expect(concept.definition).toBeDefined();
      expect(concept.clarityScore).toBeDefined();
      expect(concept.addedAt).toBeDefined();
    });
  });

  describe('_validateName()', () => {
    it('should accept lowercase name', () => {
      const result = glossary._validateName('order');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('order');
    });

    it('should normalize uppercase to lowercase', () => {
      const result = glossary._validateName('Order');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('order');
    });

    it('should normalize spaces to hyphens', () => {
      const result = glossary._validateName('Purchase Order');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('purchase-order');
    });

    it('should reject empty name', () => {
      const result = glossary._validateName('');
      expect(result.valid).toBe(false);
    });

    it('should reject invalid characters', () => {
      const result = glossary._validateName('order#123');
      expect(result.valid).toBe(false);
    });

    it('should accept single character', () => {
      const result = glossary._validateName('a');
      expect(result.valid).toBe(true);
    });
  });

  describe('performance', () => {
    it('should add concept in less than 100ms', () => {
      const start = Date.now();
      
      glossary.addConcept(
        'order',
        'A confirmed purchase request created when a customer completes checkout.'
      );
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should validate definition in less than 50ms', () => {
      const start = Date.now();
      
      glossary.validateDefinition(
        'A confirmed purchase request created when a customer completes checkout.'
      );
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });
});
