/**
 * Tests for Interviewer & Wizard Modules
 */

const interviewer = require('../lib/yanstaller/interviewer');
const wizard = require('../lib/yanstaller/wizard');

describe('Interviewer Module', () => {
  describe('getAgentChoices', () => {
    test('returns list of all available agents', () => {
      const choices = interviewer.getAgentChoices();
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBeGreaterThan(20);
      
      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(choice).toHaveProperty('checked');
      });
    });
    
    test('includes core agents like BYAN and RACHID', () => {
      const choices = interviewer.getAgentChoices();
      const values = choices.map(c => c.value);
      
      expect(values).toContain('byan');
      expect(values).toContain('rachid');
      expect(values).toContain('dev');
      expect(values).toContain('tech-writer');
    });
    
    test('has reasonable defaults checked', () => {
      const choices = interviewer.getAgentChoices();
      const checkedAgents = choices.filter(c => c.checked).map(c => c.value);
      
      expect(checkedAgents).toContain('byan');
      expect(checkedAgents).toContain('rachid');
      expect(checkedAgents).toContain('dev');
    });
  });
  
  describe('getAllAgents', () => {
    test('returns array of all agent names', () => {
      const agents = interviewer.getAllAgents();
      
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(20);
      expect(agents).toContain('byan');
      expect(agents).toContain('rachid');
    });
  });
  
  describe('askQuestion', () => {
    test('is a function', () => {
      expect(typeof interviewer.askQuestion).toBe('function');
    });
  });
});

describe('Wizard Module', () => {
  const mockConfig = {
    projectRoot: '/test/project',
    agents: ['byan', 'rachid', 'dev'],
    targetPlatforms: ['copilot-cli'],
    mode: 'minimal',
    userName: 'Test User'
  };
  
  describe('showExitMessage', () => {
    test('displays message without throwing', () => {
      expect(() => {
        wizard.showExitMessage(mockConfig);
      }).not.toThrow();
    });
  });
  
  describe('showDocumentation', () => {
    test('displays documentation paths', () => {
      expect(() => {
        wizard.showDocumentation(mockConfig);
      }).not.toThrow();
    });
  });
  
  describe('module exports', () => {
    test('exports all required functions', () => {
      expect(typeof wizard.show).toBe('function');
      expect(typeof wizard.launchByanInterview).toBe('function');
      expect(typeof wizard.testAgent).toBe('function');
      expect(typeof wizard.showDocumentation).toBe('function');
      expect(typeof wizard.showExitMessage).toBe('function');
    });
  });
});

describe('Interview Flow Integration', () => {
  test('interviewer provides data structure for wizard', () => {
    const agents = interviewer.getAllAgents();
    const mockResult = {
      userName: 'Test',
      language: 'English',
      mode: 'custom',
      agents: agents.slice(0, 5),
      targetPlatforms: ['copilot-cli'],
      createSampleAgent: false,
      createBackup: true
    };
    
    // This structure should work with wizard
    expect(mockResult.agents).toBeDefined();
    expect(mockResult.targetPlatforms).toBeDefined();
    expect(Array.isArray(mockResult.agents)).toBe(true);
  });
});
