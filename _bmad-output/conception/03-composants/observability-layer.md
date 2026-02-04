# Observability Layer - Spécification Technique

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Ready to Implement  
**Component:** ObservabilityLayer (StructuredLogger + MetricsCollector)  
**Timeline:** 1 jour (Jour 6)

---

## 🎯 OVERVIEW

L'**Observability Layer** fournit une visibilité complète sur l'exécution de BYAN v2.0 via des **logs structurés** (Winston) et des **métriques** temps réel. Il inclut un dashboard CLI avec visualisation en couleur (chalk) pour monitoring live.

### Problème Résolu

- Logs structurés JSON pour parsing/analyse automatique
- Métriques économiques (coûts, tokens, routing)
- Dashboard CLI temps réel
- Debugging facilité (traces complètes)
- Audit trail pour conformité

---

## 📋 RESPONSABILITÉS

1. **Structured Logging**
   - Logs JSON structurés (Winston)
   - Niveaux: debug, info, warn, error
   - Rotation automatique des fichiers
   - Contexte enrichi (task, workflow, step)

2. **Metrics Collection**
   - Compteurs (tasks, workers, agents)
   - Latency (p50, p95, p99)
   - Coûts économiques
   - Accuracy dispatcher

3. **CLI Dashboard**
   - Affichage temps réel (chalk)
   - Statistiques clés
   - Alertes visuelles (rouge/vert)

4. **Query & Analysis**
   - Parser logs JSON
   - Agrégation métriques
   - Export CSV/JSON

---

## 🔧 API PUBLIQUE

### Class: `StructuredLogger`

```javascript
/**
 * Logger structuré avec sortie JSON (Winston).
 * 
 * @class StructuredLogger
 * @example
 * const logger = new StructuredLogger({ level: 'info' });
 * logger.logTaskExecution(task, executor, result);
 */
class StructuredLogger {
  /**
   * Crée une instance StructuredLogger.
   * 
   * @param {Object} [options={}] - Configuration
   * @param {string} [options.level='info'] - Niveau de log (debug, info, warn, error)
   * @param {string} [options.logDir='_bmad-output/logs'] - Répertoire logs
   * @param {boolean} [options.console=false] - Log vers console aussi
   * @param {number} [options.maxFiles=7] - Nombre max fichiers rotation
   * @param {string} [options.maxSize='10m'] - Taille max fichier log
   */
  constructor(options = {}) {}

  /**
   * Log exécution d'une tâche.
   * 
   * @param {Object} task - Tâche exécutée
   * @param {Object} executor - Worker ou Agent
   * @param {Object} result - Résultat
   * 
   * @example
   * logger.logTaskExecution(
   *   { id: 'task-1', type: 'validation' },
   *   { type: 'worker', id: 1 },
   *   { success: true, duration: 1.5, tokens: 100 }
   * );
   */
  logTaskExecution(task, executor, result) {}

  /**
   * Log décision de routing du dispatcher.
   * 
   * @param {Object} decision - Détails de la décision
   * @param {string} decision.task_id - ID tâche
   * @param {number} decision.complexity_score - Score complexité
   * @param {string} decision.routing_decision - Décision (worker, agent, etc.)
   * @param {string} decision.executor_type - Type exécuteur
   */
  logRoutingDecision(decision) {}

  /**
   * Log démarrage workflow.
   * 
   * @param {Object} info - Info workflow
   * @param {string} info.workflow_path - Chemin workflow.yaml
   * @param {Array<string>} info.runtime_context - Clés contexte runtime
   */
  logWorkflowStart(info) {}

  /**
   * Log complétion workflow.
   * 
   * @param {Object} info - Info workflow
   * @param {string} info.workflow_name - Nom workflow
   * @param {number} info.steps_executed - Steps exécutés
   * @param {boolean} info.success - Succès global
   * @param {number} info.total_duration_ms - Durée totale
   * @param {number} info.total_tokens - Tokens utilisés
   * @param {number} info.total_cost_usd - Coût estimé
   */
  logWorkflowComplete(info) {}

  /**
   * Log erreur workflow.
   * 
   * @param {Object} info - Info erreur
   * @param {string} info.workflow_path - Chemin workflow
   * @param {string} info.error - Message d'erreur
   */
  logWorkflowError(info) {}

  /**
   * Log démarrage step.
   * 
   * @param {Object} info - Info step
   */
  logStepStart(info) {}

  /**
   * Log complétion step.
   * 
   * @param {Object} info - Info step
   */
  logStepComplete(info) {}

  /**
   * Log erreur step.
   * 
   * @param {Object} info - Info erreur
   */
  logStepError(info) {}

  /**
   * Log sauvegarde output.
   * 
   * @param {Object} info - Info output
   */
  logOutputSaved(info) {}

  /**
   * Log tentative d'exécution (retry).
   * 
   * @param {Object} info - Info tentative
   */
  logTaskAttempt(info) {}

  /**
   * Log échec tentative.
   * 
   * @param {Object} info - Info échec
   */
  logTaskAttemptFailed(info) {}

  /**
   * Log succès après retry.
   * 
   * @param {Object} info - Info succès
   */
  logRetrySuccess(info) {}

  /**
   * Log backoff avant retry.
   * 
   * @param {Object} info - Info backoff
   */
  logRetryBackoff(info) {}

  /**
   * Log message générique.
   * 
   * @param {'debug' | 'info' | 'warn' | 'error'} level - Niveau
   * @param {string} message - Message
   * @param {Object} [meta={}] - Métadonnées
   */
  log(level, message, meta = {}) {}
}
```

