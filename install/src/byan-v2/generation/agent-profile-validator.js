const yaml = require('js-yaml');

class AgentProfileValidator {
  validate(profileContent) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!this.checkFileSize(profileContent)) {
      result.valid = false;
      result.errors.push('Profile exceeds 50KB size limit');
      return result;
    }

    const frontmatterResult = this.validateYamlFrontmatter(profileContent);
    if (!frontmatterResult.valid) {
      result.valid = false;
      result.errors.push(...frontmatterResult.errors);
      return result;
    }

    const { data } = frontmatterResult;

    if (!data.name) {
      result.valid = false;
      result.errors.push('Missing required field: name');
    } else if (!this.validateNameFormat(data.name)) {
      result.valid = false;
      result.errors.push('Invalid name format (use lowercase, alphanumeric, hyphens only)');
    }

    if (!data.description) {
      result.valid = false;
      result.errors.push('Missing required field: description');
    } else if (!this.validateDescriptionLength(data.description)) {
      result.valid = false;
      result.errors.push('Description must be 10-200 characters');
    }

    if (this.detectEmojis(profileContent)) {
      result.warnings.push('Emoji detected (Mantra IA-23: Zero Emoji Pollution)');
    }

    if (!this.hasCapabilitiesSection(profileContent)) {
      result.warnings.push('No capabilities section found');
    }

    return result;
  }

  validateYamlFrontmatter(content) {
    const result = {
      valid: true,
      errors: [],
      data: null
    };

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!match) {
      result.valid = false;
      result.errors.push('Missing YAML frontmatter');
      return result;
    }

    try {
      result.data = yaml.load(match[1]);
    } catch (e) {
      result.valid = false;
      result.errors.push(`Invalid YAML: ${e.message}`);
    }

    return result;
  }

  validateNameFormat(name) {
    if (!name || name.length === 0) {
      return false;
    }

    const validNameRegex = /^[a-z0-9-]+$/;
    return validNameRegex.test(name);
  }

  validateDescriptionLength(description) {
    if (!description) {
      return false;
    }

    const len = description.length;
    return len >= 10 && len <= 200;
  }

  detectEmojis(text) {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    return emojiRegex.test(text);
  }

  checkFileSize(content) {
    const sizeInBytes = Buffer.byteLength(content, 'utf-8');
    const maxSize = 50 * 1024;
    return sizeInBytes <= maxSize;
  }

  hasCapabilitiesSection(content) {
    const capabilitiesRegex = /^#{1,3}\s+(Capabilit(y|ies))/mi;
    return capabilitiesRegex.test(content);
  }
}

module.exports = AgentProfileValidator;
