# BYAN v2.0 - Vision et Principes Architecturaux

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Design Phase  
**Auteur:** Yan

---

## Table des matières

- [Vision Produit](#vision-produit)
- [Objectifs HYPER-MVP](#objectifs-hyper-mvp)
- [Problèmes Résolus](#problèmes-résolus)
- [Principes Architecturaux](#principes-architecturaux)
- [Les 4 Piliers](#les-4-piliers)
- [Innovation Clé](#innovation-clé)
- [Roadmap Évolutive](#roadmap-évolutive)

---

## Vision Produit

### Transformation Stratégique

BYAN v2.0 transforme l'assistant intelligent d'interview métier en une **plateforme d'orchestration d'agents IA** optimisée pour l'efficacité économique et la scalabilité.

**Évolution :**

```
BYAN v1.0 (Interview Agent)          BYAN v2.0 (Orchestration Platform)
─────────────────────────────        ────────────────────────────────────
│                                    │
├─ Agent unique (Sonnet)             ├─ Architecture multi-agents
├─ Context non structuré             ├─ Context hiérarchique (3 niveaux)
├─ Workflows implicites              ├─ Workflows déclaratifs (YAML DSL)
├─ Pas d'optimisation coûts          ├─ Routing économique intelligent
├─ Observabilité limitée             ├─ Logs structurés + métriques
└─ Architecture monolithique         └─ Composants modulaires
```

### Proposition de Valeur

**Pour les développeurs :**
- Réduction de 40-50% des coûts en tokens via routing intelligent
- Workflows déclaratifs simples (YAML)
- Context management automatique avec héritage
- Debugging facilité avec logs structurés

**Pour les projets :**
- Architecture évolutive (HYPER-MVP → v2.0 complète)
- Multi-platform natif (Copilot CLI, VSCode, Claude, Codex)
- Performance optimisée (< 300MB RAM, latence < 2s)
- Standards Merise Agile + TDD intégrés

---

## Objectifs HYPER-MVP

### Timeline et Contraintes

**Durée :** 1 semaine (7 jours)  
**Budget :** Copilot Pro (~10$/mois, 500 requêtes/mois)  
**Infrastructure :** Multi-OS (Windows/Mac/Linux), 4-8GB RAM  
**Stack :** Node.js >= 18.0.0, JavaScript pur (pas TypeScript)

### Scope Fonctionnel

**Phase 1 (Jours 1-2) : Context Multi-Layer**
- 3 niveaux hiérarchiques : Platform → Project → Story
- Héritage avec override (child overrides parent)
- Cache in-memory avec LRU (limite 50MB)
- Chargement < 50ms

**Phase 2 (Jours 3-4) : Dispatcher + Worker Pool**
- Dispatcher rule-based avec score de complexité
- Pool statique de 2 workers (Claude Haiku)
- Routing : score < 30 → worker, >= 60 → agent
- Fallback automatique worker → agent

**Phase 3 (Jour 5) : Workflow Executor**
- DSL YAML minimal (steps, type, retry)
- Exécution séquentielle
- Retry avec backoff exponentiel
- Output file management

**Phase 4 (Jour 6) : Observability**
- Logs structurés (Winston)
- Token counting par task
- Cost tracking
- Metrics : duration, tokens, success rate

**Phase 5 (Jour 7) : Documentation + Demo**
- README avec architecture
- Guide d'utilisation
- Workflow demo end-to-end

### Success Metrics

**Performance :**
- Context loading < 50ms
- Worker pool response < 2s
- RAM usage < 300MB total

**Économie :**
- 40-50% réduction coûts tokens vs v1.0
- 60%+ tasks routées vers workers

**Qualité :**
- Dispatcher accuracy >= 70%
- Test coverage >= 80%
- Workflows YAML fonctionnent end-to-end

---

## Problèmes Résolus

### 1. Coûts Élevés des Requêtes LLM

**Problème :**
Dans BYAN v1.0, toutes les tâches utilisent Claude Sonnet (modèle coûteux), même pour des opérations simples comme le formatage ou la validation.

**Solution :**
Routing économique intelligent :

```
Tâche Simple (complexity < 30)          Tâche Complexe (complexity >= 60)
─────────────────────────────           ──────────────────────────────────
│                                       │
├─ Format markdown                      ├─ Conception architecture
├─ Valider YAML                         ├─ Analyse métier approfondie
├─ Extraire données                     ├─ Génération de code complexe
├─ Transformation simple                ├─ Décisions stratégiques
│                                       │
└─▶ WORKER (Haiku)                      └─▶ AGENT (Sonnet)
    Coût : 0.0003$ / 1000 tokens            Coût : 0.003$ / 1000 tokens
    (12× moins cher)                        (expertise justifiée)
```

**Impact économique :**

```javascript
// Scénario : 100 tâches/semaine
// v1.0 : 100% Agent (Sonnet) = 100 × 0.003$ = 0.30$
// v2.0 : 60% Worker + 40% Agent = (60 × 0.0003$) + (40 × 0.003$) = 0.138$
// Économie : 54% réduction
```

### 2. Gestion de Context Non Structurée

**Problème :**
Context transmis manuellement à chaque requête, duplication de données, pas d'héritage, gestion d'état complexe.

**Solution :**
Context hiérarchique avec héritage :

```
Platform Context (platform.yaml)
├─ company_name: "Acme Corp"
├─ methodology: "Merise Agile"
├─ mantras: [64 mantras TDD]
│
└─▶ Project Context (project.yaml)
    ├─ project_name: "ERP System"
    ├─ tech_stack: "Node.js"
    ├─ Hérite: company_name, methodology, mantras
    │
    └─▶ Story Context (story.yaml)
        ├─ story_id: "US-123"
        ├─ feature: "User Authentication"
        ├─ Hérite: ALL parent context
        └─ Override: peut redéfinir project_name si besoin
```

**Avantages :**
- Réduction duplication (Don't Repeat Yourself)
- Chargement optimisé (cache LRU)
- Maintenance simplifiée (une source de vérité)
- Placeholders dynamiques : `{company_name}` → `"Acme Corp"`

### 3. Workflows Implicites et Rigides

**Problème :**
Workflows codés en dur dans les agents, difficiles à modifier, pas réutilisables, pas de retry/error handling standardisé.

**Solution :**
DSL YAML déclaratif :

```yaml
# workflow.yaml
name: create-simple-prd
description: Generate a simple Product Requirements Document

steps:
  - id: analyze_requirements
    type: worker
    input: "Extract key requirements from: {user_input}"
    output_file: "{output_folder}/requirements.txt"
    retry:
      max_attempts: 3
      
  - id: generate_prd
    type: agent
    agent: pm
    input: "Generate PRD based on: {step.analyze_requirements.output}"
    output_file: "{output_folder}/prd.md"
    retry:
      max_attempts: 2
```

**Avantages :**
- Workflows modifiables sans changer le code
- Retry logic standardisé
- Réutilisabilité (import/extend workflows)
- Observability : logs par step

### 4. Absence d'Observability

**Problème :**
Debugging difficile, pas de metrics sur performance/coûts, impossible de tracker l'origine des erreurs dans les workflows complexes.

**Solution :**
Logs structurés + métriques :

```javascript
// Log structuré (JSON)
{
  "event": "task_execution",
  "timestamp": "2026-02-04T15:30:45Z",
  "task_id": "analyze_requirements",
  "executor_type": "worker",
  "complexity_score": 25,
  "duration_ms": 1850,
  "tokens": { "input": 120, "output": 250 },
  "cost_usd": 0.00045,
  "success": true
}
```

**Métriques trackées :**
- Token consumption par task type
- Cost per workflow
- Dispatcher accuracy (worker vs agent)
- Cache hit rate
- Execution time percentiles (p50, p95, p99)

---

## Principes Architecturaux

### Mantras Merise Agile Applicables

**Mantra #37 : Simplicity is the ultimate sophistication**
- Architecture minimale pour HYPER-MVP
- Pas de sur-engineering : Redis → In-memory cache
- Code self-documented, pas de frameworks lourds

**Mantra IA-1 : Trust But Verify**
- Dispatcher valide les résultats worker avant commit
- Fallback automatique si worker échoue
- Logs pour audit trail complet

**Mantra IA-16 : Challenge Before Confirm**
- Worker peut refuser tâche trop complexe
- Context validation avant execution
- Workflow step dependencies vérifiées

**Mantra IA-23 : Economic Intelligence**
- Routing basé coût/performance/latence
- Token budget tracking
- Optimize for 80/20 rule (60% workers, 40% agents)

**Mantra IA-24 : Adaptive Behavior**
- Dispatcher apprend des erreurs (Phase 2)
- Worker promotion si réussite répétée (Phase 3)
- Context compression si budget dépassé (Phase 3)

### Principes de Design

**1. Modularity**

```
┌──────────────────────────────────────┐
│   Composants Indépendants            │
├──────────────────────────────────────┤
│  ContextLayer │ Dispatcher │ Executor│
│       ↓            ↓            ↓    │
│  Testable │  Remplaçable │ Évolutif │
└──────────────────────────────────────┘
```

**2. Declarative Over Imperative**
- Workflows en YAML (what, pas how)
- Context en YAML (data, pas logic)
- Configuration over code

**3. Fail-Safe Defaults**
- Fallback worker → agent si échec
- Retry avec exponential backoff
- Context par défaut si missing

**4. Performance Budget**
- RAM < 300MB (monitored)
- Latency < 2s (p95)
- Token cost tracking

**5. Developer Experience**
- API simple (3 classes principales)
- Error messages clairs
- Documentation inline (JSDoc)

---

## Les 4 Piliers

### 1. AGENT (Niveau Expertise)

**Rôle :** Expert métier avec contexte large et capacité de raisonnement complexe.

**Caractéristiques :**
- Modèle : Claude Sonnet, GPT-4 (performant, coûteux)
- Scope : Décisions stratégiques, conception, validation, génération complexe
- Latence : 3-10s
- Coût : 0.003$ / 1000 tokens

**Exemples de tâches :**
- Concevoir une architecture système
- Analyser des besoins métier et proposer solutions
- Générer du code avec patterns complexes
- Valider la cohérence d'un workflow multi-étapes

**API :**

```javascript
const agent = agentRegistry.getAgent('pm');
const result = await agent.execute({
  task: 'generate_prd',
  input: 'Requirements document content...',
  context: contextLayer.loadContext('story', { storyId: 'US-123' })
});
```

### 2. CONTEXT (Niveau Situation)

**Rôle :** État situationnel hiérarchique avec héritage multi-niveaux.

**Caractéristiques :**
- Structure : 3 niveaux (Platform → Project → Story)
- Persistance : YAML files dans `_byan/_context/`
- Cache : In-memory LRU (50MB, TTL 5min)
- Résolution : Child overrides parent

**Hiérarchie :**

```
Platform Context (global)
├─ Company info
├─ Méthodologie (Merise Agile)
├─ Mantras (64 règles TDD)
├─ Standards (coding, documentation)
│
└─▶ Project Context (project-specific)
    ├─ Project name, tech stack
    ├─ Architecture decisions
    ├─ Team composition
    │
    └─▶ Story Context (task-specific)
        ├─ Story ID, feature description
        ├─ Acceptance criteria
        ├─ Technical constraints
```

**API :**

```javascript
const context = await contextLayer.loadContext('story', {
  projectId: 'erp-system',
  storyId: 'US-123'
});
// Résultat : merged object avec héritage
// story.yaml overrides project.yaml overrides platform.yaml
```

### 3. WORKFLOW (Niveau Orchestration)

**Rôle :** Orchestration déclarative de processus complexes.

**Caractéristiques :**
- Format : YAML DSL
- Exécution : Séquentielle (HYPER-MVP), parallèle (Phase 2)
- Features : Retry logic, output management, dependencies
- Location : `_byan/workflows/{workflow-name}/workflow.yaml`

**Structure :**

```yaml
name: workflow_name
description: What this workflow does

steps:
  - id: step_1
    type: worker | agent
    agent: agent_name  # if type=agent
    input: "Task description with {placeholders}"
    output_file: "path/to/output.txt"  # optional
    retry:
      max_attempts: 3
      
  - id: step_2
    type: agent
    agent: architect
    input: "Use result from: {step.step_1.output}"
```

**API :**

```javascript
const executor = new WorkflowExecutor(contextLayer, dispatcher);
const result = await executor.execute('_byan/workflows/create-prd/workflow.yaml');
// result.stepsExecuted = 5
// result.results = { step_1: {...}, step_2: {...} }
```

### 4. WORKER (Niveau Exécution)

**Rôle :** Exécuteur spécialisé pour tâches simples et déterministes.

**Caractéristiques :**
- Modèle : Claude Haiku, GPT-3.5 Turbo (léger, rapide, économique)
- Scope : Formatage, validation, extraction, transformations simples
- Latence : 1-3s
- Coût : 0.0003$ / 1000 tokens (12× moins cher que Agent)

**Exemples de tâches :**
- Formater un document markdown
- Valider syntaxe YAML
- Extraire des données structurées
- Transformer format JSON → CSV

**Worker Pool :**

```javascript
class WorkerPool {
  constructor(size = 2) {
    this.workers = Array.from({ length: size }, (_, i) => new Worker(i));
  }
  
  async getAvailableWorker() {
    // Retourne un worker disponible ou attend
  }
}

const worker = await workerPool.getAvailableWorker();
const result = await worker.execute(task);
```

**Fallback Mechanism :**

```
Task → Worker → Execution
              ↓ (échec)
         Fallback → Agent → Execution ✓
```

---

## Innovation Clé

### Economic Dispatcher

**Cœur du système :** Routing intelligent basé sur la complexité de la tâche.

**Algorithme de Complexité :**

```javascript
function calculateComplexity(task) {
  let score = 0;
  
  // Facteur 1: Token count estimé
  const tokens = task.input.split(/\s+/).length * 1.3;
  score += Math.min(tokens / 100, 30);  // Max 30 points
  
  // Facteur 2: Type de tâche
  const taskComplexityMap = {
    'validation': 5,
    'formatting': 10,
    'extraction': 15,
    'analysis': 40,
    'generation': 50,
    'reasoning': 70,
    'architecture': 80
  };
  score += taskComplexityMap[task.type] || 30;
  
  // Facteur 3: Context size
  score += Math.min(JSON.stringify(task.context).length / 5000, 20);
  
  // Facteur 4: Keywords de complexité
  const complexKeywords = ['analyze', 'design', 'architect', 'evaluate', 'optimize'];
  const keywordCount = complexKeywords.filter(kw => 
    task.input.toLowerCase().includes(kw)
  ).length;
  score += keywordCount * 5;
  
  return Math.min(score, 100);  // Score sur 100
}
```

**Règles de Routing :**

```
Complexity Score          Action                      Executor
────────────────────────────────────────────────────────────────
0-29                     → Route direct              Worker (Haiku)
30-59                    → Worker avec fallback      Worker → Agent
60-100                   → Route direct              Agent (Sonnet)
```

**Exemples :**

```javascript
// Tâche simple : "Format this markdown file"
// → Score = 8 (tokens) + 10 (formatting) + 2 (context) = 20
// → Worker

// Tâche moyenne : "Extract user requirements from this document"
// → Score = 15 (tokens) + 15 (extraction) + 5 (context) = 35
// → Worker avec fallback

// Tâche complexe : "Design a scalable architecture for microservices"
// → Score = 12 (tokens) + 80 (architecture) + 15 (context) + 5 (keywords) = 112 → 100
// → Agent
```

---

## Roadmap Évolutive

### HYPER-MVP (Semaine 1) ✅ PRIORITÉ

**Concepts implémentés :**
1. Context Multi-Layer (3 niveaux, in-memory cache)
2. Economic Dispatcher (rule-based)
3. Worker Pool (statique, 2 workers)
4. Workflow Executor (DSL YAML minimal)
5. Observability (logs + metrics basiques)

### Phase 2 (Semaines 2-4)

**Optimisations :**
- Redis cache L2 pour context persistant
- Worker auto-scaling (ajuste pool size dynamiquement)
- Context compression (réduction tokens pour LLM)
- Parallel workflow execution

### Phase 3 (Mois 2-3)

**Intelligence Avancée :**
- ML-based dispatcher (apprentissage des patterns)
- Worker promotion (worker → agent si succès répété)
- Self-optimizing routing (feedback loop)
- Saga pattern workflows (compensation automatique)

### Phase 4 (Mois 4-6)

**Architecture Mature :**
- Agent modulaire (système de plugins)
- Workflow émergent (génération conversationnelle)
- Agent adaptatif (comportement selon user level)
- Distributed tracing (OpenTelemetry)
- Agent Memory Bank (apprentissage persistant)

---

## Références

**Documents liés :**
- [Architecture Technique](../architecture/byan-v2-0-architecture-node.md)
- [Session Brainstorming](../brainstorming/brainstorming-session-2026-02-04.md)
- [Interfaces API](./04-interfaces-api.md)
- [Data Models](./05-data-models.md)
- [Flux de Données](./06-flux-de-donnees.md)

**Diagrammes UML :**
- [Class Diagram](../architecture/diagrams/byan-v2-class-diagram.drawio)
- [Component Diagram](../architecture/diagrams/byan-v2-component-diagram.drawio)
- [Sequence: Worker Flow](../architecture/diagrams/byan-v2-sequence-worker.drawio)
- [Sequence: Agent Flow](../architecture/diagrams/byan-v2-sequence-agent.drawio)
- [Deployment Diagram](../architecture/diagrams/byan-v2-deployment-diagram.drawio)

---

**Document créé le 2026-02-04**  
*BYAN v2.0 - Vision et Principes Architecturaux*  
*Auteur : Yan | Technical Writer : Paige*
