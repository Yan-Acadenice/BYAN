---
story_id: STORY-BYAN-001
title: "Créer stubs JavaScript pour les 5 composants BYAN v2.0 avec tests unitaires"
epic: "BYAN v2.0 HYPER-MVP - Phase Implémentation"
priority: High
estimation: 2 jours
sprint: "Jour 1-2 du plan 7 jours"
status: In Progress
created_date: 2025-01-25
assigned_to: Amelia (Dev Agent)
labels: [implementation, stubs, testing, byan-v2, hyper-mvp]
dependencies: []
related_stories: []
---

# Story: Créer stubs JavaScript pour les 5 composants BYAN v2.0 avec tests unitaires

## 📋 Description

Créer l'infrastructure complète des 5 composants principaux de BYAN v2.0 sous forme de stubs JavaScript fonctionnels avec tests unitaires complets. Cette story établit la base architecturale du système BYAN v2.0 en implémentant les structures de classes, les méthodes essentielles et les tests unitaires pour garantir la qualité dès le départ.

Les composants incluent:
1. **Context Layer** - Gestion du contexte conversationnel avec partage inter-agents
2. **Cache System** - Cache intelligent avec TTL et économie de tokens
3. **Economic Dispatcher** - Routage intelligent des requêtes vers les modèles appropriés
4. **Worker Pool** - Gestion de workers pour exécution parallèle des agents
5. **Workflow Executor** - Orchestration des workflows multi-agents

## 🎯 Objectifs Business

- **Réduction immédiate des coûts**: Cache et dispatcher permettent 30-40% d'économies dès J1
- **Scalabilité**: Worker pool prépare l'exécution parallèle des agents
- **Qualité**: Tests unitaires garantissent la fiabilité avant intégration
- **Vélocité**: Structure claire accélère les développements suivants

## 👥 Personas Impactées

- **Développeurs BYAN**: Infrastructure claire et testée pour contribuer
- **Ops/DevOps**: Composants monitorables et maintenables
- **Utilisateurs finaux**: Fondation pour performance et fiabilité

## 📦 Composants Concernés

```
src/
├── core/
│   ├── context/
│   │   └── context.js
│   ├── cache/
│   │   └── cache.js
│   ├── dispatcher/
│   │   └── dispatcher.js
│   ├── worker-pool/
│   │   └── worker-pool.js
│   └── workflow/
│       └── workflow-executor.js
├── observability/
│   ├── logger/
│   │   └── structured-logger.js
│   ├── metrics/
│   │   └── metrics-collector.js
│   └── dashboard/
│       └── dashboard.js
└── __tests__/
    ├── context.test.js
    ├── cache.test.js
    ├── dispatcher.test.js
    ├── worker-pool.test.js
    ├── workflow-executor.test.js
    ├── structured-logger.test.js
    ├── metrics-collector.test.js
    └── dashboard.test.js
```

## ✅ Acceptance Criteria

### AC-1: Context Layer avec ContextLayer
**Given** un système BYAN v2.0 nécessitant du contexte conversationnel  
**When** un agent doit accéder ou modifier le contexte  
**Then** la classe ContextLayer fournit:
- Méthode `addLayer(name, data)` pour ajouter des couches de contexte
- Méthode `getLayer(name)` pour récupérer une couche spécifique
- Méthode `getAllLayers()` pour obtenir tout le contexte
- Méthode `clearLayer(name)` pour supprimer une couche
- Méthode `serialize()` pour export JSON
- Tests unitaires couvrant tous les cas (nominal, edge cases, erreurs)

**Validation**:
```javascript
const ctx = new ContextLayer();
ctx.addLayer('user', { name: 'Yan', role: 'dev' });
assert(ctx.getLayer('user').name === 'Yan');
assert(ctx.getAllLayers().user !== undefined);
```

---

