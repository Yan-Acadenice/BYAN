/**
 * GenerationState - Story 4.4
 * Generates agent profile in BMAD/Copilot format
 * 
 * Format:
 * - YAML frontmatter (name, description)
 * - XML structure (<agent>, <persona>, <menu>, <capabilities>)
 * - Compliant with .github/copilot/agents/ standard
 */

const Logger = require('../observability/logger');
const fs = require('fs');
const path = require('path');

class GenerationState {
  constructor(sessionState) {
    if (!sessionState) {
      throw new Error('SessionState is required');
    }

    this.sessionState = sessionState;
    this.logger = new Logger();
    this.profileGenerated = false;
    this.generatedProfile = null;
  }

  /**
   * AC2: Generate agent profile from analysis results
   * Creates: name, description, persona, menu, capabilities
   * 
   * @returns {Promise<string>} Agent profile content
   */
  async generateProfile() {
    this.logger.info('Starting agent profile generation');

    // AC6: Try to retrieve analysis results, fallback to user responses
    let requirements;
    
    if (this.sessionState.analysisResults && this.sessionState.analysisResults.requirements) {
      requirements = this.sessionState.analysisResults.requirements;
    } else {
      // Fallback: Generate minimal requirements from user responses
      this.logger.warn('No analysis results, generating from user responses');
      requirements = this._extractRequirementsFromResponses();
    }

    // AC2: Extract components from requirements
    const agentName = this._deriveAgentName(requirements.purpose || 'custom-agent');
    const description = this._deriveDescription(requirements.purpose || 'Custom agent');
    const persona = this._generatePersona(requirements);
    const menu = this._generateMenu(requirements.capabilities || []);
    const capabilities = this._generateCapabilities(requirements);

    // AC1 & AC3: Build profile with YAML frontmatter + XML
    this.generatedProfile = this._buildProfile({
      name: agentName,
      description,
      persona,
      menu,
      capabilities,
      requirements
    });

    // AC6: Store in SessionState
    this.sessionState.agentProfileDraft = {
      content: this.generatedProfile,
      name: agentName,
      timestamp: Date.now()
    };

    this.profileGenerated = true;

    this.logger.info('Agent profile generated', {
      name: agentName,
      length: this.generatedProfile.length
    });

    return this.generatedProfile;
  }

  /**
   * AC4: Validate profile format and compliance
   * Checks: YAML frontmatter, XML well-formed, required fields, no emojis in code
   * 
   * @param {string} profile - Profile content to validate
   * @returns {boolean} True if valid
   */
  validateProfile(profile) {
    if (!profile || typeof profile !== 'string') {
      this.logger.warn('Validation failed: invalid profile');
      return false;
    }

    try {
      // AC4: Validate YAML frontmatter
      const frontmatterMatch = profile.match(/^---([\s\S]*?)---/);
      if (!frontmatterMatch) {
        this.logger.warn('Validation failed: missing YAML frontmatter');
        return false;
      }

      const frontmatter = frontmatterMatch[1];
      
      // Check required YAML fields
      if (!frontmatter.includes('name:')) {
        this.logger.warn('Validation failed: missing name in frontmatter');
        return false;
      }
      if (!frontmatter.includes('description:')) {
        this.logger.warn('Validation failed: missing description in frontmatter');
        return false;
      }

      // AC4: Validate XML block
      const xmlMatch = profile.match(/```xml\s*([\s\S]*?)\s*```/);
      if (!xmlMatch) {
        this.logger.warn('Validation failed: missing XML block');
        return false;
      }

      const xml = xmlMatch[1];

      // AC4: Check XML well-formedness (basic)
      if (!xml.includes('<agent') || !xml.includes('</agent>')) {
        this.logger.warn('Validation failed: malformed XML');
        return false;
      }

      // AC4: Validate no emojis in XML code sections
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      if (emojiRegex.test(xml)) {
        this.logger.warn('Validation failed: emojis found in XML');
        return false;
      }

      this.logger.info('Profile validation passed');
      return true;

    } catch (error) {
      this.logger.error('Validation error', { error: error.message });
      return false;
    }
  }

  /**
   * AC5: Save profile to disk
   * @param {string} filePath - Path to save profile
   */
  saveProfile(filePath) {
    if (!this.generatedProfile) {
      throw new Error('No profile to save - generate profile first');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write profile
      fs.writeFileSync(filePath, this.generatedProfile, 'utf-8');

      this.logger.info('Profile saved', {
        path: filePath,
        size: this.generatedProfile.length
      });

    } catch (error) {
      this.logger.error('Save failed', { error: error.message, path: filePath });
      throw error;
    }
  }

