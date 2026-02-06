# Worker Pool - Spécification Technique

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Ready for Implementation  
**Composant:** Core  
**Priorité:** P0 (Jour 3-4)

---

## Vue d'ensemble

Le **Worker Pool** est un gestionnaire de 2 workers asynchrones qui exécutent des tâches simples en parallèle avec des modèles LLM légers (type Haiku). Il fournit allocation automatique, file d'attente, retry logic et fallback vers agents en cas d'échec.

**Problème résolu:**
- Paralléliser l'exécution de tâches simples
- Gérer automatiquement disponibilité des workers
- Queue management quand tous workers occupés
- Fallback automatique Worker → Agent si struggle

**Architecture:**
```
WorkerPool (size=2)
  ├── Worker #0 (idle/busy)
  └── Worker #1 (idle/busy)
       ↓
    LLM Haiku-like
```

---

## Responsabilités

1. **Pool Management**
   - Maintenir pool de 2 workers
   - Allouer worker disponible
   - File d'attente si tous occupés

2. **Worker Lifecycle**
   - Créer/initialiser workers
   - Tracker status (idle/busy)
   - Libérer après exécution

3. **Async Execution**
   - Exécuter tâches en async/await
   - Gérer concurrence (2 max simultané)
   - Timeout protection

4. **Fallback Logic**
   - Détecter échecs workers
   - Router vers agent si `fallbackToAgent=true`
   - Tracker fallback rate

---

## API Publique

### Classe WorkerPool

```javascript
/**
 * Worker Pool - Gestion de workers asynchrones
 * @class WorkerPool
 */
class WorkerPool {
  /**
   * Constructeur
   * @param {number} size - Nombre de workers (défaut: 2)
   * @param {Object} options - Configuration
   * @param {string} options.model - Modèle LLM à utiliser (défaut: 'haiku')
   * @param {number} options.timeout - Timeout en ms (défaut: 30000)
   */
  constructor(size = 2, options = {}) {}

  /**
   * Obtient un worker disponible
   * @returns {Promise<Worker>} Worker disponible
   * @throws {TimeoutError} Si aucun worker disponible après timeout
   * 
   * @example
   * const worker = await pool.getAvailableWorker();
   * const result = await worker.execute(task);
   */
  async getAvailableWorker() {}

  /**
   * Exécute une tâche sur le prochain worker disponible
   * @param {Object} task - Tâche à exécuter
   * @returns {Promise<Object>} Résultat de l'exécution
   * 
   * @example
   * const result = await pool.executeTask({
   *   id: 'task-001',
   *   input: 'Format this JSON',
   *   type: 'formatting'
   * });
   */
  async executeTask(task) {}

  /**
   * Attend qu'un worker soit disponible
   * @param {number} timeout - Timeout en ms (défaut: 30000)
   * @returns {Promise<void>}
   * @throws {TimeoutError} Si timeout dépassé
   */
  async waitForWorker(timeout = 30000) {}

  /**
   * Obtient le statut du pool
   * @returns {Object} Status
   * @returns {number} status.available - Nombre workers disponibles
   * @returns {number} status.busy - Nombre workers occupés
   * @returns {number} status.total - Nombre total workers
   */
  getStatus() {}

  /**
   * Arrête tous les workers
   * @returns {Promise<void>}
   */
  async shutdown() {}
}

module.exports = WorkerPool;
```

### Classe Worker

```javascript
/**
 * Worker - Exécuteur de tâches simples avec LLM léger
 * @class Worker
 */
class Worker {
  /**
   * Constructeur
   * @param {number} id - Identifiant unique du worker
   * @param {Object} options - Configuration
   * @param {string} options.model - Modèle LLM (défaut: 'haiku')
   * @param {number} options.timeout - Timeout en ms (défaut: 30000)
   */
  constructor(id, options = {}) {}

  /**
   * Vérifie si le worker est disponible
   * @returns {boolean} True si idle
   * 
   * @example
   * if (worker.isAvailable()) {
   *   await worker.execute(task);
   * }
   */
  isAvailable() {}

  /**
   * Exécute une tâche
   * @param {Object} task - Tâche à exécuter
   * @param {string} task.id - ID unique
   * @param {string} task.input - Input text
   * @param {string} task.type - Type de tâche
   * @param {Object} task.context - Contexte
   * @returns {Promise<Object>} Résultat
   * @throws {TaskExecutionError} Si exécution échoue
   * 
   * @example
   * const result = await worker.execute({
   *   id: 'task-001',
   *   input: 'Extract emails from: user@example.com',
   *   type: 'extraction'
   * });
   */
  async execute(task) {}

  /**
   * Appelle le LLM avec la tâche
   * @param {Object} task - Tâche
   * @returns {Promise<Object>} Réponse LLM
   * @private
   */
  async callLLM(task) {}

  /**
   * Fallback vers agent si worker échoue
   * @param {Object} task - Tâche
   * @returns {Promise<Object>} Résultat agent
   * @private
   */
  async fallbackToAgentExecution(task) {}
}

module.exports = Worker;
```

