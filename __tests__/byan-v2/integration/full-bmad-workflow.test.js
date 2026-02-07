/**
 * Integration Tests: Full BMAD Workflow
 * 
 * Tests the COMPLETE integrated workflow with ALL 4 BMAD modules:
 * - GlossaryBuilder
 * - FiveWhysAnalyzer  
 * - ActiveListener
 * - MantraValidator
 * 
 * Scenario: E-commerce Agent Creation with Full BMAD Features
 * 
 * Workflow Steps:
 * 1. Setup: Start BYAN v2 with all BMAD features
 * 2. Interview: 12 questions with pain point detection
 * 3. 5 Whys: Analyze "slow checkout" root cause
 * 4. Glossary: Define 5 ecommerce concepts
 * 5. Active Listening: Reformulate every 3 responses
 * 6. Analysis: Process all data
 * 7. Generation: Create agent definition
 * 8. Validation: Check 64 mantras compliance
 * 
 * Quality: KISS, DRY, SOLID
 * Performance: < 10s total execution
 * Mantra IA-23: Zero emojis
 */

const ByanV2 = require('../../../src/byan-v2');
const GlossaryBuilder = require('../../../src/byan-v2/orchestrator/glossary-builder');
const FiveWhysAnalyzer = require('../../../src/byan-v2/dispatcher/five-whys-analyzer');
const ActiveListener = require('../../../src/byan-v2/orchestrator/active-listener');
const MantraValidator = require('../../../src/byan-v2/generation/mantra-validator');