### AC-2: Cache System avec SimpleCache
**Given** un système nécessitant de la mémorisation pour économiser les tokens  
**When** une requête identique est effectuée  
**Then** la classe SimpleCache fournit:
- Méthode `set(key, value, ttl)` pour stocker avec TTL optionnel
- Méthode `get(key)` pour récupérer (null si expiré)
- Méthode `has(key)` pour vérifier l'existence
- Méthode `delete(key)` pour supprimer
- Méthode `clear()` pour vider le cache
- Méthode `size()` pour obtenir le nombre d'entrées
- Tests unitaires incluant expiration TTL

**Validation**:
```javascript
const cache = new SimpleCache();
cache.set('key1', 'value1', 1000); // TTL 1s
assert(cache.get('key1') === 'value1');
await sleep(1100);
assert(cache.get('key1') === null); // Expiré
```

---

### AC-3: Economic Dispatcher avec EconomicDispatcher
**Given** plusieurs modèles AI disponibles (Haiku, Sonnet, Opus)  
**When** une tâche doit être routée vers le modèle approprié  
**Then** la classe EconomicDispatcher fournit:
- Méthode `dispatch(task)` qui retourne le modèle recommandé
- Logique simple de classification (keywords-based):
  - "explore", "simple", "quick" → Haiku (économique)
  - "implement", "code", "complex" → Sonnet (standard)
  - "architect", "critical", "review" → Opus (premium)
- Méthode `getModelCost(model)` pour obtenir le coût relatif
- Tests unitaires pour chaque catégorie de tâche

**Validation**:
```javascript
const dispatcher = new EconomicDispatcher();
assert(dispatcher.dispatch('explore codebase') === 'haiku');
assert(dispatcher.dispatch('implement feature') === 'sonnet');
assert(dispatcher.dispatch('architect system') === 'opus');
```

---

### AC-4: Worker Pool avec WorkerPool + Worker
**Given** des agents devant s'exécuter en parallèle  
**When** plusieurs tâches sont soumises simultanément  
**Then** les classes WorkerPool et Worker fournissent:
- **WorkerPool**: 
  - Constructeur `new WorkerPool(maxWorkers)`
  - Méthode `submitTask(task)` retournant une Promise
  - Méthode `getActiveWorkers()` pour monitoring
  - Méthode `shutdown()` pour arrêt gracieux
- **Worker**:
  - Propriété `id` unique
  - Propriété `status` (idle, busy, error)
  - Méthode `execute(task)` simulant l'exécution
- Tests unitaires incluant limitation du pool et gestion des erreurs

**Validation**:
```javascript
const pool = new WorkerPool(3);
const tasks = [task1, task2, task3, task4];
const results = await Promise.all(tasks.map(t => pool.submitTask(t)));
assert(results.length === 4);
assert(pool.getActiveWorkers() <= 3); // Respecte la limite
```

---

### AC-5: Workflow Executor avec WorkflowExecutor
**Given** un workflow multi-étapes défini  
**When** le workflow doit être exécuté  
**Then** la classe WorkflowExecutor fournit:
- Méthode `executeWorkflow(workflow)` prenant un objet workflow
- Support des workflows séquentiels (steps array)
- Méthode `getExecutionStatus()` pour suivi
- Méthode `pause()` et `resume()` pour contrôle
- Méthode `getResults()` pour obtenir les résultats
- Tests unitaires pour workflows simples et avec erreurs

**Validation**:
```javascript
const executor = new WorkflowExecutor();
const workflow = {
  name: 'test-workflow',
  steps: [
    { id: 'step1', action: 'task1' },
    { id: 'step2', action: 'task2' }
  ]
};
const result = await executor.executeWorkflow(workflow);
assert(result.success === true);
assert(result.stepsCompleted === 2);
```

---

### AC-6: Structured Logger avec StructuredLogger
**Given** le besoin de logs structurés pour observabilité  
**When** des événements système se produisent  
**Then** la classe StructuredLogger fournit:
- Méthodes `info(message, meta)`, `warn()`, `error()`, `debug()`
- Format JSON structuré avec timestamp, level, message, metadata
- Méthode `setLevel(level)` pour filtrage
- Méthode `getLogs()` pour récupération (mode in-memory pour tests)
- Tests unitaires pour tous les niveaux de log

