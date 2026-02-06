# Economic Dispatcher - Spécification Technique

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Ready for Implementation  
**Composant:** Core  
**Priorité:** P0 (Jour 3-4)

---

## Vue d'ensemble

Le **Economic Dispatcher** est le routeur intelligent de BYAN v2.0 qui décide si une tâche doit être exécutée par un Worker (modèle léger/rapide) ou un Agent (modèle puissant/coûteux) en fonction d'un score de complexité calculé dynamiquement.

**Problème résolu:**
- Réduire 40-50% des requêtes coûteuses (Agents) en routant vers Workers
- Optimiser le ratio coût/performance
- Fallback automatique Worker → Agent en cas d'échec
- Traçabilité des décisions de routing

**Objectif économique:**
- 60%+ des tâches → Workers (modèles légers)
- 30% des tâches → Medium complexity (Workers avec fallback)
- 10% des tâches → Agents (modèles puissants)

---

## Responsabilités

1. **Analyse de complexité**
   - Calculer score 0-100 basé sur multiples facteurs
   - Facteurs: tokens, type de tâche, contexte, keywords

2. **Routing décisionnel**
   - < 30: Worker direct
   - 30-60: Worker avec fallback Agent
   - > 60: Agent direct

3. **Calcul ROI**
   - Estimer coût (tokens × prix modèle)
   - Estimer durée (basé historique)
   - Recommander meilleur exécuteur

4. **Métriques & Learning**
   - Tracker accuracy des décisions
   - Ajuster thresholds si accuracy < 70%

---

## API Publique

### Classe EconomicDispatcher

```javascript
/**
 * Economic Dispatcher - Routage intelligent basé sur complexité
 * @class EconomicDispatcher
 */
class EconomicDispatcher {
  /**
   * Constructeur
   * @param {Object} options - Configuration
   * @param {WorkerPool} options.workerPool - Pool de workers
   * @param {AgentRegistry} options.agentRegistry - Registry des agents
   * @param {Object} options.thresholds - Seuils de routing
   * @param {number} options.thresholds.low - Seuil worker (défaut: 30)
   * @param {number} options.thresholds.medium - Seuil medium (défaut: 60)
   */
  constructor(options = {}) {}

  /**
   * Calcule le score de complexité d'une tâche
   * @param {Object} task - Tâche à analyser
   * @param {string} task.id - Identifiant unique
   * @param {string} task.type - Type de tâche
   * @param {string} task.input - Texte d'entrée
   * @param {Object} task.context - Contexte de la tâche
   * @returns {number} Score de complexité 0-100
   * 
   * @example
   * const score = dispatcher.calculateComplexity({
   *   type: 'formatting',
   *   input: 'Format this JSON',
   *   context: { ... }
   * });
   * // => 15
   */
  calculateComplexity(task) {}

  /**
   * Route une tâche vers le bon exécuteur
   * @param {Object} task - Tâche à router
   * @returns {Promise<Worker|Agent>} Exécuteur sélectionné
   * 
   * @example
   * const executor = await dispatcher.routeTask(task);
   * const result = await executor.execute(task);
   */
  async routeTask(task) {}

  /**
   * Calcule le ROI d'une tâche pour chaque exécuteur
   * @param {Object} task - Tâche
   * @param {string} executor - 'worker' | 'agent'
   * @returns {Object} ROI analysis
   * @returns {number} ROI.cost - Coût estimé en USD
   * @returns {number} ROI.duration - Durée estimée en ms
   * @returns {number} ROI.score - Score ROI (higher is better)
   * 
   * @example
   * const workerROI = dispatcher.calculateROI(task, 'worker');
   * const agentROI = dispatcher.calculateROI(task, 'agent');
   * // Compare et choisir meilleur ROI
   */
  calculateROI(task, executor) {}

  /**
   * Enregistre le résultat d'une tâche pour apprentissage
   * @param {Object} task - Tâche exécutée
   * @param {string} executor - Exécuteur utilisé
   * @param {Object} result - Résultat
   * @param {boolean} result.success - Succès ou échec
   * @returns {void}
   */
  recordResult(task, executor, result) {}

  /**
   * Obtient les métriques de routing
   * @returns {Object} Métriques
   * @returns {number} metrics.accuracy - Précision des décisions (%)
   * @returns {number} metrics.workerRate - % tâches vers workers
   * @returns {number} metrics.agentRate - % tâches vers agents
   */
  getMetrics() {}

  /**
   * Ajuste les thresholds basé sur performance historique
   * @returns {Object} Nouveaux thresholds
   */
  adjustThresholds() {}
}

module.exports = EconomicDispatcher;
```

