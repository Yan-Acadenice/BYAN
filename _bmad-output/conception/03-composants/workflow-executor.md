# Workflow Executor - Spécification Technique

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Ready to Implement  
**Component:** WorkflowExecutor  
**Timeline:** 1 jour (Jour 5)

---

## 🎯 OVERVIEW

Le **Workflow Executor** est l'orchestrateur principal de BYAN v2.0. Il charge et exécute des workflows déclaratifs en YAML, coordonne l'exécution séquentielle des steps (support parallèle en Phase 2), gère le retry automatique, et sauvegarde les outputs.

### Problème Résolu

- Définition déclarative de workflows complexes (YAML DSL)
- Orchestration automatique Agent/Worker via dispatcher
- Gestion d'erreurs avec retry exponentiel
- Chaînage de steps avec résolution de placeholders
- Sauvegarde automatique des outputs

---

## 📋 RESPONSABILITÉS

1. **Chargement Workflow**
   - Parser YAML workflow file
   - Valider structure (name, steps, etc.)
   - Résoudre placeholders dans config

2. **Exécution Séquentielle**
   - Exécuter steps dans l'ordre
   - Passer résultats step N à step N+1
   - Gérer dépendances entre steps

3. **Retry & Error Handling**
   - Retry automatique avec backoff exponentiel
   - Max attempts configurable par step
   - Logging détaillé des erreurs

4. **Output Management**
   - Sauvegarder outputs si `output_file` spécifié
   - Résoudre placeholders dans chemins
   - Créer répertoires automatiquement

---

## 🔧 API PUBLIQUE

### Class: `WorkflowExecutor`

