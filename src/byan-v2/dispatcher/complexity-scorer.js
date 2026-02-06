/**
 * ComplexityScorer - Calculate task complexity score (0-100)
 * 
 * Scoring factors:
 * - Factor 1: Token count (max 30 points)
 * - Factor 2: Task type (max 80 points)
 * - Factor 3: Context size (max 20 points)
 * - Factor 4: Keywords (max 25 points)
 * 
 * Total score is capped at 100 points.
 */

class ComplexityScorer {
  constructor() {
    // Task type patterns with base scores
    this.taskTypePatterns = {
      exploration: {
        keywords: ['explore', 'find', 'list', 'show', 'search', 'get', 'read', 'view', 'display', 'check'],
        baseScore: 15
      },
      implementation: {
        keywords: ['implement', 'create', 'build', 'write', 'develop', 'code', 'add', 'generate'],
        baseScore: 45
      },
      analysis: {
        keywords: ['analyze', 'design', 'architect', 'evaluate', 'review', 'assess', 'plan', 'strategy'],
        baseScore: 75
      }
    };

    // Keyword complexity weights
    this.keywordWeights = {
      simple: {
        keywords: ['list', 'show', 'find', 'get', 'read', 'basic', 'simple'],
        score: 7
      },
      medium: {
        keywords: ['refactor', 'optimize', 'implement', 'integrate', 'update', 'modify'],
        score: 17
      },
      critical: {
        keywords: ['security', 'performance', 'architecture', 'scalability', 'critical', 'mission-critical'],
        score: 25
      }
    };
  }

  /**
   * Calculate overall complexity score for a task
   * @param {Object} task - Task object with prompt and context
   * @returns {number} - Complexity score (0-100)
   */
  calculateComplexity(task) {
    if (!task || !task.prompt || task.prompt.trim() === '') {
      throw new Error('prompt is required');
    }

    const tokenScore = this._calculateTokenScore(task.prompt);
    const taskTypeScore = this._calculateTaskTypeScore(task);
    const contextScore = this._calculateContextScore(task.context || {});
    const keywordScore = this._calculateKeywordScore(task.prompt);

    // Combine scores (token + type + context + keyword)
    // Note: These can theoretically exceed 100, so we cap it
    const totalScore = tokenScore + taskTypeScore + contextScore + keywordScore;

    return Math.min(100, Math.max(0, totalScore));
  }

  /**
   * Factor 1: Token count scoring (max 30 points)
   * < 10 tokens: 0 points
   * 10-200 tokens: scale linearly 0-30
   * > 200 tokens: 30 points
   */
  _calculateTokenScore(prompt) {
    const tokenCount = this._estimateTokenCount(prompt);

    if (tokenCount < 10) return 0;
    if (tokenCount >= 200) return 30;

    // Linear scaling between 10 and 200 tokens
    return Math.round((tokenCount - 10) / 190 * 30);
  }

  /**
   * Estimate token count (simple word-based approximation)
   */
  _estimateTokenCount(text) {
    return text.trim().split(/\s+/).length;
  }

  /**
   * Factor 2: Task type scoring (max 80 points)
   */
  _calculateTaskTypeScore(task) {
    const prompt = task.prompt.toLowerCase();
    
    // Check explicit type if provided
    if (task.type) {
      const typeMap = {
        'exploration': 15,
        'implementation': 45,
        'analysis': 75
      };
      return typeMap[task.type] || 45;
    }

    // Infer type from keywords
    for (const [typeName, typeData] of Object.entries(this.taskTypePatterns)) {
      const hasKeyword = typeData.keywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(prompt);
      });

      if (hasKeyword) {
        return typeData.baseScore;
      }
    }

    // Default to medium complexity if no pattern matches
    return 45;
  }

  /**
   * Factor 3: Context size scoring (max 20 points)
   */
  _calculateContextScore(context) {
    if (!context || Object.keys(context).length === 0) {
      return 0;
    }

    // Calculate context complexity based on:
    // - Number of top-level keys
    // - Depth of nesting
    // - Total property count

    const propertyCount = this._countProperties(context);
    const nestingDepth = this._calculateNestingDepth(context);
    const topLevelKeys = Object.keys(context).length;

    // Scoring formula:
    // - Small context (< 5 properties): 5-10 points
    // - Medium context (5-15 properties): 10-15 points
    // - Large context (> 15 properties): 15-20 points

    let score = 0;

    if (propertyCount < 5) {
      score = 7;
    } else if (propertyCount < 15) {
      score = 12;
    } else {
      score = 17;
    }

    // Add bonus for deep nesting (max +3)
    if (nestingDepth > 2) {
      score += Math.min(3, nestingDepth - 2);
    }

    return Math.min(20, score);
  }

  /**
   * Count total properties in an object (including nested)
   */
  _countProperties(obj, visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) {
      return 0;
    }

    visited.add(obj);
    let count = 0;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        count++;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          count += this._countProperties(obj[key], visited);
        }
      }
    }

    return count;
  }

  /**
   * Calculate maximum nesting depth of an object
   */
  _calculateNestingDepth(obj, visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) {
      return 0;
    }

    visited.add(obj);
    let maxDepth = 0;

    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
        const depth = this._calculateNestingDepth(obj[key], visited);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth + 1;
  }

  /**
   * Factor 4: Keyword scoring (max 25 points)
   */
  _calculateKeywordScore(prompt) {
    const promptLower = prompt.toLowerCase();
    let maxScore = 0;

    // Check each keyword category (take highest matching score)
    for (const [category, data] of Object.entries(this.keywordWeights)) {
      const hasKeyword = data.keywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(promptLower);
      });

      if (hasKeyword) {
        maxScore = Math.max(maxScore, data.score);
      }
    }

    return maxScore;
  }
}

module.exports = ComplexityScorer;