---

## Implémentation

### Pseudo-code

```javascript
// _bmad/core/dispatcher.js

class EconomicDispatcher {
  constructor(options = {}) {
    this.workerPool = options.workerPool;
    this.agentRegistry = options.agentRegistry;
    
    // Thresholds configurables
    this.thresholds = {
      low: options.thresholds?.low || 30,
      medium: options.thresholds?.medium || 60
    };
    
    // Métriques
    this.metrics = {
      totalTasks: 0,
      workerSuccess: 0,
      workerFailure: 0,
      agentTasks: 0,
      fallbacks: 0
    };
    
    // Historique pour learning
    this.history = [];
  }

  calculateComplexity(task) {
    let score = 0;
    
    // Facteur 1: Tokens estimés (0-30 points)
    const words = task.input.split(/\s+/).length;
    const estimatedTokens = words * 1.3; // Moyenne 1.3 tokens/word
    score += Math.min(estimatedTokens / 100, 30);
    
    // Facteur 2: Type de tâche (0-50 points)
    const taskComplexity = {
      'validation': 5,
      'formatting': 10,
      'extraction': 15,
      'transformation': 20,
      'analysis': 40,
      'generation': 50,
      'reasoning': 70,
      'architecture': 80,
      'decision': 85
    };
    score += taskComplexity[task.type] || 30; // Défaut: 30
    
    // Facteur 3: Context size (0-20 points)
    const contextSize = JSON.stringify(task.context || {}).length;
    score += Math.min(contextSize / 5000, 20);
    
    // Facteur 4: Keywords complexité (0-20 points)
    const complexKeywords = [
      'analyze', 'design', 'architect', 'evaluate', 'optimize',
      'refactor', 'recommend', 'strategize', 'synthesize'
    ];
    const keywordMatches = complexKeywords.filter(kw => 
      task.input.toLowerCase().includes(kw)
    ).length;
    score += Math.min(keywordMatches * 5, 20);
    
    // Facteur 5: Dependencies (0-10 points)
    if (task.dependencies && task.dependencies.length > 0) {
      score += Math.min(task.dependencies.length * 2, 10);
    }
    
    // Clamp to 0-100
    return Math.max(0, Math.min(score, 100));
  }

  async routeTask(task) {
    this.metrics.totalTasks++;
    
    // 1. Calculer complexité
    const complexity = this.calculateComplexity(task);
    task.complexityScore = complexity; // Store for metrics
    
    console.log(`[Dispatcher] Task ${task.id}: complexity=${complexity}`);
    
    // 2. Décision de routing
    if (complexity < this.thresholds.low) {
      // Low complexity: Worker direct
      console.log(`[Dispatcher] → Worker (direct)`);
      return await this.workerPool.getAvailableWorker();
    }
    
    else if (complexity < this.thresholds.medium) {
      // Medium complexity: Worker avec fallback
      console.log(`[Dispatcher] → Worker (with fallback)`);
      const worker = await this.workerPool.getAvailableWorker();
      worker.fallbackToAgent = true;
      worker.fallbackRegistry = this.agentRegistry;
      return worker;
    }
    
    else {
      // High complexity: Agent direct
      console.log(`[Dispatcher] → Agent (direct)`);
      this.metrics.agentTasks++;
      const agentName = task.agentName || 'default';
      return this.agentRegistry.getAgent(agentName);
    }
  }

  calculateROI(task, executorType) {
    const complexity = task.complexityScore || this.calculateComplexity(task);
    
    if (executorType === 'worker') {
      // Worker: Haiku-like pricing
      const estimatedTokens = task.input.split(/\s+/).length * 1.5;
      const cost = (estimatedTokens / 1000) * 0.00025; // $0.25 per 1M tokens
      const duration = 1000 + (estimatedTokens * 0.1); // Base 1s + 0.1ms/token
      
      // Success probability based on complexity
      const successProb = Math.max(0.3, 1 - (complexity / 100));
      
      return {
        cost,
        duration,
        successProb,
        score: successProb / (cost + duration / 1000) // Higher is better
      };
    }
    
    else if (executorType === 'agent') {
      // Agent: Sonnet-like pricing
      const estimatedTokens = task.input.split(/\s+/).length * 1.5;
      const cost = (estimatedTokens / 1000) * 0.003; // $3 per 1M tokens
      const duration = 3000 + (estimatedTokens * 0.5); // Base 3s + 0.5ms/token
      
      // High success probability
      const successProb = 0.95;
      
      return {
        cost,
        duration,
        successProb,
        score: successProb / (cost + duration / 1000)
      };
    }
  }

  recordResult(task, executorType, result) {
    // Store in history
    this.history.push({
      taskId: task.id,
      complexity: task.complexityScore,
      executorType,
      success: result.success,
      timestamp: Date.now()
    });
    
    // Update metrics
    if (executorType === 'worker') {
      if (result.success) {
        this.metrics.workerSuccess++;
      } else {
        this.metrics.workerFailure++;
      }
    }
    
    // Check if fallback was used
    if (result.fallbackUsed) {
      this.metrics.fallbacks++;
    }
    
    // Keep only last 1000 entries
    if (this.history.length > 1000) {
      this.history.shift();
    }
  }

  getMetrics() {
    const total = this.metrics.totalTasks;
    
    if (total === 0) {
      return {
        accuracy: 0,
        workerRate: 0,
        agentRate: 0,
        fallbackRate: 0
      };
    }
    
    // Calculate accuracy: worker success rate
    const workerTotal = this.metrics.workerSuccess + this.metrics.workerFailure;
    const accuracy = workerTotal > 0 
      ? (this.metrics.workerSuccess / workerTotal * 100).toFixed(2)
      : 100;
    
    return {
      accuracy: parseFloat(accuracy),
      workerRate: ((workerTotal / total) * 100).toFixed(2),
      agentRate: ((this.metrics.agentTasks / total) * 100).toFixed(2),
      fallbackRate: ((this.metrics.fallbacks / total) * 100).toFixed(2)
    };
  }

  adjustThresholds() {
    const metrics = this.getMetrics();
    
    // Si accuracy < 70%, augmenter threshold low (plus conservateur)
    if (metrics.accuracy < 70) {
      this.thresholds.low = Math.max(20, this.thresholds.low - 5);
      console.log(`[Dispatcher] Adjusted thresholds: low=${this.thresholds.low}`);
    }
    
    // Si worker rate < 50%, diminuer threshold low (plus agressif)
    if (parseFloat(metrics.workerRate) < 50) {
      this.thresholds.low = Math.min(40, this.thresholds.low + 5);
      console.log(`[Dispatcher] Adjusted thresholds: low=${this.thresholds.low}`);
    }
    
    return this.thresholds;
  }
}

module.exports = EconomicDispatcher;
```