### Class: `MetricsCollector`

```javascript
/**
 * Collecteur de métriques temps réel.
 * 
 * @class MetricsCollector
 * @example
 * const metrics = new MetricsCollector();
 * metrics.recordTaskExecution(executor.type, result.duration, result.tokens);
 */
class MetricsCollector {
  /**
   * Crée une instance MetricsCollector.
   */
  constructor() {}

  /**
   * Enregistre une exécution de tâche.
   * 
   * @param {string} executorType - 'worker' ou 'agent'
   * @param {number} duration - Durée en secondes
   * @param {number} tokens - Tokens utilisés
   * @param {number} cost - Coût en USD
   * @param {boolean} success - Succès ou échec
   */
  recordTaskExecution(executorType, duration, tokens, cost, success) {}

  /**
   * Enregistre une décision de routing.
   * 
   * @param {string} routingDecision - 'worker', 'agent', 'worker_with_fallback'
   * @param {number} complexityScore - Score 0-100
   */
  recordRoutingDecision(routingDecision, complexityScore) {}

  /**
   * Récupère toutes les métriques.
   * 
   * @returns {Object} Métriques
   * @property {number} totalTasks - Total tâches
   * @property {number} workerTasks - Tâches Worker
   * @property {number} agentTasks - Tâches Agent
   * @property {number} totalTokens - Total tokens
   * @property {number} totalCost - Coût total USD
   * @property {Object} latency - Latences (p50, p95, p99)
   * @property {number} successRate - Taux succès %
   * @property {number} workerUsageRate - Taux usage Worker %
   */
  getMetrics() {}

  /**
   * Calcule les percentiles de latence.
   * 
   * @param {Array<number>} durations - Durées en secondes
   * @returns {Object} Percentiles { p50, p95, p99 }
   */
  calculateLatencyPercentiles(durations) {}

  /**
   * Réinitialise toutes les métriques.
   */
  reset() {}

  /**
   * Exporte les métriques en JSON.
   * 
   * @returns {string} JSON stringifié
   */
  exportJSON() {}

  /**
   * Exporte les métriques en CSV.
   * 
   * @returns {string} CSV
   */
  exportCSV() {}
}
```

### Class: `CLIDashboard`