  /**
   * Get default save path
   * @returns {string} Default path
   */
  getDefaultSavePath() {
    const name = this.sessionState.agentProfileDraft?.name || 'agent';
    return `.github/copilot/agents/${name}.md`;
  }

  /**
   * Extract requirements from user responses (fallback)
   * @private
   */
  _extractRequirementsFromResponses() {
    const responseData = this.sessionState.userResponses || [];
    
    // Extract response text from response objects
    const responses = responseData.map(r => typeof r === 'string' ? r : (r.response || ''));
    
    return {
      purpose: responses[0] || 'Custom agent',
      domain: responses[3] || 'General',
      capabilities: responses[7] ? responses[7].split(',').map(c => c.trim()) : ['General capability'],
      knowledgeAreas: responses[2] ? responses[2].split(',').map(k => k.trim()) : ['General'],
      users: responses[4] ? responses[4].split(',').map(u => u.trim()) : ['Users'],
      constraints: responses.length > 10 ? [responses[10]] : []
    };
  }

  /**
   * Derive agent name from purpose
   * @private
   */
  _deriveAgentName(purpose) {
    // Extract key words, sanitize, hyphenate
    const name = purpose
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3) // Max 3 words
      .join('-');

    return name || 'custom-agent';
  }

  /**
   * Derive description from purpose
   * @private
   */
  _deriveDescription(purpose) {
    // Use first sentence or truncate
    const firstSentence = purpose.split(/[.!?]/)[0].trim();
    return firstSentence.length > 100 
      ? firstSentence.substring(0, 97) + '...'
      : firstSentence;
  }

  /**
   * Generate persona from requirements
   * @private
   */
  _generatePersona(requirements) {
    const { purpose, capabilities, knowledgeAreas } = requirements;

    return `<persona>
    <role>Specialized Agent</role>
    <identity>${purpose}</identity>
    <expertise>Expert in ${knowledgeAreas.slice(0, 3).join(', ')}</expertise>
    <communication_style>Professional, clear, and focused on delivering results</communication_style>
    <capabilities>
${capabilities.slice(0, 5).map(cap => `      <capability>${this._escapeXml(cap)}</capability>`).join('\n')}
    </capabilities>
  </persona>`;
  }

  /**
   * Generate menu from capabilities
   * @private
   */
  _generateMenu(capabilities) {
    const menuItems = capabilities.slice(0, 5).map((cap, index) => {
      const cmdKey = `C${index + 1}`;
      return `    <item cmd="${cmdKey}">[${cmdKey}] ${this._escapeXml(cap)}</item>`;
    });

    return `<menu>
${menuItems.join('\n')}
    <item cmd="MH">[MH] Menu Help</item>
  </menu>`;
  }

  /**
   * Generate capabilities section
   * @private
   */
  _generateCapabilities(requirements) {
    const { capabilities, knowledgeAreas, constraints } = requirements;

    return `<capabilities>
    <primary>
${capabilities.map(cap => `      <capability>${this._escapeXml(cap)}</capability>`).join('\n')}
    </primary>
    <knowledge>
${knowledgeAreas.map(area => `      <domain>${this._escapeXml(area)}</domain>`).join('\n')}
    </knowledge>
    <constraints>
${(constraints || []).map(c => `      <constraint>${this._escapeXml(c)}</constraint>`).join('\n')}
    </constraints>
  </capabilities>`;
  }

  /**
   * Build complete profile
   * @private
   */
  _buildProfile({ name, description, persona, menu, capabilities, requirements }) {
    const agentId = `${name}.agent.yaml`;

    return `---
name: "${name}"
description: "${description}"
---

\`\`\`xml
<agent id="${agentId}" name="${name}" title="${description}">
  <activation>
    <step n="1">Load agent context and requirements</step>
    <step n="2">Initialize with user's project context</step>
    <step n="3">Display greeting and menu</step>
    <step n="4">Await user input</step>
  </activation>

  ${persona}

  ${menu}

  ${capabilities}

  <guidelines>
    <guideline>Follow user requirements precisely</guideline>
    <guideline>Maintain professional communication</guideline>
    <guideline>Provide actionable, clear responses</guideline>
    <guideline>Leverage knowledge domains effectively</guideline>
  </guidelines>
</agent>
\`\`\`
`;
  }

  /**
   * Escape XML special characters
   * @private
   */
  _escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = GenerationState;
