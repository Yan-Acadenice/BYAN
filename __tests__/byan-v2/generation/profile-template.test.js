const ProfileTemplate = require('../../../src/byan-v2/generation/profile-template');
const fs = require('fs');
const path = require('path');

describe('ProfileTemplate', () => {
  describe('render', () => {
    it('should render template with simple placeholders', () => {
      const template = 'Agent: {{agent_name}}, Role: {{role}}';
      const data = { agent_name: 'TestAgent', role: 'Reviewer' };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Agent: TestAgent, Role: Reviewer');
    });

    it('should handle missing placeholders gracefully', () => {
      const template = 'Agent: {{agent_name}}, Role: {{role}}';
      const data = { agent_name: 'TestAgent' };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Agent: TestAgent, Role: {{role}}');
    });

    it('should support nested data access', () => {
      const template = 'Capability: {{analysis.capabilities.0}}';
      const data = { 
        analysis: { 
          capabilities: ['Code Review', 'Testing'] 
        } 
      };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Capability: Code Review');
    });

    it('should support nested object properties', () => {
      const template = 'Name: {{agent.name}}, Domain: {{agent.domain}}';
      const data = {
        agent: {
          name: 'CodeReviewer',
          domain: 'Software Quality'
        }
      };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Name: CodeReviewer, Domain: Software Quality');
    });

    it('should render complete BMAD agent template', () => {
      const template = `---
name: "{{agent_name}}"
description: "{{description}}"
---

\`\`\`xml
<agent id="{{agent_id}}" name="{{agent_name}}" title="{{title}}" icon="{{icon}}">
<persona>{{persona}}</persona>
<capabilities>{{capabilities}}</capabilities>
</agent>
\`\`\``;

      const data = {
        agent_name: 'test-agent',
        description: 'Test agent',
        agent_id: 'test.agent',
        title: 'Test Agent',
        icon: '🧪',
        persona: 'Expert tester',
        capabilities: 'Testing, Validation'
      };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toContain('name: "test-agent"');
      expect(result).toContain('description: "Test agent"');
      expect(result).toContain('<agent id="test.agent"');
      expect(result).toContain('<persona>Expert tester</persona>');
    });

    it('should handle empty data object', () => {
      const template = 'Agent: {{agent_name}}';
      const data = {};
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Agent: {{agent_name}}');
    });

    it('should handle special characters in data', () => {
      const template = 'Description: {{description}}';
      const data = { description: 'Agent with "quotes" and \'apostrophes\'' };
      
      const result = ProfileTemplate.render(template, data);
      
      expect(result).toBe('Description: Agent with "quotes" and \'apostrophes\'');
    });
  });

  describe('loadTemplate', () => {
    const templatesDir = path.join(__dirname, '../../../src/byan-v2/generation/templates');

    beforeAll(() => {
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }
    });

    it('should load default template', () => {
      const templatePath = path.join(templatesDir, 'default-agent.md');
      
      if (!fs.existsSync(templatePath)) {
        fs.writeFileSync(templatePath, 'Agent: {{agent_name}}');
      }
      
      const template = ProfileTemplate.loadTemplate('default-agent');
      
      expect(template).toContain('{{agent_name}}');
    });

    it('should throw error for non-existent template', () => {
      expect(() => {
        ProfileTemplate.loadTemplate('non-existent-template');
      }).toThrow();
    });

    it('should load custom template from custom path', () => {
      const customPath = path.join(templatesDir, 'custom-agent.md');
      fs.writeFileSync(customPath, 'Custom: {{custom_field}}');
      
      const template = ProfileTemplate.loadTemplate('custom-agent');
      
      expect(template).toContain('{{custom_field}}');
      
      fs.unlinkSync(customPath);
    });
  });

  describe('renderFromFile', () => {
    const templatesDir = path.join(__dirname, '../../../src/byan-v2/generation/templates');

    beforeAll(() => {
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }
      
      const templatePath = path.join(templatesDir, 'test-template.md');
      fs.writeFileSync(templatePath, 'Agent: {{agent_name}}, Role: {{role}}');
    });

    it('should load and render template from file', () => {
      const data = { agent_name: 'FileAgent', role: 'Tester' };
      
      const result = ProfileTemplate.renderFromFile('test-template', data);
      
      expect(result).toBe('Agent: FileAgent, Role: Tester');
    });

    it('should use default template if none specified', () => {
      const data = { agent_name: 'DefaultAgent' };
      
      const result = ProfileTemplate.renderFromFile('default-agent', data);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('validateTemplate', () => {
    it('should validate valid YAML frontmatter', () => {
      const template = `---
name: "test"
description: "test desc"
---

Content here`;
      
      const validation = ProfileTemplate.validateTemplate(template);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid YAML frontmatter', () => {
      const template = `---
name: "test
description: invalid
---

Content`;
      
      const validation = ProfileTemplate.validateTemplate(template);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing frontmatter', () => {
      const template = 'Just content without frontmatter';
      
      const validation = ProfileTemplate.validateTemplate(template);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing YAML frontmatter');
    });

    it('should validate required placeholders', () => {
      const template = `---
name: "{{agent_name}}"
---

Agent content`;
      
      const requiredPlaceholders = ['agent_name', 'description'];
      const validation = ProfileTemplate.validateTemplate(template, requiredPlaceholders);
      
      expect(validation.warnings).toContain('Missing required placeholder: description');
    });

    it('should validate XML structure in content', () => {
      const template = `---
name: "test"
---

\`\`\`xml
<agent id="test">
  <persona>Test</persona>
</agent>
\`\`\``;
      
      const validation = ProfileTemplate.validateTemplate(template);
      
      expect(validation.valid).toBe(true);
    });

    it('should detect malformed XML', () => {
      const template = `---
name: "test"
---

\`\`\`xml
<agent id="test">
  <persona>Test
</agent>
\`\`\``;
      
      const validation = ProfileTemplate.validateTemplate(template);
      
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('extractPlaceholders', () => {
    it('should extract all placeholders from template', () => {
      const template = 'Name: {{name}}, Role: {{role}}, Domain: {{domain}}';
      
      const placeholders = ProfileTemplate.extractPlaceholders(template);
      
      expect(placeholders).toEqual(['name', 'role', 'domain']);
    });

    it('should extract nested placeholders', () => {
      const template = 'First: {{data.first}}, Second: {{data.second}}';
      
      const placeholders = ProfileTemplate.extractPlaceholders(template);
      
      expect(placeholders).toContain('data.first');
      expect(placeholders).toContain('data.second');
    });

    it('should return unique placeholders', () => {
      const template = '{{name}} and {{name}} and {{role}}';
      
      const placeholders = ProfileTemplate.extractPlaceholders(template);
      
      expect(placeholders).toEqual(['name', 'role']);
      expect(placeholders.length).toBe(2);
    });

    it('should handle template with no placeholders', () => {
      const template = 'Static content only';
      
      const placeholders = ProfileTemplate.extractPlaceholders(template);
      
      expect(placeholders).toEqual([]);
    });
  });

  describe('resolvePlaceholder', () => {
    it('should resolve simple property', () => {
      const data = { name: 'TestAgent' };
      
      const result = ProfileTemplate.resolvePlaceholder('name', data);
      
      expect(result).toBe('TestAgent');
    });

    it('should resolve nested property with dot notation', () => {
      const data = { agent: { name: 'Nested' } };
      
      const result = ProfileTemplate.resolvePlaceholder('agent.name', data);
      
      expect(result).toBe('Nested');
    });

    it('should resolve array index', () => {
      const data = { capabilities: ['Cap1', 'Cap2', 'Cap3'] };
      
      const result = ProfileTemplate.resolvePlaceholder('capabilities.0', data);
      
      expect(result).toBe('Cap1');
    });

    it('should return undefined for missing property', () => {
      const data = { name: 'Test' };
      
      const result = ProfileTemplate.resolvePlaceholder('missing', data);
      
      expect(result).toBeUndefined();
    });

    it('should handle deep nesting', () => {
      const data = {
        level1: {
          level2: {
            level3: 'Deep Value'
          }
        }
      };
      
      const result = ProfileTemplate.resolvePlaceholder('level1.level2.level3', data);
      
      expect(result).toBe('Deep Value');
    });
  });
});
