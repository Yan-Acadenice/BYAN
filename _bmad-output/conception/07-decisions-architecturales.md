# Architecture Decision Records (ADR) - BYAN v2.0

**Projet:** BYAN v2.0 - Plateforme d'Orchestration d'Agents IA  
**Auteur:** Yan (avec Winston - Architecte)  
**Date de création:** 2026-02-04  
**Version:** 1.0.0  
**Status du document:** Actif  

---

## 🎯 Introduction

Ce document regroupe les **Architecture Decision Records (ADR)** pour BYAN v2.0. Chaque ADR documente une décision architecturale critique prise lors de la phase de conception, avec son contexte, sa justification, ses conséquences et les alternatives évaluées.

### Pourquoi les ADR ?

Les ADR permettent de:
- **Tracer** l'historique des décisions techniques
- **Justifier** les choix architecturaux auprès des contributeurs
- **Éviter** de remettre en question des décisions déjà prises
- **Faciliter** l'onboarding de nouveaux développeurs
- **Documenter** les compromis (trade-offs) acceptés

### Format des ADR

Chaque ADR suit le format standard:
- **Date:** Date de la décision
- **Status:** Accepted | Proposed | Deprecated | Superseded
- **Context:** Contexte et problème à résoudre
- **Decision:** Décision prise
- **Rationale:** Arguments et justifications détaillés
- **Consequences:** Impacts positifs et négatifs
- **Alternatives Considered:** Autres options évaluées

---

## ADR-001: Node.js au lieu de Python

**Date:** 2026-02-04  
**Status:** Accepted  

### Context

BYAN v1.x existant est développé en Node.js et distribué via NPX (`npx create-byan-agent`). La plateforme v2.0 nécessite de gérer:
- Orchestration asynchrone complexe (agents, workers, workflows)
- Distribution via NPM/NPX pour simplicité d'installation
- Compatibilité avec la base de code existante
- Performance sur des opérations I/O intensives

Python est souvent considéré comme le langage de prédilection pour l'IA/ML, mais cela introduirait une rupture technologique.

### Decision

**Conserver Node.js (>= 18.0.0) avec JavaScript pur comme stack technique principal.**

### Rationale

**Arguments en faveur de Node.js:**

1. **Cohérence avec l'existant:**
   - BYAN v1.x est en Node.js
   - Pas de réécriture complète nécessaire
   - Réutilisation de modules existants (_bmad/core/, _bmad/bmm/)
   - Expérience utilisateur préservée (NPX)

2. **Async/Await natif:**
   - Event loop Node.js parfait pour orchestration
   - Gestion native des promesses et opérations concurrentes
   - Worker pool et dispatcher = use-case idéal pour event-driven

3. **Écosystème NPM:**
   - Packages matures: `js-yaml`, `winston`, `node-cache`, `commander`
   - Distribution triviale: `npm install -g` ou `npx`
   - 0 friction d'installation pour utilisateurs

4. **Performance I/O:**
   - Lecture/écriture YAML workflows: non-blocking I/O
   - Appels API LLM parallèles: optimisé pour latence réseau

5. **Developer Experience:**
   - JavaScript = barrière entrée basse
   - Pas de setup Python virtual env
   - Single runtime (Node.js)

**Compromis acceptés:**

- Pas de bibliothèques ML natives (scikit-learn, pandas)
- Moins d'outils de data science mature
- Typage optionnel (pas de TypeScript pour MVP)

### Consequences

**Positives:**
- ✅ Continuité technologique (pas de Big Bang rewrite)
- ✅ Time-to-market réduit (7 jours au lieu de 3-4 semaines)
- ✅ Réutilisation code existant (~60% de _bmad/core/)
- ✅ Distribution NPM/NPX simple
- ✅ Event loop optimal pour orchestration asynchrone

**Négatives:**
- ❌ Pas de ML natif (Phase 2: appel API Python ou TensorFlow.js)
- ❌ Pas de typage strict (acceptable pour MVP)

**Impact sur la roadmap:**
- Phase 2 (ML-based dispatcher): Utilisation de TensorFlow.js ou micro-service Python
- Phase 3 (Agent adaptatif): Idem, API Python via child process

### Alternatives Considered

