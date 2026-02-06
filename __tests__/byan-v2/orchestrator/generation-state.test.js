const GenerationState = require('../../../src/byan-v2/orchestrator/generation-state');
const SessionState = require('../../../src/byan-v2/context/session-state');
const Logger = require('../../../src/byan-v2/observability/logger');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../../../src/byan-v2/observability/logger');
jest.mock('fs');

describe('GenerationState - Story 4.4', () => {
  let generationState;
  let sessionState;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    Logger.mockImplementation(() => mockLogger);

    // Mock fs
    fs.writeFileSync = jest.fn();
    fs.mkdirSync = jest.fn();
    fs.existsSync = jest.fn().mockReturnValue(true);

    // Setup SessionState with analysis results
    sessionState = new SessionState();
    sessionState.setAnalysisResults({
      requirements: {
        purpose: 'Testing automation agent',
        capabilities: ['run tests', 'generate reports', 'validate code'],
        knowledgeAreas: ['QA', 'Testing', 'CI/CD'],
        constraints: ['Must integrate with GitHub Actions']
      },
      patterns: [
        { theme: 'testing', occurrences: 5 },
        { theme: 'automation', occurrences: 3 }
      ]
    });

    generationState = new GenerationState(sessionState);
  });

  describe('AC1: GenerationState creates agent profile', () => {
    test('should initialize with SessionState', () => {
      expect(generationState.sessionState).toBe(sessionState);
    });

    test('should have logger', () => {
      expect(generationState.logger).toBeDefined();
    });

    test('should track generation state', () => {
      expect(generationState.profileGenerated).toBe(false);
    });

    test('should create profile with YAML frontmatter + XML structure', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('---');
      expect(profile).toContain('name:');
      expect(profile).toContain('description:');
      expect(profile).toContain('```xml');
      expect(profile).toContain('<agent');
    });
  });

  describe('AC2: generateProfile() uses analysis results', () => {
    test('should extract name from purpose', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toMatch(/name:\s*["']?[a-z-]+["']?/);
    });

    test('should include description from purpose', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('description:');
      expect(profile).toContain('Testing');
    });

    test('should include persona derived from capabilities', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('<persona>');
      expect(profile.toLowerCase()).toContain('test');
    });

    test('should include menu with capabilities', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('<menu>');
      expect(profile).toContain('<item');
    });

    test('should include capabilities section', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('<capabilities>');
    });

    test('should use analysis requirements', async () => {
      const profile = await generationState.generateProfile();
      
      // Should reference testing/automation from requirements
      const lowerProfile = profile.toLowerCase();
      expect(lowerProfile).toMatch(/test|automation|qa/);
    });
  });

  describe('AC3: Format compliance (YAML frontmatter + XML)', () => {
    test('should start with YAML frontmatter delimiter', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile.trim()).toMatch(/^---/);
    });

    test('should have required YAML fields: name, description', async () => {
      const profile = await generationState.generateProfile();
      
      const frontmatterMatch = profile.match(/^---([\s\S]*?)---/);
      expect(frontmatterMatch).not.toBeNull();
      
      const frontmatter = frontmatterMatch[1];
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');
    });

    test('should have XML code block', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('```xml');
      expect(profile).toMatch(/```xml[\s\S]*?```/);
    });

    test('should have well-formed XML structure', async () => {
      const profile = await generationState.generateProfile();
      
      // Extract XML
      const xmlMatch = profile.match(/```xml\s*([\s\S]*?)\s*```/);
      expect(xmlMatch).not.toBeNull();
      
      const xml = xmlMatch[1];
      expect(xml).toContain('<agent');
      expect(xml).toContain('</agent>');
    });

    test('should follow BMAD/Copilot agent structure', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('<agent');
      expect(profile).toContain('<persona>');
      expect(profile).toContain('<menu>');
    });

    test('should use .md extension format', async () => {
      const profile = await generationState.generateProfile();
      
      // Markdown file with YAML frontmatter + XML block
      expect(profile).toMatch(/^---[\s\S]*---[\s\S]*```xml/);
    });
  });

  describe('AC4: validateProfile() checks requirements', () => {
    test('should validate required YAML fields present', async () => {
      const profile = await generationState.generateProfile();
      const isValid = generationState.validateProfile(profile);
      
      expect(isValid).toBe(true);
    });

    test('should reject profile without name', () => {
      const invalidProfile = `---
description: Test
---
\`\`\`xml
<agent></agent>
\`\`\``;
      
      const isValid = generationState.validateProfile(invalidProfile);
      expect(isValid).toBe(false);
    });

    test('should reject profile without description', () => {
      const invalidProfile = `---
name: test
---
\`\`\`xml
<agent></agent>
\`\`\``;
      
      const isValid = generationState.validateProfile(invalidProfile);
      expect(isValid).toBe(false);
    });

    test('should validate XML is well-formed', async () => {
      const profile = await generationState.generateProfile();
      
      // Extract XML
      const xmlMatch = profile.match(/```xml\s*([\s\S]*?)\s*```/);
      const xml = xmlMatch[1];
      
      // Basic well-formedness: opening/closing tags
      expect(xml).toContain('<agent');
      expect(xml).toContain('</agent>');
    });

    test('should reject profile with malformed XML', () => {
      const invalidProfile = `---
name: test
description: Test
---
\`\`\`xml
<agent>
  <persona>Test
  <!-- Missing closing tags -->
\`\`\``;
      
      const isValid = generationState.validateProfile(invalidProfile);
      expect(isValid).toBe(false);
    });

    test('should validate no emojis in code sections', async () => {
      const profile = await generationState.generateProfile();
      
      // XML section should not contain emojis
      const xmlMatch = profile.match(/```xml\s*([\s\S]*?)\s*```/);
      if (xmlMatch) {
        const xml = xmlMatch[1];
        expect(xml).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
      }
    });

    test('should allow emojis in description/text', () => {
      const profileWithEmoji = `---
name: test
description: Testing agent 🚀
---
\`\`\`xml
<agent id="test">
  <persona>Test agent</persona>
</agent>
\`\`\``;
      
      const isValid = generationState.validateProfile(profileWithEmoji);
      expect(isValid).toBe(true);
    });
  });

  describe('AC5: saveProfile(path) writes to disk', () => {
    test('should save profile to specified path', async () => {
      const profile = await generationState.generateProfile();
      const savePath = '.github/copilot/agents/test-agent.md';
      
      generationState.saveProfile(savePath);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-agent.md'),
        expect.any(String),
        'utf-8'
      );
    });

    test('should create directory if not exists', async () => {
      fs.existsSync.mockReturnValue(false);
      
      await generationState.generateProfile();
      generationState.saveProfile('.github/copilot/agents/test.md');
      
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    test('should save to .github/copilot/agents/ by default', async () => {
      await generationState.generateProfile();
      const defaultPath = generationState.getDefaultSavePath();
      
      expect(defaultPath).toContain('.github/copilot/agents');
    });

    test('should use agent name in filename', async () => {
      await generationState.generateProfile();
      const defaultPath = generationState.getDefaultSavePath();
      
      expect(defaultPath).toMatch(/\.md$/);
    });

    test('should write profile content', async () => {
      const profile = await generationState.generateProfile();
      generationState.saveProfile('.github/copilot/agents/test.md');
      
      const writeCall = fs.writeFileSync.mock.calls[0];
      expect(writeCall[1]).toContain('---');
      expect(writeCall[1]).toContain('```xml');
    });

    test('should log save operation', async () => {
      await generationState.generateProfile();
      generationState.saveProfile('.github/copilot/agents/test.md');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('saved'),
        expect.any(Object)
      );
    });
  });

  describe('AC6: Integration with SessionState', () => {
    test('should retrieve analysis results from SessionState', async () => {
      const profile = await generationState.generateProfile();
      
      // Should use analysis results
      expect(profile).toBeDefined();
    });

    test('should handle missing analysis results', async () => {
      sessionState.analysisResults = null;
      
      await expect(generationState.generateProfile()).rejects.toThrow();
    });

    test('should handle incomplete requirements', async () => {
      sessionState.analysisResults = {
        requirements: {
          purpose: 'Test'
          // Missing capabilities, knowledgeAreas
        }
      };
      
      await expect(generationState.generateProfile()).rejects.toThrow();
    });

    test('should store generated profile in SessionState', async () => {
      const profile = await generationState.generateProfile();
      
      expect(sessionState.agentProfileDraft).toBeDefined();
      expect(sessionState.agentProfileDraft.content).toBe(profile);
    });

    test('should preserve SessionState data', async () => {
      const originalResults = sessionState.analysisResults;
      
      await generationState.generateProfile();
      
      expect(sessionState.analysisResults).toEqual(originalResults);
    });
  });

  describe('AC7: Tests validate profile format and compliance', () => {
    test('should generate valid agent profile', async () => {
      const profile = await generationState.generateProfile();
      const isValid = generationState.validateProfile(profile);
      
      expect(isValid).toBe(true);
    });

    test('should create consistent profile structure', async () => {
      const profile1 = await generationState.generateProfile();
      const profile2 = await generationState.generateProfile();
      
      // Both should have same structure
      expect(profile1).toContain('---');
      expect(profile2).toContain('---');
      expect(profile1).toContain('```xml');
      expect(profile2).toContain('```xml');
    });

    test('should handle various requirement types', async () => {
      sessionState.setAnalysisResults({
        requirements: {
          purpose: 'Complex multi-purpose agent',
          capabilities: ['capability1', 'capability2', 'capability3'],
          knowledgeAreas: ['domain1', 'domain2'],
          constraints: ['constraint1']
        }
      });
      
      const profile = await generationState.generateProfile();
      expect(generationState.validateProfile(profile)).toBe(true);
    });

    test('should escape special characters correctly', async () => {
      sessionState.setAnalysisResults({
        requirements: {
          purpose: 'Agent with <special> & "characters"',
          capabilities: ['test'],
          knowledgeAreas: ['testing'],
          constraints: []
        }
      });
      
      const profile = await generationState.generateProfile();
      expect(generationState.validateProfile(profile)).toBe(true);
    });
  });

  describe('Profile Content Quality', () => {
    test('should generate unique agent ID', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toMatch(/id=["'][^"']+["']/);
    });

    test('should include activation section', async () => {
      const profile = await generationState.generateProfile();
      
      expect(profile).toContain('<activation>');
    });

    test('should include menu with at least one item', async () => {
      const profile = await generationState.generateProfile();
      
      const menuMatch = profile.match(/<menu>([\s\S]*?)<\/menu>/);
      expect(menuMatch).not.toBeNull();
      expect(menuMatch[1]).toContain('<item');
    });

    test('should derive agent name from purpose', async () => {
      const profile = await generationState.generateProfile();
      
      // Name should be lowercase, hyphenated
      const nameMatch = profile.match(/name:\s*["']?([a-z-]+)["']?/);
      expect(nameMatch).not.toBeNull();
      expect(nameMatch[1]).toMatch(/^[a-z-]+$/);
    });
  });

  describe('Error Handling', () => {
    test('should handle null SessionState', () => {
      expect(() => {
        new GenerationState(null);
      }).toThrow();
    });

    test('should handle empty requirements', async () => {
      sessionState.analysisResults = { requirements: {} };
      
      await expect(generationState.generateProfile()).rejects.toThrow();
    });

    test('should log generation errors', async () => {
      sessionState.analysisResults = null;
      
      try {
        await generationState.generateProfile();
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    test('should handle file write errors', async () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      await generationState.generateProfile();
      
      expect(() => {
        generationState.saveProfile('.github/copilot/agents/test.md');
      }).toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long purpose', async () => {
      sessionState.setAnalysisResults({
        requirements: {
          purpose: 'A'.repeat(500),
          capabilities: ['test'],
          knowledgeAreas: ['testing'],
          constraints: []
        }
      });
      
      const profile = await generationState.generateProfile();
      expect(generationState.validateProfile(profile)).toBe(true);
    });

    test('should handle many capabilities', async () => {
      sessionState.setAnalysisResults({
        requirements: {
          purpose: 'Test agent',
          capabilities: Array(20).fill(0).map((_, i) => `capability${i}`),
          knowledgeAreas: ['testing'],
          constraints: []
        }
      });
      
      const profile = await generationState.generateProfile();
      expect(profile).toBeDefined();
    });

    test('should sanitize invalid characters in name', async () => {
      sessionState.setAnalysisResults({
        requirements: {
          purpose: 'Test Agent With Spaces & Special!',
          capabilities: ['test'],
          knowledgeAreas: ['testing'],
          constraints: []
        }
      });
      
      const profile = await generationState.generateProfile();
      const nameMatch = profile.match(/name:\s*["']?([^"'\n]+)["']?/);
      
      // Name should be sanitized
      expect(nameMatch[1]).toMatch(/^[a-z-]+$/);
    });
  });
});