```javascript
/**
 * Dashboard CLI avec affichage en couleur (chalk).
 * 
 * @class CLIDashboard
 * @example
 * const dashboard = new CLIDashboard(metricsCollector);
 * dashboard.display();
 */
class CLIDashboard {
  /**
   * Crée une instance CLIDashboard.
   * 
   * @param {MetricsCollector} metricsCollector - Collecteur de métriques
   */
  constructor(metricsCollector) {}

  /**
   * Affiche le dashboard une fois.
   * 
   * @param {Object} [options={}] - Options d'affichage
   * @param {boolean} [options.compact=false] - Mode compact
   * @param {boolean} [options.colors=true] - Activer couleurs
   */
  display(options = {}) {}

  /**
   * Lance le mode watch (rafraîchissement auto).
   * 
   * @param {number} [interval=5000] - Intervalle en ms
   */
  watch(interval = 5000) {}

  /**
   * Arrête le mode watch.
   */
  stopWatch() {}

  /**
   * Formate un nombre avec couleur selon seuil.
   * 
   * @private
   * @param {number} value - Valeur
   * @param {number} greenThreshold - Seuil vert
   * @param {number} yellowThreshold - Seuil jaune
   * @returns {string} Valeur colorée
   */
  _colorizeValue(value, greenThreshold, yellowThreshold) {}
}
```

---

## 🛠️ IMPLÉMENTATION

### Fichier: `_bmad/core/structured-logger.js`

```javascript
const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

class StructuredLogger {
  constructor(options = {}) {
    const logDir = options.logDir || path.join(
      process.cwd(),
      '_bmad-output',
      'logs'
    );

    // Créer répertoire logs
    fs.ensureDirSync(logDir);

    // Transports
    const transports = [
      // Fichier principal (JSON)
      new winston.transports.File({
        filename: path.join(logDir, 'byan.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: options.maxSize || 10 * 1024 * 1024, // 10MB
        maxFiles: options.maxFiles || 7
      }),

      // Fichier erreurs séparé
      new winston.transports.File({
        filename: path.join(logDir, 'errors.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    ];

    // Console si demandé
    if (options.console) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    // Créer logger Winston
    this.logger = winston.createLogger({
      level: options.level || 'info',
      transports
    });
  }

  logTaskExecution(task, executor, result) {
    this.logger.info({
      event: 'task_execution',
      task_id: task.id,
      task_type: task.type,
      executor_type: executor.type,
      executor_id: executor.id,
      complexity_score: task.complexityScore,
      duration_ms: result.duration * 1000,
      tokens: result.tokens,
      cost_usd: result.costEstimated,
      success: result.success
    });
  }

  logRoutingDecision(decision) {
    this.logger.info({
      event: 'routing_decision',
      ...decision
    });
  }

  logWorkflowStart(info) {
    this.logger.info({
      event: 'workflow_start',
      ...info
    });
  }

  logWorkflowComplete(info) {
    this.logger.info({
      event: 'workflow_complete',
      ...info
    });
  }

  logWorkflowError(info) {
    this.logger.error({
      event: 'workflow_error',
      ...info
    });
  }

  logStepStart(info) {
    this.logger.info({
      event: 'step_start',
      ...info
    });
  }

  logStepComplete(info) {
    this.logger.info({
      event: 'step_complete',
      ...info
    });
  }

  logStepError(info) {
    this.logger.error({
      event: 'step_error',
      ...info
    });
  }

  logOutputSaved(info) {
    this.logger.info({
      event: 'output_saved',
      ...info
    });
  }

  logTaskAttempt(info) {
    this.logger.debug({
      event: 'task_attempt',
      ...info
    });
  }

  logTaskAttemptFailed(info) {
    this.logger.warn({
      event: 'task_attempt_failed',
      ...info
    });
  }

  logRetrySuccess(info) {
    this.logger.info({
      event: 'retry_success',
      ...info
    });
  }

  logRetryBackoff(info) {
    this.logger.debug({
      event: 'retry_backoff',
      ...info
    });
  }

  log(level, message, meta = {}) {
    this.logger.log(level, message, meta);
  }
}

module.exports = StructuredLogger;
```

### Fichier: `_bmad/core/metrics-collector.js`