---

## Error Handling

### Stratégies

1. **Worker Unavailable**
   ```javascript
   async routeTask(task) {
     try {
       return await this.workerPool.getAvailableWorker();
     } catch (error) {
       // Fallback to agent if no worker available
       console.warn('[Dispatcher] No worker available, using agent');
       return this.agentRegistry.getAgent('default');
     }
   }
   ```

2. **Agent Not Found**
   ```javascript
   if (!agent) {
     throw new AgentNotFoundError(
       `Agent '${task.agentName}' not found in registry`
     );
   }
   ```

3. **Invalid Task**
   ```javascript
   if (!task.type || !task.input) {
     throw new InvalidTaskError(
       'Task must have type and input properties'
     );
   }
   ```

---

## Performance Requirements

| Metric | Target | Mesure |
|--------|--------|--------|
| **Complexity Calculation** | < 1ms | Benchmark 1000 tasks |
| **Routing Decision** | < 5ms | Include worker allocation |
| **Accuracy** | 70%+ | Worker success rate |
| **Worker Rate** | 60%+ | % tasks routed to workers |

---

## Tests Scénarios

### Scénario 1: Low Complexity → Worker
```javascript
test('should route simple formatting to worker', async () => {
  const task = {
    id: 'task-001',
    type: 'formatting',
    input: 'Format this JSON: {"name": "test"}',
    context: {}
  };
  
  const executor = await dispatcher.routeTask(task);
  
  expect(executor).toBeInstanceOf(Worker);
  expect(executor.fallbackToAgent).toBe(false);
  expect(task.complexityScore).toBeLessThan(30);
});
```

