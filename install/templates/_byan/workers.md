# BYAN v2 Workers - Lightweight LLM Agents

**Version:** 2.0.0  
**Last Updated:** 2026-02-10  
**Status:** ✅ Production Ready

---

## ⚠️ IMPORTANT: Worker vs Module

**WORKERS** = Petits agents LLM légers (Haiku, gpt-5-mini)  
**MODULES** = Code technique (Context, Dispatcher, Generation, etc.)

**Ne confondez pas les deux !**

---

## Qu'est-ce qu'un Worker ?

Un **Worker** est un **petit agent LLM** optimisé pour des tâches simples et répétitives.

### Caractéristiques

```
┌────────────────────┬──────────────┬──────────────┐
│ Feature            │ Worker       │ Agent        │
├────────────────────┼──────────────┼──────────────┤
│ Model              │ Haiku/Mini   │ Sonnet/Opus  │
│ Cost               │ 0.0003$/call │ 0.003$/call  │
│ Complexity Score   │ < 30         │ ≥ 60         │
│ Task Type          │ Simple       │ Complex      │
│ Context Window     │ Small        │ Large        │
│ Response Time      │ Fast         │ Slower       │
│ Intelligence       │ Low          │ High         │
└────────────────────┴──────────────┴──────────────┘
```

### Économie

```javascript
// Scénario : 100 tâches/semaine
// 100% Agent (Sonnet) = 100 × 0.003$ = 0.30$
// 60% Worker + 40% Agent = (60 × 0.0003$) + (40 × 0.003$) = 0.138$
// 
// Économie : 54% réduction de coût
```

---

## Architecture BYAN v2

### Dispatcher Rule-Based

Le **Dispatcher** (module technique, PAS un worker) analyse la complexité de chaque tâche et route :

```
┌─────────────────────────────────────────────────┐
│            TASK ARRIVES                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│        DISPATCHER (Code Module)                 │
│  Analyse complexité → Score 0-100               │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  Score < 30  │  │  Score ≥ 60  │
│              │  │              │
│   WORKER     │  │    AGENT     │
│   (Cheap)    │  │  (Expensive) │
│              │  │              │
│ gpt-5-mini   │  │ claude-sonnet│
│ 0.0003$      │  │ 0.003$       │
└──────────────┘  └──────────────┘
```

### Worker Pool

```javascript
// Pool de 2 workers LLM
WorkerPool (size=2)
  ├── Worker #0 (idle/busy) → Model: gpt-5-mini
  └── Worker #1 (idle/busy) → Model: gpt-5-mini
```

**Gestion automatique :**
- Allocation du worker disponible
- File d'attente si tous occupés
- Fallback vers Agent si worker échoue
- Retry logic avec backoff

---

## Types de Workers

### 1. Task Workers (Dans Worker Pool)

**Utilisation :** Tâches génériques simples

**Exemples :**
- Format JSON
- Extraire données structurées
- Valider format
- Traductions simples
- Résumés courts

**Routing :**
```javascript
// Dispatcher analyse complexité
if (complexityScore < 30) {
  executeWithWorker(task);
} else {
  executeWithAgent(task);
}
```

---

### 2. Launcher Workers (Platform-Specific)

**Utilisation :** Lancer yanstaller sur chaque plateforme

**Fichiers :**
- `_byan/workers/launchers/launch-yanstaller-copilot.md`
- `_byan/workers/launchers/launch-yanstaller-claude.md`
- `_byan/workers/launchers/launch-yanstaller-codex.md`

**Caractéristiques :**
- Single task (execute `npx create-byan-agent`)
- No LLM call (just shell command)
- Ultra-light (< 5 KB)
- Idempotent
- Platform hints via env vars

**Architecture :**
```
User → Stub Agent → Launcher Worker → Yanstaller Agent
```

---

## Worker Pool Implementation

### Code Location

`src/core/worker-pool/worker-pool.js`

### API

```javascript
class WorkerPool {
  /**
   * @param {number} size - Number of workers (default: 2)
   * @param {Object} options
   * @param {string} options.model - LLM model (default: 'gpt-5-mini')
   * @param {number} options.timeout - Timeout in ms (default: 30000)
   */
  constructor(size = 2, options = {}) {
    this.size = size;
    this.model = options.model || 'gpt-5-mini';
    this.workers = [];
    this.queue = [];
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      fallbackToAgent: 0
    };
  }

  /**
   * Execute task with next available worker
   * @param {Object} task
   * @returns {Promise<Object>}
   */
  async executeTask(task) {
    const worker = await this.getAvailableWorker();
    
    try {
      const result = await worker.execute(task);
      this.stats.success++;
      return result;
    } catch (error) {
      // Fallback to Agent if configured
      if (task.fallbackToAgent) {
        return await this.fallbackToAgent(task);
      }
      throw error;
    } finally {
      worker.release();
    }
  }

  /**
   * Get next available worker
   * @returns {Promise<Worker>}
   */
  async getAvailableWorker() {
    // Check for idle worker
    const idle = this.workers.find(w => w.isIdle());
    if (idle) {
      idle.markBusy();
      return idle;
    }

    // Queue if all busy
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Fallback to Agent for complex tasks
   * @param {Object} task
   * @returns {Promise<Object>}
   */
  async fallbackToAgent(task) {
    console.log(`Worker failed, falling back to Agent for task ${task.id}`);
    this.stats.fallbackToAgent++;
    
    // Use more powerful model
    const agent = new Agent({ model: 'claude-sonnet-4' });
    return await agent.execute(task);
  }
}
```

---

## Complexity Scoring

### Algorithm

