const AgentProfileValidator = require('../../../src/byan-v2/generation/agent-profile-validator');

describe('AgentProfileValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new AgentProfileValidator();
  });

  describe('validate', () => {
    it('should validate complete valid profile', () => {
      const profile = `---
name: "test-agent"
description: "A test agent for validation"
---

You are a test agent specialized in testing.

## Capabilities
- Testing
- Validation

## Tools
- Jest
`;

      const result = validator.validate(profile);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing frontmatter', () => {
      const profile = 'Just content without frontmatter';

      const result = validator.validate(profile);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing YAML frontmatter');
    });

    it('should detect invalid YAML syntax', () => {
      const profile = `---
name: "test
description: invalid
---
Content`;

      const result = validator.validate(profile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require name field', () => {
      const profile = `---
description: "Test description"
---
Content`;

      const result = validator.validate(profile);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should require description field', () => {
      const profile = `---
name: "test-agent"
---
Content`;

      const result = validator.validate(profile);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: description');
    });

    it('should validate name format (lowercase, alphanumeric, hyphens)', () => {
      const invalidNames = [
        'TestAgent',      // uppercase
        'test_agent',     // underscore
        'test agent',     // space
        'test@agent',     // special char
        '123-agent',      // starts with number is ok
      ];

      const invalidProfile = (name) => `---
name: "${name}"
description: "Test description"
---
Content`;

      expect(validator.validate(invalidProfile('TestAgent')).valid).toBe(false);
      expect(validator.validate(invalidProfile('test_agent')).valid).toBe(false);
      expect(validator.validate(invalidProfile('test agent')).valid).toBe(false);
      expect(validator.validate(invalidProfile('test@agent')).valid).toBe(false);
      
      expect(validator.validate(invalidProfile('test-agent')).valid).toBe(true);
      expect(validator.validate(invalidProfile('123-agent')).valid).toBe(true);
    });

    it('should validate description length (10-200 chars)', () => {
      const shortDesc = `---
name: "test"
description: "Short"
---
Content`;

      const longDesc = `---
name: "test"
description: "${'A'.repeat(201)}"
---
Content`;

      const validDesc = `---
name: "test"
description: "Valid length description"
---
Content`;

      expect(validator.validate(shortDesc).valid).toBe(false);
      expect(validator.validate(shortDesc).errors).toContain('Description must be 10-200 characters');
      
      expect(validator.validate(longDesc).valid).toBe(false);
      expect(validator.validate(longDesc).errors).toContain('Description must be 10-200 characters');
      
      expect(validator.validate(validDesc).valid).toBe(true);
    });

    it('should detect emoji pollution (Mantra IA-23)', () => {
      const profileWithEmoji = `---
name: "test-agent"
description: "Test agent with emoji"
---

You are a test agent 🚀 specialized in testing 🧪.
`;

      const result = validator.validate(profileWithEmoji);

      expect(result.warnings).toContain('Emoji detected (Mantra IA-23: Zero Emoji Pollution)');
    });

    it('should validate file size < 50KB', () => {
      const largeProfile = `---
name: "test-agent"
description: "Large profile test"
---

${'A'.repeat(51 * 1024)}
`;

      const result = validator.validate(largeProfile);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Profile exceeds 50KB size limit');
    });

    it('should require at least one capability', () => {
      const noCaps = `---
name: "test-agent"
description: "Agent without capabilities"
---

You are a test agent.
`;

      const result = validator.validate(noCaps);

      expect(result.warnings).toContain('No capabilities section found');
    });

    it('should validate markdown structure', () => {
      const validStructure = `---
name: "test-agent"
description: "Well-structured agent"
---

You are a professional test agent.

## Capabilities
- Testing
- Validation

## Tools
- Jest
- Mocha
`;

      const result = validator.validate(validStructure);

      expect(result.valid).toBe(true);
    });

    it('should allow warnings but still be valid', () => {
      const profileWithWarnings = `---
name: "test-agent"
description: "Agent with warnings"
---

You are a test agent 🎯.

## Capabilities
- Testing
`;

      const result = validator.validate(profileWithWarnings);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateYamlFrontmatter', () => {
    it('should extract and validate frontmatter', () => {
      const profile = `---
name: "test"
description: "Test description"
---
Content`;

      const result = validator.validateYamlFrontmatter(profile);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        name: 'test',
        description: 'Test description'
      });
    });

    it('should return error for missing frontmatter', () => {
      const result = validator.validateYamlFrontmatter('No frontmatter');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing YAML frontmatter');
    });

    it('should return error for invalid YAML', () => {
      const profile = `---
invalid: yaml: syntax:
---`;

      const result = validator.validateYamlFrontmatter(profile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateNameFormat', () => {
    it('should accept valid names', () => {
      const validNames = [
        'test-agent',
        'my-cool-agent',
        'agent123',
        '123-test',
        'a'
      ];

      validNames.forEach(name => {
        expect(validator.validateNameFormat(name)).toBe(true);
      });
    });

    it('should reject invalid names', () => {
      const invalidNames = [
        'TestAgent',      // uppercase
        'test_agent',     // underscore
        'test agent',     // space
        'test@agent',     // special char
        'test.agent',     // dot
      ];

      invalidNames.forEach(name => {
        expect(validator.validateNameFormat(name)).toBe(false);
      });
    });

    it('should reject empty name', () => {
      expect(validator.validateNameFormat('')).toBe(false);
    });
  });

  describe('detectEmojis', () => {
    it('should detect common emojis', () => {
      const textWithEmojis = 'Hello 👋 World 🌍';

      expect(validator.detectEmojis(textWithEmojis)).toBe(true);
    });

    it('should return false for text without emojis', () => {
      const text = 'Plain text without emojis';

      expect(validator.detectEmojis(text)).toBe(false);
    });

    it('should detect various emoji types', () => {
      const emojis = ['🚀', '🎯', '✅', '❌', '⚠️', '💡', '🔧'];
      
      emojis.forEach(emoji => {
        expect(validator.detectEmojis(`Text with ${emoji}`)).toBe(true);
      });
    });
  });

  describe('validateDescriptionLength', () => {
    it('should accept valid length (10-200)', () => {
      const valid = 'This is a valid description for testing';

      expect(validator.validateDescriptionLength(valid)).toBe(true);
    });

    it('should reject too short', () => {
      expect(validator.validateDescriptionLength('Short')).toBe(false);
    });

    it('should reject too long', () => {
      const tooLong = 'A'.repeat(201);

      expect(validator.validateDescriptionLength(tooLong)).toBe(false);
    });

    it('should accept exactly 10 chars', () => {
      expect(validator.validateDescriptionLength('1234567890')).toBe(true);
    });

    it('should accept exactly 200 chars', () => {
      const exactly200 = 'A'.repeat(200);

      expect(validator.validateDescriptionLength(exactly200)).toBe(true);
    });
  });

  describe('checkFileSize', () => {
    it('should accept profiles under 50KB', () => {
      const small = 'A'.repeat(1000);

      expect(validator.checkFileSize(small)).toBe(true);
    });

    it('should reject profiles over 50KB', () => {
      const large = 'A'.repeat(51 * 1024);

      expect(validator.checkFileSize(large)).toBe(false);
    });

    it('should accept exactly 50KB', () => {
      const exactly50KB = 'A'.repeat(50 * 1024);

      expect(validator.checkFileSize(exactly50KB)).toBe(true);
    });
  });

  describe('hasCapabilitiesSection', () => {
    it('should detect capabilities section', () => {
      const profile = `
## Capabilities
- Cap1
- Cap2
`;

      expect(validator.hasCapabilitiesSection(profile)).toBe(true);
    });

    it('should detect alternative headings', () => {
      const alternatives = [
        '## Capabilities',
        '## Capability',
        '### Capabilities',
        '# Capabilities'
      ];

      alternatives.forEach(heading => {
        const profile = `${heading}\n- Cap1`;
        expect(validator.hasCapabilitiesSection(profile)).toBe(true);
      });
    });

    it('should return false if no capabilities section', () => {
      const profile = 'Content without capabilities';

      expect(validator.hasCapabilitiesSection(profile)).toBe(false);
    });
  });
});
