# BYAN v2.0 - Architecture Technique (Node.js/JavaScript)

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Design Phase  
**Timeline:** 1 semaine (7 jours)  
**Tech Stack:** Node.js >= 18.0.0, JavaScript  
**Auteur:** Yan (avec Carson - Brainstorming Coach)

---

## 🎯 VUE D'ENSEMBLE

### Vision

BYAN v2.0 transforme l'assistant intelligent d'interview métier en une **plateforme d'orchestration d'agents IA** basée sur 4 piliers:

1. **Agent** - Expertise métier (modèles puissants comme Sonnet)
2. **Context** - Gestion d'état hiérarchique avec héritage
3. **Workflow** - Orchestration déclarative (YAML DSL)
4. **Worker** - Exécution de tâches simples (modèles légers comme Haiku)

### Objectifs HYPER-MVP

**Problème résolu:**
- 40-50% réduction requêtes via routing intelligent
- Context hiérarchique: Platform → Project → Story
- Workflows déclaratifs en YAML
- Observability complète (logs + metrics)

---

## 🏗️ ARCHITECTURE GLOBALE

```
┌────────────────────────────────────────────────────────┐
│                    BYAN v2.0 PLATFORM                   │
│                    (Node.js / JavaScript)               │
├────────────────────────────────────────────────────────┤
│  User CLI → WorkflowExecutor → Dispatcher              │
│             ↓                   ↓                       │
│         Agent (Sonnet)      Worker Pool (Haiku)        │
│             ↓                   ↓                       │
│         ContextLayer (Multi-Level Inheritance)         │
│         ObservabilityLayer (Winston Logs + Metrics)    │
└────────────────────────────────────────────────────────┘
```

---

## 🧩 COMPOSANTS DÉTAILLÉS

### 1. CONTEXT LAYER

```javascript
// _bmad/core/context.js
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');

class ContextLayer {
  async loadContext(level, id = null) {
    const contextDir = path.join(process.cwd(), '_bmad/_context');
    
    if (level === 'platform') {
      return yaml.load(await fs.readFile(
        path.join(contextDir, 'platform.yaml'), 'utf8'
      ));
    }
    
    if (level === 'story') {
      const platform = await this.loadContext('platform');
      const project = yaml.load(await fs.readFile(
        path.join(contextDir, id.projectId, 'project.yaml'), 'utf8'
      ));
      const story = yaml.load(await fs.readFile(
        path.join(contextDir, id.projectId, id.storyId, 'story.yaml'), 'utf8'
      ));
      
      // Merge with child override
      return { ...platform, ...project, ...story };
    }
  }
  
  resolvePlaceholders(text, context) {
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      return context[key] || match;
    });
  }
}

module.exports = ContextLayer;
```

### 2. ECONOMIC DISPATCHER

```javascript
// _bmad/core/dispatcher.js

class EconomicDispatcher {
  calculateComplexity(task) {
    let score = 0;
    
    // Facteur 1: Tokens estimés
    const tokenCount = task.input.split(/\s+/).length * 1.3;
    score += Math.min(tokenCount / 100, 30);
    
    // Facteur 2: Type de tâche
    const taskComplexity = {
      'validation': 5,
      'formatting': 10,
      'extraction': 15,
      'analysis': 40,
      'generation': 50,
      'reasoning': 70,
      'architecture': 80
    };
    score += taskComplexity[task.type] || 30;
    
    // Facteur 3: Context size
    score += Math.min(JSON.stringify(task.context).length / 5000, 20);
    
    // Facteur 4: Keywords complexité
    const complexKeywords = [
      'analyze', 'design', 'architect', 'evaluate', 'optimize'
    ];
    const keywordCount = complexKeywords.filter(kw => 
      task.input.toLowerCase().includes(kw)
    ).length;
    score += keywordCount * 5;
    
    return Math.min(score, 100);
  }
  
  async routeTask(task) {
    const complexity = this.calculateComplexity(task);
    
    if (complexity < 30) {
      return await this.workerPool.getAvailableWorker();
    } else if (complexity < 60) {
      const worker = await this.workerPool.getAvailableWorker();
      worker.fallbackToAgent = true;
      return worker;
    } else {
      return this.agentRegistry.getAgent(task.agentName);
    }
  }
}

module.exports = EconomicDispatcher;
```