---

## Implémentation

### Pseudo-code WorkerPool

```javascript
// _bmad/core/worker-pool.js

class WorkerPool {
  constructor(size = 2, options = {}) {
    this.size = size;
    this.options = options;
    
    // Créer workers
    this.workers = Array.from({ length: size }, (_, i) => 
      new Worker(i, options)
    );
    
    // Metrics
    this.metrics = {
      tasksExecuted: 0,
      totalDuration: 0,
      errors: 0
    };
  }

  async getAvailableWorker() {
    // 1. Chercher worker disponible
    let worker = this.workers.find(w => w.isAvailable());
    
    if (worker) {
      return worker;
    }
    
    // 2. Si aucun disponible, attendre
    await this.waitForWorker();
    
    // 3. Retry après wait
    worker = this.workers.find(w => w.isAvailable());
    
    if (!worker) {
      throw new Error('No worker available after waiting');
    }
    
    return worker;
  }

  async executeTask(task) {
    const startTime = Date.now();
    
    try {
      // Obtenir worker
      const worker = await this.getAvailableWorker();
      
      // Exécuter
      const result = await worker.execute(task);
      
      // Metrics
      this.metrics.tasksExecuted++;
      this.metrics.totalDuration += Date.now() - startTime;
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  async waitForWorker(timeout = 30000) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new TimeoutError('No worker available within timeout'));
          return;
        }
        
        // Check availability
        if (this.workers.some(w => w.isAvailable())) {
          clearInterval(interval);
          resolve();
        }
      }, 100); // Check every 100ms
    });
  }

  getStatus() {
    const available = this.workers.filter(w => w.isAvailable()).length;
    const busy = this.size - available;
    
    return {
      available,
      busy,
      total: this.size,
      metrics: this.metrics
    };
  }

  async shutdown() {
    // Wait for all workers to finish
    await Promise.all(
      this.workers.map(w => {
        while (!w.isAvailable()) {
          // Wait
        }
      })
    );
    
    console.log('[WorkerPool] Shutdown complete');
  }
}

module.exports = WorkerPool;
```

### Pseudo-code Worker

```javascript
// _bmad/core/worker.js

class Worker {
  constructor(id, options = {}) {
    this.id = id;
    this.status = 'idle'; // idle | busy
    this.options = options;
    
    // Fallback config
    this.fallbackToAgent = false;
    this.fallbackRegistry = null;
    
    // Stats
    this.stats = {
      tasksExecuted: 0,
      successCount: 0,
      failureCount: 0,
      fallbackCount: 0
    };
  }

  isAvailable() {
    return this.status === 'idle';
  }

  async execute(task) {
    // 1. Mark as busy
    this.status = 'busy';
    this.currentTask = task;
    
    const startTime = Date.now();
    
    try {
      console.log(`[Worker ${this.id}] Executing task ${task.id}`);
      
      // 2. Call LLM
      const response = await this.callLLM(task);
      
      // 3. Build result
      const result = {
        taskId: task.id,
        workerId: this.id,
        output: response.text,
        tokens: response.tokens,
        duration: Date.now() - startTime,
        success: true,
        costEstimated: this._estimateCost(response.tokens),
        executorType: 'worker'
      };
      
      // Stats
      this.stats.tasksExecuted++;
      this.stats.successCount++;
      
      return result;
      
    } catch (error) {
      console.error(`[Worker ${this.id}] Error:`, error.message);
      
      // 4. Fallback si configuré
      if (this.fallbackToAgent && this.fallbackRegistry) {
        console.log(`[Worker ${this.id}] Falling back to agent`);
        this.stats.fallbackCount++;
        
        return await this.fallbackToAgentExecution(task);
      }
      
      // Stats
      this.stats.failureCount++;
      
      throw new TaskExecutionError(
        `Worker ${this.id} failed to execute task ${task.id}: ${error.message}`
      );
      
    } finally {
      // 5. Mark as idle
      this.status = 'idle';
      this.currentTask = null;
    }
  }

  async callLLM(task) {
    // Simuler appel LLM (à remplacer par vrai appel)
    // En production: utiliser OpenAI, Anthropic, etc.
    
    const prompt = this._buildPrompt(task);
    
    // Mock response (en dev)
    if (process.env.NODE_ENV === 'test') {
      return {
        text: `[Mock] Processed task ${task.id}`,
        tokens: Math.floor(Math.random() * 500) + 100,
        model: 'haiku-mock'
      };
    }
    
    // Real LLM call (production)
    // const response = await anthropic.messages.create({
    //   model: 'claude-haiku-4',
    //   messages: [{ role: 'user', content: prompt }],
    //   max_tokens: 2000
    // });
    
    // return {
    //   text: response.content[0].text,
    //   tokens: response.usage.total_tokens,
    //   model: response.model
    // };
    
    throw new Error('LLM integration not implemented');
  }

  async fallbackToAgentExecution(task) {
    const agent = this.fallbackRegistry.getAgent(task.agentName || 'default');
    
    const result = await agent.execute(task);
    
    // Mark as fallback
    result.fallbackUsed = true;
    result.originalExecutor = 'worker';
    result.finalExecutor = 'agent';
    
    return result;
  }

  _buildPrompt(task) {
    return `Task: ${task.type}\n\nInput:\n${task.input}\n\nPlease process this task concisely.`;
  }

  _estimateCost(tokens) {
    // Haiku pricing: ~$0.25 per 1M tokens
    return (tokens / 1000000) * 0.25;
  }
}

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class TaskExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskExecutionError';
  }
}

module.exports = Worker;
```