**Option A: Python**
- **Avantages:** Écosystème ML/IA (scikit-learn, transformers), typage (mypy), data science
- **Inconvénients:** Rupture tech stack, réécriture complète, setup virtual env complexe, distribution PyPI moins fluide que NPX
- **Verdict:** ❌ Rejeté - coût de migration trop élevé pour MVP

**Option B: Architecture Hybride (Node.js + Python)**
- **Avantages:** Best of both worlds, Node pour orchestration, Python pour ML
- **Inconvénients:** Complexité opérationnelle, 2 runtimes à installer, communication inter-process overhead
- **Verdict:** ❌ Rejeté pour MVP - acceptable Phase 2+ si ML nécessaire

**Option C: TypeScript**
- **Avantages:** Typage strict, meilleure maintenabilité
- **Inconvénients:** Compilation transpilation step, complexité setup, overhead mental pour MVP
- **Verdict:** 🟡 Envisagé Phase 2 - JavaScript pur suffisant pour MVP

---

## ADR-002: In-Memory Cache au lieu de Redis

**Date:** 2026-02-04  
**Status:** Accepted  

### Context

Le Context Layer doit gérer:
- Chargement fréquent des fichiers YAML de contexte (platform.yaml, project.yaml, story.yaml)
- Résolution de placeholders répétitive ({user_name}, {output_folder})
- Opérations de lecture I/O coûteuses (disk access)

Objectif: **Réduire latence de chargement de context < 50ms** (critère success HYPER-MVP).

Options de cache:
- **In-memory** (node-cache, lru-cache)
- **Redis** (cache distribué persistant)
- **Aucun cache** (lecture fichier à chaque fois)

### Decision

**Utiliser `node-cache` (in-memory cache) comme solution de cache L1.**

### Rationale

**Arguments en faveur de node-cache:**

1. **0 dépendance externe:**
   - Pas de Redis server à installer/configurer
   - Pas de docker-compose pour développeurs
   - Installation: `npm install node-cache` → 1 commande

2. **Performance:**
   - Access time: **< 1ms** (RAM locale)
   - vs Redis: 1-5ms (network roundtrip localhost)
   - Context loading: 50ms → 10ms avec cache (80% amélioration)

3. **Simplicité d'implémentation:**
   ```javascript
   const NodeCache = require('node-cache');
   const cache = new NodeCache({ stdTTL: 600 }); // 10min TTL
   
   async loadContext(level, id) {
     const cacheKey = `context:${level}:${id}`;
     let context = cache.get(cacheKey);
     if (!context) {
       context = await this._loadFromDisk(level, id);
       cache.set(cacheKey, context);
     }
     return context;
   }
   ```

4. **Resource efficiency:**
   - Memory footprint: **< 50MB** pour cache complet
   - vs Redis: 100MB+ (serveur standalone)
   - CPU: 0% idle (cache RAM = simple object lookup)

5. **MVP approprié:**
   - Single process Node.js
   - Pas de scaling horizontal pour MVP
   - Cache hit rate 60%+ suffisant

**Compromis acceptés:**

- **Perte de données au restart** (cache volatile)
  - Acceptable: context YAML = source of truth sur disque
  - Warm-up au démarrage: < 2s pour charger tous les contextes
  
- **Pas de partage multi-process**
  - Acceptable pour MVP (single CLI process)
  - Phase 2: Redis si mode server HTTP déployé

### Consequences

**Positives:**
- ✅ Setup instantané (0 config externe)
- ✅ Latence cache < 1ms (vs 1-5ms Redis)
- ✅ Memory usage: < 50MB
- ✅ Simplicité code (10 lignes implémentation)
- ✅ 0 point de défaillance externe

**Négatives:**
- ❌ Cache perdu au restart (non-problématique car source = disk)
- ❌ Pas de persistance (acceptable car contexte = fichiers YAML)
- ❌ Single-process only (Phase 2: multi-process = Redis)

**Impact sur architecture:**
- Context Layer reste léger et autonome
- Pas de dépendance infrastructure pour développeurs
- Évolution naturelle vers Redis Layer 2 en Phase 2 si scaling nécessaire

### Alternatives Considered

**Option A: Redis**
- **Avantages:** Persistance, partage multi-process, distribution, TTL avancé
- **Inconvénients:** Setup complexe (docker/install), overhead network, 100MB+ RAM, overkill pour MVP
- **Verdict:** ❌ Rejeté pour MVP - envisagé Phase 2 si mode server HTTP