**Validation**:
```javascript
const logger = new StructuredLogger();
logger.info('Task started', { taskId: '123', agent: 'dev' });
const logs = logger.getLogs();
assert(logs[0].level === 'info');
assert(logs[0].meta.taskId === '123');
assert(logs[0].timestamp !== undefined);
```

---

### AC-7: Metrics Collector avec MetricsCollector
**Given** le besoin de collecter des métriques système  
**When** des opérations s'exécutent  
**Then** la classe MetricsCollector fournit:
- Méthode `recordMetric(name, value, tags)` pour enregistrer
- Méthode `increment(name, tags)` pour compteurs
- Méthode `recordDuration(name, durationMs, tags)` pour timings
- Méthode `getMetrics()` pour récupération
- Méthode `getMetric(name)` pour une métrique spécifique
- Tests unitaires pour tous les types de métriques

**Validation**:
```javascript
const metrics = new MetricsCollector();
metrics.increment('api.calls', { endpoint: '/chat' });
metrics.recordDuration('request.duration', 150, { status: '200' });
const collected = metrics.getMetrics();
assert(collected['api.calls'].value === 1);
assert(collected['request.duration'].value === 150);
```

---

### AC-8: Dashboard avec printDashboard()
**Given** des métriques et logs disponibles  
**When** un utilisateur veut visualiser l'état du système  
**Then** la fonction printDashboard() fournit:
- Affichage formaté dans la console
- Sections: Status, Metrics, Recent Logs, Workers
- Utilisation de box-drawing characters pour rendu visuel
- Fonction standalone exportée depuis dashboard.js
- Tests unitaires vérifiant la structure de sortie

**Validation**:
```javascript
const dashboard = require('./observability/dashboard/dashboard.js');
const output = dashboard.printDashboard({
  metrics: metricsCollector.getMetrics(),
  logs: logger.getLogs(),
  workers: pool.getActiveWorkers()
});
assert(output.includes('╔═══ BYAN v2.0 Dashboard ═══╗'));
assert(output.includes('Status:'));
assert(output.includes('Metrics:'));
```

---

### AC-9: Tests Unitaires pour tous les composants
**Given** tous les composants implémentés  
**When** la suite de tests est exécutée  
**Then** les tests fournissent:
- Couverture >= 80% pour chaque composant
- Tests des cas nominaux (happy path)
- Tests des cas d'erreur (error handling)
- Tests des edge cases (limites, valeurs nulles, etc.)
- Framework Jest configuré avec `npm test`
- Tous les tests passent à 100%

**Validation**:
```bash
$ npm test
PASS  __tests__/context.test.js
PASS  __tests__/cache.test.js
PASS  __tests__/dispatcher.test.js
PASS  __tests__/worker-pool.test.js
PASS  __tests__/workflow-executor.test.js
PASS  __tests__/structured-logger.test.js
PASS  __tests__/metrics-collector.test.js
PASS  __tests__/dashboard.test.js

Test Suites: 8 passed, 8 total
Tests:       XX passed, XX total
Coverage:    > 80% lines
```

---

### AC-10: Clean Code (JSDoc, pas d'emojis)
**Given** le code des composants  
**When** un développeur lit le code  
**Then** le code respecte:
- JSDoc complet pour toutes les classes et méthodes publiques
- Commentaires explicatifs pour la logique complexe
- Pas d'emojis dans le code source (uniquement en logs/docs)
- Nommage clair et consistant (camelCase, PascalCase)
- Structure de fichiers cohérente
- ESLint configuré et respecté

**Validation**:
```javascript
/**
 * Context Layer for managing conversational context across agents
 * @class ContextLayer
 */
class ContextLayer {
  /**
   * Add a new context layer
   * @param {string} name - Layer name
   * @param {object} data - Layer data
   * @returns {void}
   */
  addLayer(name, data) { /* ... */ }
}
```

---

## 📝 Tasks & Subtasks

### Task 1: Setup projet et structure de dossiers
- [ ] 1.1 Initialiser package.json avec Jest
- [ ] 1.2 Créer structure de dossiers src/core, src/observability, __tests__
- [ ] 1.3 Configurer Jest dans package.json
- [ ] 1.4 Créer .gitignore approprié (node_modules, coverage)