```javascript
/**
 * Exécuteur de workflows YAML déclaratifs.
 * 
 * @class WorkflowExecutor
 * @example
 * const executor = new WorkflowExecutor({
 *   dispatcher: myDispatcher,
 *   agentRegistry: myAgentRegistry,
 *   contextLayer: myContextLayer
 * });
 * 
 * const result = await executor.execute('workflow.yaml');
 */
class WorkflowExecutor {
  /**
   * Crée une instance WorkflowExecutor.
   * 
   * @param {Object} options - Configuration
   * @param {EconomicDispatcher} options.dispatcher - Dispatcher pour routing
   * @param {AgentRegistry} options.agentRegistry - Registre des agents
   * @param {ContextLayer} options.contextLayer - Layer de contexte
   * @param {Object} [options.context={}] - Contexte global additionnel
   */
  constructor(options) {}

  /**
   * Exécute un workflow YAML.
   * 
   * @async
   * @param {string} workflowPath - Chemin vers fichier workflow.yaml
   * @param {Object} [runtimeContext={}] - Contexte runtime additionnel
   * @returns {Promise<WorkflowResult>} Résultat de l'exécution
   * 
   * @typedef {Object} WorkflowResult
   * @property {string} workflowName - Nom du workflow
   * @property {number} stepsExecuted - Nombre de steps exécutés
   * @property {Object} results - Résultats par step ID
   * @property {boolean} success - true si tous les steps ont réussi
   * @property {number} totalDuration - Durée totale en ms
   * @property {number} totalTokens - Tokens utilisés
   * @property {number} totalCost - Coût estimé en USD
   * 
   * @throws {WorkflowError} Si workflow invalide ou step échoue
   * 
   * @example
   * const result = await executor.execute('_bmad/workflows/create-prd/workflow.yaml');
   * console.log(`Workflow: ${result.workflowName}`);
   * console.log(`Steps: ${result.stepsExecuted}`);
   * console.log(`Success: ${result.success}`);
   */
  async execute(workflowPath, runtimeContext = {}) {}

  /**
   * Charge et parse un fichier workflow YAML.
   * 
   * @async
   * @param {string} workflowPath - Chemin vers workflow.yaml
   * @returns {Promise<WorkflowConfig>} Configuration du workflow
   * 
   * @typedef {Object} WorkflowConfig
   * @property {string} name - Nom du workflow
   * @property {string} [description] - Description
   * @property {Array<StepConfig>} steps - Liste des steps
   * 
   * @throws {WorkflowError} Si fichier manquant ou YAML invalide
   */
  async loadWorkflow(workflowPath) {}

  /**
   * Valide la structure d'un workflow.
   * 
   * @param {WorkflowConfig} workflow - Workflow à valider
   * @throws {ValidationError} Si structure invalide
   */
  validateWorkflow(workflow) {}

  /**
   * Exécute un step individuel.
   * 
   * @async
   * @param {StepConfig} step - Configuration du step
   * @param {Object} context - Contexte disponible
   * @returns {Promise<StepResult>} Résultat du step
   * 
   * @typedef {Object} StepConfig
   * @property {string} id - ID unique du step
   * @property {string} type - Type: 'agent' ou 'worker'
   * @property {string} [agent] - Nom agent spécifique
   * @property {string} input - Input template avec placeholders
   * @property {string} [output_file] - Chemin fichier output (optionnel)
   * @property {Object} [retry] - Config retry
   * @property {number} [retry.max_attempts=1] - Max tentatives
   * @property {number} [retry.delay_ms=1000] - Délai initial
   * 
   * @typedef {Object} StepResult
   * @property {string} output - Output du step
   * @property {number} tokens - Tokens utilisés
   * @property {number} duration - Durée en secondes
   * @property {boolean} success - Succès ou échec
   * @property {number} costEstimated - Coût estimé en USD
   * @property {string} executorType - 'worker' ou 'agent'
   */
  async executeStep(step, context) {}

  /**
   * Exécute un step avec retry automatique.
   * 
   * @async
   * @param {Object} executor - Worker ou Agent
   * @param {Object} task - Tâche à exécuter
   * @param {Object} [retryConfig={}] - Config retry
   * @param {number} [retryConfig.max_attempts=1] - Max tentatives
   * @param {number} [retryConfig.delay_ms=1000] - Délai initial
   * @returns {Promise<StepResult>} Résultat du step
   * 
   * @throws {Error} Si tous les retry échouent
   */
  async executeWithRetry(executor, task, retryConfig = {}) {}

  /**
   * Sauvegarde l'output d'un step dans un fichier.
   * 
   * @async
   * @param {string} outputPath - Chemin fichier (avec placeholders)
   * @param {string} content - Contenu à sauvegarder
   * @param {Object} context - Contexte pour résolution placeholders
   * @returns {Promise<string>} Chemin résolu du fichier créé
   */
  async saveOutput(outputPath, content, context) {}

  /**
   * Résout les placeholders dans un texte.
   * Supporte: {step.stepId.field} et {context.field}
   * 
   * @param {string} text - Texte avec placeholders
   * @param {Object} availableContext - Contexte disponible
   * @param {Object} availableContext.step - Résultats steps précédents
   * @param {Object} availableContext.context - Contexte global
   * @returns {string} Texte résolu
   * 
   * @example
   * executor.resolvePlaceholders(
   *   'Use {step.analyze.output} for {context.project_name}',
   *   {
   *     step: { analyze: { output: 'results' } },
   *     context: { project_name: 'BYAN' }
   *   }
   * );
   * // => 'Use results for BYAN'
   */
  resolvePlaceholders(text, availableContext) {}
}
```

---

## 🛠️ IMPLÉMENTATION

### Fichier: `_bmad/core/workflow-executor.js`