**Option B: Aucun cache**
- **Avantages:** Code simple, 0 dépendance, toujours à jour
- **Inconvénients:** Latence inacceptable (50ms+ par load), I/O disque répété, CPU overhead YAML parsing
- **Verdict:** ❌ Rejeté - performance insuffisante (critère < 50ms non respecté)

**Option C: LRU-Cache**
- **Avantages:** Algorithme éviction Least Recently Used, lightweight
- **Inconvénients:** Pas de TTL automatique, gestion manuelle taille
- **Verdict:** 🟡 Équivalent node-cache - node-cache choisi pour API plus riche (TTL, stats)

---

## ADR-003: Rule-Based Dispatcher au lieu de ML

**Date:** 2026-02-04  
**Status:** Accepted  

### Context

Le **Economic Dispatcher** doit router les tâches entre:
- **Workers** (Haiku-like, rapides, économiques) pour tâches simples
- **Agent** (Sonnet-like, puissants, coûteux) pour tâches complexes

Objectif: **40-50% réduction des requêtes coûteuses** vers l'agent.

Critères de complexité à évaluer:
- Longueur du prompt (tokens)
- Type de tâche (validation vs architecture)
- Taille du contexte
- Keywords de complexité (analyze, design, optimize)

Options:
- **ML-based routing** (modèle entraîné)
- **Rule-based scoring** (algorithme déterministe)
- **Random routing** (baseline)

### Decision

**Implémenter un algorithme rule-based avec scoring déterministe pour le dispatcher MVP.**

### Rationale

**Arguments en faveur du rule-based:**

1. **Pas de dataset d'entraînement:**
   - BYAN v1 n'a pas collecté de données de routing
   - Créer un dataset = 2-3 semaines de data labeling
   - Pas de ground truth (quelle tâche = worker vs agent)

2. **Simplicité et prédictibilité:**
   ```javascript
   calculateComplexity(task) {
     let score = 0;
     // Facteur 1: Tokens (max 30 points)
     score += Math.min(tokenCount / 100, 30);
     // Facteur 2: Type tâche (0-80 points)
     score += TASK_COMPLEXITY[task.type];
     // Facteur 3: Context size (max 20 points)
     score += Math.min(contextSize / 5000, 20);
     // Facteur 4: Keywords (5 points each)
     score += complexKeywords.length * 5;
     return Math.min(score, 100);
   }
   ```

3. **Debuggable et explicable:**
   - Score visible dans logs: `complexity_score: 45`
   - Facile à ajuster (tuning des poids)
   - Pas de "black box" ML

4. **Performance acceptable:**
   - **Baseline estimée: 70% accuracy** sur tâches simples vs complexes
   - Amélioration itérative facile (ajout de règles)
   - Worker fallback si échec

5. **Foundation pour ML Phase 2:**
   - Logging de tous les routings (task → executor → success)
   - Collecte de dataset automatique (6-12 mois)
   - Entraînement modèle supervisé avec labels réels

**Compromis acceptés:**

- **Accuracy < 100%** (70% attendu, vs 90%+ avec ML)
  - Mitigation: Worker fallback vers Agent si échec
  - Acceptable pour MVP: économie 40-50% déjà atteinte

- **Pas d'adaptation automatique**
  - Règles = statiques (pas de self-learning)
  - Phase 2: ML remplacera rule-based

### Consequences

**Positives:**
- ✅ Implémentation rapide (1 jour au lieu de 2-3 semaines ML)
- ✅ 0 dépendance ML framework (TensorFlow, scikit-learn)
- ✅ Debuggable et explicable (logs transparents)
- ✅ Accuracy 70%+ suffisante pour MVP
- ✅ Collecte données pour ML Phase 2

