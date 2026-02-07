/**
 * BYAN v2.0 - Entry Point
 * 
 * Architecture 4 Pilliers:
 * - Agent: Expertise (modèles puissants)
 * - Context: State management hiérarchique
 * - Workflow: Orchestration déclarative
 * - Worker: Exécution simple (modèles légers)
 * 
 * @module byan-v2
 * @version 2.0.0-alpha.1
 */

// Core Components
const ContextLayer = require('./core/context/context');
const SimpleCache = require('./core/cache/cache');
const EconomicDispatcher = require('./core/dispatcher/dispatcher');
const { WorkerPool, Worker } = require('./core/worker-pool/worker-pool');
const { WorkflowExecutor } = require('./core/workflow/workflow-executor');

// Observability Components
const { StructuredLogger } = require('./observability/logger/structured-logger');
const { MetricsCollector } = require('./observability/metrics/metrics-collector');
const { printDashboard, generateSummary } = require('./observability/dashboard/dashboard');

// Dashboard wrapper class for easy integration
class Dashboard {
  constructor(metrics, logger = null, workerPool = null) {
    this.metrics = metrics;
    this.logger = logger;
    this.workerPool = workerPool;
  }

  render() {
    return printDashboard({
      metrics: this.metrics.getMetrics(),
      logs: this.logger ? this.logger.getLogs() : [],
      workers: this.workerPool ? this.workerPool.workers.map((w, i) => ({ id: w.id, status: w.status })) : [],
      status: { version: '2.0.0-alpha.1' }
    });
  }

  renderSummary() {
    return generateSummary({
      metrics: this.metrics.getStats ? this.metrics.getStats() : {},
      logs: this.logger ? this.logger.getStats() : {}
    });
  }
}

/**
 * Factory function pour initialiser BYAN v2.0
 * 
 * @param {Object} [options={}] - Options de configuration
 * @param {number} [options.workerCount=2] - Nombre de workers
 * @param {number} [options.cacheMaxSize=50] - Taille max cache (MB)
 * @param {Object} [options.loggerOptions] - Options pour logger
 * @returns {Object} Instance BYAN v2.0 configurée
 * 
 * @example
 * const byan = createByanInstance({ workerCount: 2 });
 * await byan.executeWorkflow('_byan/workflows/create-agent/workflow.yaml');
 */
function createByanInstance(options = {}) {
  const {
    workerCount = 2,
    cacheMaxSize = 50,
    loggerOptions = {}
  } = options;

  // Initialize core components
  const cache = new SimpleCache({ maxSizeMB: cacheMaxSize });
  const contextLayer = new ContextLayer();  // Note: Current implementation doesn't use cache yet
  const logger = new StructuredLogger(loggerOptions);
  const metrics = new MetricsCollector();
  const workerPool = new WorkerPool(workerCount);
  const dashboard = new Dashboard(metrics, logger, workerPool);
  const dispatcher = new EconomicDispatcher(workerPool);
  const workflowExecutor = new WorkflowExecutor(contextLayer, dispatcher, logger);

  return {
    // Core
    contextLayer,
    cache,
    dispatcher,
    workerPool,
    workflowExecutor,
    
    // Observability
    logger,
    metrics,
    dashboard,
    
    // Convenience methods
    async executeWorkflow(workflowPath, contextId = null) {
      let context = {};
      if (contextId) {
        context = await contextLayer.loadContext('story', contextId);
      }
      return workflowExecutor.execute(workflowPath, context);
    },
    
    async loadContext(level, id = null) {
      return contextLayer.loadContext(level, id);
    },
    
    getMetrics() {
      return metrics.getMetrics();
    },
    
    showDashboard() {
      return dashboard.render();
    },
    
    async shutdown() {
      await workerPool.shutdown();
      logger.info('BYAN v2.0 shutdown complete');
    }
  };
}

// Named exports (pour usage avancé)
module.exports = {
  // Factory
  createByanInstance,
  
  // Core Components
  ContextLayer,
  SimpleCache,
  EconomicDispatcher,
  WorkerPool,
  Worker,
  WorkflowExecutor,
  
  // Observability
  StructuredLogger,
  MetricsCollector,
  Dashboard
};