```javascript
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');
const { StructuredLogger } = require('./structured-logger');

/**
 * Erreur spécifique aux workflows
 */
class WorkflowError extends Error {
  constructor(message, workflowPath, stepId) {
    super(message);
    this.name = 'WorkflowError';
    this.workflowPath = workflowPath;
    this.stepId = stepId;
  }
}

class WorkflowExecutor {
  constructor(options) {
    if (!options.dispatcher) {
      throw new Error('dispatcher requis');
    }
    if (!options.agentRegistry) {
      throw new Error('agentRegistry requis');
    }
    if (!options.contextLayer) {
      throw new Error('contextLayer requis');
    }

    this.dispatcher = options.dispatcher;
    this.agentRegistry = options.agentRegistry;
    this.contextLayer = options.contextLayer;
    this.context = options.context || {};

    this.logger = new StructuredLogger();
  }

  async execute(workflowPath, runtimeContext = {}) {
    const startTime = Date.now();

    this.logger.logWorkflowStart({
      workflow_path: workflowPath,
      runtime_context: Object.keys(runtimeContext)
    });

    try {
      // Charger workflow
      const workflow = await this.loadWorkflow(workflowPath);

      // Valider
      this.validateWorkflow(workflow);

      // Merge contexts
      const globalContext = {
        ...this.context,
        ...runtimeContext
      };

      // Exécuter steps séquentiellement
      const results = {};
      const availableContext = {
        step: results,
        context: globalContext
      };

      for (const step of workflow.steps) {
        this.logger.logStepStart({
          workflow_name: workflow.name,
          step_id: step.id,
          step_type: step.type
        });

        try {
          // Exécuter step
          const result = await this.executeStep(step, availableContext);
          results[step.id] = result;

          this.logger.logStepComplete({
            workflow_name: workflow.name,
            step_id: step.id,
            success: result.success,
            duration_ms: result.duration * 1000,
            tokens: result.tokens
          });

          // Sauvegarder output si spécifié
          if (step.output_file && result.success) {
            const savedPath = await this.saveOutput(
              step.output_file,
              result.output,
              availableContext
            );

            this.logger.logOutputSaved({
              step_id: step.id,
              output_path: savedPath
            });
          }

        } catch (error) {
          // Log erreur mais continue workflow si step non-critical
          this.logger.logStepError({
            workflow_name: workflow.name,
            step_id: step.id,
            error: error.message
          });

          results[step.id] = {
            success: false,
            error: error.message,
            output: null
          };

          // Stop si step critical
          if (step.critical !== false) {
            throw new WorkflowError(
              `Step critique ${step.id} a échoué: ${error.message}`,
              workflowPath,
              step.id
            );
          }
        }
      }

      // Calculer métriques
      const totalDuration = Date.now() - startTime;
      const totalTokens = Object.values(results)
        .reduce((sum, r) => sum + (r.tokens || 0), 0);
      const totalCost = Object.values(results)
        .reduce((sum, r) => sum + (r.costEstimated || 0), 0);

      const workflowResult = {
        workflowName: workflow.name,
        stepsExecuted: Object.keys(results).length,
        results,
        success: Object.values(results).every(r => r.success),
        totalDuration,
        totalTokens,
        totalCost
      };

      this.logger.logWorkflowComplete({
        workflow_name: workflow.name,
        steps_executed: workflowResult.stepsExecuted,
        success: workflowResult.success,
        total_duration_ms: totalDuration,
        total_tokens: totalTokens,
        total_cost_usd: totalCost
      });

      return workflowResult;

    } catch (error) {
      this.logger.logWorkflowError({
        workflow_path: workflowPath,
        error: error.message
      });
      throw error;
    }
  }

  async loadWorkflow(workflowPath) {
    const resolvedPath = path.resolve(workflowPath);

    if (!await fs.pathExists(resolvedPath)) {
      throw new WorkflowError(
        `Fichier workflow introuvable: ${resolvedPath}`,
        workflowPath
      );
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf8');
      const workflow = yaml.load(content);

      return workflow;

    } catch (error) {
      throw new WorkflowError(
        `Erreur parsing YAML: ${error.message}`,
        workflowPath
      );
    }
  }

  validateWorkflow(workflow) {
    // Vérifier champs requis
    if (!workflow.name) {
      throw new Error('Workflow.name requis');
    }

    if (!workflow.steps || !Array.isArray(workflow.steps)) {
      throw new Error('Workflow.steps requis (array)');
    }

    // Valider chaque step
    workflow.steps.forEach((step, index) => {
      if (!step.id) {
        throw new Error(`Step ${index}: id requis`);
      }

      if (!step.type) {
        throw new Error(`Step ${step.id}: type requis`);
      }

      if (!['agent', 'worker', 'auto'].includes(step.type)) {
        throw new Error(
          `Step ${step.id}: type invalide (agent, worker, ou auto)`
        );
      }

      if (!step.input) {
        throw new Error(`Step ${step.id}: input requis`);
      }
    });

    // Vérifier IDs uniques
    const ids = workflow.steps.map(s => s.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Step IDs doivent être uniques');
    }
  }

  async executeStep(step, context) {
    // Résoudre input avec placeholders
    const resolvedInput = this.resolvePlaceholders(step.input, context);

    // Créer tâche
    const task = {
      id: step.id,
      type: step.task_type || 'generation',
      input: resolvedInput,
      agentName: step.agent,
      context: context.context
    };

    // Router vers exécuteur
    let executor;
    if (step.type === 'agent') {
      executor = this.agentRegistry.getAgent(step.agent || 'default');
    } else if (step.type === 'worker') {
      executor = await this.dispatcher.workerPool.getAvailableWorker();
    } else { // 'auto'
      executor = await this.dispatcher.routeTask(task);
    }

    // Exécuter avec retry
    const result = await this.executeWithRetry(
      executor,
      task,
      step.retry
    );

    return result;
  }

  async executeWithRetry(executor, task, retryConfig = {}) {
    const maxAttempts = retryConfig.max_attempts || 1;
    const initialDelay = retryConfig.delay_ms || 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.logTaskAttempt({
          task_id: task.id,
          attempt,
          max_attempts: maxAttempts,
          executor_type: executor.type
        });

        const result = await executor.execute(task);

        // Success
        if (result.success) {
          if (attempt > 1) {
            this.logger.logRetrySuccess({
              task_id: task.id,
              attempt
            });
          }
          return result;
        }

        // Échec mais pas d'exception (ex: Worker returned error)
        throw new Error(result.error || 'Execution failed');

      } catch (error) {
        lastError = error;

        this.logger.logTaskAttemptFailed({
          task_id: task.id,
          attempt,
          error: error.message
        });

        // Si dernier attempt, throw
        if (attempt >= maxAttempts) {
          break;
        }

        // Exponential backoff
        const delay = initialDelay * Math.pow(2, attempt - 1);
        this.logger.logRetryBackoff({
          task_id: task.id,
          attempt,
          delay_ms: delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Tous les retry ont échoué
    throw new Error(
      `Task ${task.id} échoué après ${maxAttempts} tentatives: ${lastError.message}`
    );
  }

  async saveOutput(outputPath, content, context) {
    // Résoudre placeholders dans chemin
    const resolvedPath = this.resolvePlaceholders(outputPath, context);
    const fullPath = path.resolve(resolvedPath);

    // Créer répertoire parent si nécessaire
    await fs.ensureDir(path.dirname(fullPath));

    // Sauvegarder
    await fs.writeFile(fullPath, content, 'utf8');

    return fullPath;
  }

  resolvePlaceholders(text, availableContext) {
    if (typeof text !== 'string') {
      return text;
    }

    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      // Support step.stepId.field
      if (key.startsWith('step.')) {
        const parts = key.split('.');
        const stepId = parts[1];
        const field = parts[2] || 'output';

        const stepResult = availableContext.step?.[stepId];
        if (stepResult) {
          return stepResult[field] !== undefined ? stepResult[field] : match;
        }
      }

      // Support context.field
      if (key.startsWith('context.')) {
        const contextKey = key.substring(8); // Remove 'context.'
        const value = contextKey.split('.').reduce(
          (obj, k) => obj?.[k],
          availableContext.context
        );
        return value !== undefined ? value : match;
      }

      // Direct context key
      const value = availableContext.context?.[key];
      return value !== undefined ? value : match;
    });
  }
}

module.exports = { WorkflowExecutor, WorkflowError };
```