**Négatives:**
- ❌ Accuracy limitée à 70-80% (vs 90%+ ML potentiel)
- ❌ Pas d'auto-amélioration (tuning manuel)
- ❌ Règles statiques (pas d'adaptation usage patterns)

**Impact sur roadmap:**
- Phase 1 (MVP): Rule-based dispatcher opérationnel J3-4
- Phase 2 (Mois 2-3): ML model entraîné sur données collectées
- Phase 3 (Mois 4-6): Dispatcher adaptatif (self-optimizing)

### Alternatives Considered

**Option A: ML-based routing (modèle supervisé)**
- **Avantages:** Accuracy 90%+, adaptation automatique, patterns complexes
- **Inconvénients:** Pas de dataset (3 semaines de prep), overhead runtime (TensorFlow.js 50MB), black box debugging
- **Verdict:** ❌ Rejeté pour MVP - envisagé Phase 2 avec données réelles

**Option B: Random routing (baseline)**
- **Avantages:** Ultra simple, 0 logique
- **Inconvénients:** 50% accuracy random (inacceptable), pas d'économie
- **Verdict:** ❌ Rejeté - baseline utile uniquement pour benchmark

**Option C: Heuristique simple (if tokens > 500 → agent)**
- **Avantages:** Encore plus simple que scoring
- **Inconvénients:** Trop simpliste (type de tâche ignoré), accuracy 60% estimée
- **Verdict:** 🟡 Insuffisant - scoring multi-facteurs nécessaire

---

## ADR-004: Worker Pool Statique au lieu de Dynamique

**Date:** 2026-02-04  
**Status:** Accepted  

### Context

Le **Worker Pool** gère l'exécution de tâches simples via workers (modèles légers type Haiku).

Questions:
- **Combien de workers instancier ?** (1, 2, N dynamique)
- **Auto-scaling ?** (créer/détruire workers selon charge)
- **Stratégie d'allocation ?** (round-robin, least-busy, queue)

Contraintes MVP:
- CLI single-user (1 utilisateur à la fois)
- Workflows séquentiels (rarement > 2 tâches parallèles)
- Resource-constrained (laptop developer)

### Decision

**Implémenter un Worker Pool statique de 2 workers fixes, sans auto-scaling.**

### Rationale

**Arguments en faveur du pool statique:**

1. **Simplicité d'implémentation:**
   ```javascript
   class WorkerPool {
     constructor(size = 2) {
       this.workers = Array.from({ length: size }, (_, i) => 
         new Worker(i)
       );
     }
     
     async getAvailableWorker() {
       let worker = this.workers.find(w => w.isAvailable());
       if (!worker) {
         await this.waitForWorker(); // simple polling
         worker = this.workers.find(w => w.isAvailable());
       }
       return worker;
     }
   }
   ```

2. **Ressources prévisibles:**
   - 2 workers = **~100MB RAM** (vs N workers = imprévisible)
   - CPU: 2 threads max concurrents
   - Pas de spike de création/destruction

3. **Adapté au use-case MVP:**
   - CLI = 1 workflow à la fois
   - Workflows BYAN = rarement > 2 steps parallèles
   - Exemple workflow "Create PRD":
     ```yaml
     steps:
       - id: extract_info (worker 1)
       - id: format_template (worker 2) # parallèle possible
       - id: final_review (agent) # séquentiel
     ```

4. **Performance suffisante:**
   - Queue wait time: < 2s (critère success)
   - Throughput: 2 tasks/s (largement suffisant CLI)
   - 0 overhead de scheduling complexe

5. **Économie de complexité:**
   - Pas de logique auto-scaling (health checks, thresholds, cooldown)
   - Pas de worker lifecycle management
   - Code: 50 lignes au lieu de 300+

**Compromis acceptés:**

- **Pas de scaling automatique**
  - Si 3+ tâches parallèles → queue (wait < 2s acceptable)
  - Mitigation: Workflows bien conçus = max 2 steps parallèles
  
- **Ressources "gaspillées" si idle**
  - 2 workers = 100MB même si inactifs
  - Acceptable: worker = lightweight (pas de modèle chargé en mémoire)

### Consequences

**Positives:**
- ✅ Implémentation simple (50 lignes de code)
- ✅ RAM prévisible: 100MB pour pool
- ✅ Performance suffisante: < 2s wait time
- ✅ 0 overhead de scaling logic
- ✅ Debugging trivial (2 workers = 2 états à tracker)

**Négatives:**
- ❌ Pas de scaling si charge élevée (acceptable CLI single-user)
- ❌ 100MB RAM "gaspillée" si idle (compromis acceptable)
- ❌ Hard-coded 2 workers (configurable via ENV Phase 2)

**Impact sur architecture:**
- Worker Pool reste simple et robuste
- Phase 2: Config ENV `BYAN_WORKER_POOL_SIZE=4` si besoin
- Phase 3: Auto-scaling si mode server HTTP déployé

### Alternatives Considered

**Option A: Auto-scaling dynamique**
- **Avantages:** Resource efficiency, handle spikes, optimal utilisation
- **Inconvénients:** Complexité 10x (health checks, thresholds, cooldown), overhead création/destruction, debugging difficile
- **Verdict:** ❌ Rejeté pour MVP - overkill pour CLI single-user

**Option B: Single worker (N=1)**
- **Avantages:** Ultra simple, 50MB RAM
- **Inconvénients:** 0 parallélisme (workflows 2x plus lents), queue wait > 5s inacceptable
- **Verdict:** ❌ Rejeté - performance insuffisante

**Option C: N=4 workers**
- **Avantages:** Plus de parallélisme
- **Inconvénients:** 200MB RAM (overhead), rarement utilisés à pleine capacité, diminishing returns
- **Verdict:** 🟡 Over-provisioning - N=2 optimal pour CLI use-case

**Option D: Worker pool configurable (ENV variable)**
- **Avantages:** Flexibilité utilisateur
- **Inconvénients:** Complexité config, users = mauvais tuning
- **Verdict:** 🟡 Envisagé Phase 2 - N=2 hardcoded suffisant MVP

---

## ADR-005: Workflow YAML au lieu de Code

**Date:** 2026-02-04  
**Status:** Accepted  

### Context

Les **Workflows** orchestrent des séquences multi-étapes pour accomplir des tâches métier (ex: "Create PRD", "Generate Architecture").

Questions:
- **Format de définition ?** (YAML, JSON, JavaScript code)
- **Déclaratif vs impératif ?**
- **Flexibilité vs simplicité ?**

Exigences:
- Developer Experience: non-codeurs doivent pouvoir créer workflows
- Évolutivité: ajout de steps sans redéployer
- Lisibilité: claire pour humains et outils
- Expressivité: conditions, retry, fallback

### Decision

**Adopter un DSL (Domain-Specific Language) déclaratif au format YAML pour définir les workflows.**

### Rationale

**Arguments en faveur de YAML DSL:**

1. **Developer Experience supérieure:**
   ```yaml
   # Workflow lisible par humains
   name: create-simple-prd
   version: 1.0.0
   
   steps:
     - id: extract_requirements
       type: worker
       input: "Extract key requirements from: {user_input}"
       output_file: "{output_folder}/requirements.md"
       retry:
         max_attempts: 2
         
     - id: generate_prd
       type: agent
       agent: architect
       input: "Create PRD based on: {step.extract_requirements.output}"
       output_file: "{output_folder}/PRD.md"
   ```

2. **Pas de redéploiement:**
   - Workflows = fichiers séparés dans `_bmad/workflows/`
   - Modification workflow → pas de `npm install` ou rebuild
   - Hot-reload possible (Phase 2)

3. **Validation et tooling:**
   - Schema YAML validable (JSON Schema)
   - IDE support (YAML IntelliSense)
   - Diff/merge workflows (Git friendly)

4. **Expressivité suffisante:**
   - Variables: `{user_input}`, `{step.previous.output}`
   - Conditions: Phase 2 (if/else YAML)
   - Retry policy: `max_attempts`, `backoff`
   - Parallel steps: `depends_on: []`

5. **Séparation concerns:**
   - Logique métier (workflow YAML) ≠ Exécution (WorkflowExecutor.js)
   - Business users = edit YAML
   - Developers = code executor engine

**Compromis acceptés:**

- **Parser YAML nécessaire** (dependency: `js-yaml`)
  - Overhead: < 10ms parsing
  - Acceptable: 1 parsing au début du workflow

- **Validation runtime** (pas compile-time)
  - Erreurs détectées à l'exécution
  - Mitigation: Schema validator pre-run (Phase 2)

### Consequences

**Positives:**
- ✅ DX excellente (lisibilité, édition facile)
- ✅ Pas de redéploiement pour nouveaux workflows
- ✅ Git-friendly (diff/merge YAML)
- ✅ Séparation logique métier / code
- ✅ Extensible (ajout keywords: conditions, loops Phase 2)

**Négatives:**
- ❌ Parser YAML nécessaire (dependency js-yaml ~50KB)
- ❌ Validation runtime (erreurs à l'exécution)
- ❌ Moins expressif que code JavaScript (acceptable trade-off)

**Impact sur architecture:**
- WorkflowExecutor = core engine (réutilisable)
- Workflows = assets découplés (facile à versionner)
- Contributeurs non-dev peuvent créer workflows

### Alternatives Considered

**Option A: Code JavaScript (impératif)**
```javascript
// workflow-create-prd.js
module.exports = async (context) => {
  const requirements = await worker.execute({
    input: `Extract from: ${context.user_input}`
  });
  const prd = await agent.execute({
    input: `Create PRD: ${requirements}`
  });
  return prd;
};
```
- **Avantages:** Full expressivité JavaScript, typage possible, debugger natif
- **Inconvénients:** Redéploiement nécessaire, barrière entrée codeurs only, moins lisible
- **Verdict:** ❌ Rejeté - DX inférieure, rigidité

**Option B: JSON déclaratif**
```json
{
  "name": "create-simple-prd",
  "steps": [
    {"id": "extract", "type": "worker", "input": "..."}
  ]
}
```
- **Avantages:** Parsing natif (`JSON.parse`), validation stricte
- **Inconvénients:** Verbeux (quotes partout), pas de commentaires, moins lisible
- **Verdict:** 🟡 Acceptable mais YAML > JSON pour DX

**Option C: DSL custom (syntaxe propriétaire)**
```
WORKFLOW create-prd
  STEP extract USING worker
    INPUT "Extract from {user_input}"
  END
END
```
- **Avantages:** Syntaxe ultra concise
- **Inconvénients:** Parser custom complexe, 0 IDE support, pas standard
- **Verdict:** ❌ Rejeté - over-engineering, YAML = standard industrie

**Option D: Hybrid (YAML config + JavaScript callbacks)**
- **Avantages:** YAML pour structure, JS pour logique complexe
- **Inconvénients:** Complexité mentale (2 langages), moins déclaratif
- **Verdict:** 🟡 Envisagé Phase 3 si besoins logique complexe

---

## 📊 Synthèse des Décisions

| ADR | Décision | Impact Principal | Phase |
|-----|----------|------------------|-------|
| **001** | Node.js vs Python | Continuité tech stack, 60% code réutilisé | MVP ✅ |
| **002** | In-Memory vs Redis | Setup 0 config, latence < 1ms | MVP ✅ |
| **003** | Rule-Based vs ML | Implémentation 1 jour, accuracy 70%+ | MVP ✅ |
| **004** | Static vs Dynamic Pool | 100MB RAM, simplicité 50 lignes | MVP ✅ |
| **005** | YAML vs Code | DX supérieure, pas de redéploiement | MVP ✅ |

### Trade-offs Globaux Acceptés

**Simplicité > Sophistication** (pour MVP):
- In-memory cache au lieu de Redis
- Rule-based au lieu de ML
- Static pool au lieu de auto-scaling

**Developer Experience > Performance théorique**:
- YAML (lisible) au lieu de JSON (parsable)
- Node.js (familier) au lieu de Python (ML natif)

**Time-to-Market > Perfection**:
- 7 jours MVP au lieu de 3-4 semaines "optimal"
- 70% accuracy dispatcher acceptable (vs 90% ML)

---

## 🚀 Évolution Future des ADR

### Phase 2 (Semaines 2-4)
- **ADR-006:** Redis Layer 2 Cache (multi-process)
- **ADR-007:** ML Dispatcher avec dataset collecté
- **ADR-008:** Worker Auto-Scaling (server mode)

### Phase 3 (Mois 2-3)
- **ADR-009:** TypeScript Migration
- **ADR-010:** Workflow Conditions & Loops
- **ADR-011:** Agent Plugins Architecture

### Phase 4 (Mois 4-6)
- **ADR-012:** Self-Optimizing Routing
- **ADR-013:** Distributed Tracing (OpenTelemetry)
- **ADR-014:** Agent Adaptive Learning

---

## 📚 Références

**Documents liés:**
- `byan-v2-0-architecture-node.md` - Architecture technique détaillée
- `byan-v2-requirements.md` - Requirements fonctionnels
- `05-analyse-impacts.md` - Analyse d'impacts métier

**Standards ADR:**
- [ADR GitHub Template](https://adr.github.io/)
- [Documenting Architecture Decisions (Michael Nygard)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

---

**Document créé le:** 2026-02-04  
**Dernière mise à jour:** 2026-02-04  
**Auteur:** Yan (avec Winston - Architecte)  
**Status:** Actif  
**Version:** 1.0.0