### 3. WORKER POOL

```javascript
// _bmad/core/worker-pool.js

class WorkerPool {
  constructor(size = 2) {
    this.workers = Array.from({ length: size }, (_, i) => 
      new Worker(i)
    );
  }
  
  async getAvailableWorker() {
    // Find available worker
    let worker = this.workers.find(w => w.isAvailable());
    
    if (!worker) {
      // Wait for one to be available
      await this.waitForWorker();
      worker = this.workers.find(w => w.isAvailable());
    }
    
    return worker;
  }
  
  async waitForWorker() {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.workers.some(w => w.isAvailable())) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }
}

class Worker {
  constructor(id) {
    this.id = id;
    this.status = 'idle';
    this.fallbackToAgent = false;
  }
  
  isAvailable() {
    return this.status === 'idle';
  }
  
  async execute(task) {
    this.status = 'busy';
    
    try {
      // Call LLM (Haiku-like model)
      const response = await this.callLLM(task);
      
      return {
        output: response.text,
        tokens: response.tokens,
        duration: response.duration,
        success: true,
        costEstimated: 0.0003
      };
    } catch (error) {
      if (this.fallbackToAgent) {
        // Fallback to agent
        return await this.fallbackToAgentExecution(task);
      }
      throw error;
    } finally {
      this.status = 'idle';
    }
  }
}

module.exports = WorkerPool;
```

### 4. WORKFLOW EXECUTOR

```javascript
// _bmad/core/workflow-executor.js
const yaml = require('js-yaml');
const fs = require('fs-extra');

class WorkflowExecutor {
  async execute(workflowPath) {
    // Load workflow YAML
    const workflowContent = await fs.readFile(workflowPath, 'utf8');
    const workflow = yaml.load(workflowContent);
    
    const results = {};
    
    // Execute steps sequentially
    for (const step of workflow.steps) {
      console.log(`Executing step: ${step.id}`);
      
      // Resolve inputs with previous results
      const stepInput = this.resolvePlaceholders(
        step.input, 
        { step: results, ...this.context }
      );
      
      // Create task
      const task = {
        id: step.id,
        type: step.type,
        input: stepInput,
        agentName: step.agent,
        context: this.context
      };
      
      // Route to executor
      const executor = step.type === 'agent' 
        ? this.agentRegistry.getAgent(step.agent)
        : await this.dispatcher.routeTask(task);
      
      // Execute with retry
      const result = await this.executeWithRetry(
        executor, task, step.retry
      );
      
      results[step.id] = result;
      
      // Save output if specified
      if (step.output_file) {
        const outputPath = this.resolvePlaceholders(
          step.output_file, this.context
        );
        await fs.writeFile(outputPath, result.output);
      }
    }
    
    return {
      workflowName: workflow.name,
      stepsExecuted: Object.keys(results).length,
      results,
      success: Object.values(results).every(r => r.success)
    };
  }
  
  async executeWithRetry(executor, task, retryConfig = {}) {
    const maxAttempts = retryConfig.max_attempts || 1;
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executor.execute(task);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}

module.exports = WorkflowExecutor;
```

### 5. OBSERVABILITY LAYER