---

## ⚠️ ERROR HANDLING

### Types d'Erreurs

1. **WorkflowError**
   - Fichier YAML manquant
   - YAML malformé
   - Workflow invalide

2. **Step Execution Error**
   - Retry automatique (max_attempts)
   - Log détaillé de chaque tentative
   - Fail gracefully si step non-critical

### Exemple Workflow avec Retry

```yaml
name: create-prd-robust
steps:
  - id: analyze
    type: auto
    input: "Analyze project requirements"
    retry:
      max_attempts: 3
      delay_ms: 2000
    critical: true
    output_file: "{output_folder}/analysis.md"
```

---

## ⚡ PERFORMANCE

### Objectifs

- **Load Workflow:** < 100ms
- **Execute Step:** Variable (dépend executor)
- **Save Output:** < 50ms

### Optimisations

1. **Async I/O**
   - `fs-extra` avec promises
   - Pas de sync reads

2. **Sequential Execution**
   - Phase 1: Sequential only
   - Phase 2: Parallel steps (future)

3. **Lazy Loading**
   - Charger workflow au besoin
   - Pas de pre-loading

---

## 🧪 TESTS

### Fichier: `__tests__/workflow-executor.test.js`

```javascript
const { WorkflowExecutor, WorkflowError } = require('../_bmad/core/workflow-executor');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

describe('WorkflowExecutor', () => {
  let executor;
  let mockDispatcher;
  let mockAgentRegistry;
  let mockContextLayer;
  let testWorkflowDir;

  beforeEach(async () => {
    testWorkflowDir = path.join(__dirname, 'fixtures', 'workflows');
    await fs.ensureDir(testWorkflowDir);

    // Mock Dispatcher
    mockDispatcher = {
      routeTask: jest.fn().mockResolvedValue({
        type: 'worker',
        execute: jest.fn().mockResolvedValue({
          output: 'Worker result',
          tokens: 100,
          duration: 1.5,
          success: true,
          costEstimated: 0.0003
        })
      }),
      workerPool: {
        getAvailableWorker: jest.fn().mockResolvedValue({
          type: 'worker',
          execute: jest.fn().mockResolvedValue({
            output: 'Worker result',
            tokens: 100,
            duration: 1.5,
            success: true,
            costEstimated: 0.0003
          })
        })
      }
    };

    // Mock Agent Registry
    mockAgentRegistry = {
      getAgent: jest.fn().mockReturnValue({
        type: 'agent',
        execute: jest.fn().mockResolvedValue({
          output: 'Agent result',
          tokens: 500,
          duration: 3.0,
          success: true,
          costEstimated: 0.015
        })
      })
    };

    // Mock Context Layer
    mockContextLayer = {
      loadContext: jest.fn().mockResolvedValue({
        project_name: 'BYAN',
        owner: 'Yan'
      })
    };

    executor = new WorkflowExecutor({
      dispatcher: mockDispatcher,
      agentRegistry: mockAgentRegistry,
      contextLayer: mockContextLayer
    });
  });

  afterEach(async () => {
    await fs.remove(testWorkflowDir);
  });

  describe('loadWorkflow', () => {
    test('should load valid workflow YAML', async () => {
      const workflowPath = path.join(testWorkflowDir, 'test.yaml');
      await fs.writeFile(
        workflowPath,
        yaml.dump({
          name: 'test-workflow',
          steps: [
            { id: 'step1', type: 'auto', input: 'Test input' }
          ]
        })
      );

      const workflow = await executor.loadWorkflow(workflowPath);

      expect(workflow.name).toBe('test-workflow');
      expect(workflow.steps).toHaveLength(1);
    });

    test('should throw WorkflowError if file missing', async () => {
      await expect(
        executor.loadWorkflow('/missing/workflow.yaml')
      ).rejects.toThrow(WorkflowError);
    });

    test('should throw WorkflowError if YAML invalid', async () => {
      const workflowPath = path.join(testWorkflowDir, 'invalid.yaml');
      await fs.writeFile(workflowPath, 'invalid: yaml: content: [');

      await expect(
        executor.loadWorkflow(workflowPath)
      ).rejects.toThrow(WorkflowError);
    });
  });

  describe('validateWorkflow', () => {
    test('should validate correct workflow', () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'step1', type: 'auto', input: 'Input 1' },
          { id: 'step2', type: 'agent', input: 'Input 2' }
        ]
      };

      expect(() => executor.validateWorkflow(workflow)).not.toThrow();
    });

    test('should throw if name missing', () => {
      const workflow = {
        steps: []
      };

      expect(() => executor.validateWorkflow(workflow)).toThrow('name requis');
    });

    test('should throw if steps not array', () => {
      const workflow = {
        name: 'test',
        steps: 'not-array'
      };

      expect(() => executor.validateWorkflow(workflow)).toThrow('steps requis');
    });

    test('should throw if step.id missing', () => {
      const workflow = {
        name: 'test',
        steps: [
          { type: 'auto', input: 'Test' }
        ]
      };

      expect(() => executor.validateWorkflow(workflow)).toThrow('id requis');
    });

    test('should throw if duplicate step IDs', () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'step1', type: 'auto', input: 'Test 1' },
          { id: 'step1', type: 'auto', input: 'Test 2' }
        ]
      };

      expect(() => executor.validateWorkflow(workflow)).toThrow('uniques');
    });
  });

  describe('execute', () => {
    test('should execute simple workflow end-to-end', async () => {
      const workflowPath = path.join(testWorkflowDir, 'simple.yaml');
      await fs.writeFile(
        workflowPath,
        yaml.dump({
          name: 'simple-workflow',
          steps: [
            { id: 'step1', type: 'auto', input: 'Step 1 input' },
            { id: 'step2', type: 'auto', input: 'Step 2 input' }
          ]
        })
      );

      const result = await executor.execute(workflowPath);

      expect(result.workflowName).toBe('simple-workflow');
      expect(result.stepsExecuted).toBe(2);
      expect(result.success).toBe(true);
      expect(result.results).toHaveProperty('step1');
      expect(result.results).toHaveProperty('step2');
    });

    test('should save output when output_file specified', async () => {
      const outputPath = path.join(testWorkflowDir, 'output.txt');
      const workflowPath = path.join(testWorkflowDir, 'with-output.yaml');
      
      await fs.writeFile(
        workflowPath,
        yaml.dump({
          name: 'with-output',
          steps: [
            {
              id: 'step1',
              type: 'auto',
              input: 'Generate content',
              output_file: outputPath
            }
          ]
        })
      );

      await executor.execute(workflowPath);

      const savedContent = await fs.readFile(outputPath, 'utf8');
      expect(savedContent).toBe('Worker result');
    });

    test('should resolve placeholders in step input', async () => {
      const workflowPath = path.join(testWorkflowDir, 'placeholders.yaml');
      await fs.writeFile(
        workflowPath,
        yaml.dump({
          name: 'placeholders-test',
          steps: [
            { id: 'step1', type: 'auto', input: 'First step' },
            { id: 'step2', type: 'auto', input: 'Use {step.step1.output}' }
          ]
        })
      );

      await executor.execute(workflowPath);

      // Vérifier que step2 a reçu l'output de step1
      const mockExecute = mockDispatcher.routeTask.mock.results[1].value.execute;
      const step2Input = mockExecute.mock.calls[0][0].input;
      expect(step2Input).toBe('Use Worker result');
    });
  });

  describe('executeWithRetry', () => {
    test('should succeed on first attempt', async () => {
      const mockExecutor = {
        type: 'worker',
        execute: jest.fn().mockResolvedValue({
          success: true,
          output: 'Success'
        })
      };

      const result = await executor.executeWithRetry(
        mockExecutor,
        { id: 'task-1' },
        { max_attempts: 3 }
      );

      expect(result.success).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and succeed', async () => {
      const mockExecutor = {
        type: 'worker',
        execute: jest.fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockResolvedValueOnce({ success: true, output: 'Success' })
      };

      const result = await executor.executeWithRetry(
        mockExecutor,
        { id: 'task-1' },
        { max_attempts: 3, delay_ms: 100 }
      );

      expect(result.success).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    });

    test('should throw after max attempts', async () => {
      const mockExecutor = {
        type: 'worker',
        execute: jest.fn().mockRejectedValue(new Error('Persistent fail'))
      };

      await expect(
        executor.executeWithRetry(
          mockExecutor,
          { id: 'task-1' },
          { max_attempts: 2, delay_ms: 50 }
        )
      ).rejects.toThrow('échoué après 2 tentatives');

      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolvePlaceholders', () => {
    test('should resolve step output', () => {
      const context = {
        step: {
          step1: { output: 'Result 1' }
        },
        context: {}
      };

      const resolved = executor.resolvePlaceholders(
        'Use {step.step1.output}',
        context
      );

      expect(resolved).toBe('Use Result 1');
    });

    test('should resolve context value', () => {
      const context = {
        step: {},
        context: { project_name: 'BYAN' }
      };

      const resolved = executor.resolvePlaceholders(
        'Project: {project_name}',
        context
      );

      expect(resolved).toBe('Project: BYAN');
    });

    test('should keep unresolved placeholders', () => {
      const context = {
        step: {},
        context: {}
      };

      const resolved = executor.resolvePlaceholders(
        'Missing: {unknown}',
        context
      );

      expect(resolved).toBe('Missing: {unknown}');
    });
  });

  describe('Performance', () => {
    test('should execute workflow in reasonable time', async () => {
      const workflowPath = path.join(testWorkflowDir, 'perf.yaml');
      await fs.writeFile(
        workflowPath,
        yaml.dump({
          name: 'perf-test',
          steps: [
            { id: 'step1', type: 'auto', input: 'Test 1' },
            { id: 'step2', type: 'auto', input: 'Test 2' },
            { id: 'step3', type: 'auto', input: 'Test 3' }
          ]
        })
      );

      const start = Date.now();
      await executor.execute(workflowPath);
      const duration = Date.now() - start;

      // 3 steps + overhead < 1s (avec mocks)
      expect(duration).toBeLessThan(1000);
    });
  });
});
```