### Scénario 2: Medium Complexity → Worker with Fallback
```javascript
test('should route analysis to worker with fallback', async () => {
  const task = {
    id: 'task-002',
    type: 'analysis',
    input: 'Analyze this small dataset and extract key metrics',
    context: { data: [...] }
  };
  
  const executor = await dispatcher.routeTask(task);
  
  expect(executor).toBeInstanceOf(Worker);
  expect(executor.fallbackToAgent).toBe(true);
  expect(task.complexityScore).toBeGreaterThanOrEqual(30);
  expect(task.complexityScore).toBeLessThan(60);
});
```

### Scénario 3: High Complexity → Agent
```javascript
test('should route architecture to agent', async () => {
  const task = {
    id: 'task-003',
    type: 'architecture',
    input: 'Design a microservices architecture for...',
    context: { requirements: [...] }
  };
  
  const executor = await dispatcher.routeTask(task);
  
  expect(executor).toBeInstanceOf(Agent);
  expect(task.complexityScore).toBeGreaterThanOrEqual(60);
});
```

### Scénario 4: Complexity Calculation - Tokens
```javascript
test('should score based on token count', () => {
  const shortTask = {
    type: 'validation',
    input: 'Validate this',
    context: {}
  };
  
  const longTask = {
    type: 'validation',
    input: 'Validate this very long text... '.repeat(100),
    context: {}
  };
  
  const shortScore = dispatcher.calculateComplexity(shortTask);
  const longScore = dispatcher.calculateComplexity(longTask);
  
  expect(longScore).toBeGreaterThan(shortScore);
});
```

### Scénario 5: Complexity Calculation - Type
```javascript
test('should score based on task type', () => {
  const simple = { type: 'validation', input: 'test', context: {} };
  const complex = { type: 'reasoning', input: 'test', context: {} };
  
  const simpleScore = dispatcher.calculateComplexity(simple);
  const complexScore = dispatcher.calculateComplexity(complex);
  
  expect(complexScore).toBeGreaterThan(simpleScore);
});
```

### Scénario 6: Complexity Calculation - Keywords
```javascript
test('should score based on complexity keywords', () => {
  const noKeywords = {
    type: 'generation',
    input: 'Generate a list',
    context: {}
  };
  
  const withKeywords = {
    type: 'generation',
    input: 'Analyze and design an optimized architecture',
    context: {}
  };
  
  const score1 = dispatcher.calculateComplexity(noKeywords);
  const score2 = dispatcher.calculateComplexity(withKeywords);
  
  expect(score2).toBeGreaterThan(score1);
});
```

### Scénario 7: ROI Calculation
```javascript
test('should calculate ROI for worker vs agent', () => {
  const task = {
    type: 'analysis',
    input: 'Analyze this dataset',
    context: {}
  };
  
  task.complexityScore = 45;
  
  const workerROI = dispatcher.calculateROI(task, 'worker');
  const agentROI = dispatcher.calculateROI(task, 'agent');
  
  expect(workerROI.cost).toBeLessThan(agentROI.cost);
  expect(workerROI.duration).toBeLessThan(agentROI.duration);
  expect(agentROI.successProb).toBeGreaterThan(workerROI.successProb);
});
```