```javascript
// _bmad/core/structured-logger.js
const winston = require('winston');
const path = require('path');

class StructuredLogger {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: path.join('_bmad-output', 'logs', 'byan.log')
        })
      ]
    });
  }
  
  logTaskExecution(task, executor, result) {
    this.logger.info({
      event: 'task_execution',
      task_id: task.id,
      executor_type: executor.type,
      complexity_score: task.complexityScore,
      duration_ms: result.duration * 1000,
      tokens: result.tokens,
      cost: result.costEstimated,
      success: result.success
    });
  }
}

module.exports = StructuredLogger;
```

---

## 📅 PLAN D'IMPLÉMENTATION (7 JOURS)

### JOUR 1-2: Context Multi-Layer
```bash
# Fichiers
_bmad/core/context.js
_bmad/core/cache.js (using node-cache)

# Tests
__tests__/context.test.js

# Dependencies
npm install node-cache js-yaml fs-extra
```

### JOUR 3-4: Dispatcher + Worker Pool
```bash
# Fichiers
_bmad/core/dispatcher.js
_bmad/core/worker-pool.js

# Tests
__tests__/dispatcher.test.js
__tests__/worker-pool.test.js
```

### JOUR 5: Workflow Executor
```bash
# Fichiers
_bmad/core/workflow-executor.js
_bmad/workflows/create-simple-prd/workflow.yaml

# Tests
__tests__/workflow-executor.test.js
```

### JOUR 6: Observability
```bash
# Fichiers
_bmad/core/structured-logger.js
_bmad/core/metrics-collector.js

# Dependencies
npm install winston
```

### JOUR 7: Documentation + Demo
```bash
README.md
QUICKSTART.md
demo/demo-workflow.yaml
```

---

## 📊 SUCCESS CRITERIA

**Fonctionnel:**
- Context loading < 50ms
- Worker pool répond < 2s
- Dispatcher accuracy 70%+
- Workflow YAML fonctionne end-to-end

**Performance:**
- RAM usage < 300MB
- CPU < 50% idle
- Cache hit rate 60%+

**Économie:**
- 40-50% réduction requêtes
- 60%+ tasks → workers

**Qualité:**
- Test coverage 80%+ (Jest)
- 0 dépendance externe lourde
- Clean code (self-documented)

---

## 🚀 ÉVOLUTION FUTURE

### Phase 2 (Semaines 2-4)
- Redis cache L2 (npm `redis`)
- Worker auto-scaling
- Context compression

### Phase 3 (Mois 2-3)
- ML-based dispatcher
- Worker promotion
- Self-optimizing routing

### Phase 4 (Mois 4-6)
- Agent modulaire (plugins)
- Workflow émergent
- Agent adaptatif

---

## 📚 STACK TECHNIQUE

**Core:**
- Node.js >= 18.0.0
- JavaScript (pur, pas TypeScript pour MVP)

**Dependencies:**
- `js-yaml` - Parse YAML workflows
- `node-cache` - In-memory cache
- `winston` - Structured logging
- `chalk` - CLI colors (déjà installé)
- `commander` - CLI args (déjà installé)
- `inquirer` - Prompts (déjà installé)
- `fs-extra` - File operations (déjà installé)
- `ora` - Spinners (déjà installé)

**Dev Dependencies:**
- `jest` - Testing framework (déjà installé)

**Distribution:**
- NPX: `npx create-byan-agent`
- NPM: `npm install -g create-byan-agent`

---

## 🎨 DIAGRAMMES UML

Les diagrammes UML ont été générés par l'agent drawio:
- `byan-v2-class-diagram.drawio` - Structure des classes
- `byan-v2-sequence-worker.drawio` - Flux Worker
- `byan-v2-sequence-agent.drawio` - Flux Agent
- `byan-v2-component-diagram.drawio` - Architecture composants
- `byan-v2-deployment-diagram.drawio` - Déploiement multi-OS

Fichiers dans: `_bmad-output/architecture/diagrams/`

---

**Document généré le 2026-02-04**  
*Architecture BYAN v2.0 en Node.js/JavaScript*  
*Auteur: Yan (avec Carson - Brainstorming Coach)*
