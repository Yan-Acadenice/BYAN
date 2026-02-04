# Flux de Données - BYAN v2.0

**Projet:** BYAN v2.0 - Plateforme d'Orchestration d'Agents IA  
**Auteur:** Yan (avec Paige - Technical Writer)  
**Date de création:** 2026-02-04  
**Version:** 1.0.0  
**Status du document:** Actif  

---

## Table des matières

- [Introduction](#introduction)
- [Vue d'ensemble des flux](#vue-densemble-des-flux)
- [Scénario 1: Exécution Worker Simple](#scénario-1-exécution-worker-simple)
- [Scénario 2: Exécution Agent Complexe](#scénario-2-exécution-agent-complexe)
- [Scénario 3: Fallback Worker vers Agent](#scénario-3-fallback-worker-vers-agent)
- [Gestion des erreurs](#gestion-des-erreurs)
- [Références cross-documents](#références-cross-documents)

---

## Introduction

Ce document décrit les flux de données au sein de BYAN v2.0, de la requête utilisateur jusqu'à la génération du résultat final. Il couvre trois scénarios principaux d'exécution et détaille la gestion des erreurs à chaque étape.

### Objectifs du document

- Illustrer les chemins de traitement des tâches dans le système
- Documenter les transformations de données entre composants
- Clarifier les points de décision du dispatcher
- Décrire les mécanismes de fallback et retry

### Documents connexes

Consultez également:
- [`04-interfaces-api.md`](./04-interfaces-api.md) - Signatures d'API utilisées
- [`05-data-models.md`](./05-data-models.md) - Structures de données détaillées
- [`07-decisions-architecturales.md`](./07-decisions-architecturales.md) - Justifications des choix techniques
- [`../architecture/byan-v2-0-architecture-node.md`](../architecture/byan-v2-0-architecture-node.md) - Architecture globale

---

## Vue d'ensemble des flux

Le système BYAN v2.0 traite les requêtes selon une architecture pipeline composée de quatre composants principaux:

```
User Request
    ↓
[Context Layer] ← Charge context hiérarchique (platform → project → story)
    ↓
[WorkflowExecutor] ← Parse workflow YAML, résout placeholders
    ↓
[EconomicDispatcher] ← Calcule complexity score, route vers executor
    ↓
[Worker Pool] ou [Agent Registry] ← Exécute tâche, retourne résultat
    ↓
Result + Metrics
```

### Types de flux

Le dispatcher route les tâches selon trois chemins possibles:

1. **Worker Simple** - Tâches avec complexity score < 30 (validation, formatting, extraction)
2. **Agent Complexe** - Tâches avec complexity score >= 60 (architecture, analysis, generation)
3. **Fallback** - Worker avec score 30-60 qui peut escalader vers Agent si échec

Chaque flux suit des étapes communes:
- Chargement du contexte
- Parsing du workflow
- Scoring de complexité
- Exécution avec retry
- Logging structuré

---

## Scénario 1: Exécution Worker Simple

Ce scénario illustre le traitement d'une tâche simple (validation YAML) routée vers un Worker.

### Flux de données

```
┌──────────────┐
│ User Request │
│ "Validate    │
│  YAML file"  │
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ Step 1: Context Layer                                │
│ loadContext('story', {projectId, storyId})           │
│                                                       │
│ Input:  level='story', id={projectId, storyId}       │
│ Output: {                                             │
│   user_name: "Yan",                                   │
│   output_folder: "/home/yan/conception/_bmad-output",│
│   project_constraints: "YAML compliance required"    │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 2: WorkflowExecutor                             │
│ execute('workflows/validate-yaml/workflow.yaml')     │
│                                                       │
│ Input:  workflowPath, context                        │
│ Workflow YAML:                                        │
│   steps:                                              │
│     - id: validate_syntax                            │
│       type: worker                                    │
│       input: "Validate {file_path}"                  │
│                                                       │
│ Output: task = {                                      │
│   id: 'validate_syntax',                             │
│   type: 'validation',                                │
│   input: 'Validate /path/to/file.yaml',             │
│   context: {...}                                     │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 3: EconomicDispatcher                           │
│ calculateComplexity(task)                            │
│                                                       │
│ Input:  task object                                  │
│ Calculation:                                          │
│   tokenCount = 10 tokens → score += 1                │
│   type = 'validation' → score += 5                   │
│   contextSize = 200 bytes → score += 0               │
│   keywords = 0 → score += 0                          │
│   Total score = 6                                    │
│                                                       │
│ Decision: score < 30 → Route to Worker               │
│                                                       │
│ Output: workerPool.getAvailableWorker()              │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 4: Worker Pool                                  │
│ worker.execute(task)                                 │
│                                                       │
│ Input:  task object                                  │
│ Process:                                              │
│   1. worker.status = 'busy'                          │
│   2. Call LLM (Haiku-like model)                     │
│      Prompt: "Validate /path/to/file.yaml"          │
│   3. LLM Response: "YAML syntax valid"               │
│                                                       │
│ Output: {                                             │
│   output: "YAML syntax valid",                       │
│   tokens: {input: 10, output: 5},                    │
│   duration: 0.8,                                     │
│   success: true,                                     │
│   costEstimated: 0.0003                              │
│ }                                                     │
│                                                       │
│ 4. worker.status = 'idle'                            │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 5: Observability Layer                          │
│ logger.logTaskExecution(task, worker, result)        │
│                                                       │
│ Log Entry (JSON):                                     │
│ {                                                     │
│   "event": "task_execution",                         │
│   "task_id": "validate_syntax",                      │
│   "executor_type": "worker",                         │
│   "complexity_score": 6,                             │
│   "duration_ms": 800,                                │
│   "tokens": {"input": 10, "output": 5},              │
│   "cost": 0.0003,                                    │
│   "success": true,                                   │
│   "timestamp": "2026-02-04T14:23:45.123Z"            │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────┐
│ User Result  │
│ "Valid YAML" │
└──────────────┘
```

### Données intermédiaires

**Context après chargement:**
```javascript
{
  // Platform level (from _bmad/_context/platform.yaml)
  user_name: "Yan",
  communication_language: "Francais",
  output_folder: "{project-root}/_bmad-output",
  
  // Project level (from _bmad/_context/conception/project.yaml)
  project_name: "conception",
  project_type: "architecture_design",
  
  // Story level (from _bmad/_context/conception/US-123/story.yaml)
  story_id: "US-123",
  story_title: "Validate YAML workflows",
  constraints: ["YAML 1.2 spec", "No anchors/aliases"]
}
```

**Task après résolution placeholders:**
```javascript
{
  id: 'validate_syntax',
  type: 'validation',
  input: 'Validate /home/yan/conception/_bmad/workflows/demo.yaml',
  agentName: null,
  context: {
    user_name: "Yan",
    output_folder: "/home/yan/conception/_bmad-output",
    // ... autres champs context
  },
  complexityScore: 6  // Ajouté par dispatcher
}
```

**Worker result:**
```javascript
{
  output: "YAML syntax valid. 0 errors, 0 warnings.",
  tokens: {
    input: 10,
    output: 5,
    total: 15
  },
  duration: 0.8,  // seconds
  success: true,
  costEstimated: 0.0003,  // $0.0003 USD
  model: "claude-haiku-3.5"
}
```

### Points de décision

**Dispatcher routing (Step 3):**
- **Condition:** `complexityScore < 30`
- **Action:** Route vers Worker Pool
- **Justification:** Tâche validation = déterministe, pas de raisonnement complexe requis

**Worker execution (Step 4):**
- **Condition:** `worker.isAvailable() === true`
- **Action:** Exécute immédiatement
- **Alternative:** Si tous workers busy, attendre via `waitForWorker()` (polling 100ms)

### Métriques collectées

```javascript
{
  event: "task_execution",
  task_id: "validate_syntax",
  executor_type: "worker",
  complexity_score: 6,
  duration_ms: 800,
  tokens: {input: 10, output: 5},
  cost: 0.0003,
  success: true
}
```

Ces métriques permettent:
- Monitoring performance (duration_ms)
- Tracking coûts (cost)
- Analyse accuracy routing (complexity_score vs success)
- Dataset pour ML dispatcher (Phase 2)

---

## Scénario 2: Exécution Agent Complexe

Ce scénario illustre le traitement d'une tâche complexe (génération architecture) routée vers un Agent.

### Flux de données

```
┌──────────────┐
│ User Request │
│ "Design      │
│  system arch"│
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ Step 1: Context Layer                                │
│ loadContext('project', {projectId})                  │
│                                                       │
│ Input:  level='project', id={projectId}              │
│ Output: {                                             │
│   user_name: "Yan",                                   │
│   project_name: "BYAN v2.0",                         │
│   tech_stack: "Node.js, JavaScript",                 │
│   mantras: ["Mantra #1: Clarity...", ...]           │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 2: WorkflowExecutor                             │
│ execute('workflows/design-architecture/workflow.yaml')│
│                                                       │
│ Workflow YAML:                                        │
│   steps:                                              │
│     - id: generate_architecture                      │
│       type: agent                                     │
│       agent: architect                               │
│       input: |                                        │
│         Design system architecture for {project_name}│
│         Tech stack: {tech_stack}                     │
│         Apply mantras: {mantras}                     │
│                                                       │
│ Output: task = {                                      │
│   id: 'generate_architecture',                       │
│   type: 'architecture',                              │
│   input: 'Design system architecture for BYAN v2.0   │
│           Tech stack: Node.js, JavaScript...',       │
│   agentName: 'architect',                            │
│   context: {...}                                     │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 3: EconomicDispatcher                           │
│ calculateComplexity(task)                            │
│                                                       │
│ Input:  task object                                  │
│ Calculation:                                          │
│   tokenCount = 350 tokens → score += 30 (max)        │
│   type = 'architecture' → score += 80                │
│   contextSize = 8000 bytes → score += 16             │
│   keywords = ['design', 'architect'] → score += 10   │
│   Total score = 100 (capped)                         │
│                                                       │
│ Decision: score >= 60 → Route to Agent               │
│                                                       │
│ Output: agentRegistry.getAgent('architect')          │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 4: Agent Registry                               │
│ agent.execute(task)                                  │
│                                                       │
│ Input:  task object                                  │
│ Process:                                              │
│   1. Load agent config (_bmad/bmm/agents/architect/) │
│   2. Merge context with agent memory                 │
│   3. Call LLM (Sonnet-like model)                    │
│      Prompt: "Design system architecture for BYAN... │
│               [+ 300 tokens context + mantras]"      │
│   4. LLM Response: "# Architecture BYAN v2.0..."     │
│      (2000 tokens output)                            │
│                                                       │
│ Output: {                                             │
│   output: "# Architecture BYAN v2.0\n\n## Components │
│            ...",                                      │
│   tokens: {input: 350, output: 2000},                │
│   duration: 5.2,                                     │
│   success: true,                                     │
│   costEstimated: 0.042                               │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 5: Observability Layer                          │
│ logger.logTaskExecution(task, agent, result)         │
│                                                       │
│ Log Entry (JSON):                                     │
│ {                                                     │
│   "event": "task_execution",                         │
│   "task_id": "generate_architecture",                │
│   "executor_type": "agent",                          │
│   "agent_name": "architect",                         │
│   "complexity_score": 100,                           │
│   "duration_ms": 5200,                               │
│   "tokens": {"input": 350, "output": 2000},          │
│   "cost": 0.042,                                     │
│   "success": true,                                   │
│   "timestamp": "2026-02-04T14:45:12.456Z"            │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌────────────────────┐
│ User Result        │
│ Architecture Doc   │
│ (2000 tokens)      │
└────────────────────┘
```

### Données intermédiaires

**Context après chargement:**
```javascript
{
  // Platform level
  user_name: "Yan",
  communication_language: "Francais",
  
  // Project level (hierarchical merge)
  project_name: "BYAN v2.0",
  project_type: "agent_orchestration_platform",
  tech_stack: "Node.js >= 18.0.0, JavaScript",
  mantras: [
    "Mantra #1: Clarity over cleverness",
    "Mantra #2: Context is king",
    // ... 62 autres mantras
  ]
}
```

**Task après scoring:**
```javascript
{
  id: 'generate_architecture',
  type: 'architecture',
  input: 'Design system architecture for BYAN v2.0. Tech stack: Node.js, JavaScript. Apply mantras: [Mantra #1: Clarity over cleverness, ...]',
  agentName: 'architect',
  context: {
    user_name: "Yan",
    project_name: "BYAN v2.0",
    tech_stack: "Node.js >= 18.0.0, JavaScript",
    mantras: [...]
  },
  complexityScore: 100,  // Score maximal
  routedTo: 'agent'
}
```

**Agent result:**
```javascript
{
  output: `# Architecture BYAN v2.0

## Vue d'ensemble

BYAN v2.0 est une plateforme d'orchestration d'agents IA basée sur 4 piliers:
- Agent: Expertise métier (modèles puissants)
- Context: Gestion d'état hiérarchique
- Workflow: Orchestration déclarative
- Worker: Exécution de tâches simples

## Composants

### Context Layer
...
[2000 tokens de documentation architecture détaillée]
`,
  tokens: {
    input: 350,
    output: 2000,
    total: 2350
  },
  duration: 5.2,  // seconds
  success: true,
  costEstimated: 0.042,  // $0.042 USD (14x plus cher que Worker)
  model: "claude-sonnet-4"
}
```

### Points de décision

**Dispatcher routing (Step 3):**
- **Condition:** `complexityScore >= 60`
- **Action:** Route vers Agent Registry
- **Justification:** Tâche architecture = raisonnement complexe, créativité, expertise requise

**Agent execution (Step 4):**
- **Agent selection:** `agentRegistry.getAgent('architect')` retourne Winston (Architect)
- **Context merging:** Combine platform + project + agent memory + task context
- **Model selection:** Utilise Claude Sonnet (modèle puissant) au lieu de Haiku

### Comparaison Worker vs Agent

| Métrique           | Worker (Scénario 1) | Agent (Scénario 2) | Ratio |
|--------------------|---------------------|-------------------|-------|
| Complexity Score   | 6                   | 100               | 16.7x |
| Duration (s)       | 0.8                 | 5.2               | 6.5x  |
| Tokens Input       | 10                  | 350               | 35x   |
| Tokens Output      | 5                   | 2000              | 400x  |
| Cost (USD)         | 0.0003              | 0.042             | 140x  |
| Model              | Haiku               | Sonnet            | -     |

**Enseignement:** Agent coûte 140x plus cher mais produit 400x plus de contenu de qualité supérieure.

---

## Scénario 3: Fallback Worker vers Agent

Ce scénario illustre une tâche avec score intermédiaire (30-60) qui tente d'abord Worker, puis escalade vers Agent en cas d'échec.

### Flux de données

```
┌──────────────┐
│ User Request │
│ "Extract     │
│  key info"   │
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ Step 1: Context Layer                                │
│ (Identique aux scénarios précédents)                 │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 2: WorkflowExecutor                             │
│ Workflow YAML:                                        │
│   steps:                                              │
│     - id: extract_requirements                       │
│       type: worker                                    │
│       input: "Extract key requirements from {doc}"   │
│       retry:                                          │
│         max_attempts: 2                              │
│         fallback_to_agent: true                      │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 3: EconomicDispatcher                           │
│ calculateComplexity(task)                            │
│                                                       │
│ Calculation:                                          │
│   tokenCount = 100 tokens → score += 10              │
│   type = 'extraction' → score += 15                  │
│   contextSize = 3000 bytes → score += 6              │
│   keywords = ['extract'] → score += 5                │
│   Total score = 36                                   │
│                                                       │
│ Decision: 30 <= score < 60 → Try Worker with fallback│
│                                                       │
│ Output: worker with fallbackToAgent = true           │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 4a: Worker Pool (Tentative 1)                   │
│ worker.execute(task)                                 │
│                                                       │
│ Process:                                              │
│   1. Call LLM (Haiku)                                │
│      Prompt: "Extract key requirements from [doc]"  │
│   2. LLM Response: Incomplete/incorrect              │
│   3. Validation: result.quality < threshold          │
│                                                       │
│ Output: {                                             │
│   output: "Requirements: 1. Feature A...",           │
│   success: false,  // Quality check failed           │
│   error: "Incomplete extraction"                     │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓ Fallback triggered
┌──────────────────────────────────────────────────────┐
│ Step 4b: Agent Registry (Fallback)                   │
│ agent.execute(task)                                  │
│                                                       │
│ Process:                                              │
│   1. Detect fallback scenario                        │
│   2. Add context: "Previous worker attempt failed"  │
│   3. Call LLM (Sonnet) with enriched prompt          │
│   4. LLM Response: Complete, structured              │
│                                                       │
│ Output: {                                             │
│   output: "# Requirements Analysis\n\n1. Feature A...│
│            [Complete structured extraction]",        │
│   tokens: {input: 120, output: 450},                 │
│   duration: 2.8,                                     │
│   success: true,                                     │
│   costEstimated: 0.012,                              │
│   fallbackFromWorker: true                           │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────┐
│ Step 5: Observability Layer                          │
│ logger.logTaskExecution(task, agent, result)         │
│                                                       │
│ Log Entries (JSON):                                   │
│ // Entry 1: Worker attempt                           │
│ {                                                     │
│   "event": "task_execution",                         │
│   "task_id": "extract_requirements",                 │
│   "executor_type": "worker",                         │
│   "complexity_score": 36,                            │
│   "duration_ms": 1200,                               │
│   "success": false,                                  │
│   "error": "Incomplete extraction"                   │
│ }                                                     │
│                                                       │
│ // Entry 2: Agent fallback                           │
│ {                                                     │
│   "event": "task_execution",                         │
│   "task_id": "extract_requirements",                 │
│   "executor_type": "agent",                          │
│   "complexity_score": 36,                            │
│   "duration_ms": 2800,                               │
│   "tokens": {"input": 120, "output": 450},           │
│   "cost": 0.012,                                     │
│   "success": true,                                   │
│   "fallback_from": "worker",                         │
│   "timestamp": "2026-02-04T15:10:33.789Z"            │
│ }                                                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ↓
┌─────────────────────┐
│ User Result         │
│ Complete extraction │
└─────────────────────┘
```

### Données intermédiaires

**Task avec configuration fallback:**
```javascript
{
  id: 'extract_requirements',
  type: 'extraction',
  input: 'Extract key requirements from /path/to/document.md',
  context: {...},
  complexityScore: 36,
  routedTo: 'worker',
  fallbackToAgent: true,  // Flag activé par dispatcher
  retryConfig: {
    max_attempts: 2,
    fallback_to_agent: true
  }
}
```

**Worker result (échec):**
```javascript
{
  output: "Requirements: 1. Feature A needs implementation",
  tokens: {input: 100, output: 12},
  duration: 1.2,
  success: false,  // Validation quality check failed
  error: "Incomplete extraction",
  qualityScore: 0.35,  // Threshold = 0.7
  model: "claude-haiku-3.5"
}
```

**Agent result (fallback success):**
```javascript
{
  output: `# Requirements Analysis

## Functional Requirements

1. **Feature A: User Authentication**
   - OAuth2 integration
   - Multi-factor authentication
   - Session management

2. **Feature B: Data Processing**
   - Real-time pipeline
   - Batch processing support
   
[... Complete structured extraction with 450 tokens]
`,
  tokens: {input: 120, output: 450},
  duration: 2.8,
  success: true,
  costEstimated: 0.012,
  model: "claude-sonnet-4",
  fallbackFromWorker: true,
  qualityScore: 0.92  // Au-dessus du threshold
}
```

### Points de décision

**Dispatcher routing (Step 3):**
- **Condition:** `30 <= complexityScore < 60`
- **Action:** Route vers Worker avec flag `fallbackToAgent = true`
- **Justification:** Tâche borderline - tenter worker économique d'abord, agent si échec

**Worker validation (Step 4a):**
- **Condition:** `result.qualityScore < 0.7`
- **Action:** Marquer `success = false`, déclencher fallback
- **Critères qualité:**
  - Complétude (tous champs requis extraits)
  - Structure (format attendu respecté)
  - Cohérence (pas de contradictions)

**Fallback trigger (Step 4b):**
- **Condition:** `worker.success === false && task.fallbackToAgent === true`
- **Action:** Escalade vers Agent avec contexte enrichi
- **Context enrichment:**
  ```javascript
  {
    ...originalContext,
    workerAttemptFailed: true,
    workerError: "Incomplete extraction",
    workerOutput: "Requirements: 1. Feature A needs...",
    instruction: "Complete and structure the extraction properly"
  }
  ```

### Métriques de fallback

**Coût total du fallback:**
```javascript
{
  totalCost: 0.012,  // Agent uniquement (worker échec non facturé)
  totalDuration: 4.0,  // 1.2s worker + 2.8s agent
  totalTokens: {input: 220, output: 462},  // Cumulé
  attemptCount: 2,
  successfulExecutor: 'agent',
  economicImpact: -0.012  // Coût additionnel vs worker success
}
```

**Analyse de pertinence:**
- Worker cost estimé: 0.0008 USD (si success)
- Agent cost réel: 0.012 USD
- Ratio: 15x plus cher
- Enseignement: Score 36 = trop proche du seuil, améliorer dispatcher

### Apprentissage pour ML Phase 2

Les données de fallback constituent un dataset précieux:

```javascript
{
  features: {
    complexityScore: 36,
    taskType: 'extraction',
    tokenCount: 100,
    contextSize: 3000,
    keywords: ['extract']
  },
  groundTruth: {
    correctExecutor: 'agent',  // Worker a échoué
    workerSuccess: false,
    agentSuccess: true
  }
}
```

Ces données permettront d'entraîner le ML dispatcher à:
- Reconnaître les patterns d'échec worker
- Ajuster le threshold de routing (ex: extraction > score 40 → agent direct)
- Réduire les fallbacks coûteux (actuellement 15-20% des tasks score 30-60)

---

## Gestion des erreurs

Ce chapitre décrit les mécanismes de gestion des erreurs à chaque niveau du pipeline.

### Erreurs du Context Layer

**Type:** Context file not found

```javascript
// _bmad/core/context.js
class ContextLayer {
  async loadContext(level, id) {
    try {
      const contextPath = this._resolveContextPath(level, id);
      return yaml.load(await fs.readFile(contextPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ContextError(
          `Context file not found: ${level}/${id}`,
          'FILE_NOT_FOUND',
          { level, id, path: contextPath }
        );
      }
      throw error;
    }
  }
}
```

**Gestion:**
- Erreur propagée au WorkflowExecutor
- Workflow step marqué comme failed
- User feedback: "Context configuration missing for story US-123"

**Retry:** Non applicable (erreur de configuration)

**Mitigation:**
- Validation au démarrage: vérifier existence context files requis
- Fallback: Charger context parent si child manquant

---

**Type:** YAML parse error

```javascript
catch (error) {
  if (error instanceof yaml.YAMLException) {
    throw new ContextError(
      `Invalid YAML syntax in context file`,
      'YAML_PARSE_ERROR',
      { level, id, yamlError: error.message }
    );
  }
}
```

**Gestion:**
- Workflow step échoue immédiatement
- Log structuré avec détails erreur YAML
- User feedback: "Syntax error in project.yaml line 15: unexpected token"

**Retry:** Non applicable (erreur de syntaxe)

**Mitigation:**
- Validation YAML via schema au commit (Git hook)
- CI/CD validation avant déploiement

---

### Erreurs du Workflow Executor

**Type:** Invalid workflow YAML

```javascript
// _bmad/core/workflow-executor.js
async execute(workflowPath) {
  try {
    const workflow = yaml.load(await fs.readFile(workflowPath, 'utf8'));
    this._validateWorkflow(workflow);  // Schema validation
    // ...
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new WorkflowError(
        `Invalid workflow: ${error.message}`,
        'WORKFLOW_VALIDATION_FAILED',
        { workflowPath, validationErrors: error.details }
      );
    }
    throw error;
  }
}
```

**Validation schema:**
```javascript
_validateWorkflow(workflow) {
  const requiredFields = ['name', 'version', 'steps'];
  const missing = requiredFields.filter(field => !workflow[field]);
  
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      { missingFields: missing }
    );
  }
  
  workflow.steps.forEach((step, index) => {
    if (!step.id || !step.type) {
      throw new ValidationError(
        `Step ${index} missing required fields (id, type)`,
        { stepIndex: index, step }
      );
    }
  });
}
```

**Gestion:**
- Workflow échoue immédiatement (fail-fast)
- Log détaillé avec champs manquants
- User feedback: "Workflow validation failed: missing 'id' in step 2"

**Retry:** Non applicable (erreur structurelle)

---

**Type:** Step execution failed

```javascript
async execute(workflowPath) {
  const results = {};
  
  for (const step of workflow.steps) {
    try {
      const result = await this.executeWithRetry(executor, task, step.retry);
      results[step.id] = result;
    } catch (error) {
      // Handle step failure
      results[step.id] = {
        success: false,
        error: error.message,
        step: step.id
      };
      
      if (step.on_error === 'continue') {
        // Continue to next step
        this.logger.warn(`Step ${step.id} failed, continuing`, error);
        continue;
      } else {
        // Default: stop workflow
        throw new WorkflowError(
          `Workflow failed at step: ${step.id}`,
          'STEP_EXECUTION_FAILED',
          { step: step.id, error: error.message, results }
        );
      }
    }
  }
  
  return {
    workflowName: workflow.name,
    stepsExecuted: Object.keys(results).length,
    results,
    success: Object.values(results).every(r => r.success)
  };
}
```

**Configuration on_error dans workflow YAML:**
```yaml
steps:
  - id: optional_validation
    type: worker
    input: "Validate optional field"
    on_error: continue  # Continue même si échec
    
  - id: critical_generation
    type: agent
    input: "Generate critical output"
    on_error: stop  # Stop workflow (default)
```

**Gestion:**
- Configurable par step via `on_error`
- Default: stop workflow (fail-fast)
- Option continue: marquer step failed mais continuer

---

### Erreurs du Dispatcher

**Type:** No available executor

```javascript
// _bmad/core/dispatcher.js
async routeTask(task) {
  const complexity = this.calculateComplexity(task);
  
  if (complexity < 30) {
    const worker = await this.workerPool.getAvailableWorker();
    
    if (!worker) {
      // Timeout after 30s waiting
      throw new DispatcherError(
        'No available worker after 30s',
        'WORKER_TIMEOUT',
        { complexity, queueSize: this.workerPool.queueSize }
      );
    }
    
    return worker;
  }
  // ...
}
```

**Gestion:**
- Timeout configurable (default 30s)
- Fallback: Escalader vers Agent si workers saturés
- Log queue metrics pour monitoring

---

**Type:** Routing calculation error

```javascript
calculateComplexity(task) {
  try {
    let score = 0;
    
    const tokenCount = task.input.split(/\s+/).length * 1.3;
    score += Math.min(tokenCount / 100, 30);
    
    // ... autres facteurs
    
    return Math.min(score, 100);
  } catch (error) {
    // Fallback: score conservateur
    this.logger.error('Complexity calculation failed, using default', error);
    return 50;  // Score moyen = route vers worker avec fallback
  }
}
```

**Gestion:**
- Try-catch autour calcul
- Fallback: score conservateur (50) = worker avec fallback agent
- Log error pour investigation

---

### Erreurs du Worker Pool

**Type:** LLM API call failed

```javascript
// _bmad/core/worker-pool.js
class Worker {
  async execute(task) {
    this.status = 'busy';
    
    try {
      const response = await this.callLLM(task);
      return {
        output: response.text,
        tokens: response.tokens,
        duration: response.duration,
        success: true
      };
    } catch (error) {
      if (this.fallbackToAgent) {
        // Fallback to agent
        return await this.fallbackToAgentExecution(task);
      }
      
      // No fallback: re-throw
      throw new WorkerError(
        `Worker execution failed: ${error.message}`,
        'LLM_API_ERROR',
        { workerId: this.id, task: task.id, error: error.message }
      );
    } finally {
      this.status = 'idle';
    }
  }
  
  async callLLM(task) {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._apiCall(task);
      } catch (error) {
        lastError = error;
        
        // Retry sur erreurs transitoires uniquement
        if (this._isRetryable(error) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Erreur non-retryable ou max attempts
        throw error;
      }
    }
    
    throw lastError;
  }
  
  _isRetryable(error) {
    const retryableCodes = [
      'ECONNRESET',      // Connection reset
      'ETIMEDOUT',       // Timeout
      'ENOTFOUND',       // DNS resolution failed
      'RATE_LIMIT',      // API rate limit
      '503'              // Service unavailable
    ];
    
    return retryableCodes.some(code => 
      error.code === code || error.message.includes(code)
    );
  }
}
```

**Gestion:**
- Retry automatique 3x avec exponential backoff (1s, 2s, 4s)
- Retry uniquement sur erreurs transitoires (network, rate limit, 503)
- Fallback vers Agent si flag `fallbackToAgent = true`
- Sinon, propagation erreur au WorkflowExecutor

**Erreurs non-retryables:**
- 400 Bad Request (problème prompt)
- 401 Unauthorized (problème API key)
- 404 Not Found (problème endpoint)
- Erreur parsing response

---

**Type:** Quality validation failed

```javascript
async execute(task) {
  // ... LLM call ...
  
  const result = {
    output: response.text,
    tokens: response.tokens,
    success: true
  };
  
  // Validate quality
  const qualityScore = this._validateQuality(result.output, task);
  
  if (qualityScore < 0.7) {
    result.success = false;
    result.error = 'Quality validation failed';
    result.qualityScore = qualityScore;
    
    if (this.fallbackToAgent) {
      return await this.fallbackToAgentExecution(task);
    }
  }
  
  return result;
}

_validateQuality(output, task) {
  let score = 0;
  
  // Facteur 1: Longueur minimale
  if (output.length < 50) {
    score += 0;
  } else if (output.length < 200) {
    score += 0.3;
  } else {
    score += 0.4;
  }
  
  // Facteur 2: Structure (si extraction)
  if (task.type === 'extraction') {
    const hasStructure = /^#+\s/.test(output) || /^-\s/.test(output);
    score += hasStructure ? 0.3 : 0;
  } else {
    score += 0.3;  // Non applicable
  }
  
  // Facteur 3: Complétude (keywords présents)
  const expectedKeywords = this._extractExpectedKeywords(task);
  const foundKeywords = expectedKeywords.filter(kw => 
    output.toLowerCase().includes(kw.toLowerCase())
  );
  score += (foundKeywords.length / expectedKeywords.length) * 0.3;
  
  return Math.min(score, 1.0);
}
```

**Gestion:**
- Validation qualité post-LLM
- Score < 0.7 = échec, trigger fallback si activé
- Log détaillé avec facteurs qualité
- Amélioration continue via feedback (Phase 2)

---

### Erreurs de l'Agent Registry

**Type:** Agent not found

```javascript
// _bmad/core/agent-registry.js
class AgentRegistry {
  getAgent(agentName) {
    const agent = this.agents[agentName];
    
    if (!agent) {
      throw new AgentError(
        `Agent not found: ${agentName}`,
        'AGENT_NOT_FOUND',
        { 
          requestedAgent: agentName,
          availableAgents: Object.keys(this.agents)
        }
      );
    }
    
    return agent;
  }
}
```

**Gestion:**
- Erreur propagée au WorkflowExecutor
- User feedback: "Agent 'architect' not found. Available: [analyst, pm, dev]"
- Suggestion: Typo dans workflow YAML

---

**Type:** Agent execution failed

```javascript
class Agent {
  async execute(task) {
    try {
      // Load agent config
      const config = await this._loadConfig();
      
      // Merge context with agent memory
      const enrichedContext = this._mergeContext(task.context, config.memory);
      
      // Call LLM (Sonnet)
      const response = await this.callLLM(task, enrichedContext);
      
      return {
        output: response.text,
        tokens: response.tokens,
        duration: response.duration,
        success: true,
        costEstimated: this._calculateCost(response.tokens)
      };
    } catch (error) {
      throw new AgentError(
        `Agent execution failed: ${error.message}`,
        'AGENT_EXECUTION_FAILED',
        { agentName: this.name, task: task.id, error: error.message }
      );
    }
  }
}
```

**Gestion:**
- Similaire Worker (retry LLM calls)
- Pas de fallback (Agent = executor terminal)
- Propagation au WorkflowExecutor pour retry step

---

### Stratégie de retry globale

Le WorkflowExecutor implémente une stratégie de retry configurable par step:

```javascript
async executeWithRetry(executor, task, retryConfig = {}) {
  const maxAttempts = retryConfig.max_attempts || 1;
  const backoffStrategy = retryConfig.backoff || 'exponential';
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executor.execute(task);
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        // Calculate delay
        let delay;
        if (backoffStrategy === 'exponential') {
          delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s, ...
        } else if (backoffStrategy === 'linear') {
          delay = attempt * 2000;  // 2s, 4s, 6s, ...
        } else {
          delay = 2000;  // Constant 2s
        }
        
        this.logger.info(
          `Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`,
          { task: task.id, error: error.message }
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new WorkflowError(
    `Task failed after ${maxAttempts} attempts`,
    'MAX_RETRIES_EXCEEDED',
    { task: task.id, lastError: lastError.message }
  );
}
```

**Configuration retry dans workflow YAML:**
```yaml
steps:
  - id: generate_architecture
    type: agent
    agent: architect
    input: "Design system architecture"
    retry:
      max_attempts: 3
      backoff: exponential  # exponential | linear | constant
```

**Comportement:**
- Attempt 1: Exécution immédiate
- Attempt 2: Retry après 2s
- Attempt 3: Retry après 4s
- Total: 3 attempts sur 6s

---

### Logs structurés pour debugging

Tous les composants logguent les erreurs dans un format structuré:

```javascript
// _bmad/core/structured-logger.js
logError(component, error, context = {}) {
  this.logger.error({
    event: 'error',
    component,
    errorType: error.constructor.name,
    errorCode: error.code,
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
}
```

**Exemple de log d'erreur:**
```json
{
  "event": "error",
  "component": "WorkflowExecutor",
  "errorType": "WorkflowError",
  "errorCode": "STEP_EXECUTION_FAILED",
  "message": "Workflow failed at step: generate_architecture",
  "stack": "WorkflowError: Workflow failed at step: generate_architecture\n    at WorkflowExecutor.execute (/path/to/workflow-executor.js:45:11)",
  "context": {
    "workflow": "design-architecture",
    "step": "generate_architecture",
    "executor": "agent",
    "attempt": 3
  },
  "timestamp": "2026-02-04T15:45:23.456Z"
}
```

Ces logs permettent:
- Debugging rapide (grep par `errorCode`)
- Monitoring dashboards (count by `errorType`)
- Alerting (erreurs critiques)
- Root cause analysis (stack trace + context)

---

## Références cross-documents

Ce document fait référence aux spécifications détaillées dans:

### Interfaces API
Consultez [`04-interfaces-api.md`](./04-interfaces-api.md) pour:
- Signatures complètes des méthodes (JSDoc)
- Paramètres et types retour
- Exemples d'utilisation API
- Error handling patterns

**Sections pertinentes:**
- Section 3: Context Layer API (`loadContext`, `resolvePlaceholders`)
- Section 4: Dispatcher API (`routeTask`, `calculateComplexity`)
- Section 5: Worker Pool API (`execute`, `getAvailableWorker`)
- Section 6: Workflow Executor API (`execute`, `executeWithRetry`)

### Data Models
Consultez [`05-data-models.md`](./05-data-models.md) pour:
- Structures YAML (context, workflow)
- Objets JavaScript (Task, Result, Context)
- Schémas de validation
- Exemples complets

**Sections pertinentes:**
- Section 2: Context YAML Structure
- Section 3: Workflow YAML Structure
- Section 4: Task Object Model
- Section 5: Result Object Model

### Décisions architecturales
Consultez [`07-decisions-architecturales.md`](./07-decisions-architecturales.md) pour:
- Justifications des choix techniques
- Alternatives considérées
- Trade-offs acceptés
- Roadmap évolution

**ADR pertinents:**
- ADR-002: In-Memory Cache (impact sur Context Layer)
- ADR-003: Rule-Based Dispatcher (algorithme de scoring)
- ADR-004: Worker Pool Statique (stratégie d'allocation)
- ADR-005: Workflow YAML (format déclaratif)

### Architecture globale
Consultez [`../architecture/byan-v2-0-architecture-node.md`](../architecture/byan-v2-0-architecture-node.md) pour:
- Vue d'ensemble du système
- Composants détaillés avec code
- Plan d'implémentation
- Stack technique

**Sections pertinentes:**
- Section 2: Architecture Globale (diagramme système)
- Section 3: Composants Détaillés (code complet)
- Section 8: Diagrammes UML (sequence diagrams)

### Diagrammes UML

Les diagrammes UML illustrant les flux décrits dans ce document sont disponibles dans:
- `_bmad-output/architecture/diagrams/byan-v2-sequence-worker.drawio` - Flux Worker (Scénario 1)
- `_bmad-output/architecture/diagrams/byan-v2-sequence-agent.drawio` - Flux Agent (Scénario 2)
- `_bmad-output/architecture/diagrams/byan-v2-sequence-fallback.drawio` - Flux Fallback (Scénario 3)

**Note:** Ces diagrammes ont été générés par l'agent drawio le 2026-02-04 et peuvent être édités avec Draw.io ou visualisés dans VSCode avec l'extension Draw.io Integration.

---

## Annexes

### Glossaire des composants

- **Context Layer:** Gère le chargement et l'héritage des contextes hiérarchiques
- **WorkflowExecutor:** Orchestre l'exécution séquentielle des steps d'un workflow YAML
- **EconomicDispatcher:** Route les tâches vers Worker ou Agent selon un score de complexité
- **Worker Pool:** Gère un pool de workers pour tâches simples (modèles légers)
- **Agent Registry:** Registry des agents métier (modèles puissants)
- **Observability Layer:** Collecte logs structurés et métriques d'exécution

### Métriques de performance cibles

| Métrique                     | Cible HYPER-MVP | Mesure                      |
|------------------------------|----------------|------------------------------|
| Context loading              | < 50ms         | Cache hit rate 60%+          |
| Worker response time         | < 2s           | LLM call + validation        |
| Agent response time          | < 10s          | LLM call complexe            |
| Dispatcher accuracy          | 70%+           | % tasks routées correctement |
| Fallback rate                | < 20%          | % tasks score 30-60          |
| Token cost reduction         | 40-50%         | vs all-agent baseline        |

### Checklist de validation

Avant de considérer un flux comme correctement implémenté:

- [ ] Context chargé avec succès (logs présents)
- [ ] Workflow YAML validé (schema compliance)
- [ ] Task scoré par dispatcher (complexity log)
- [ ] Executor appelé (worker ou agent)
- [ ] Result retourné avec success flag
- [ ] Metrics collectées (tokens, duration, cost)
- [ ] Erreurs gérées avec retry approprié
- [ ] Logs structurés écrits dans `_bmad-output/logs/byan.log`

---

**Document créé le:** 2026-02-04  
**Dernière mise à jour:** 2026-02-04  
**Auteur:** Yan (avec Paige - Technical Writer)  
**Status:** Actif  
**Version:** 1.0.0