```javascript
class MetricsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.metrics = {
      totalTasks: 0,
      workerTasks: 0,
      agentTasks: 0,
      totalTokens: 0,
      totalCost: 0,
      successes: 0,
      failures: 0,
      durations: [],
      routingDecisions: {
        worker: 0,
        agent: 0,
        worker_with_fallback: 0
      },
      complexityScores: []
    };
  }

  recordTaskExecution(executorType, duration, tokens, cost, success) {
    this.metrics.totalTasks++;
    
    if (executorType === 'worker') {
      this.metrics.workerTasks++;
    } else if (executorType === 'agent') {
      this.metrics.agentTasks++;
    }

    this.metrics.totalTokens += tokens || 0;
    this.metrics.totalCost += cost || 0;

    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
    }

    this.metrics.durations.push(duration);
  }

  recordRoutingDecision(routingDecision, complexityScore) {
    if (this.metrics.routingDecisions[routingDecision] !== undefined) {
      this.metrics.routingDecisions[routingDecision]++;
    }

    this.metrics.complexityScores.push(complexityScore);
  }

  getMetrics() {
    const latency = this.calculateLatencyPercentiles(this.metrics.durations);

    return {
      totalTasks: this.metrics.totalTasks,
      workerTasks: this.metrics.workerTasks,
      agentTasks: this.metrics.agentTasks,
      totalTokens: this.metrics.totalTokens,
      totalCost: this.metrics.totalCost,
      latency,
      successRate: this.metrics.totalTasks > 0
        ? (this.metrics.successes / this.metrics.totalTasks * 100).toFixed(2)
        : 0,
      workerUsageRate: this.metrics.totalTasks > 0
        ? (this.metrics.workerTasks / this.metrics.totalTasks * 100).toFixed(2)
        : 0,
      routingDecisions: this.metrics.routingDecisions,
      avgComplexityScore: this.metrics.complexityScores.length > 0
        ? (this.metrics.complexityScores.reduce((a, b) => a + b, 0) /
           this.metrics.complexityScores.length).toFixed(2)
        : 0
    };
  }

  calculateLatencyPercentiles(durations) {
    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);

    const percentile = (p) => {
      const index = Math.ceil(sorted.length * p / 100) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      p50: (percentile(50) * 1000).toFixed(0), // ms
      p95: (percentile(95) * 1000).toFixed(0),
      p99: (percentile(99) * 1000).toFixed(0)
    };
  }

  exportJSON() {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  exportCSV() {
    const metrics = this.getMetrics();
    
    const rows = [
      ['Metric', 'Value'],
      ['Total Tasks', metrics.totalTasks],
      ['Worker Tasks', metrics.workerTasks],
      ['Agent Tasks', metrics.agentTasks],
      ['Total Tokens', metrics.totalTokens],
      ['Total Cost (USD)', metrics.totalCost.toFixed(4)],
      ['Success Rate (%)', metrics.successRate],
      ['Worker Usage Rate (%)', metrics.workerUsageRate],
      ['Latency p50 (ms)', metrics.latency.p50],
      ['Latency p95 (ms)', metrics.latency.p95],
      ['Latency p99 (ms)', metrics.latency.p99],
      ['Avg Complexity Score', metrics.avgComplexityScore]
    ];

    return rows.map(row => row.join(',')).join('\n');
  }
}

module.exports = MetricsCollector;
```

### Fichier: `_bmad/core/cli-dashboard.js`

