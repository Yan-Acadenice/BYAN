const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ProfileTemplate {
  static render(template, data) {
    let result = template;
    
    const placeholders = this.extractPlaceholders(template);
    
    for (const placeholder of placeholders) {
      const value = this.resolvePlaceholder(placeholder, data);
      
      if (value !== undefined && value !== null) {
        const regex = new RegExp(`\\{\\{${placeholder.replace(/\./g, '\\.')}\\}\\}`, 'g');
        result = result.replace(regex, value);
      }
    }
    
    return result;
  }

  static loadTemplate(templateName) {
    const templatesDir = path.join(__dirname, 'templates');
    const templatePath = path.join(templatesDir, `${templateName}.md`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    return fs.readFileSync(templatePath, 'utf-8');
  }

  static renderFromFile(templateName, data) {
    const template = this.loadTemplate(templateName);
    return this.render(template, data);
  }

  static validateTemplate(template, requiredPlaceholders = []) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    const frontmatterMatch = template.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      result.valid = false;
      result.errors.push('Missing YAML frontmatter');
      return result;
    }

    try {
      yaml.load(frontmatterMatch[1]);
    } catch (e) {
      result.valid = false;
      result.errors.push(`Invalid YAML frontmatter: ${e.message}`);
      return result;
    }

    const templatePlaceholders = this.extractPlaceholders(template);
    
    for (const required of requiredPlaceholders) {
      if (!templatePlaceholders.includes(required)) {
        result.warnings.push(`Missing required placeholder: ${required}`);
      }
    }

    const xmlMatch = template.match(/```xml\n([\s\S]*?)\n```/);
    if (xmlMatch) {
      const xmlContent = xmlMatch[1];
      const openTags = (xmlContent.match(/<(\w+)[^>]*>/g) || []).map(tag => tag.match(/<(\w+)/)[1]);
      const closeTags = (xmlContent.match(/<\/(\w+)>/g) || []).map(tag => tag.match(/<\/(\w+)>/)[1]);
      
      if (openTags.length !== closeTags.length) {
        result.warnings.push('Potentially malformed XML: tag count mismatch');
      }
    }

    return result;
  }

  static extractPlaceholders(template) {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [];
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    
    return matches;
  }

  static resolvePlaceholder(path, data) {
    const parts = path.split('.');
    let current = data;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}

module.exports = ProfileTemplate;