describe('Full BMAD Workflow Integration', () => {
  let byan;
  let startTime;

  beforeEach(() => {
    startTime = Date.now();
    
    byan = new ByanV2({
      sessionId: 'test-full-bmad-workflow',
      maxQuestions: 12,
      bmad_features: {
        glossary: {
          enabled: true,
          min_concepts: 5,
          validation: {
            min_definition_length: 20,
            clarity_threshold: 0.7
          }
        },
        five_whys: {
          enabled: true,
          max_depth: 5,
          pain_keywords: ['problem', 'issue', 'slow', 'error', 'fail']
        },
        active_listening: {
          enabled: true,
          reformulate_every: 3,
          clarity_threshold: 0.7
        },
        mantra_validation: {
          enabled: true,
          min_compliance_score: 80
        }
      }
    });
  });

  afterEach(() => {
    const duration = Date.now() - startTime;
    console.log(`Test execution time: ${duration}ms`);
  });

  describe('Setup: Initialize with All BMAD Features', () => {
    it('should initialize ByanV2 with all 4 BMAD modules', () => {
      expect(byan).toBeDefined();
      expect(byan.glossaryBuilder).toBeInstanceOf(GlossaryBuilder);
      expect(byan.fiveWhysAnalyzer).toBeInstanceOf(FiveWhysAnalyzer);
      expect(byan.activeListener).toBeInstanceOf(ActiveListener);
      expect(byan.mantraValidator).toBeInstanceOf(MantraValidator);
    });

    it('should configure all modules correctly', () => {
      expect(byan.glossaryBuilder.minConcepts).toBe(5);
      expect(byan.fiveWhysAnalyzer.maxDepth).toBe(5);
      expect(byan.activeListener.validationFrequency).toBe(3);
    });

    it('should initialize session state', () => {
      expect(byan.sessionState).toBeDefined();
      expect(byan.sessionState.sessionId).toBe('test-full-bmad-workflow');
    });

    it('should verify all modules are enabled', () => {
      const config = byan.config.bmad_features;
      
      expect(config.glossary.enabled).toBe(true);
      expect(config.five_whys.enabled).toBe(true);
      expect(config.active_listening.enabled).toBe(true);
      expect(config.mantra_validation.enabled).toBe(true);
    });
  });

  describe('Interview Phase with Active Listening', () => {
    it('should start interview with initial question', () => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');

      const question = byan.interviewState.getNextQuestion();
      expect(question).toBeDefined();
    });

    it('should process user response with active listening', () => {
      const response = 'I want to build an ecommerce agent for order management';
      const result = byan.activeListener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.reformulated).toBeDefined();
      expect(result.clarityScore).toBeGreaterThanOrEqual(0);
    });

    it('should detect pain point in interview response', () => {
      const response = 'Our checkout process is slow and customers complain about it';
      const result = byan.fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints.length).toBeGreaterThan(0);
      expect(result.firstQuestion).toBeDefined();
    });

    it('should reformulate every 3rd response during interview', () => {
      const responses = [
        'I need an ecommerce agent',
        'For order management and tracking',
        'With real-time inventory updates'
      ];

      responses.forEach((response, index) => {
        const result = byan.activeListener.listen(response);
        
        if ((index + 1) % 3 === 0) {
          expect(result.needsValidation).toBe(true);
        }
      });
    });

    it('should complete 12 interview questions with active listening', () => {
      const mockResponses = [
        'Ecommerce platform agent',
        'For product recommendations',
        'Based on customer history',
        'Integration with inventory',
        'Real-time stock checking',
        'Payment gateway support',
        'Order tracking features',
        'Customer notification system',
        'Returns and refunds handling',
        'Analytics and reporting',
        'Mobile app integration',
        'Multi-language support'
      ];

      mockResponses.forEach(response => {
        const result = byan.activeListener.listen(response);
        expect(result.valid).toBe(true);
      });

      expect(byan.activeListener.history.length).toBe(12);
    });
  });

  describe('5 Whys Phase: Root Cause Analysis', () => {
    beforeEach(() => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');
    });

    it('should detect slow checkout pain point', () => {
      const response = 'Our biggest problem is the slow checkout process causing cart abandonment';
      const result = byan.fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints.some(p => p.keyword === 'slow' || p.keyword === 'problem')).toBe(true);
    });

    it('should ask 5 sequential WHY questions', () => {
      byan.fiveWhysAnalyzer.start('Checkout is slow');

      const whyAnswers = [
        'Because payment gateway takes too long to respond',
        'Because we make synchronous calls to external services',
        'Because no caching mechanism was implemented',
        'Because caching was not prioritized in development',
        'Because we lacked infrastructure expertise'
      ];

      whyAnswers.forEach((answer, index) => {
        const question = byan.fiveWhysAnalyzer.askNext();
        expect(question).toBeDefined();
        expect(question.depth).toBe(index + 1);

        const result = byan.fiveWhysAnalyzer.processAnswer(answer);
        expect(result.valid).toBe(true);
      });

      expect(byan.fiveWhysAnalyzer.depth).toBe(5);
    });

    it('should extract root cause: lack of caching infrastructure', () => {
      byan.fiveWhysAnalyzer.start('Checkout is slow');

      const whyAnswers = [
        'Payment gateway responds slowly',
        'Synchronous external API calls',
        'No caching mechanism implemented',
        'Caching not prioritized',
        'Lack of infrastructure expertise'
      ];

      whyAnswers.forEach(answer => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = byan.fiveWhysAnalyzer.extractRootCause();

      expect(rootCause).toBeDefined();
      expect(rootCause.cause).toContain('infrastructure expertise');
      expect(rootCause.depth).toBe(5);
    });

    it('should categorize root cause as technical', () => {
      byan.fiveWhysAnalyzer.start('Slow checkout problem');

      const answers = [
        'Payment processing delays',
        'Synchronous API calls',
        'No caching infrastructure',
        'Infrastructure not implemented',
        'Lack of technical expertise'
      ];

      answers.forEach(answer => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(answer);
      });

      const category = byan.fiveWhysAnalyzer.categorizeRootCause();
      expect(['technical', 'knowledge']).toContain(category);
    });

    it('should extract action items from 5 Whys analysis', () => {
      byan.fiveWhysAnalyzer.start('Checkout performance issue');

      const answers = [
        'Payment gateway timeout',
        'No retry mechanism',
        'Error handling not implemented',
        'Best practices not followed',
        'Team lacks expertise'
      ];

      answers.forEach(answer => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(answer);
      });

      const actions = byan.fiveWhysAnalyzer.extractActionItems();

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].description).toBeDefined();
      expect(actions[0].priority).toBeDefined();
    });
  });

  describe('Glossary Phase: Domain Vocabulary', () => {
    it('should auto-trigger glossary for ecommerce domain', () => {
      const sessionData = {
        domain: 'ecommerce',
        context: 'online shopping platform'
      };

      const shouldTrigger = byan.glossaryBuilder._shouldTriggerForDomain(sessionData);
      expect(shouldTrigger).toBe(true);
    });

    it('should guide user to define 5 core concepts', () => {
      const result = byan.glossaryBuilder.start();

      expect(result.prompt).toBeDefined();
      expect(result.instructions).toContain('5 core concepts');
    });

    it('should define order concept with validation', () => {
      const result = byan.glossaryBuilder.addConcept(
        'order',
        'A customer request to purchase one or more products with payment and delivery information'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('order');
      expect(result.concept.clarityScore).toBeGreaterThanOrEqual(0.7);
    });

    it('should define product concept with validation', () => {
      const result = byan.glossaryBuilder.addConcept(
        'product',
        'An item available for sale with attributes like name, price, description, and inventory count'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('product');
    });

    it('should define cart concept with validation', () => {
      const result = byan.glossaryBuilder.addConcept(
        'cart',
        'A temporary collection of products selected by a customer before proceeding to checkout'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('cart');
    });

    it('should define payment concept with validation', () => {
      const result = byan.glossaryBuilder.addConcept(
        'payment',
        'A financial transaction that transfers money from customer to merchant for purchased items'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('payment');
    });

    it('should define inventory concept with validation', () => {
      const result = byan.glossaryBuilder.addConcept(
        'inventory',
        'The stock quantity and availability status of products in the warehouse or distribution center'
      );

      expect(result.valid).toBe(true);
      expect(result.concept.name).toBe('inventory');
    });

    it('should reject vague definition and challenge user', () => {
      const result = byan.glossaryBuilder.addConcept(
        'customer',
        'A person who buys stuff'
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should suggest related concepts after defining core terms', () => {
      byan.glossaryBuilder.addConcept('order', 'A customer request to purchase products with delivery details');
      
      const suggestions = byan.glossaryBuilder.suggestRelatedConcepts(byan.glossaryBuilder.concepts);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.name === 'customer' || s.name === 'product')).toBe(true);
    });

    it('should complete glossary with 5 valid concepts', () => {
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment and delivery information' },
        { name: 'product', definition: 'An item available for sale with attributes like name, price, and description' },
        { name: 'cart', definition: 'A temporary collection of products selected by a customer before checkout' },
        { name: 'payment', definition: 'A financial transaction transferring money from customer to merchant' },
        { name: 'inventory', definition: 'The stock quantity and availability status of products in warehouse' }
      ];

      concepts.forEach(c => {
        const result = byan.glossaryBuilder.addConcept(c.name, c.definition);
        expect(result.valid).toBe(true);
      });

      expect(byan.glossaryBuilder.isComplete()).toBe(true);
      expect(byan.glossaryBuilder.concepts.length).toBe(5);
    });
  });

  describe('Analysis Phase: Process All Data', () => {
    beforeEach(() => {
      // Setup complete interview data
      const responses = [
        'Ecommerce agent for order management',
        'Product recommendations engine',
        'Real-time inventory tracking',
        'Payment gateway integration',
        'Customer notification system',
        'Returns and refunds processing'
      ];

      responses.forEach(r => byan.activeListener.listen(r));

      // Setup 5 Whys data
      byan.fiveWhysAnalyzer.start('Slow checkout causing problems');
      const whyAnswers = [
        'Payment gateway delays',
        'Synchronous API calls',
        'No caching implemented',
        'Not prioritized',
        'Lack of expertise'
      ];
      whyAnswers.forEach(a => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(a);
      });

      // Setup glossary data
      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment details' },
        { name: 'product', definition: 'An item available for sale with price and description' },
        { name: 'cart', definition: 'A temporary collection of products before checkout' },
        { name: 'payment', definition: 'Financial transaction from customer to merchant' },
        { name: 'inventory', definition: 'Stock quantity and availability of products' }
      ];
      concepts.forEach(c => byan.glossaryBuilder.addConcept(c.name, c.definition));
    });

    it('should transition to analysis state', () => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');
      byan.stateMachine.transition('ANALYSIS');

      expect(byan.stateMachine.currentState).toBe('ANALYSIS');
    });

    it('should include active listening summary in analysis', () => {
      const listeningData = byan.activeListener.export();

      expect(listeningData.summary).toBeDefined();
      expect(listeningData.history.length).toBeGreaterThan(0);
    });

    it('should include 5 Whys root cause in analysis', () => {
      const whysData = byan.fiveWhysAnalyzer.export();

      expect(whysData.rootCause).toBeDefined();
      expect(whysData.category).toBeDefined();
      expect(whysData.actions).toBeDefined();
    });

    it('should include glossary in analysis', () => {
      const glossaryData = byan.glossaryBuilder.export();

      expect(glossaryData.concepts.length).toBe(5);
      expect(glossaryData.metadata.complete).toBe(true);
    });

    it('should create comprehensive analysis combining all data', () => {
      const analysisData = {
        listening: byan.activeListener.export(),
        rootCause: byan.fiveWhysAnalyzer.export(),
        glossary: byan.glossaryBuilder.export()
      };

      expect(analysisData.listening.history.length).toBeGreaterThan(0);
      expect(analysisData.rootCause.responses.length).toBe(6);
      expect(analysisData.glossary.concepts.length).toBe(5);
    });
  });

  describe('Generation Phase: Create Agent Definition', () => {
    beforeEach(() => {
      // Setup complete data from previous phases
      const responses = [
        'Ecommerce agent',
        'Order management',
        'Inventory tracking',
        'Payment processing',
        'Customer notifications',
        'Analytics dashboard'
      ];
      responses.forEach(r => byan.activeListener.listen(r));

      byan.fiveWhysAnalyzer.start('Slow checkout');
      ['Payment delays', 'API calls', 'No caching', 'Not prioritized', 'No expertise'].forEach(a => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(a);
      });

      [
        { name: 'order', definition: 'Customer request to purchase products with payment and delivery' },
        { name: 'product', definition: 'Item available for sale with price and description' },
        { name: 'cart', definition: 'Temporary collection of products before checkout' },
        { name: 'payment', definition: 'Financial transaction from customer to merchant' },
        { name: 'inventory', definition: 'Stock quantity and availability of products' }
      ].forEach(c => byan.glossaryBuilder.addConcept(c.name, c.definition));
    });

    it('should transition to generation state', () => {
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');
      byan.stateMachine.transition('ANALYSIS');
      byan.stateMachine.transition('GENERATION');

      expect(byan.stateMachine.currentState).toBe('GENERATION');
    });

    it('should generate agent definition with all collected data', () => {
      const agentDefinition = {
        name: 'EcommerceOrderAgent',
        description: 'Agent for ecommerce order management with inventory tracking',
        purpose: byan.activeListener.generateConsolidatedSummary(),
        rootCause: byan.fiveWhysAnalyzer.extractRootCause(),
        glossary: byan.glossaryBuilder.export(),
        actionItems: byan.fiveWhysAnalyzer.extractActionItems()
      };

      expect(agentDefinition.name).toBeDefined();
      expect(agentDefinition.purpose).toBeDefined();
      expect(agentDefinition.rootCause).toBeDefined();
      expect(agentDefinition.glossary.concepts.length).toBe(5);
    });

    it('should include root cause insights in agent design', () => {
      const rootCause = byan.fiveWhysAnalyzer.extractRootCause();
      
      expect(rootCause.cause).toBeDefined();
      expect(rootCause.depth).toBe(5);
    });

    it('should incorporate glossary into agent documentation', () => {
      const glossary = byan.glossaryBuilder.export();
      const markdown = byan.glossaryBuilder.exportAsMarkdown();

      expect(glossary.concepts.length).toBe(5);
      expect(markdown).toContain('# Business Glossary');
      expect(markdown).toContain('order');
      expect(markdown).toContain('product');
    });
  });

  describe('Validation Phase: Mantra Compliance', () => {
    let agentDefinition;

    beforeEach(() => {
      agentDefinition = {
        name: 'EcommerceOrderAgent',
        description: 'Ecommerce order management agent with inventory tracking',
        purpose: 'Help customers manage orders and track inventory in real-time',
        capabilities: [
          'Order creation and management',
          'Real-time inventory checking',
          'Payment processing',
          'Customer notifications'
        ],
        dataModel: byan.glossaryBuilder.export(),
        rootCauseAnalysis: byan.fiveWhysAnalyzer.export()
      };
    });

    it('should validate agent against 64 mantras', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);

      expect(validation).toBeDefined();
      expect(validation.totalMantras).toBe(64);
      expect(validation.results).toBeDefined();
    });

    it('should achieve compliance score >= 80', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);

      expect(validation.complianceScore).toBeGreaterThanOrEqual(80);
    });

    it('should validate mantra IA-23: Zero Emojis', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);
      const ia23 = validation.results.find(r => r.mantraId === 'IA-23');

      if (ia23) {
        expect(ia23.compliant).toBe(true);
      }
    });

    it('should validate mantra #33: Data Dictionary First', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);
      const dataDictionary = validation.results.find(r => r.mantraId === 'M33' || r.description?.includes('Data Dictionary'));

      if (dataDictionary) {
        expect(dataDictionary.compliant).toBe(true);
      }
    });

    it('should generate compliance report', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);
      const report = byan.mantraValidator.generateReport(validation);

      expect(report).toBeDefined();
      expect(report).toContain('Compliance Score');
      expect(report).toContain('64');
    });

    it('should identify non-compliant mantras if any', () => {
      const validation = byan.mantraValidator.validate(agentDefinition);
      const nonCompliant = validation.results.filter(r => !r.compliant);

      nonCompliant.forEach(nc => {
        expect(nc.reason).toBeDefined();
        expect(nc.suggestion).toBeDefined();
      });
    });
  });

  describe('Complete Workflow End-to-End', () => {
    it('should execute full workflow from start to validation', () => {
      // 1. Start session
      byan.stateMachine.transition('START');
      expect(byan.stateMachine.currentState).toBe('START');

      // 2. Interview phase with active listening
      byan.stateMachine.transition('INTERVIEW');
      
      const interviewResponses = [
        'I want an ecommerce agent for order management',
        'It should handle product recommendations',
        'Based on customer purchase history and browsing behavior',
        'The checkout process is slow and causes cart abandonment',
        'We need real-time inventory integration',
        'Payment gateway support for multiple providers',
        'Automated customer notifications for order status',
        'Returns and refunds processing workflow',
        'Analytics dashboard for business insights',
        'Mobile app integration for customer convenience',
        'Multi-language support for global customers',
        'Security and compliance with payment standards'
      ];

      interviewResponses.forEach((response, index) => {
        const listenResult = byan.activeListener.listen(response);
        expect(listenResult.valid).toBe(true);

        // Validate understanding every 3 responses
        if ((index + 1) % 3 === 0) {
          expect(listenResult.needsValidation).toBe(true);
          const summary = byan.activeListener.generateConsolidatedSummary();
          const validation = byan.activeListener.validateUnderstanding('yes', summary);
          expect(validation.validated).toBe(true);
        }
      });

      // 3. 5 Whys triggered by pain point in response 4
      const whysResult = byan.fiveWhysAnalyzer.start(interviewResponses[3]);
      expect(whysResult.needsWhys).toBe(true);

      const whyAnswers = [
        'Because payment gateway takes too long to respond',
        'Because we make synchronous calls to external services',
        'Because no caching mechanism was implemented',
        'Because caching was not prioritized in development',
        'Because we lacked infrastructure expertise during planning'
      ];

      whyAnswers.forEach(answer => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = byan.fiveWhysAnalyzer.extractRootCause();
      expect(rootCause).toBeDefined();
      expect(rootCause.cause).toContain('infrastructure expertise');

      // 4. Glossary phase
      const glossaryStart = byan.glossaryBuilder.start();
      expect(glossaryStart.instructions).toContain('5 core concepts');

      const concepts = [
        { name: 'order', definition: 'A customer request to purchase products with payment and delivery information' },
        { name: 'product', definition: 'An item available for sale with attributes like name, price, and description' },
        { name: 'cart', definition: 'A temporary collection of products selected by customer before checkout' },
        { name: 'payment', definition: 'A financial transaction transferring money from customer to merchant' },
        { name: 'inventory', definition: 'The stock quantity and availability status of products in warehouse' }
      ];

      concepts.forEach(concept => {
        const result = byan.glossaryBuilder.addConcept(concept.name, concept.definition);
        expect(result.valid).toBe(true);
      });

      expect(byan.glossaryBuilder.isComplete()).toBe(true);

      // 5. Analysis phase
      byan.stateMachine.transition('ANALYSIS');

      const analysisData = {
        listening: byan.activeListener.export(),
        rootCause: byan.fiveWhysAnalyzer.export(),
        glossary: byan.glossaryBuilder.export()
      };

      expect(analysisData.listening.history.length).toBe(12);
      expect(analysisData.rootCause.responses.length).toBe(6);
      expect(analysisData.glossary.concepts.length).toBe(5);

      // 6. Generation phase
      byan.stateMachine.transition('GENERATION');

      const agentDefinition = {
        name: 'EcommerceOrderManagementAgent',
        description: 'Comprehensive ecommerce agent for order management with real-time inventory',
        purpose: analysisData.listening.summary,
        rootCauseInsights: analysisData.rootCause,
        domainModel: analysisData.glossary,
        capabilities: [
          'Order creation and tracking',
          'Real-time inventory checking',
          'Payment gateway integration',
          'Customer notifications',
          'Returns and refunds',
          'Analytics and reporting'
        ]
      };

      expect(agentDefinition.name).toBeDefined();
      expect(agentDefinition.domainModel.concepts.length).toBe(5);
      expect(agentDefinition.rootCauseInsights.rootCause).toBeDefined();

      // 7. Validation phase
      const validation = byan.mantraValidator.validate(agentDefinition);

      expect(validation.totalMantras).toBe(64);
      expect(validation.complianceScore).toBeGreaterThanOrEqual(80);

      const report = byan.mantraValidator.generateReport(validation);
      expect(report).toContain('Compliance Score');

      // 8. Verify state machine progression
      expect(byan.stateMachine.currentState).toBe('GENERATION');
    });

    it('should maintain data consistency across all phases', () => {
      // Collect data from all phases
      const responses = [
        'Ecommerce agent',
        'Order management',
        'Slow checkout is a problem'
      ];
      
      responses.forEach(r => byan.activeListener.listen(r));
      
      byan.fiveWhysAnalyzer.start('Slow checkout problem');
      ['Payment delays', 'API calls', 'No caching', 'Not prioritized', 'No expertise'].forEach(a => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(a);
      });

      [
        { name: 'order', definition: 'Customer request to purchase products with delivery information' },
        { name: 'product', definition: 'Item available for sale with price and description attributes' },
        { name: 'cart', definition: 'Temporary collection of products selected before checkout' },
        { name: 'payment', definition: 'Financial transaction from customer to merchant for items' },
        { name: 'inventory', definition: 'Stock quantity and availability status of products' }
      ].forEach(c => byan.glossaryBuilder.addConcept(c.name, c.definition));

      // Verify data consistency
      const listeningData = byan.activeListener.export();
      const whysData = byan.fiveWhysAnalyzer.export();
      const glossaryData = byan.glossaryBuilder.export();

      expect(listeningData.metadata.sessionId).toBe('test-full-bmad-workflow');
      expect(whysData.metadata.sessionId).toBe('test-full-bmad-workflow');
      
      expect(listeningData.history.length).toBe(3);
      expect(whysData.responses.length).toBe(6);
      expect(glossaryData.concepts.length).toBe(5);
    });

    it('should preserve backwards compatibility with features disabled', () => {
      const minimalByan = new ByanV2({
        sessionId: 'minimal-test',
        bmad_features: {
          glossary: { enabled: false },
          five_whys: { enabled: false },
          active_listening: { enabled: false },
          mantra_validation: { enabled: true }
        }
      });

      expect(minimalByan.glossaryBuilder).toBeUndefined();
      expect(minimalByan.fiveWhysAnalyzer).toBeUndefined();
      expect(minimalByan.activeListener).toBeUndefined();
      expect(minimalByan.mantraValidator).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should complete full workflow in under 10 seconds', () => {
      const workflowStart = Date.now();

      // Execute abbreviated workflow
      byan.stateMachine.transition('START');
      byan.stateMachine.transition('INTERVIEW');

      ['Response 1', 'Response 2', 'Slow checkout problem'].forEach(r => {
        byan.activeListener.listen(r);
      });

      byan.fiveWhysAnalyzer.start('Slow checkout');
      ['Reason 1', 'Reason 2', 'Reason 3', 'Reason 4', 'Reason 5'].forEach(a => {
        byan.fiveWhysAnalyzer.askNext();
        byan.fiveWhysAnalyzer.processAnswer(a);
      });

      [
        { name: 'order', definition: 'Customer purchase request with payment details' },
        { name: 'product', definition: 'Item for sale with price and description' },
        { name: 'cart', definition: 'Temporary product collection before checkout' },
        { name: 'payment', definition: 'Financial transaction to merchant' },
        { name: 'inventory', definition: 'Stock quantity of products' }
      ].forEach(c => byan.glossaryBuilder.addConcept(c.name, c.definition));

      byan.stateMachine.transition('ANALYSIS');
      byan.stateMachine.transition('GENERATION');

      const agentDef = {
        name: 'Test',
        description: 'Test agent',
        dataModel: byan.glossaryBuilder.export()
      };
      
      byan.mantraValidator.validate(agentDef);

      const duration = Date.now() - workflowStart;
      expect(duration).toBeLessThan(10000);
    });

    it('should have less than 10% performance overhead from BMAD modules', () => {
      const baselineStart = Date.now();
      const baselineByan = new ByanV2({
        bmad_features: {
          glossary: { enabled: false },
          five_whys: { enabled: false },
          active_listening: { enabled: false },
          mantra_validation: { enabled: false }
        }
      });
      const baselineDuration = Date.now() - baselineStart;

      const bmadStart = Date.now();
      const bmadByan = new ByanV2({
        bmad_features: {
          glossary: { enabled: true },
          five_whys: { enabled: true },
          active_listening: { enabled: true },
          mantra_validation: { enabled: true }
        }
      });
      const bmadDuration = Date.now() - bmadStart;

      const overhead = ((bmadDuration - baselineDuration) / baselineDuration) * 100;
      expect(overhead).toBeLessThan(10);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle partial workflow execution gracefully', () => {
      byan.activeListener.listen('Single response');
      
      const listeningData = byan.activeListener.export();
      expect(listeningData.history.length).toBe(1);

      // Glossary not started
      expect(byan.glossaryBuilder.concepts.length).toBe(0);

      // 5 Whys not triggered
      expect(byan.fiveWhysAnalyzer.active).toBe(false);
    });

    it('should handle invalid data gracefully', () => {
      expect(() => {
        byan.activeListener.listen(null);
      }).not.toThrow();

      expect(() => {
        byan.glossaryBuilder.addConcept('', '');
      }).not.toThrow();
    });

    it('should handle state transition errors', () => {
      expect(() => {
        byan.stateMachine.transition('INVALID_STATE');
      }).not.toThrow();
    });
  });
});
