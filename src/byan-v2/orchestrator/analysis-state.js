/**
 * AnalysisState - Story 4.3
 * Analyzes interview responses to extract structured requirements
 * 
 * Integrates:
 * - TaskRouter: Route tasks based on complexity
 * - LocalExecutor: Execute high-complexity analysis
 * - Logger: Log analysis steps
 * - SessionState: Store analysis results
 */

const TaskRouter = require('../dispatcher/task-router');
const LocalExecutor = require('../dispatcher/local-executor');
const Logger = require('../observability/logger');

class AnalysisState {
  constructor(sessionState) {
    this.sessionState = sessionState;
    this.taskRouter = new TaskRouter();
    this.localExecutor = new LocalExecutor();
    this.logger = new Logger();

    this.analysisComplete = false;
    this.requirements = null;
    this.patterns = null;
  }

  /**
   * AC2: Extract requirements from user responses
   * Identifies: purpose, capabilities, knowledgeAreas, constraints
   * 
   * @returns {Promise<Object>} Extracted requirements
   */
  async extractRequirements() {
    this.logger.info('Analysis started: extracting requirements', {
      responseCount: this.sessionState.userResponses.length
    });

    // Prepare analysis task
    const responsesText = this.sessionState.userResponses
      .map((r, i) => `Response ${i + 1}: ${r.response}`)
      .join('\n');

    const analysisTask = {
      type: 'analysis',
      prompt: `Extract structured requirements from these user responses:

${responsesText}

Extract and return JSON with:
- purpose: Main goal/purpose of the agent
- capabilities: Array of specific capabilities needed
- knowledgeAreas: Array of knowledge domains required
- constraints: Array of constraints or limitations`,
      metadata: {
        requiresReasoning: true,
        requiresMultipleSteps: true,
        estimatedDuration: 'medium'
      }
    };

    // AC6: Route through TaskRouter (complexity-based delegation)
    const routing = this.taskRouter.routeTask(analysisTask);
    
    this.logger.info('Task routed', {
      executor: routing.executor,
      complexity: routing.complexity
    });

    // Execute analysis (typically routed to LocalExecutor due to high complexity)
    let result;
    if (routing.executor === 'local') {
      result = await this.localExecutor.execute(analysisTask);
    } else {
      // Fallback to local if task-tool routing (shouldn't happen for analysis)
      result = await this.localExecutor.execute(analysisTask);
    }

    // Parse requirements
    try {
      this.requirements = JSON.parse(result.output);
    } catch (error) {
      this.logger.error('Failed to parse analysis output', { error: error.message });
      throw new Error('Invalid analysis output format');
    }

    // Store in SessionState
    this.sessionState.setAnalysisResults({
      requirements: this.requirements,
      timestamp: Date.now(),
      tokens: result.tokens,
      duration: result.duration
    });

    this.logger.info('Requirements extraction complete', {
      purpose: this.requirements.purpose,
      capabilitiesCount: this.requirements.capabilities?.length || 0,
      knowledgeAreasCount: this.requirements.knowledgeAreas?.length || 0
    });

    return this.requirements;
  }