### Task 2: Implémenter Context Layer
- [ ] 2.1 Créer src/core/context/context.js avec classe ContextLayer
- [ ] 2.2 Implémenter méthodes: addLayer, getLayer, getAllLayers, clearLayer, serialize
- [ ] 2.3 Créer __tests__/context.test.js avec tests complets
- [ ] 2.4 Exécuter tests et atteindre 100% de passage

### Task 3: Implémenter Cache System
- [ ] 3.1 Créer src/core/cache/cache.js avec classe SimpleCache
- [ ] 3.2 Implémenter méthodes: set, get, has, delete, clear, size
- [ ] 3.3 Implémenter logique TTL avec expiration automatique
- [ ] 3.4 Créer __tests__/cache.test.js avec tests incluant TTL
- [ ] 3.5 Exécuter tests et atteindre 100% de passage

### Task 4: Implémenter Economic Dispatcher
- [ ] 4.1 Créer src/core/dispatcher/dispatcher.js avec classe EconomicDispatcher
- [ ] 4.2 Implémenter logique de dispatch basée sur keywords
- [ ] 4.3 Implémenter getModelCost avec coûts relatifs
- [ ] 4.4 Créer __tests__/dispatcher.test.js avec tests pour chaque catégorie
- [ ] 4.5 Exécuter tests et atteindre 100% de passage

### Task 5: Implémenter Worker Pool
- [ ] 5.1 Créer src/core/worker-pool/worker-pool.js avec classes WorkerPool et Worker
- [ ] 5.2 Implémenter Worker avec id, status, execute
- [ ] 5.3 Implémenter WorkerPool avec submitTask, gestion de la queue
- [ ] 5.4 Implémenter limitation du pool et gestion des erreurs
- [ ] 5.5 Créer __tests__/worker-pool.test.js avec tests de concurrence
- [ ] 5.6 Exécuter tests et atteindre 100% de passage

### Task 6: Implémenter Workflow Executor
- [ ] 6.1 Créer src/core/workflow/workflow-executor.js avec classe WorkflowExecutor
- [ ] 6.2 Implémenter executeWorkflow pour workflows séquentiels
- [ ] 6.3 Implémenter getExecutionStatus, pause, resume
- [ ] 6.4 Créer __tests__/workflow-executor.test.js avec tests de workflows
- [ ] 6.5 Exécuter tests et atteindre 100% de passage

### Task 7: Implémenter Structured Logger
- [ ] 7.1 Créer src/observability/logger/structured-logger.js avec classe StructuredLogger
- [ ] 7.2 Implémenter méthodes info, warn, error, debug
- [ ] 7.3 Implémenter format JSON avec timestamp et metadata
- [ ] 7.4 Implémenter setLevel et getLogs pour tests
- [ ] 7.5 Créer __tests__/structured-logger.test.js avec tests de niveaux
- [ ] 7.6 Exécuter tests et atteindre 100% de passage

### Task 8: Implémenter Metrics Collector
- [ ] 8.1 Créer src/observability/metrics/metrics-collector.js avec classe MetricsCollector
- [ ] 8.2 Implémenter recordMetric, increment, recordDuration
- [ ] 8.3 Implémenter getMetrics et getMetric
- [ ] 8.4 Créer __tests__/metrics-collector.test.js avec tests de métriques
- [ ] 8.5 Exécuter tests et atteindre 100% de passage

### Task 9: Implémenter Dashboard
- [ ] 9.1 Créer src/observability/dashboard/dashboard.js avec fonction printDashboard
- [ ] 9.2 Implémenter formatage avec box-drawing characters
- [ ] 9.3 Implémenter sections Status, Metrics, Logs, Workers
- [ ] 9.4 Créer __tests__/dashboard.test.js avec tests de structure
- [ ] 9.5 Exécuter tests et atteindre 100% de passage

