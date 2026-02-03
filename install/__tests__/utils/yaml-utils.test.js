/**
 * YAML Utils Tests
 * 
 * Tests for install/lib/utils/yaml-utils.js
 */

const yamlUtils = require('../../lib/utils/yaml-utils');
const fileUtils = require('../../lib/utils/file-utils');

jest.mock('../../lib/utils/file-utils');

describe('YAML Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parse()', () => {
    it('should parse valid YAML string', () => {
      const yamlString = 'name: test\nvalue: 123';
      
      const result = yamlUtils.parse(yamlString);
      
      expect(result).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('dump()', () => {
    it('should dump object to YAML string', () => {
      const obj = { name: 'test', value: 123 };
      
      const result = yamlUtils.dump(obj);
      
      expect(result).toContain('name: test');
      expect(result).toContain('value: 123');
    });
  });

  describe('readYAML()', () => {
    it('should read and parse YAML file', async () => {
      fileUtils.readFile.mockResolvedValue('name: test\nvalue: 123');
      
      const result = await yamlUtils.readYAML('/path/file.yaml');
      
      expect(fileUtils.readFile).toHaveBeenCalledWith('/path/file.yaml');
      expect(result).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('writeYAML()', () => {
    it('should dump and write YAML file', async () => {
      fileUtils.writeFile.mockResolvedValue();
      
      await yamlUtils.writeYAML('/path/file.yaml', { name: 'test', value: 123 });
      
      expect(fileUtils.writeFile).toHaveBeenCalledWith(
        '/path/file.yaml',
        expect.stringContaining('name: test')
      );
    });
  });

  describe('extractFrontmatter()', () => {
    it('should extract frontmatter and content from markdown', () => {
      const markdown = `---
name: test
value: 123
---
# Content here`;
      
      const result = yamlUtils.extractFrontmatter(markdown);
      
      expect(result.frontmatter).toEqual({ name: 'test', value: 123 });
      expect(result.content).toBe('# Content here');
    });

    it('should return null frontmatter when no frontmatter exists', () => {
      const markdown = '# Content without frontmatter';
      
      const result = yamlUtils.extractFrontmatter(markdown);
      
      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(markdown);
    });
  });
});