  /**
   * AC3: Identify patterns and common themes across responses
   * @returns {Promise<Array>} Patterns found
   */
  async identifyPatterns() {
    this.logger.info('Identifying patterns across responses');

    if (!this.sessionState.userResponses || this.sessionState.userResponses.length === 0) {
      this.logger.warn('No responses to analyze for patterns');
      this.patterns = [];
      return this.patterns;
    }

    // Simple pattern detection based on keyword frequency
    const keywordCounts = {};
    const responses = this.sessionState.userResponses
      .map(r => (r.response || '').toLowerCase())
      .join(' ');

    // Extract words (simple tokenization)
    const words = responses.split(/\s+/).filter(w => w.length > 3);

    // Count occurrences
    words.forEach(word => {
      keywordCounts[word] = (keywordCounts[word] || 0) + 1;
    });

    // Find patterns (words appearing >= 2 times)
    this.patterns = Object.entries(keywordCounts)
      .filter(([word, count]) => count >= 2)
      .map(([word, count]) => ({
        theme: word,
        occurrences: count,
        relevance: count / words.length
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10); // Top 10 patterns

    // Update SessionState
    if (this.sessionState.analysisResults) {
      this.sessionState.analysisResults.patterns = this.patterns;
    } else {
      this.sessionState.setAnalysisResults({ patterns: this.patterns });
    }

    this.logger.info('Pattern identification complete', {
      patternsFound: this.patterns.length
    });

    return this.patterns;
  }

  /**
   * AC4: Validate that all required fields are present and complete
   * @param {Object} requirements - Requirements object to validate
   * @returns {boolean} True if complete
   */
  validateCompleteness(requirements) {
    if (!requirements || typeof requirements !== 'object') {
      this.logger.warn('Requirements validation failed: invalid input');
      return false;
    }

    // Check required fields exist
    const requiredFields = ['purpose', 'capabilities', 'knowledgeAreas', 'constraints'];
    
    for (const field of requiredFields) {
      if (!requirements[field]) {
        this.logger.warn(`Requirements validation failed: missing ${field}`);
        return false;
      }
    }

    // Validate purpose is not empty
    if (typeof requirements.purpose !== 'string' || requirements.purpose.trim().length === 0) {
      this.logger.warn('Requirements validation failed: empty purpose');
      return false;
    }

    // Validate arrays are not empty
    const arrayFields = ['capabilities', 'knowledgeAreas'];
    
    for (const field of arrayFields) {
      if (!Array.isArray(requirements[field]) || requirements[field].length === 0) {
        this.logger.warn(`Requirements validation failed: empty ${field}`);
        return false;
      }
    }

    // Constraints can be empty array (optional)
    if (!Array.isArray(requirements.constraints)) {
      this.logger.warn('Requirements validation failed: constraints must be array');
      return false;
    }

    this.logger.info('Requirements validation passed', {
      purpose: requirements.purpose.substring(0, 50),
      capabilitiesCount: requirements.capabilities.length,
      knowledgeAreasCount: requirements.knowledgeAreas.length
    });

    return true;
  }

  /**
   * AC5: Check if analysis is complete and can transition to GENERATION
   * @returns {boolean} True if ready to transition
   */
  canTransitionToGeneration() {
    // Check if requirements have been extracted
    if (!this.requirements) {
      this.logger.warn('Cannot transition: requirements not extracted');
      return false;
    }

    // Validate completeness
    if (!this.validateCompleteness(this.requirements)) {
      this.logger.warn('Cannot transition: requirements incomplete');
      return false;
    }

    // Check SessionState has analysis results
    if (!this.sessionState.analysisResults || 
        !this.sessionState.analysisResults.requirements) {
      this.logger.warn('Cannot transition: SessionState missing analysis results');
      return false;
    }

    this.logger.info('Analysis complete - ready to transition to GENERATION');
    this.analysisComplete = true;
    return true;
  }

  /**
   * Get current analysis results
   * @returns {Object} Analysis results
   */
  getAnalysisResults() {
    return {
      requirements: this.requirements,
      patterns: this.patterns,
      complete: this.analysisComplete
    };
  }

  /**
   * Get requirements summary
   * @returns {Object} Requirements summary
   */
  getRequirementsSummary() {
    if (!this.requirements) {
      return { summary: 'No requirements extracted yet' };
    }

    return {
      purpose: this.requirements.purpose,
      capabilitiesCount: this.requirements.capabilities?.length || 0,
      knowledgeAreasCount: this.requirements.knowledgeAreas?.length || 0,
      constraintsCount: this.requirements.constraints?.length || 0,
      isComplete: this.validateCompleteness(this.requirements)
    };
  }
}

module.exports = AnalysisState;