---

## Error Handling

### Stratégies

1. **Timeout Protection**
   ```javascript
   async callLLM(task) {
     const timeout = this.options.timeout || 30000;
     
     return Promise.race([
       this._actualLLMCall(task),
       new Promise((_, reject) => 
         setTimeout(() => reject(new TimeoutError('LLM call timeout')), timeout)
       )
     ]);
   }
   ```

2. **Retry Logic**
   ```javascript
   async execute(task) {
     const maxRetries = task.retry?.max_attempts || 1;
     let lastError;
     
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         return await this._executeOnce(task);
       } catch (error) {
         lastError = error;
         if (attempt < maxRetries) {
           await this._delay(Math.pow(2, attempt) * 1000);
         }
       }
     }
     
     throw lastError;
   }
   ```

3. **Graceful Degradation**
   ```javascript
   if (this.fallbackToAgent) {
     try {
       return await this.fallbackToAgentExecution(task);
     } catch (fallbackError) {
       // Both worker and agent failed
       throw new Error(
         `Worker and agent both failed: ${fallbackError.message}`
       );
     }
   }
   ```

---

## Performance Requirements

| Metric | Target | Mesure |
|--------|--------|--------|
| **Worker Allocation** | < 1ms | Time to find available worker |
| **Task Execution** | < 2s | Avg duration simple tasks |
| **Queue Wait** | < 5s | Max wait when all busy |
| **Concurrency** | 2 parallel | Max simultaneous tasks |

---

## Tests Scénarios

### Scénario 1: Create Pool
```javascript
test('should create worker pool with 2 workers', () => {
  const pool = new WorkerPool(2);
  
  expect(pool.workers).toHaveLength(2);
  expect(pool.workers[0].id).toBe(0);
  expect(pool.workers[1].id).toBe(1);
});
```

### Scénario 2: Get Available Worker
```javascript
test('should get available worker', async () => {
  const pool = new WorkerPool(2);
  
  const worker = await pool.getAvailableWorker();
  
  expect(worker).toBeInstanceOf(Worker);
  expect(worker.isAvailable()).toBe(true);
});
```

### Scénario 3: Execute Task
```javascript
test('should execute task successfully', async () => {
  const pool = new WorkerPool(2);
  
  const task = {
    id: 'task-001',
    type: 'formatting',
    input: 'Format this text',
    context: {}
  };
  
  const result = await pool.executeTask(task);
  
  expect(result.success).toBe(true);
  expect(result.taskId).toBe('task-001');
  expect(result.executorType).toBe('worker');
});
```

### Scénario 4: Concurrency (2 parallel)
```javascript
test('should execute 2 tasks in parallel', async () => {
  const pool = new WorkerPool(2);
  
  const task1 = { id: 'task-001', type: 'test', input: 'A' };
  const task2 = { id: 'task-002', type: 'test', input: 'B' };
  
  const startTime = Date.now();
  
  // Execute in parallel
  const [result1, result2] = await Promise.all([
    pool.executeTask(task1),
    pool.executeTask(task2)
  ]);
  
  const duration = Date.now() - startTime;
  
  expect(result1.success).toBe(true);
  expect(result2.success).toBe(true);
  
  // Should take ~1x time, not 2x (parallel)
  expect(duration).toBeLessThan(3000);
});
```