### Couverture Requise

- **Coverage:** 80%+
- **Tests:** 20+ test cases
- **Integration:** Tests end-to-end avec workflows réels

---

## 📦 DEPENDENCIES

```json
{
  "dependencies": {
    "js-yaml": "^4.1.0",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

---

## 💡 EXEMPLES D'UTILISATION

### Exemple 1: Workflow Simple

**Fichier:** `simple-workflow.yaml`

```yaml
name: create-simple-prd
description: Génère un PRD basique

steps:
  - id: analyze
    type: auto
    input: |
      Analyze the project requirements:
      {context.requirements}
    output_file: "{output_folder}/analysis.md"

  - id: generate-prd
    type: agent
    agent: architect
    input: |
      Based on this analysis:
      {step.analyze.output}
      
      Generate a PRD for {context.project_name}
    output_file: "{output_folder}/prd.md"
```

**Exécution:**

```javascript
const executor = new WorkflowExecutor({
  dispatcher: myDispatcher,
  agentRegistry: myAgentRegistry,
  contextLayer: myContextLayer
});

const result = await executor.execute('simple-workflow.yaml', {
  requirements: 'Build a todo app',
  project_name: 'TodoMaster',
  output_folder: './output'
});

console.log(`Success: ${result.success}`);
console.log(`Cost: $${result.totalCost}`);
```

### Exemple 2: Workflow avec Retry

```yaml
name: robust-workflow
steps:
  - id: fetch-data
    type: worker
    input: "Fetch external API data"
    retry:
      max_attempts: 5
      delay_ms: 2000
    critical: true

  - id: process
    type: auto
    input: "Process {step.fetch-data.output}"
    critical: false