```javascript
const chalk = require('chalk');

class CLIDashboard {
  constructor(metricsCollector) {
    this.metricsCollector = metricsCollector;
    this.watchInterval = null;
  }

  display(options = {}) {
    const metrics = this.metricsCollector.getMetrics();
    const colors = options.colors !== false;
    const compact = options.compact || false;

    console.clear();

    // Header
    console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║        BYAN v2.0 - Dashboard CLI         ║'));
    console.log(chalk.bold.cyan('╚═══════════════════════════════════════════╝\n'));

    // Tâches
    console.log(chalk.bold('📊 TÂCHES'));
    console.log(`  Total:   ${this._colorize(metrics.totalTasks, colors)}`);
    console.log(`  Worker:  ${this._colorize(metrics.workerTasks, colors)} (${metrics.workerUsageRate}%)`);
    console.log(`  Agent:   ${this._colorize(metrics.agentTasks, colors)}\n`);

    // Économie
    console.log(chalk.bold('💰 ÉCONOMIE'));
    console.log(`  Tokens:  ${this._colorize(metrics.totalTokens, colors)}`);
    console.log(`  Coût:    ${this._colorizeValue(
      `$${metrics.totalCost.toFixed(4)}`,
      0.01,
      0.05,
      colors
    )}\n`);

    // Performance
    console.log(chalk.bold('⚡ PERFORMANCE'));
    console.log(`  p50:     ${metrics.latency.p50}ms`);
    console.log(`  p95:     ${this._colorizeValue(
      `${metrics.latency.p95}ms`,
      2000,
      5000,
      colors
    )}`);
    console.log(`  p99:     ${this._colorizeValue(
      `${metrics.latency.p99}ms`,
      3000,
      10000,
      colors
    )}\n`);

    // Qualité
    console.log(chalk.bold('✅ QUALITÉ'));
    console.log(`  Succès:  ${this._colorizeSuccessRate(
      parseFloat(metrics.successRate),
      colors
    )}%\n`);

    // Routing
    if (!compact) {
      console.log(chalk.bold('🎯 ROUTING'));
      console.log(`  Worker:           ${metrics.routingDecisions.worker}`);
      console.log(`  Worker+Fallback:  ${metrics.routingDecisions.worker_with_fallback}`);
      console.log(`  Agent:            ${metrics.routingDecisions.agent}`);
      console.log(`  Avg Complexity:   ${metrics.avgComplexityScore}\n`);
    }

    // Footer
    console.log(chalk.gray(`\nMis à jour: ${new Date().toLocaleTimeString()}`));
  }

  watch(interval = 5000) {
    this.display();

    this.watchInterval = setInterval(() => {
      this.display();
    }, interval);

    console.log(chalk.yellow('\nMode watch activé. Ctrl+C pour quitter.\n'));
  }

  stopWatch() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  _colorize(value, colors) {
    if (!colors) return value;
    return chalk.cyan(value);
  }

  _colorizeValue(value, greenThreshold, yellowThreshold, colors) {
    if (!colors) return value;

    const numValue = parseFloat(value.toString().replace(/[^0-9.]/g, ''));

    if (numValue < greenThreshold) {
      return chalk.green(value);
    } else if (numValue < yellowThreshold) {
      return chalk.yellow(value);
    } else {
      return chalk.red(value);
    }
  }

  _colorizeSuccessRate(rate, colors) {
    if (!colors) return rate;

    if (rate >= 95) {
      return chalk.green(rate);
    } else if (rate >= 80) {
      return chalk.yellow(rate);
    } else {
      return chalk.red(rate);
    }
  }
}

module.exports = CLIDashboard;
```

---

## ⚠️ ERROR HANDLING

### Gestion Logs

- Winston gère automatiquement rotation fichiers
- Erreurs loggées dans `errors.log` séparé
- Pas d'exception si logging échoue (silent fail)

### Gestion Métriques

- Métriques en mémoire (pas de persist)
- Reset manuel si nécessaire
- Pas de limite taille (attention RAM)

---

## ⚡ PERFORMANCE

### Objectifs

- **Log Write:** < 5ms (async)
- **Metrics Record:** < 1ms
- **Dashboard Display:** < 100ms

### Optimisations

1. **Async Logging**
   - Winston async par défaut
   - Pas de blocage I/O

2. **In-Memory Metrics**
   - Structures simples (arrays, counters)
   - Calculs à la demande (getMetrics)

3. **Dashboard Compact**
   - Éviter trop d'I/O
   - Affichage optimisé

---

## 🧪 TESTS

### Fichier: `__tests__/observability.test.js`