### Scénario 5: Queue When All Busy
```javascript
test('should queue task when all workers busy', async () => {
  const pool = new WorkerPool(2);
  
  // Start 2 long tasks
  const longTask1 = pool.executeTask({
    id: 'long-1',
    input: 'Long task 1'
  });
  const longTask2 = pool.executeTask({
    id: 'long-2',
    input: 'Long task 2'
  });
  
  // Try to execute 3rd task (should wait)
  const startTime = Date.now();
  const task3 = await pool.executeTask({
    id: 'task-3',
    input: 'Should wait'
  });
  const waitTime = Date.now() - startTime;
  
  expect(task3.success).toBe(true);
  expect(waitTime).toBeGreaterThan(100); // Had to wait
});
```

### Scénario 6: Worker Status Tracking
```javascript
test('should track worker status correctly', async () => {
  const worker = new Worker(0);
  
  expect(worker.isAvailable()).toBe(true);
  
  // Start task (don't await)
  const taskPromise = worker.execute({
    id: 'task-001',
    input: 'Test'
  });
  
  // Should be busy now
  expect(worker.isAvailable()).toBe(false);
  
  // Wait for completion
  await taskPromise;
  
  // Should be available again
  expect(worker.isAvailable()).toBe(true);
});
```

### Scénario 7: Fallback to Agent
```javascript
test('should fallback to agent on failure', async () => {
  const worker = new Worker(0);
  worker.fallbackToAgent = true;
  worker.fallbackRegistry = mockAgentRegistry;
  
  // Force worker to fail
  worker.callLLM = jest.fn().mockRejectedValue(new Error('Worker failed'));
  
  const result = await worker.execute({
    id: 'task-001',
    input: 'Test'
  });
  
  expect(result.fallbackUsed).toBe(true);
  expect(result.finalExecutor).toBe('agent');
  expect(worker.stats.fallbackCount).toBe(1);
});
```

### Scénario 8: Timeout
```javascript
test('should timeout long-running tasks', async () => {
  const worker = new Worker(0, { timeout: 1000 });
  
  // Mock LLM that never resolves
  worker.callLLM = jest.fn(() => new Promise(() => {}));
  
  await expect(
    worker.execute({ id: 'task-001', input: 'Test' })
  ).rejects.toThrow(TimeoutError);
});
```

### Scénario 9: Pool Status
```javascript
test('should report pool status', async () => {
  const pool = new WorkerPool(2);
  
  let status = pool.getStatus();
  expect(status.available).toBe(2);
  expect(status.busy).toBe(0);
  
  // Start task
  const taskPromise = pool.executeTask({ id: 'task-001', input: 'Test' });
  
  status = pool.getStatus();
  expect(status.busy).toBe(1);
  
  await taskPromise;
  
  status = pool.getStatus();
  expect(status.available).toBe(2);
});
```

### Scénario 10: Shutdown
```javascript
test('should shutdown gracefully', async () => {
  const pool = new WorkerPool(2);
  
  // Start task
  pool.executeTask({ id: 'task-001', input: 'Test' });
  
  // Shutdown should wait for completion
  await pool.shutdown();
  
  const status = pool.getStatus();
  expect(status.available).toBe(2);
});
```

---

## Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

---

## Exemples Utilisation

### Exemple 1: Basic Usage

```javascript
const WorkerPool = require('./_bmad/core/worker-pool');

async function main() {
  const pool = new WorkerPool(2);
  
  const task = {
    id: 'task-001',
    type: 'extraction',
    input: 'Extract emails from: john@example.com, jane@test.org',
    context: {}
  };
  
  const result = await pool.executeTask(task);
  
  console.log('Result:', result.output);
  console.log('Duration:', result.duration + 'ms');
  console.log('Cost:', result.costEstimated);
}

main();
```

### Exemple 2: Parallel Execution

```javascript
async function processBatch(tasks) {
  const pool = new WorkerPool(2);
  
  // Execute all tasks in parallel (max 2 at a time)
  const results = await Promise.all(
    tasks.map(task => pool.executeTask(task))
  );
  
  console.log(`Processed ${results.length} tasks`);
  console.log('Status:', pool.getStatus());
}
```

### Exemple 3: With Dispatcher

```javascript
const dispatcher = new EconomicDispatcher({ workerPool: pool });

async function executeWithRouting(task) {
  // Dispatcher chooses worker or agent
  const executor = await dispatcher.routeTask(task);
  
  if (executor instanceof Worker) {
    console.log('Using worker');
  }
  
  return await executor.execute(task);
}
```

---

## Métriques Succès

| Metric | Target | Validation |
|--------|--------|------------|
| Concurrency | 2 parallel | Pool status |
| Avg Duration | < 2s | Task metrics |
| Success Rate | 90%+ | Worker stats |
| Fallback Rate | < 20% | Fallback count |

**Commandes:**
```bash
npm test -- worker-pool.test.js
npm run benchmark -- worker-pool
```

---

**Document créé le 2026-02-04**  
*Spécification technique - Worker Pool - BYAN v2.0*  
*Prêt pour implémentation Jour 3-4*