```javascript
function calculateComplexity(task) {
  let score = 0;

  // Input length
  if (task.input.length > 1000) score += 20;
  else if (task.input.length > 500) score += 10;

  // Task type
  const complexTypes = ['analysis', 'reasoning', 'creation'];
  if (complexTypes.includes(task.type)) score += 30;

  // Context required
  if (task.contextSize > 5000) score += 20;

  // Multi-step
  if (task.steps && task.steps.length > 3) score += 15;

  // Output structure
  if (task.outputFormat === 'complex') score += 15;

  return score;
}
```

### Routing Logic

```javascript
const score = calculateComplexity(task);

if (score < 30) {
  // Simple task → Worker (gpt-5-mini)
  await workerPool.executeTask(task);
} else if (score < 60) {
  // Medium task → Worker with Agent fallback
  await workerPool.executeTask({
    ...task,
    fallbackToAgent: true
  });
} else {
  // Complex task → Agent directly (claude-sonnet)
  await agent.execute(task);
}
```

---

## Worker Lifecycle

### States

```
IDLE → BUSY → IDLE (success)
       ↓
     FAILED → RETRY → IDLE (success)
                ↓
              FALLBACK_TO_AGENT
```

### Flow

```javascript
// 1. Worker allocated from pool
const worker = await pool.getAvailableWorker();

// 2. Worker executes task
worker.markBusy();
const result = await worker.callLLM(task);

// 3. Worker released back to pool
worker.markIdle();
pool.releaseWorker(worker);

// 4. If failed and fallback enabled
if (failed && task.fallbackToAgent) {
  const agent = new Agent();
  return await agent.execute(task);
}
```

---

## Monitoring & Observability

### Metrics Tracked

```javascript
{
  total: 1000,              // Total tasks
  success: 850,             // Successful
  failed: 50,               // Failed
  fallbackToAgent: 100,     // Escalated to agent
  avgDuration: 1200,        // Average ms
  totalCost: 0.255,         // Total $
  avgCostPerTask: 0.000255  // Average $/task
}
```

### Cost Breakdown

```javascript
// Worker calls
workerCalls = 850;
workerCost = 850 × 0.0003$ = 0.255$;

// Agent fallback calls
agentCalls = 100;
agentCost = 100 × 0.003$ = 0.30$;

// Total
totalCost = 0.255$ + 0.30$ = 0.555$;

// vs All Agent approach
allAgentCost = 950 × 0.003$ = 2.85$;

// Savings
savings = (2.85$ - 0.555$) / 2.85$ = 80.5%
```

---

## Configuration

### Worker Pool Config

```yaml
# config/worker-pool.yaml
workerPool:
  size: 2
  model: gpt-5-mini
  timeout: 30000
  maxRetries: 3
  retryDelay: 1000
  
  fallback:
    enabled: true
    model: claude-sonnet-4
    threshold: 2  # Fallback after 2 failures
```

### Model Selection

```javascript
// Available models for workers
const WORKER_MODELS = {
  'gpt-5-mini': {
    cost: 0.0003,
    contextWindow: 128000,
    speed: 'fast'
  },
  'claude-haiku': {
    cost: 0.0005,
    contextWindow: 200000,
    speed: 'fast'
  }
};

// Available models for agents
const AGENT_MODELS = {
  'claude-sonnet-4': {
    cost: 0.003,
    contextWindow: 200000,
    speed: 'medium'
  },
  'claude-opus-4': {
    cost: 0.015,
    contextWindow: 200000,
    speed: 'slow'
  }
};
```

---

## Best Practices

### When to Use Workers

✅ **Use Workers for:**
- Format validation
- Data extraction
- Simple transformations
- JSON parsing/generation
- String operations
- Template filling

❌ **Don't Use Workers for:**
- Complex reasoning
- Multi-step analysis
- Code generation
- Architecture design
- Creative writing
- Decision making

### Optimization Tips

1. **Tune complexity thresholds** based on your use cases
2. **Monitor fallback rate** - high rate means threshold too low
3. **Batch simple tasks** to maximize worker utilization
4. **Cache common results** to avoid redundant calls
5. **Use async/await** properly to avoid blocking

---

## File Structure

```
_byan/
├── workers.md (this file)
└── workers/
    └── launchers/
        ├── README.md
        ├── launch-yanstaller-copilot.md
        ├── launch-yanstaller-claude.md
        └── launch-yanstaller-codex.md

src/
└── core/
    └── worker-pool/
        ├── worker-pool.js
        ├── worker.js
        └── complexity-scorer.js
```

---

## Related Documentation

- **Worker Pool Implementation:** `src/core/worker-pool/worker-pool.js`
- **Dispatcher Logic:** `src/byan-v2/dispatcher/`
- **Launcher Workers:** `_byan/workers/launchers/README.md`
- **Architecture:** `_bmad-output/conception/01-vision-et-principes.md`

---

## Summary

**Workers = Lightweight LLM agents for simple tasks**

```
┌─────────────────────────────────────────────────┐
│            BYAN v2 Task Execution               │
│                                                 │
│  Simple Task (score < 30)                       │
│    → Worker Pool (gpt-5-mini, 0.0003$)         │
│                                                 │
│  Medium Task (30 ≤ score < 60)                  │
│    → Worker Pool with Agent fallback            │
│                                                 │
│  Complex Task (score ≥ 60)                      │
│    → Agent directly (claude-sonnet, 0.003$)     │
│                                                 │
│  Result: 54-80% cost reduction                  │
└─────────────────────────────────────────────────┘
```

**Key Principle:** Right model for right task = optimal cost/performance

---

**Maintainer:** BYAN Core Team  
**Version:** 2.0.0  
**Status:** ✅ Production Ready