```javascript
const StructuredLogger = require('../_bmad/core/structured-logger');
const MetricsCollector = require('../_bmad/core/metrics-collector');
const CLIDashboard = require('../_bmad/core/cli-dashboard');
const fs = require('fs-extra');
const path = require('path');

describe('StructuredLogger', () => {
  let logger;
  let testLogDir;

  beforeEach(async () => {
    testLogDir = path.join(__dirname, 'fixtures', 'logs');
    await fs.ensureDir(testLogDir);

    logger = new StructuredLogger({
      logDir: testLogDir,
      console: false
    });
  });

  afterEach(async () => {
    await fs.remove(testLogDir);
  });

  test('should create log files', async () => {
    logger.log('info', 'Test message');

    // Wait for async write
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFile = path.join(testLogDir, 'byan.log');
    const exists = await fs.pathExists(logFile);

    expect(exists).toBe(true);
  });

  test('should log structured JSON', async () => {
    logger.logTaskExecution(
      { id: 'task-1', type: 'validation', complexityScore: 15 },
      { type: 'worker', id: 1 },
      { duration: 1.5, tokens: 100, costEstimated: 0.0003, success: true }
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const logFile = path.join(testLogDir, 'byan.log');
    const content = await fs.readFile(logFile, 'utf8');
    const logEntry = JSON.parse(content.trim());

    expect(logEntry.event).toBe('task_execution');
    expect(logEntry.task_id).toBe('task-1');
    expect(logEntry.executor_type).toBe('worker');
  });

  test('should log errors to separate file', async () => {
    logger.logWorkflowError({
      workflow_path: 'test.yaml',
      error: 'Test error'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const errorFile = path.join(testLogDir, 'errors.log');
    const exists = await fs.pathExists(errorFile);

    expect(exists).toBe(true);
  });
});

describe('MetricsCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  test('should record task execution', () => {
    collector.recordTaskExecution('worker', 1.5, 100, 0.0003, true);

    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(1);
    expect(metrics.workerTasks).toBe(1);
    expect(metrics.totalTokens).toBe(100);
    expect(parseFloat(metrics.successRate)).toBe(100);
  });

  test('should calculate latency percentiles', () => {
    // Add 100 durations
    for (let i = 1; i <= 100; i++) {
      collector.recordTaskExecution('worker', i / 10, 100, 0.001, true);
    }

    const metrics = collector.getMetrics();

    expect(parseInt(metrics.latency.p50)).toBeGreaterThan(0);
    expect(parseInt(metrics.latency.p95)).toBeGreaterThan(parseInt(metrics.latency.p50));
    expect(parseInt(metrics.latency.p99)).toBeGreaterThan(parseInt(metrics.latency.p95));
  });

  test('should track worker usage rate', () => {
    // 7 worker, 3 agent
    for (let i = 0; i < 7; i++) {
      collector.recordTaskExecution('worker', 1, 100, 0.001, true);
    }
    for (let i = 0; i < 3; i++) {
      collector.recordTaskExecution('agent', 2, 500, 0.015, true);
    }

    const metrics = collector.getMetrics();

    expect(parseFloat(metrics.workerUsageRate)).toBe(70);
  });

  test('should reset metrics', () => {
    collector.recordTaskExecution('worker', 1, 100, 0.001, true);
    collector.reset();

    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(0);
  });

  test('should export JSON', () => {
    collector.recordTaskExecution('worker', 1, 100, 0.001, true);

    const json = collector.exportJSON();
    const parsed = JSON.parse(json);

    expect(parsed.totalTasks).toBe(1);
  });

  test('should export CSV', () => {
    collector.recordTaskExecution('worker', 1, 100, 0.001, true);

    const csv = collector.exportCSV();

    expect(csv).toContain('Metric,Value');
    expect(csv).toContain('Total Tasks,1');
  });
});

describe('CLIDashboard', () => {
  let dashboard;
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector();
    dashboard = new CLIDashboard(collector);
  });

  test('should display dashboard', () => {
    // Mock console.log
    const originalLog = console.log;
    const logOutput = [];
    console.log = (msg) => logOutput.push(msg);

    dashboard.display({ colors: false });

    console.log = originalLog;

    expect(logOutput.join('\n')).toContain('BYAN v2.0');
    expect(logOutput.join('\n')).toContain('TÂCHES');
  });

  test('should start and stop watch mode', () => {
    dashboard.watch(1000);
    expect(dashboard.watchInterval).toBeTruthy();

    dashboard.stopWatch();
    expect(dashboard.watchInterval).toBeNull();
  });
});
```