### Task 10: Vérification finale et documentation
- [ ] 10.1 Exécuter suite complète de tests (npm test)
- [ ] 10.2 Vérifier couverture de tests >= 80%
- [ ] 10.3 Vérifier JSDoc complet pour toutes les classes/méthodes
- [ ] 10.4 Créer README.md dans src/ avec documentation d'usage
- [ ] 10.5 Valider tous les AC (AC-1 à AC-10)

---

## ✓ Definition of Done

- [ ] Tous les AC (AC-1 à AC-10) sont satisfaits et validés
- [ ] Tous les tests passent à 100% (npm test)
- [ ] Couverture de tests >= 80% pour chaque composant
- [ ] JSDoc complet et cohérent
- [ ] Code sans emojis (sauf logs/docs)
- [ ] Structure de fichiers conforme au plan
- [ ] README.md avec exemples d'usage créé
- [ ] Aucun warning ESLint
- [ ] Code review effectué (auto-review dans ce cas)
- [ ] Story marquée comme "Done" dans le système

---

## 📚 Références

### Spécifications Techniques
- **BYAN v2.0 Architecture Spec**: `docs/architecture/byan-v2-architecture.md` (à créer si nécessaire)
- **Component Design Doc**: Détails dans les AC ci-dessus

### Standards de Code
- **JavaScript Style Guide**: ESLint avec config standard
- **Testing Standards**: Jest best practices
- **Documentation Standards**: JSDoc complète

### Epic/Parent Story
- **Epic**: BYAN v2.0 HYPER-MVP - Phase Implémentation
- **Plan 7 jours**: Cette story = Jour 1-2

---

## 📊 Métriques de Succès

| Métrique | Cible | Validation |
|----------|-------|------------|
| Tests passés | 100% | npm test |
| Couverture de code | >= 80% | npm test -- --coverage |
| JSDoc complète | 100% classes/méthodes publiques | Review manuelle |
| Temps d'implémentation | <= 2 jours | Suivi sprint |
| AC validés | 10/10 | Validation manuelle |

---

## 🔍 Risques & Mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Tests incomplets | High | Medium | Review stricte de la couverture avant DoD |
| Complexité sous-estimée du Worker Pool | Medium | Medium | Implémenter version simple d'abord, itérer |
| Incompatibilité Jest/Node version | Low | Low | Vérifier versions au setup |

---

## 📝 Dev Agent Record

### Session 2025-01-25
**Developer**: Amelia (Dev Agent)
**Duration**: [En cours]

#### Implémentation:
- Story file créé: STORY-BYAN-001-stubs-composants-v2.md
- En attente: Début de l'implémentation des stubs

#### Tests:
- En attente

#### Décisions:
- Utilisation de Jest comme framework de test (standard JavaScript)
- Structure modulaire avec séparation core/observability
- Approche TDD: Tests créés en parallèle avec chaque composant

#### Blockers:
- Aucun pour le moment

#### Notes:
- Story prête pour implémentation
- Tous les AC détaillés et testables
- Structure de fichiers validée

---

## 📁 File List

### Story File
- `_byan-output/implementation-artifacts/stories/STORY-BYAN-001-stubs-composants-v2.md`

### Implementation Files (à créer)
- `package.json`
- `src/core/context/context.js`
- `src/core/cache/cache.js`
- `src/core/dispatcher/dispatcher.js`
- `src/core/worker-pool/worker-pool.js`
- `src/core/workflow/workflow-executor.js`
- `src/observability/logger/structured-logger.js`
- `src/observability/metrics/metrics-collector.js`
- `src/observability/dashboard/dashboard.js`

### Test Files (à créer)
- `__tests__/context.test.js`
- `__tests__/cache.test.js`
- `__tests__/dispatcher.test.js`
- `__tests__/worker-pool.test.js`
- `__tests__/workflow-executor.test.js`
- `__tests__/structured-logger.test.js`
- `__tests__/metrics-collector.test.js`
- `__tests__/dashboard.test.js`

### Documentation (à créer)
- `src/README.md`

---

## 🏁 Story Status

**Current Status**: In Progress  
**Last Updated**: 2025-01-25  
**Next Steps**: Commencer Task 1 - Setup projet
