/**
 * Integration Tests: Glossary Workflow
 * 
 * Tests the complete glossary building workflow end-to-end:
 * - Session initialization
 * - Glossary triggering for specific domains
 * - Concept validation with acceptance/rejection
 * - Definition quality challenges
 * - Related concept suggestions
 * - Completion criteria
 * - Export functionality
 * - State transitions
 * 
 * Quality: KISS, DRY, SOLID
 * Performance: < 5s total execution
 * Mantra IA-23: Zero emojis
 */

const ByanV2 = require('../../../src/byan-v2');
const GlossaryBuilder = require('../../../src/byan-v2/orchestrator/glossary-builder');

describe('Glossary Workflow Integration', () => {
  let byan;
  let glossaryBuilder;

  beforeEach(() => {
    byan = new ByanV2({
      sessionId: 'test-glossary-flow',
      maxQuestions: 12,
      bmad_features: {
        glossary: {
          enabled: true,
          min_concepts: 5,
          validation: {
            min_definition_length: 20,
            clarity_threshold: 0.3
          }
        }
      }
    });

    glossaryBuilder = byan.glossaryBuilder;
  });

  describe('Session Initialization with Glossary', () => {
    it('should initialize ByanV2 session with glossary enabled', () => {
      expect(byan).toBeDefined();
      expect(byan.glossaryBuilder).toBeInstanceOf(GlossaryBuilder);
      expect(byan.glossaryBuilder.minConcepts).toBe(5);
      expect(byan.glossaryBuilder.minDefinitionLength).toBe(20);
    });

    it('should support backwards compatibility when glossary disabled', () => {
      const byanNoGlossary = new ByanV2({
        bmad_features: {
          glossary: { enabled: false }
        }
      });

      expect(byanNoGlossary.glossaryBuilder).toBeUndefined();
    });

    it('should allow custom glossary configuration', () => {
      const customByan = new ByanV2({
        bmad_features: {
          glossary: {
            enabled: true,
            min_concepts: 3,
            validation: {
              min_definition_length: 15,
              clarity_threshold: 0.6
            }
          }
        }
      });

      expect(customByan.glossaryBuilder.minConcepts).toBe(3);
      expect(customByan.glossaryBuilder.minDefinitionLength).toBe(15);
      expect(customByan.glossaryBuilder.clarityThreshold).toBe(0.6);
    });
  });

  describe('Glossary Triggering for Domain', () => {
    it('should start glossary building with clear instructions', () => {
      const result = glossaryBuilder.start();

      expect(result).toBeDefined();
      expect(result.prompt).toContain('glossary');
      expect(result.instructions).toContain('5 core concepts');
      expect(result.instructions).toContain('minimum 20 characters');
    });

    it('should trigger automatically for ecommerce domain', () => {
      const sessionData = {
        domain: 'ecommerce',
        context: 'online shopping platform'
      };

      const shouldTrigger = glossaryBuilder._shouldTriggerForDomain(sessionData);
      expect(shouldTrigger).toBe(true);
    });

    it('should provide domain-specific suggestions for ecommerce', () => {
      const suggestions = glossaryBuilder.getDomainSuggestions('ecommerce');

      expect(suggestions).toContain('order');
      expect(suggestions).toContain('product');
      expect(suggestions).toContain('cart');
      expect(suggestions).toContain('payment');
    });
  });

  describe('Adding Valid Concepts', () => {
    it('should accept valid concept with good definition', () => {
      const result = glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase one or more products with specified quantity and delivery details'
      );

      expect(result.valid).toBe(true);
      expect(result.concept).toBeDefined();
      expect(result.concept.name).toBe('order');
      expect(result.concept.clarityScore).toBeGreaterThanOrEqual(0.3);
      expect(result.progress).toBe('1/5 concepts');
    });

    it('should add multiple valid concepts sequentially', () => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment and delivery information included' },
        { name: 'product', definition: 'An item available for sale with attributes like name, price, description and inventory count' },
        { name: 'cart', definition: 'A temporary collection of products selected by a customer before checkout and payment' },
        { name: 'payment', definition: 'The financial transaction that transfers money from customer to merchant for purchased items' },
        { name: 'inventory', definition: 'The stock quantity and availability status of products in the warehouse or store' }
      ];

      concepts.forEach((c, index) => {
        const result = glossaryBuilder.addConcept(c.name, c.definition);
        expect(result.valid).toBe(true);
        expect(result.progress).toBe(`${index + 1}/5 concepts`);
      });

      expect(glossaryBuilder.concepts.length).toBe(5);
      expect(glossaryBuilder.isComplete()).toBe(true);
    });

    it('should normalize concept names consistently', () => {
      const result1 = glossaryBuilder.addConcept(
        'Order',
        'A customer request to purchase products with payment and delivery details'
      );
      expect(result1.concept.name).toBe('order');

      const result2 = glossaryBuilder.addConcept(
        'ORDER',
        'Different definition'
      );
      expect(result2.valid).toBe(false);
      expect(result2.issues).toContain('Concept already exists');
    });

    it('should track concept metadata correctly', () => {
      const result = glossaryBuilder.addConcept(
        'customer',
        'A person or organization that purchases products or services from the business'
      );

      expect(result.concept.addedAt).toBeDefined();
      expect(result.concept.clarityScore).toBeDefined();
      expect(result.concept.relatedConcepts).toEqual([]);
    });
  });

  describe('Handling Invalid Concepts', () => {
    it('should reject concept with definition too short', () => {
      const result = glossaryBuilder.addConcept('order', 'A purchase');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Definition too short (min 20 characters)');
    });

    it('should reject concept with vague definition', () => {
      const result = glossaryBuilder.addConcept(
        'order',
        'A thing that exists'
      );

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('too short') || i.includes('vague'))).toBe(true);
    });

    it('should reject empty concept name', () => {
      const result = glossaryBuilder.addConcept(
        '',
        'A valid definition that is long enough to pass validation checks'
      );

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Name is required');
    });

    it('should reject duplicate concept names', () => {
      glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase products with specified quantity and delivery details'
      );

      const result = glossaryBuilder.addConcept(
        'order',
        'A different definition for the same concept that is also long enough'
      );

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Concept already exists');
    });

    it('should reject invalid concept name formats', () => {
      const result = glossaryBuilder.addConcept(
        'order@#$',
        'A customer request to purchase products with payment information'
      );

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('format') || i.includes('invalid'))).toBe(true);
    });
  });

  describe('Definition Quality Challenges', () => {
    it('should challenge vague definitions and suggest improvements', () => {
      const vagueDef = 'A thing that does stuff';
      const challenge = glossaryBuilder.challengeDefinition(vagueDef);

      expect(challenge).toBeDefined();
      expect(challenge.reason).toContain('vague');
      expect(challenge.suggestions).toBeDefined();
      expect(challenge.suggestions.length).toBeGreaterThan(0);
    });

    it('should provide specific improvement suggestions', () => {
      const weakDef = 'An order for products';
      const challenge = glossaryBuilder.challengeDefinition(weakDef);

      expect(challenge.suggestions).toContain('Specify what makes it unique');
      expect(challenge.suggestions).toContain('Add concrete examples');
    });

    it('should not challenge clear definitions', () => {
      const clearDef = 'A customer request to purchase products with specified quantity, payment method, and delivery address';
      const validationResult = glossaryBuilder.validateDefinition(clearDef);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.clarityScore).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('Related Concept Suggestions', () => {
    it('should suggest related concepts after adding order', () => {
      glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase products with payment and delivery information'
      );
      glossaryBuilder.addConcept(
        'product',
        'An item available for sale with price and description attributes'
      );

      const suggestions = glossaryBuilder.suggestRelatedConcepts(glossaryBuilder.concepts);

      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.name === 'inventory' || s.name === 'shipping' || s.name === 'checkout')).toBe(true);
    });

    it('should not suggest already added concepts', () => {
      glossaryBuilder.addConcept('order', 'A customer request to purchase products with delivery details');
      glossaryBuilder.addConcept('customer', 'A person who purchases products from the business');

      const suggestions = glossaryBuilder.suggestRelatedConcepts(glossaryBuilder.concepts);

      expect(suggestions.every(s => s.name !== 'order' && s.name !== 'customer')).toBe(true);
    });

    it('should provide rationale for each suggestion', () => {
      glossaryBuilder.addConcept('order', 'A customer request to purchase products with payment information');

      const suggestions = glossaryBuilder.suggestRelatedConcepts(glossaryBuilder.concepts);

      suggestions.forEach(suggestion => {
        expect(suggestion.name).toBeDefined();
        expect(suggestion.rationale).toBeDefined();
        expect(suggestion.rationale.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Completion Criteria', () => {
    it('should not be complete with fewer than minimum concepts', () => {
      glossaryBuilder.addConcept('order', 'A customer request to purchase products with delivery information');
      glossaryBuilder.addConcept('product', 'An item available for sale with price and description');

      expect(glossaryBuilder.isComplete()).toBe(false);
    });

    it('should be complete with minimum required concepts', () => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment and delivery details' },
        { name: 'product', definition: 'An item available for sale with attributes like price and description' },
        { name: 'cart', definition: 'A temporary collection of products selected before checkout' },
        { name: 'payment', definition: 'Financial transaction transferring money from customer to merchant' },
        { name: 'inventory', definition: 'Stock quantity and availability status of products in warehouse' }
      ];

      concepts.forEach(c => glossaryBuilder.addConcept(c.name, c.definition));

      expect(glossaryBuilder.isComplete()).toBe(true);
    });

    it('should track completion progress accurately', () => {
      expect(glossaryBuilder.getCompletionStatus()).toEqual({
        current: 0,
        required: 5,
        percentage: 0,
        complete: false
      });

      glossaryBuilder.addConcept('order', 'A customer request to purchase products with delivery details');
      glossaryBuilder.addConcept('product', 'An item available for sale in the catalog');

      expect(glossaryBuilder.getCompletionStatus()).toEqual({
        current: 2,
        required: 5,
        percentage: 40,
        complete: false
      });
    });
  });

  describe('Export Glossary', () => {
    beforeEach(() => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment details' },
        { name: 'product', definition: 'An item available for sale with price and description' },
        { name: 'cart', definition: 'A temporary collection of products before checkout' },
        { name: 'payment', definition: 'Financial transaction from customer to merchant' },
        { name: 'inventory', definition: 'Stock quantity and availability of products' }
      ];

      concepts.forEach(c => glossaryBuilder.addConcept(c.name, c.definition));
    });

    it('should export complete glossary with all metadata', () => {
      const exported = glossaryBuilder.export();

      expect(exported).toBeDefined();
      expect(exported.concepts).toHaveLength(5);
      expect(exported.metadata).toBeDefined();
      expect(exported.metadata.totalConcepts).toBe(5);
      expect(exported.metadata.complete).toBe(true);
    });

    it('should include concept details in export', () => {
      const exported = glossaryBuilder.export();

      exported.concepts.forEach(concept => {
        expect(concept.name).toBeDefined();
        expect(concept.definition).toBeDefined();
        expect(concept.clarityScore).toBeDefined();
        expect(concept.addedAt).toBeDefined();
      });
    });

    it('should export as formatted markdown', () => {
      const markdown = glossaryBuilder.exportAsMarkdown();

      expect(markdown).toContain('# Business Glossary');
      expect(markdown).toContain('## order');
      expect(markdown).toContain('## product');
      expect(markdown).toContain('**Concepts:** 5');
    });

    it('should export as JSON format', () => {
      const json = glossaryBuilder.exportAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed.concepts).toHaveLength(5);
      expect(parsed.metadata.totalConcepts).toBe(5);
    });
  });

  describe('State Transitions', () => {
    it('should transition from INTERVIEW to GLOSSARY state', () => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');

      const currentState = byan.stateMachine.currentState;
      expect(['INTERVIEW', 'START']).toContain(currentState);

      // Glossary can be triggered during interview or analysis
      const glossaryStart = glossaryBuilder.start();
      expect(glossaryStart).toBeDefined();
    });

    it('should complete glossary before moving to ANALYSIS', () => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with delivery information' },
        { name: 'product', definition: 'An item available for sale with price and description' },
        { name: 'cart', definition: 'A temporary collection of products before checkout' },
        { name: 'payment', definition: 'Financial transaction from customer to merchant' },
        { name: 'inventory', definition: 'Stock quantity and availability of products' }
      ];

      concepts.forEach(c => glossaryBuilder.addConcept(c.name, c.definition));

      expect(glossaryBuilder.isComplete()).toBe(true);

      // Can now proceed to analysis with glossary data
      const glossaryData = glossaryBuilder.export();
      expect(glossaryData.metadata.complete).toBe(true);
    });

    it('should allow glossary to run parallel to interview', () => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');

      // Start glossary
      glossaryBuilder.start();

      // Add concepts while potentially still in interview
      const result = glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase products with delivery details'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    it('should add concept in under 10ms', () => {
      const start = Date.now();

      glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase products with payment information'
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });

    it('should validate definition in under 5ms', () => {
      const start = Date.now();

      glossaryBuilder.validateDefinition(
        'A customer request to purchase products with specified quantity and delivery details'
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5);
    });

    it('should export glossary in under 20ms', () => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products' },
        { name: 'product', definition: 'An item available for sale in catalog' },
        { name: 'cart', definition: 'Temporary collection of products' },
        { name: 'payment', definition: 'Financial transaction for purchase' },
        { name: 'inventory', definition: 'Stock quantity of products' }
      ];

      concepts.forEach(c => glossaryBuilder.addConcept(c.name, c.definition));

      const start = Date.now();
      glossaryBuilder.export();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(20);
    });
  });
});