### Scénario 8: Record Results
```javascript
test('should record task results', () => {
  const task = { id: 'task-001', complexityScore: 25 };
  const result = { success: true };
  
  dispatcher.recordResult(task, 'worker', result);
  
  expect(dispatcher.history).toHaveLength(1);
  expect(dispatcher.metrics.workerSuccess).toBe(1);
});
```

### Scénario 9: Metrics Accuracy
```javascript
test('should calculate accuracy correctly', () => {
  // 3 successes, 1 failure
  dispatcher.recordResult({complexityScore: 20}, 'worker', {success: true});
  dispatcher.recordResult({complexityScore: 25}, 'worker', {success: true});
  dispatcher.recordResult({complexityScore: 30}, 'worker', {success: false});
  dispatcher.recordResult({complexityScore: 35}, 'worker', {success: true});
  
  const metrics = dispatcher.getMetrics();
  
  expect(metrics.accuracy).toBe(75); // 3/4 = 75%
});
```

### Scénario 10: Adjust Thresholds
```javascript
test('should adjust thresholds when accuracy is low', () => {
  // Simulate low accuracy
  for (let i = 0; i < 10; i++) {
    dispatcher.recordResult(
      {complexityScore: 20}, 
      'worker', 
      {success: i < 5} // 50% success
    );
  }
  
  const oldThreshold = dispatcher.thresholds.low;
  dispatcher.adjustThresholds();
  
  expect(dispatcher.thresholds.low).toBeLessThan(oldThreshold);
});
```

---

## Dependencies

```json
{
  "dependencies": {
    "node-cache": "^5.1.2"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

---

## Exemples Utilisation

### Exemple 1: Basic Usage

```javascript
const dispatcher = new EconomicDispatcher({
  workerPool: new WorkerPool(2),
  agentRegistry: new AgentRegistry(),
  thresholds: { low: 30, medium: 60 }
});

// Router une tâche
const task = {
  id: 'task-001',
  type: 'extraction',
  input: 'Extract user emails from this text',
  context: {}
};

const executor = await dispatcher.routeTask(task);
const result = await executor.execute(task);

// Enregistrer résultat
dispatcher.recordResult(task, 'worker', result);
```

### Exemple 2: ROI Comparison

```javascript
const task = {
  type: 'analysis',
  input: 'Analyze this code for security issues',
  context: { code: '...' }
};

const workerROI = dispatcher.calculateROI(task, 'worker');
const agentROI = dispatcher.calculateROI(task, 'agent');

console.log('Worker:', workerROI);
// => { cost: 0.0005, duration: 1500, successProb: 0.6, score: 0.4 }

console.log('Agent:', agentROI);
// => { cost: 0.006, duration: 4000, successProb: 0.95, score: 0.237 }

// Choose based on priority: cost vs quality
const executor = workerROI.score > agentROI.score 
  ? await dispatcher.workerPool.getAvailableWorker()
  : dispatcher.agentRegistry.getAgent('default');
```

### Exemple 3: Adaptive Learning

```javascript
// Exécuter plusieurs tâches
for (const task of tasks) {
  const executor = await dispatcher.routeTask(task);
  const result = await executor.execute(task);
  dispatcher.recordResult(task, executor.type, result);
}

// Vérifier métriques
const metrics = dispatcher.getMetrics();
console.log('Accuracy:', metrics.accuracy + '%');
console.log('Worker rate:', metrics.workerRate + '%');

// Ajuster si nécessaire
if (metrics.accuracy < 70) {
  dispatcher.adjustThresholds();
  console.log('New thresholds:', dispatcher.thresholds);
}
```

---

## Métriques Succès

| Metric | Target | Validation |
|--------|--------|------------|
| Accuracy | 70%+ | Worker success rate |
| Worker Rate | 60%+ | % tasks to workers |
| Latency | < 5ms | Routing decision time |
| Fallback Rate | < 15% | % worker → agent fallbacks |

**Commandes:**
```bash
npm test -- dispatcher.test.js
npm run benchmark -- dispatcher
```

---

**Document créé le 2026-02-04**  
*Spécification technique - Economic Dispatcher - BYAN v2.0*  
*Prêt pour implémentation Jour 3-4*
