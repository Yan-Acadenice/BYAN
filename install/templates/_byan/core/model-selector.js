#!/usr/bin/env node

/**
 * Model Selector - Calculate optimal AI model based on task complexity
 * Inspired by BYAN v2 workers.md concept
 * 
 * Usage:
 *   node model-selector.js --task=detect --context=small --reasoning=shallow --quality=fast
 *   node model-selector.js --workflow=yanstaller/workflow.md
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ModelSelector {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, 'model-selector.yaml');
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configFile = fs.readFileSync(this.configPath, 'utf8');
    return yaml.load(configFile);
  }

  /**
   * Calculate complexity score based on task factors
   * @param {Object} factors - { task_type, context_size, reasoning_depth, quality_requirement }
   * @returns {number} Complexity score (0-200+)
   */
  calculateComplexity(factors) {
    const { task_type, context_size, reasoning_depth, quality_requirement } = factors;
    
    const taskScore = this.config.calculation_factors.task_type.weights[task_type] || 0;
    const contextScore = this.config.calculation_factors.context_size.weights[context_size] || 0;
    const reasoningScore = this.config.calculation_factors.reasoning_depth.weights[reasoning_depth] || 0;
    const qualityScore = this.config.calculation_factors.quality_requirement.weights[quality_requirement] || 0;
    
    const totalScore = taskScore + contextScore + reasoningScore + qualityScore;
    
    return {
      total: totalScore,
      breakdown: {
        task_type: taskScore,
        context_size: contextScore,
        reasoning_depth: reasoningScore,
        quality_requirement: qualityScore
      }
    };
  }

  /**
   * Select optimal model based on complexity score
   * @param {number} score - Complexity score
   * @returns {Object} Selected model info
   */
  selectModel(score) {
    for (const [level, config] of Object.entries(this.config.complexity_levels)) {
      const [min, max] = config.score_range;
      if (score >= min && score <= max) {
        return {
          level,
          model: config.recommended_model,
          fallback: config.fallback_model,
          cost_tier: config.cost_tier,
          description: config.description
        };
      }
    }
    
    // If score > 100, use expert level
    const expertConfig = this.config.complexity_levels.expert;
    return {
      level: 'expert',
      model: expertConfig.recommended_model,
      fallback: expertConfig.fallback_model,
      cost_tier: expertConfig.cost_tier,
      description: expertConfig.description
    };
  }

  /**
   * Get model recommendation with full details
   * @param {Object} factors - Task factors
   * @param {Object} options - Override options
   * @returns {Object} Full recommendation
   */
  recommend(factors, options = {}) {
    // Calculate complexity
    const complexity = this.calculateComplexity(factors);
    
    // Select model
    let selection = this.selectModel(complexity.total);
    
    // Apply overrides
    if (options.model) {
      selection.model = options.model;
      selection.overridden = true;
    }
    
    // Get model details
    const modelDetails = this.config.models[selection.model];
    
    return {
      factors,
      complexity: complexity.total,
      breakdown: complexity.breakdown,
      level: selection.level,
      recommended_model: selection.model,
      fallback_model: selection.fallback,
      cost_tier: selection.cost_tier,
      model_details: modelDetails,
      overridden: selection.overridden || false
    };
  }

  /**
   * Parse workflow frontmatter to extract complexity factors
   * @param {string} workflowPath - Path to workflow.md
   * @returns {Object} Extracted factors
   */
  parseWorkflowComplexity(workflowPath) {
    const content = fs.readFileSync(workflowPath, 'utf8');
    
    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in workflow');
    }
    
    const frontmatter = yaml.load(frontmatterMatch[1]);
    
    if (!frontmatter.complexity) {
      throw new Error('No complexity section in workflow frontmatter');
    }
    
    return frontmatter.complexity;
  }

  /**
   * Log recommendation for metrics
   * @param {Object} recommendation
   */
  logRecommendation(recommendation) {
    if (!this.config.logging.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...recommendation
    };
    
    const logPath = this.config.logging.log_file.replace('{project-root}', process.cwd());
    const logDir = path.dirname(logPath);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.replace('--', '').split('=');
    acc[key] = value;
    return acc;
  }, {});

  const selector = new ModelSelector();
  
  try {
    let factors;
    
    if (args.workflow) {
      // Parse from workflow file
      factors = selector.parseWorkflowComplexity(args.workflow);
    } else {
      // Manual factors
      factors = {
        task_type: args.task || 'detect',
        context_size: args.context || 'small',
        reasoning_depth: args.reasoning || 'shallow',
        quality_requirement: args.quality || 'fast'
      };
    }
    
    const recommendation = selector.recommend(factors, { model: args.model });
    
    // Output recommendation
    console.log(JSON.stringify(recommendation, null, 2));
    
    // Log for metrics
    selector.logRecommendation(recommendation);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = ModelSelector;