```

### Exemple 3: Monitoring Workflow

```javascript
const result = await executor.execute('my-workflow.yaml');

console.log(`
  Workflow: ${result.workflowName}
  Steps: ${result.stepsExecuted}
  Success: ${result.success}
  Duration: ${result.totalDuration}ms
  Tokens: ${result.totalTokens}
  Cost: $${result.totalCost.toFixed(4)}
`);

// Détail par step
Object.entries(result.results).forEach(([stepId, stepResult]) => {
  console.log(`  ${stepId}: ${stepResult.executorType} (${stepResult.duration}s)`);
});
```

---

## ✅ CRITÈRES DE SUCCÈS

**Fonctionnel:**
- ✅ Load + parse workflow YAML
- ✅ Exécution séquentielle steps
- ✅ Résolution placeholders `{step.X.Y}` et `{context.Z}`
- ✅ Retry automatique avec backoff
- ✅ Sauvegarde outputs automatique

**Performance:**
- ✅ Load workflow < 100ms
- ✅ Save output < 50ms
- ✅ Support workflows 10+ steps

**Qualité:**
- ✅ 20+ tests passants
- ✅ Coverage 80%+
- ✅ Tests end-to-end

---

**Document généré le 2026-02-04**  
*Spécification Workflow Executor - BYAN v2.0*