### Couverture Requise

- **Coverage:** 80%+
- **Tests:** 15+ test cases
- **Integration:** Logs parsing fonctionnel

---

## 📦 DEPENDENCIES

```json
{
  "dependencies": {
    "winston": "^3.11.0",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "fs-extra": "^11.2.0"
  }
}
```

### Installation

```bash
npm install winston chalk
```

---

## 💡 EXEMPLES D'UTILISATION

### Exemple 1: Logging Simple

```javascript
const { StructuredLogger } = require('./_bmad/core/structured-logger');

const logger = new StructuredLogger({ console: true });

logger.logWorkflowStart({
  workflow_path: 'my-workflow.yaml',
  runtime_context: ['project_name', 'requirements']
});

logger.logTaskExecution(
  { id: 'task-1', type: 'validation', complexityScore: 12 },
  { type: 'worker', id: 1 },
  { duration: 1.2, tokens: 80, costEstimated: 0.0002, success: true }
);

logger.logWorkflowComplete({
  workflow_name: 'my-workflow',
  steps_executed: 3,
  success: true,
  total_duration_ms: 5200,
  total_tokens: 450,
  total_cost_usd: 0.012
});
```

### Exemple 2: Métriques & Dashboard

```javascript
const MetricsCollector = require('./_bmad/core/metrics-collector');
const CLIDashboard = require('./_bmad/core/cli-dashboard');

const collector = new MetricsCollector();
const dashboard = new CLIDashboard(collector);

// Simuler exécutions
for (let i = 0; i < 50; i++) {
  collector.recordTaskExecution('worker', Math.random() * 2, 100, 0.0003, true);
}
for (let i = 0; i < 20; i++) {
  collector.recordTaskExecution('agent', Math.random() * 5, 500, 0.015, true);
}

// Afficher dashboard
dashboard.display();

// Mode watch
dashboard.watch(5000); // Refresh toutes les 5s
```

### Exemple 3: Analyse Logs

```javascript
const fs = require('fs-extra');
const path = require('path');

async function analyzeLogs() {
  const logFile = path.join('_bmad-output', 'logs', 'byan.log');
  const content = await fs.readFile(logFile, 'utf8');

  const lines = content.trim().split('\n');
  const logs = lines.map(line => JSON.parse(line));

  // Analyser événements
  const events = logs.reduce((acc, log) => {
    acc[log.event] = (acc[log.event] || 0) + 1;
    return acc;
  }, {});

  console.log('Event Distribution:', events);

  // Analyser coûts
  const totalCost = logs
    .filter(log => log.event === 'task_execution')
    .reduce((sum, log) => sum + (log.cost_usd || 0), 0);

  console.log(`Total Cost: $${totalCost.toFixed(4)}`);
}

analyzeLogs();
```

### Exemple 4: Export Métriques

```javascript
const collector = new MetricsCollector();

// ... exécuter tâches ...

// Export JSON
const jsonMetrics = collector.exportJSON();
await fs.writeFile('metrics.json', jsonMetrics);

// Export CSV
const csvMetrics = collector.exportCSV();
await fs.writeFile('metrics.csv', csvMetrics);

console.log('Métriques exportées');
```

---

## ✅ CRITÈRES DE SUCCÈS

**Fonctionnel:**
- ✅ Logs structurés JSON (Winston)
- ✅ Rotation automatique fichiers
- ✅ Métriques temps réel
- ✅ Dashboard CLI avec couleurs

**Performance:**
- ✅ Log write < 5ms
- ✅ Metrics record < 1ms
- ✅ Dashboard display < 100ms

**Qualité:**
- ✅ 15+ tests passants
- ✅ Coverage 80%+
- ✅ Logs parsables automatiquement

---

**Document généré le 2026-02-04**  
*Spécification Observability Layer - BYAN v2.0*
