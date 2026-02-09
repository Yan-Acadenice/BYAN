---
project_name: BYAN v2.0 - GitHub Copilot CLI Integration (REVISED)
version: 2.0.0-COPILOT-INTEGRATION-REVISED
created_date: 2025-02-04
revised_date: 2025-02-04
author: John (Product Manager)
architect: Winston
user: Yan
status: REVISED - Ready for Implementation
paradigm_shift: Standalone Platform → GitHub Copilot CLI Agent (Option B)
timeline: 5 jours MVP (77 SP @ ~15 SP/day)
inputDocuments:
  - /home/yan/conception/_byan-output/architecture/byan-v2-copilot-integration-architecture.md
  - /home/yan/conception/_byan-output/architecture/BYAN-V2-COPILOT-INTEGRATION-SUMMARY.md
  - /home/yan/conception/_byan-output/planning-artifacts/byan-v2-epics-stories.md (ORIGINAL)
---

# BYAN v2.0 - Épics & Stories RÉVISÉS (Option B - Hybrid Integration)

## 🎯 RÉSUMÉ EXÉCUTIF

**DÉCISION ARCHITECTURALE:** ✅ **Option B (Hybrid Integration)** approuvée par Yan  
**DATE VALIDATION:** 2025-02-04  
**ARCHITECTE:** Winston

### 🔄 CHANGEMENT DE PARADIGME

**AVANT (Standalone Platform):**
- BYAN orchestrait des appels LLM directs (Haiku/Sonnet)
- Worker pool gérait concurrence + retry + LLM calls
- Context YAML multi-niveaux (platform/project/story)
- Workflows YAML déclaratifs exécutés localement
- Observability custom (Winston + Metrics Dashboard)
- **Total:** 145 SP sur 7 jours

**APRÈS (GitHub Copilot CLI Agent - Option B):**
- BYAN est un **agent Copilot CLI spécialisé** en création d'agents
- Workers remplacés par **Task Tool** → délégation agents
- Context fourni par **Copilot CLI** + SessionState léger
- Workflows via **State Machine** (INTERVIEW → ANALYSIS → GENERATION)
- Observability intégrée (console.log capturé par Copilot)
- **Total:** 77 SP sur 5 jours

---

## 📊 IMPACT SUR ÉPICS EXISTANTS

| Epic | Original SP | Révisé SP | Réduction | Impact | Raison |
|------|-------------|-----------|-----------|---------|---------|
| **EPIC 1** (Context) | 22 | 6 | **-73%** | 🔄 SIMPLIFIÉ | Copilot CLI fournit context |
| **EPIC 2** (Dispatcher) | 22 | 12 | -45% | 🔄 ADAPTÉ | Routing → Task Tool |
| **EPIC 3** (Worker Pool) | 23 | 4 | **-83%** | ⚠️ OBSOLÈTE | Task Tool remplace LLM calls |
| **EPIC 4** (Workflow) | 33 | 18 | -45% | 🔄 ADAPTÉ | State Machine vs YAML |
| **EPIC 5** (Observability) | 17 | 8 | **-53%** | 🔄 SIMPLIFIÉ | Copilot logs built-in |
| **EPIC 6** (Integration) | 28 | 29 | +4% | ✨ NOUVEAU FOCUS | Agent profile Copilot |
| **TOTAL** | **145 SP** | **77 SP** | **-47%** | - | **Architecture pivot** |

### 🎯 Insight Clef

L'intégration Copilot CLI réduit l'effort de **47%** tout en **maintenant** les objectifs de qualité et de performance grâce à la réutilisation de l'infrastructure Copilot existante.

---

## 📅 ROADMAP RÉVISÉ (5 JOURS)

### Jour 1: Foundation & Core Refactoring (16 SP)
**Focus:** Adapter les fondations pour Copilot CLI
- ✅ TaskToolInterface class (remplace Worker Pool)
- ✅ Dispatcher refactored (routing vers Task Tool)
- ✅ SessionState (remplace Context multi-layer)
- ✅ Tests unitaires critiques

**Livrables:** Code foundational + tests

---

### Jour 2: Dispatcher & Context Integration (13 SP)
**Focus:** Intégration context Copilot + routing intelligent
- ✅ Copilot context variables integration
- ✅ Dispatcher complexity algorithm (réutilisé)
- ✅ Task routing logic (Task Tool delegation)
- ✅ Tests integration dispatcher

**Livrables:** Dispatcher fonctionnel + context intégré

---

### Jour 3: Interview Orchestrator & Business Logic (18 SP)
**Focus:** State machine + logique métier BYAN
- ✅ State Machine (INTERVIEW → ANALYSIS → GENERATION)
- ✅ Question flow management
- ✅ Response analysis engine (Merise Agile logic)
- ✅ Agent profile generation basics
- ✅ Tests E2E orchestrator

**Livrables:** Orchestrator complet + business logic

---

### Jour 4: Agent Profile & Integration (16 SP)
**Focus:** Génération profils + intégration complète
- ✅ `.github/copilot/agents/byan.md` (agent profile)
- ✅ Placeholder resolution (custom instructions)
- ✅ E2E integration tests
- ✅ Error handling + retry mechanisms

**Livrables:** Agent profile + tests E2E

---

### Jour 5: Polish, Docs & Validation (14 SP)
**Focus:** Documentation + validation finale
- ✅ README + QUICKSTART
- ✅ API documentation
- ✅ Demo scenario (create agent via BYAN)
- ✅ Performance testing
- ✅ Bug fixes + polish
- ✅ Success criteria validation

**Livrables:** Documentation complète + MVP prêt

---

## 🎯 EPIC 1: Context Layer (SIMPLIFIÉ)

**Objectif Révisé:** Intégrer le context Copilot CLI et ajouter SessionState léger pour données runtime.

**Value Statement:** Réutilise le context fourni par Copilot CLI ({project-root}, {user_name}) + stockage state léger pour interview flow.

**Size:** S (Small) - **Réduction de 73%**  
**Priority:** P0 (Critique)  
**Timeline:** Jour 2 (4-6h)  
**SP Révisé:** 6 SP (vs 22 SP original)

---

### ✅ STORIES CONSERVÉES

**Aucune** - Toutes les stories Context YAML sont obsolètes avec Copilot CLI.

---

### ❌ STORIES SUPPRIMÉES

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 1.1 (YAML Loading) | 5 SP | Copilot CLI fournit context via variables |
| Story 1.2 (Hierarchical Merge) | 5 SP | Pas besoin de merge multi-niveaux |
| Story 1.3 (Placeholder Resolution) | 3 SP | **DÉPLACÉE** vers Epic 6 (agent profile) |
| Story 1.4 (L1 Cache) | 4 SP | SessionState en mémoire suffit |
| Story 1.5 (Integration Tests) | 5 SP | **SIMPLIFIÉE** - réduit à tests SessionState |

**Total Supprimé:** 17 SP  
**Total Conservé (modifié):** 5 SP

---

### ✨ NOUVELLES STORIES

#### Story 1.1-NEW: Implement SessionState Manager

**As a** developer  
**I want** a lightweight session state manager  
**So that** I can store interview flow data (questions, responses, analysis)

**Acceptance Criteria:**

**AC1:** Class `SessionState` exists with properties
```javascript
class SessionState {
  sessionId: string (UUID);
  currentState: 'INTERVIEW' | 'ANALYSIS' | 'GENERATION';
  questionHistory: Array<{question, timestamp}>;
  userResponses: Array<{questionId, response, timestamp}>;
  analysisResults: Object;
  agentProfileDraft: Object;
}
```

**AC2:** Méthodes CRUD
- `addQuestion(question)`: Ajoute question à history
- `addResponse(questionId, response)`: Enregistre réponse user
- `setAnalysisResults(data)`: Stocke résultat analyse
- `getCurrentState()`: Retourne état actuel
- `transitionTo(newState)`: Change état avec validation

**AC3:** Validation transitions
- INTERVIEW → ANALYSIS: Valid si ≥ 5 réponses
- ANALYSIS → GENERATION: Valid si analysisResults non vide
- Autres transitions: Throw error

**AC4:** Serialization
- `toJSON()`: Serialize pour logging/debugging
- `fromJSON(data)`: Restore depuis JSON

**AC5:** Tests unitaires
- Test transitions valides
- Test transitions invalides (throw error)
- Test CRUD operations

**Dependencies:** None  
**Estimation:** 3 SP

**Technical Notes:**
- Pure in-memory (no persistence MVP)
- Use UUID v4 for sessionId
- Add timestamps automatically

---

#### Story 1.2-NEW: Integrate Copilot Context Variables

**As a** developer  
**I want** to access Copilot CLI context variables  
**So that** BYAN reuses project info without duplication

**Acceptance Criteria:**

**AC1:** Function `getCopilotContext()` exists
- Reads from Copilot CLI environment
- Returns object: `{projectRoot, userName, workingDir, gitBranch}`

**AC2:** Access {project-root} variable
- GIVEN Copilot CLI running in project
- WHEN calling `getCopilotContext().projectRoot`
- THEN returns absolute path to project root

**AC3:** Access {user_name} from config
- Read from `.github/copilot/config.yaml` or ENV
- Fallback to OS username if not found

**AC4:** Merge with SessionState
- SessionState has method `mergeContext(copilotContext)`
- Copilot context available as `sessionState.context`

**AC5:** Tests with mocked environment
- Mock process.env variables
- Verify correct values extracted

**Dependencies:** Story 1.1-NEW  
**Estimation:** 3 SP

**Technical Notes:**
- Copilot context passed via environment variables
- Document available variables in README
- Graceful fallback if Copilot vars missing

---

### 📝 Summary Epic 1

**Stories Totales:** 2 (vs 5 originales)  
**SP Total:** 6 SP (vs 22 SP)  
**Réduction:** 73%  
**Raison:** Copilot CLI simplifie massivement context management

---

## 🎯 EPIC 2: Dispatcher Algorithm (ADAPTÉ)

**Objectif Révisé:** Adapter Dispatcher pour router vers Task Tool au lieu de Worker Pool.

**Value Statement:** Garde l'excellent algorithme de complexité existant, change seulement la destination du routing.

**Size:** M (Medium)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 2 (6-8h)  
**SP Révisé:** 12 SP (vs 22 SP original)

---

### ✅ STORIES CONSERVÉES (MODIFIÉES)

#### Story 2.1-MODIFIED: Complexity Scoring Algorithm (CONSERVÉ)

**Status:** ✅ **100% RÉUTILISABLE**

**As a** dispatcher  
**I want** to calculate task complexity score (0-100)  
**So that** I can route tasks to appropriate executors

**CHANGEMENT:** Aucun - l'algorithme est **EXCELLENT** et reste identique.

**Acceptance Criteria:** [IDENTIQUES à version originale]
- AC1-AC7: Tous conservés

**Dependencies:** None  
**Estimation:** 5 SP (inchangé)

**Technical Notes:**
- Facteur 1: Token count (max 30 points)
- Facteur 2: Task type (max 80 points)
- Facteur 3: Context size (max 20 points)
- Facteur 4: Keywords (max 25 points)
- Score cappé à 100

---

#### Story 2.2-MODIFIED: Task Routing Logic (ADAPTÉ)

**Status:** 🔄 **MODIFIÉ - Routing vers Task Tool**

**As a** dispatcher  
**I want** to route tasks based on complexity score  
**So that** simple tasks use task agent, complex tasks execute locally

**CHANGEMENTS:**
- ❌ Route vers Worker Pool
- ✅ Route vers Task Tool API
- ✅ Garde logique complexité identique

**Acceptance Criteria:**

**AC1:** Function `routeTask(task)` returns executor decision
- GIVEN task with complexity score
- WHEN calling routeTask
- THEN returns: `{executor: 'task' | 'local', agentType: string}`

**AC2:** Route to Task Tool (task agent) for simple tasks (score < 30)
```javascript
if (complexity < 30) {
  return {
    executor: 'task',
    agentType: 'task', // Fast agent
    prompt: formatTaskForAgent(task)
  };
}
```

**AC3:** Route to Task Tool (explore agent) for medium tasks (30-60)
```javascript
if (complexity >= 30 && complexity < 60) {
  return {
    executor: 'task',
    agentType: 'explore',
    prompt: formatTaskForAgent(task)
  };
}
```

**AC4:** Execute locally for complex tasks (score > 60)
```javascript
if (complexity >= 60) {
  return {
    executor: 'local',
    reason: 'BYAN core expertise required'
  };
}
```

**AC5:** Prompt formatting for Task Tool
- Method `formatTaskForAgent(task)` exists
- Converts task object to natural language prompt
- Example: `"Analyze this response: [USER_INPUT]. Context: [CONTEXT]"`

**AC6:** Routing metrics tracking
- Track: `{taskRouted: N, localExecuted: M, taskToolDelegated: P}`
- Track: `avgComplexityPerRoute`

**Dependencies:** Story 2.1-MODIFIED  
**Estimation:** 4 SP (réduit de 5 → 4)

**Technical Notes:**
- NO Worker Pool dependency
- Task Tool called via custom instructions syntax
- Format: `{agent_type: 'task', prompt: '...'}`

---

### ❌ STORIES SUPPRIMÉES

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 2.3 (Routing Metrics) | 3 SP | **DÉPLACÉE** vers Epic 5 (Observability) |
| Story 2.4 (Dispatcher Tests) | 4 SP | **SIMPLIFIÉE** - Intégrée dans 2.2-MODIFIED |

**Total Supprimé:** 7 SP

---

### ✨ NOUVELLES STORIES

#### Story 2.3-NEW: Implement TaskToolInterface

**As a** developer  
**I want** a clean interface to call Task Tool  
**So that** dispatcher can delegate tasks to Copilot agents

**Acceptance Criteria:**

**AC1:** Class `TaskToolInterface` exists
```javascript
class TaskToolInterface {
  async delegateTask(taskPrompt, agentType) {
    // Returns: {output: string, metadata: {tokens, duration}}
  }
}
```

**AC2:** Support agent types
- 'task': Fast agent (Haiku-like)
- 'explore': Search + analysis agent
- 'general-purpose': Full-capability agent (fallback)

**AC3:** Call Task Tool via custom instructions
- Construct call syntax per Copilot CLI docs
- Example: `@task "prompt here"`
- Parse response

**AC4:** Error handling
- Timeout after 30s
- Retry once on transient errors
- Throw descriptive error on persistent failure

**AC5:** Response parsing
- Extract agent output from structured response
- Parse metadata (tokens, duration if available)

**AC6:** Mock implementation for tests
- `MockTaskToolInterface` returns predefined responses
- Simulates delays (100-500ms)

**Dependencies:** None  
**Estimation:** 3 SP

**Technical Notes:**
- Study Copilot CLI Task Tool API docs
- Document syntax in code comments
- Add integration test with real task agent

---

### 📝 Summary Epic 2

**Stories Totales:** 3 (vs 4 originales)  
**SP Total:** 12 SP (vs 22 SP)  
**Réduction:** 45%  
**Raison:** Task Tool simplifie routing, pas besoin Worker Pool management

---

## 🎯 EPIC 3: Worker Pool (OBSOLÈTE - RÉDUIT AU MINIMUM)

**Objectif Révisé:** ⚠️ **Worker Pool est OBSOLÈTE** - Remplacé par Task Tool. Garde uniquement local execution pour tâches complexes.

**Value Statement:** Exécution locale pour tâches complexes (score > 60) nécessitant expertise BYAN.

**Size:** XS (Extra Small) - **Réduction de 83%**  
**Priority:** P1 (Important mais non-bloquant)  
**Timeline:** Jour 3 (2-3h)  
**SP Révisé:** 4 SP (vs 23 SP original)

---

### ❌ STORIES SUPPRIMÉES (OBSOLÈTES)

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 3.1 (LLM Provider Interface) | 3 SP | ❌ Task Tool remplace LLM calls directs |
| Story 3.2 (Worker LLM Execution) | 5 SP | ❌ Task Tool remplace Worker execution |
| Story 3.3 (Agent Fallback) | 5 SP | ❌ Task Tool gère fallback nativement |
| Story 3.4 (Worker Metrics) | 4 SP | ❌ Déplacé vers Epic 5 (Observability) |
| Story 3.5 (Worker Tests) | 6 SP | ❌ Pas de Worker Pool à tester |

**Total Supprimé:** 23 SP  
**Total Nouvelles Stories:** 4 SP

---

### ✨ NOUVELLES STORIES

#### Story 3.1-NEW: Implement Local Task Executor

**As a** developer  
**I want** to execute complex tasks locally  
**So that** BYAN's core expertise handles critical business logic

**Acceptance Criteria:**

**AC1:** Class `LocalExecutor` exists
```javascript
class LocalExecutor {
  async execute(task, context) {
    // Business logic here
    return {output, metadata};
  }
}
```

**AC2:** Execute interview questions generation
- GIVEN task.type = 'generate_questions'
- WHEN executing locally
- THEN returns 5 structured questions (Merise Agile)

**AC3:** Execute response analysis
- GIVEN task.type = 'analyze_responses'
- AND userResponses array
- WHEN executing
- THEN returns analysis: {agentName, role, capabilities, constraints}

**AC4:** Execute agent profile generation
- GIVEN task.type = 'generate_profile'
- AND analysis results
- WHEN executing
- THEN returns complete `.md` agent profile

**AC5:** Error handling
- Throw descriptive errors for unsupported task types
- Validate input parameters

**Dependencies:** None  
**Estimation:** 4 SP

**Technical Notes:**
- Contains BYAN's core business logic
- NO external LLM calls
- Pure JavaScript logic
- Unit tests for each task type

---

### 📝 Summary Epic 3

**Stories Totales:** 1 (vs 5 originales)  
**SP Total:** 4 SP (vs 23 SP)  
**Réduction:** 83%  
**Raison:** Task Tool remplace entièrement Worker Pool pour délégation LLM

---

## 🎯 EPIC 4: Workflow Executor (ADAPTÉ)

**Objectif Révisé:** Remplacer Workflow YAML par State Machine pour interview flow.

**Value Statement:** State Machine plus simple et testable pour flow fixe (INTERVIEW → ANALYSIS → GENERATION).

**Size:** M (Medium)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 3 (8-10h)  
**SP Révisé:** 18 SP (vs 33 SP original)

---

### ❌ STORIES SUPPRIMÉES

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 4.1 (YAML Workflow Loading) | 5 SP | ❌ State Machine remplace YAML |
| Story 4.2 (Placeholder Resolution) | 4 SP | **DÉPLACÉE** vers Epic 6 (Agent Profile) |
| Story 4.3 (Step Retry) | 4 SP | ⚠️ Simplifié dans State Machine |
| Story 4.4 (Output File Saving) | 4 SP | **DÉPLACÉE** vers Epic 6 |
| Story 4.5 (Orchestration) | 6 SP | **REMPLACÉE** par State Machine |
| Story 4.6 (Demo Workflow) | 5 SP | **REMPLACÉE** par E2E tests |

**Total Supprimé:** 28 SP  
**Total Nouvelles Stories:** 18 SP

---

### ✨ NOUVELLES STORIES

#### Story 4.1-NEW: Implement State Machine Core

**As a** developer  
**I want** a state machine for interview workflow  
**So that** flow is predictable and testable

**Acceptance Criteria:**

**AC1:** Class `InterviewStateMachine` exists
```javascript
class InterviewStateMachine {
  states = ['INTERVIEW', 'ANALYSIS', 'GENERATION'];
  currentState = 'INTERVIEW';
  sessionState: SessionState;
  
  async transitionTo(nextState) {}
  async execute() {}
}
```

**AC2:** Valid transitions defined
- INTERVIEW → ANALYSIS (if >= 5 responses)
- ANALYSIS → GENERATION (if analysis complete)
- GENERATION → COMPLETE (if profile generated)
- Invalid transitions throw error

**AC3:** Transition validation
- GIVEN currentState = 'INTERVIEW'
- AND only 3 responses collected
- WHEN attempting transition to ANALYSIS
- THEN throw error: "Need minimum 5 responses"

**AC4:** State persistence in SessionState
- After each transition, update `sessionState.currentState`
- Can resume from saved state

**AC5:** Event hooks
- `onEnterState(state)`: Called when entering new state
- `onExitState(state)`: Called when leaving state
- Useful for logging/metrics

**Dependencies:** Epic 1 (SessionState)  
**Estimation:** 4 SP

---

#### Story 4.2-NEW: Implement INTERVIEW State Logic

**As a** interviewer  
**I want** structured question flow  
**So that** I collect quality responses from user

**Acceptance Criteria:**

**AC1:** Question generator method
- `generateNextQuestion(sessionState)` returns next question
- Questions follow Merise Agile methodology:
  1. What is the agent's purpose?
  2. What tasks should it perform?
  3. What tools/data does it need?
  4. What are success criteria?
  5. Any constraints/limitations?

**AC2:** Response validation
- Each response must be > 10 characters
- Track completion: `questionsAsked` / `questionsTotal`

**AC3:** Dynamic question adaptation (optional MVP)
- If user response vague, ask clarifying question
- Mark as "needs_clarification"

**AC4:** Progress tracking
- Method `getProgress()` returns: `{current: 3, total: 5, percent: 60}`

**AC5:** Transition trigger
- After 5 valid responses → auto-trigger transition to ANALYSIS

**Dependencies:** Story 4.1-NEW  
**Estimation:** 5 SP

---

#### Story 4.3-NEW: Implement ANALYSIS State Logic

**As a** analyst  
**I want** to extract structured data from responses  
**So that** I can generate accurate agent profile

**Acceptance Criteria:**

**AC1:** Analysis engine method
- `analyzeResponses(userResponses)` returns structured data:
```javascript
{
  agentName: string,
  role: string,
  capabilities: string[],
  tools: string[],
  constraints: string[],
  successCriteria: string[]
}
```

**AC2:** Natural Language Processing (simple)
- Extract key entities from responses
- Identify action verbs → capabilities
- Identify constraints (can't, must not, never)

**AC3:** Validation rules
- agentName must be valid (alphanumeric + hyphens)
- Minimum 3 capabilities identified
- Role must be clear (not vague)

**AC4:** Delegate complex analysis to Task Tool
- If responses are ambiguous (complexity > 60)
- Call Task Tool with 'explore' agent for deeper analysis

**AC5:** Store results in SessionState
- `sessionState.analysisResults = analysisData`

**AC6:** Transition trigger
- After successful analysis → trigger transition to GENERATION

**Dependencies:** Story 4.2-NEW, Epic 2 (TaskToolInterface)  
**Estimation:** 5 SP

**Technical Notes:**
- Simple regex + keyword matching for MVP
- Phase 2: Use LLM via Task Tool for better extraction

---

#### Story 4.4-NEW: Implement GENERATION State Logic

**As a** generator  
**I want** to create agent profile from analysis  
**So that** user gets ready-to-use Copilot agent

**Acceptance Criteria:**

**AC1:** Profile generator method
- `generateAgentProfile(analysisResults)` returns `.md` content

**AC2:** Profile structure (per Copilot CLI spec)
```markdown
---
name: agent-name
description: Brief description
---

You are [role]...

## Capabilities
- [capability 1]
- [capability 2]

## Tools Available
- [tool 1]

## Constraints
- [constraint 1]

## Success Criteria
- [criteria 1]
```

**AC3:** Placeholder resolution
- Replace `{agent_name}`, `{role}`, `{capabilities}`
- Use data from analysisResults

**AC4:** Validation
- Generated profile must be valid YAML frontmatter
- Must be valid Markdown
- Lint with markdown parser

**AC5:** Save to file (if in Copilot environment)
- Path: `.github/copilot/agents/{agent-name}.md`
- Create directory if doesn't exist

**AC6:** Return profile to user
- Display in console/output
- Provide file path

**Dependencies:** Story 4.3-NEW  
**Estimation:** 4 SP

---

### 📝 Summary Epic 4

**Stories Totales:** 4 (vs 6 originales)  
**SP Total:** 18 SP (vs 33 SP)  
**Réduction:** 45%  
**Raison:** State Machine plus simple que Workflow YAML pour flow fixe

---

## 🎯 EPIC 5: Observability (SIMPLIFIÉ)

**Objectif Révisé:** Observabilité minimale (console.log) - Copilot CLI capture logs automatiquement.

**Value Statement:** Logs basiques pour debugging, pas besoin dashboard MVP.

**Size:** S (Small) - **Réduction de 53%**  
**Priority:** P2 (Nice-to-have)  
**Timeline:** Jour 5 (3-4h)  
**SP Révisé:** 8 SP (vs 17 SP original)

---

### ❌ STORIES SUPPRIMÉES

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 5.1 (Winston Logger) | 4 SP | ⚠️ console.log suffit pour MVP |
| Story 5.2 (MetricsCollector) | 4 SP | **SIMPLIFIÉE** - Basic counters |
| Story 5.3 (Dashboard) | 5 SP | ❌ Hors scope MVP - Copilot CLI logs |
| Story 5.4 (Observability Tests) | 4 SP | **SIMPLIFIÉE** |

**Total Supprimé:** 13 SP (dashboard + complexity)  
**Total Nouvelles Stories:** 8 SP

---

### ✨ NOUVELLES STORIES

#### Story 5.1-NEW: Implement Basic Structured Logging

**As a** developer  
**I want** structured console logs  
**So that** I can debug issues in Copilot CLI

**Acceptance Criteria:**

**AC1:** Logger utility function
```javascript
function log(level, event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level, // 'info', 'warn', 'error'
    event, // 'state_transition', 'task_routed', etc.
    ...data
  };
  console.log(JSON.stringify(entry));
}
```

**AC2:** Log key events
- State transitions (INTERVIEW → ANALYSIS)
- Task routing decisions
- Task Tool delegations
- Errors/exceptions

**AC3:** Log levels
- INFO: Normal flow
- WARN: Recoverable issues
- ERROR: Failures

**AC4:** Privacy
- Sanitize sensitive data (user inputs truncated to 100 chars)
- Never log credentials/tokens

**AC5:** Environment-aware
- In tests: Silent mode (no console output)
- In dev: Verbose mode
- In prod: Info+ only

**Dependencies:** None  
**Estimation:** 3 SP

---

#### Story 5.2-NEW: Implement Basic Metrics

**As a** operator  
**I want** simple counters for key metrics  
**So that** I can track usage and performance

**Acceptance Criteria:**

**AC1:** Metrics class
```javascript
class Metrics {
  counters = {
    sessionsStarted: 0,
    questionsAsked: 0,
    analysesCompleted: 0,
    profilesGenerated: 0,
    tasksRouted: {local: 0, delegated: 0},
    errors: 0
  };
  
  increment(metric) {}
  getAll() {}
}
```

**AC2:** Increment on events
- Session start → sessionsStarted++
- Question asked → questionsAsked++
- Task routed → tasksRouted[type]++

**AC3:** Method `getMetricsSummary()`
```javascript
{
  totalSessions: N,
  avgQuestionsPerSession: X,
  successRate: X%,
  delegationRate: X%
}
```

**AC4:** Log metrics on process exit
- Print summary to console
- Example: "Session completed. Asked 5 questions, generated 1 profile."

**Dependencies:** Story 5.1-NEW  
**Estimation:** 3 SP

---

#### Story 5.3-NEW: Add Error Tracking & Reporting

**As a** developer  
**I want** detailed error tracking  
**So that** I can fix bugs quickly

**Acceptance Criteria:**

**AC1:** Error wrapper function
```javascript
async function withErrorTracking(fn, context) {
  try {
    return await fn();
  } catch (error) {
    log('error', 'exception', {
      message: error.message,
      stack: error.stack,
      context
    });
    throw error; // Re-throw
  }
}
```

**AC2:** Wrap critical operations
- State transitions
- Task executions
- File operations

**AC3:** Error categorization
- ValidationError
- NetworkError
- TaskExecutionError
- FileSystemError

**AC4:** User-friendly error messages
- Convert technical errors to plain language
- Example: "Failed to generate profile. Please check your responses."

**Dependencies:** Story 5.1-NEW  
**Estimation:** 2 SP

---

### 📝 Summary Epic 5

**Stories Totales:** 3 (vs 4 originales)  
**SP Total:** 8 SP (vs 17 SP)  
**Réduction:** 53%  
**Raison:** Copilot CLI fournit observability built-in, pas besoin dashboard

---

## 🎯 EPIC 6: Integration & Agent Profile (NOUVEAU FOCUS)

**Objectif Révisé:** Créer agent profile Copilot CLI + intégration E2E + documentation.

**Value Statement:** Génère profils agents compatibles Copilot CLI avec validation complète.

**Size:** L (Large)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 4-5 (12-14h)  
**SP Révisé:** 29 SP (vs 28 SP original - **+4%**)

**Changement Focus:**
- ❌ MOINS: Integration générique multi-platforms
- ✅ PLUS: Agent profile Copilot CLI spécifique

---

### ✅ STORIES CONSERVÉES (MODIFIÉES)

#### Story 6.1-MODIFIED: System Integration

**Status:** 🔄 **ADAPTÉ pour Copilot CLI**

**As a** developer  
**I want** all components integrated  
**So that** BYAN works as Copilot CLI agent

**Acceptance Criteria:**

**AC1:** Main entry point `index.js`
- Exports BYAN agent for Copilot CLI
- Initializes: SessionState, Dispatcher, StateMachine, LocalExecutor

**AC2:** Dependency injection
- Components loosely coupled
- Mock-able for tests

**AC3:** Configuration loading
- Read from `byan.config.js`
- Defaults for all settings

**AC4:** Environment detection
- Detect if running in Copilot CLI context
- Fallback for standalone testing

**AC5:** Integration smoke test
- Start session → Ask 5 questions → Generate profile
- End-to-end in < 60s

**Dependencies:** All previous epics  
**Estimation:** 5 SP (inchangé)

---

#### Story 6.2-MODIFIED: Create Demo Scenario

**Status:** 🔄 **ADAPTÉ**

**As a** user  
**I want** a demo creating real agent  
**So that** I can see BYAN in action

**Acceptance Criteria:**

**AC1:** Demo script `demo.js`
- Simulates user responses (pre-defined)
- Runs complete interview → analysis → generation

**AC2:** Demo creates "code-reviewer" agent
- Purpose: Review code for bugs
- Capabilities: Static analysis, best practices check
- Constraints: No code execution

**AC3:** Generated profile saved
- Path: `.github/copilot/agents/code-reviewer.md`
- Valid YAML + Markdown

**AC4:** Demo runs in < 30s

**AC5:** README includes demo instructions

**Dependencies:** Story 6.1-MODIFIED  
**Estimation:** 4 SP (réduit de 5 → 4)

---

### ❌ STORIES SUPPRIMÉES

| Story | SP Original | Raison Suppression |
|-------|-------------|-------------------|
| Story 6.3 (Documentation) | 5 SP | **DÉCOMPOSÉE** en 3 stories ciblées |
| Story 6.4 (E2E Tests) | 5 SP | **INTÉGRÉE** dans autres stories |
| Story 6.5 (Performance Tests) | 4 SP | **SIMPLIFIÉE** |
| Story 6.6 (Release Prep) | 4 SP | **INTÉGRÉE** dans 6.6-NEW |

---

### ✨ NOUVELLES STORIES

#### Story 6.3-NEW: Create Agent Profile Template System

**As a** generator  
**I want** flexible profile templates  
**So that** I can generate various agent types

**Acceptance Criteria:**

**AC1:** Template engine
```javascript
class ProfileTemplate {
  static render(templateName, data) {
    const template = loadTemplate(templateName);
    return resolvePlaceholders(template, data);
  }
}
```

**AC2:** Default template: `templates/default-agent.md`
- YAML frontmatter
- Structured sections (Capabilities, Tools, Constraints)
- Placeholder syntax: `{{agent_name}}`, `{{role}}`

**AC3:** Placeholder resolution
- Support nested: `{{analysis.capabilities[0]}}`
- Support loops: `{{#each capabilities}}...{{/each}}`
- Support conditionals: `{{#if tools}}...{{/if}}`

**AC4:** Template validation
- Lint YAML frontmatter
- Validate Markdown structure
- Check required placeholders

**AC5:** Custom templates
- Support user-provided templates
- Path: `_byan/templates/custom-agent.md`
- Override default template

**Dependencies:** Epic 4 (GENERATION state)  
**Estimation:** 5 SP

**Technical Notes:**
- Use Handlebars or Mustache for templating
- Document template syntax in README

---

#### Story 6.4-NEW: Implement Agent Profile Validator

**As a** quality engineer  
**I want** to validate generated profiles  
**So that** they work in Copilot CLI

**Acceptance Criteria:**

**AC1:** Validator class
```javascript
class AgentProfileValidator {
  validate(profileContent) {
    return {
      valid: boolean,
      errors: string[],
      warnings: string[]
    };
  }
}
```

**AC2:** YAML frontmatter validation
- Required fields: `name`, `description`
- Valid name format: lowercase, alphanumeric, hyphens only
- Description length: 10-200 chars

**AC3:** Markdown structure validation
- Must have: Agent role description
- Must have: At least one capability
- Valid Markdown syntax (no broken links)

**AC4:** Copilot CLI compatibility checks
- No prohibited directives
- No emoji pollution (Mantra IA-23) 🚫
- File size < 50KB

**AC5:** Validation in generation flow
- Auto-validate before saving
- If invalid → throw error with details
- If warnings → log but proceed

**Dependencies:** Story 6.3-NEW  
**Estimation:** 4 SP

---

#### Story 6.5-NEW: Create Comprehensive Documentation

**As a** user  
**I want** clear documentation  
**So that** I can use BYAN effectively

**Acceptance Criteria:**

**AC1:** README.md
- Overview (what is BYAN)
- Installation (npm install, setup)
- Quick Start (5 min tutorial)
- Examples (create agent, validate profile)
- Troubleshooting

**AC2:** QUICKSTART.md
- Step-by-step first agent creation
- Screenshots/GIFs (optional)
- Expected output at each step

**AC3:** API.md
- All public classes/methods documented
- Code examples for each method
- Error handling examples

**AC4:** ARCHITECTURE.md (reference Winston's doc)
- High-level architecture diagram
- Component interactions
- State machine flow diagram
- Sequence diagrams (interview flow)

**AC5:** CONTRIBUTING.md
- How to contribute
- Development setup
- Running tests
- Code style guide

**AC6:** Documentation hosted
- GitHub README displays correctly
- Links work (relative paths)

**Dependencies:** Story 6.2-MODIFIED  
**Estimation:** 5 SP

---

#### Story 6.6-NEW: E2E Testing & Release Validation

**As a** QA engineer  
**I want** comprehensive E2E tests  
**So that** BYAN is production-ready

**Acceptance Criteria:**

**AC1:** E2E test suite
```javascript
describe('BYAN E2E', () => {
  test('Complete interview flow', async () => {
    // Start session
    // Answer 5 questions
    // Verify analysis
    // Verify profile generation
  });
});
```

**AC2:** Test scenarios
- Happy path (valid responses)
- Edge case (vague responses)
- Error case (invalid input)
- Performance test (< 30s total)

**AC3:** Integration with Copilot CLI (manual)
- Load BYAN as Copilot agent
- Test invocation: `@byan create agent for...`
- Verify output

**AC4:** Success criteria validation
- ✅ Context loading < 50ms
- ✅ Task routing < 10ms
- ✅ Full workflow < 30s
- ✅ Test coverage > 70%
- ✅ No emoji pollution (Mantra IA-23)

**AC5:** Release checklist
- All tests pass (unit + integration + E2E)
- Documentation complete
- Demo works
- README accurate
- Version bumped (package.json)

**AC6:** Performance profiling
- Identify bottlenecks
- Optimize if > 30s total time

**Dependencies:** All stories  
**Estimation:** 6 SP

**Technical Notes:**
- Use Jest for E2E tests
- Mock Task Tool for automated tests
- Manual Copilot CLI test required

---

### 📝 Summary Epic 6

**Stories Totales:** 6 (vs 6 originales)  
**SP Total:** 29 SP (vs 28 SP)  
**Augmentation:** +4%  
**Raison:** Plus de focus sur agent profile Copilot CLI (validation, templates)

---

## 📊 RÉSUMÉ GLOBAL RÉVISÉ

### Stories Par Epic

| Epic | Stories Originales | Stories Révisées | SP Original | SP Révisé | Réduction |
|------|-------------------|-----------------|-------------|-----------|-----------|
| EPIC 1 | 5 | 2 | 22 | 6 | -73% |
| EPIC 2 | 4 | 3 | 22 | 12 | -45% |
| EPIC 3 | 5 | 1 | 23 | 4 | -83% |
| EPIC 4 | 6 | 4 | 33 | 18 | -45% |
| EPIC 5 | 4 | 3 | 17 | 8 | -53% |
| EPIC 6 | 6 | 6 | 28 | 29 | +4% |
| **TOTAL** | **30** | **19** | **145 SP** | **77 SP** | **-47%** |

### Stories Par Type

| Type | Nombre | SP Total |
|------|--------|---------|
| ✅ Conservées (identiques) | 1 | 5 SP |
| 🔄 Modifiées (adaptées) | 4 | 17 SP |
| ❌ Supprimées (obsolètes) | 25 | 68 SP |
| ✨ Nouvelles (Option B) | 14 | 55 SP |

### Impact Architectural

**RÉDUCTIONS MAJEURES:**
1. **Context Layer:** -73% (Copilot CLI context)
2. **Worker Pool:** -83% (Task Tool delegation)
3. **Observability:** -53% (Copilot built-in)

**ADAPTATIONS:**
1. **Dispatcher:** -45% (routing vers Task Tool)
2. **Workflow:** -45% (State Machine vs YAML)

**NOUVEAU FOCUS:**
1. **Agent Profile:** +4% (validation + templates)

---

## 🎯 SUCCESS CRITERIA RÉVISÉS

### Fonctionnels
- ✅ Agent BYAN fonctionne dans Copilot CLI
- ✅ Interview process (5 questions structurées Merise Agile)
- ✅ Task delegation (< 30 → task agent, > 60 → local)
- ✅ Agent profile généré (`.github/copilot/agents/`)
- ✅ Profile validé (YAML + Markdown + Copilot spec)

### Performance
- ✅ Session state access: < 5ms
- ✅ Task routing decision: < 10ms
- ✅ Full workflow completion: < 30s
- ✅ Token réduction: 40-50% (via intelligent routing)

### Qualité
- ✅ Test coverage: > 70% (unit), > 60% (integration)
- ✅ Clean architecture (SOLID principles)
- ✅ Documentation complète (README, API, ARCHITECTURE)
- ✅ Zero emoji pollution (Mantra IA-23)
- ✅ Validation E2E pass

---

## 🚀 PLAN D'EXÉCUTION JOUR PAR JOUR

### 📅 JOUR 1: Foundation (16 SP)
**Objectif:** Adapter fondations pour Copilot CLI

**Morning (8 SP):**
- Story 1.1-NEW: SessionState Manager (3 SP)
- Story 1.2-NEW: Copilot Context Integration (3 SP)
- Story 2.3-NEW: TaskToolInterface (3 SP) - Commencer

**Afternoon (8 SP):**
- Story 2.3-NEW: TaskToolInterface (finaliser)
- Story 2.1-MODIFIED: Complexity Algorithm (5 SP)
- Tests unitaires foundational

**Livrable Jour 1:**
- ✅ SessionState fonctionnel
- ✅ Copilot context intégré
- ✅ TaskToolInterface implémenté
- ✅ Complexity algorithm testé

---

### 📅 JOUR 2: Dispatcher & Routing (12 SP)
**Objectif:** Routing intelligent vers Task Tool

**Morning (6 SP):**
- Story 2.2-MODIFIED: Task Routing Logic (4 SP)
- Story 5.1-NEW: Basic Logging (3 SP) - Commencer

**Afternoon (6 SP):**
- Story 5.1-NEW: Basic Logging (finaliser)
- Story 5.2-NEW: Basic Metrics (3 SP)
- Tests integration dispatcher

**Livrable Jour 2:**
- ✅ Dispatcher route vers Task Tool
- ✅ Logging structuré fonctionnel
- ✅ Metrics basiques
- ✅ Integration tests pass

---

### 📅 JOUR 3: Orchestrator & Business Logic (22 SP - JOURNÉE INTENSIVE)
**Objectif:** State machine + logique métier BYAN

**Morning (10 SP):**
- Story 4.1-NEW: State Machine Core (4 SP)
- Story 4.2-NEW: INTERVIEW State (5 SP)
- Story 3.1-NEW: Local Executor (4 SP) - Commencer

**Afternoon (12 SP):**
- Story 3.1-NEW: Local Executor (finaliser)
- Story 4.3-NEW: ANALYSIS State (5 SP)
- Story 4.4-NEW: GENERATION State (4 SP)
- Tests unitaires orchestrator

**Livrable Jour 3:**
- ✅ State machine complet
- ✅ INTERVIEW flow fonctionnel
- ✅ ANALYSIS engine opérationnel
- ✅ GENERATION basic (sans templates avancés)
- ✅ Local executor testé

**⚠️ Note:** Journée intensive - 22 SP (au-dessus de 15 SP/jour). Si retard, déplacer Story 4.4 à Jour 4.

---

### 📅 JOUR 4: Templates & Integration (14 SP)
**Objectif:** Agent profiles + intégration E2E

**Morning (9 SP):**
- Story 6.3-NEW: Profile Template System (5 SP)
- Story 6.4-NEW: Profile Validator (4 SP)

**Afternoon (5 SP):**
- Story 6.1-MODIFIED: System Integration (5 SP)
- Story 5.3-NEW: Error Tracking (2 SP) - Commencer

**Livrable Jour 4:**
- ✅ Templates profiles fonctionnels
- ✅ Validation profiles opérationnelle
- ✅ Intégration système complète
- ✅ Error tracking basique

---

### 📅 JOUR 5: Documentation & Validation (13 SP)
**Objectif:** Polish + validation finale

**Morning (9 SP):**
- Story 5.3-NEW: Error Tracking (finaliser)
- Story 6.5-NEW: Documentation (5 SP)
- Story 6.2-MODIFIED: Demo Scenario (4 SP)

**Afternoon (6 SP):**
- Story 6.6-NEW: E2E Testing & Validation (6 SP)
- Bug fixes
- Performance optimization

**Evening:**
- Final validation
- Success criteria check
- README polish

**Livrable Jour 5:**
- ✅ Documentation complète
- ✅ Demo fonctionnel
- ✅ Tests E2E pass
- ✅ Success criteria validés
- ✅ MVP PRÊT 🚀

---

## 🎯 RISQUES & MITIGATION

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Task Tool integration complexe** | Medium | High | Prototype Jour 1 + fallback mock |
| **Jour 3 trop chargé (22 SP)** | High | Medium | Buffer stories vers Jour 4 si nécessaire |
| **Complexité templates** | Low | Medium | Commencer simple (placeholders basiques) |
| **Validation Copilot CLI** | Medium | High | Tests manuels fréquents |
| **Timeline serré** | Medium | High | Prioriser P0, skip P2 si retard |

---

## 📋 DEPENDENCIES GRAPH

```
JOUR 1:
  1.1-NEW (SessionState)
    └─> 1.2-NEW (Copilot Context)
  2.3-NEW (TaskToolInterface) [parallel]
  2.1-MODIFIED (Complexity) [parallel]

JOUR 2:
  2.2-MODIFIED (Routing) [depends: 2.1, 2.3]
  5.1-NEW (Logging) [parallel]
  5.2-NEW (Metrics) [depends: 5.1]

JOUR 3:
  4.1-NEW (State Machine) [depends: 1.1]
  4.2-NEW (INTERVIEW) [depends: 4.1]
  4.3-NEW (ANALYSIS) [depends: 4.2, 2.2]
  4.4-NEW (GENERATION) [depends: 4.3]
  3.1-NEW (Local Executor) [parallel]

JOUR 4:
  6.3-NEW (Templates) [depends: 4.4]
  6.4-NEW (Validator) [depends: 6.3]
  6.1-MODIFIED (Integration) [depends: ALL]
  5.3-NEW (Error Tracking) [depends: 5.1]

JOUR 5:
  6.5-NEW (Documentation) [depends: 6.1]
  6.2-MODIFIED (Demo) [depends: 6.1]
  6.6-NEW (E2E Tests) [depends: ALL]
```

---

## 🔍 APPENDIX A: Stories Supprimées Détail

### Stories Obsolètes (Task Tool Remplace)

| Story ID | Nom | Raison Suppression | SP Économisé |
|----------|-----|-------------------|-------------|
| 3.1 | LLM Provider Interface | Task Tool abstrait LLM calls | 3 SP |
| 3.2 | Worker LLM Execution | Task Tool exécute tasks | 5 SP |
| 3.3 | Agent Fallback | Task Tool gère fallback nativement | 5 SP |
| 3.4 | Worker Metrics | Déplacé vers Epic 5 (simplifié) | 4 SP |
| 3.5 | Worker Tests | Pas de Worker Pool à tester | 6 SP |

### Stories Simplifiées (Copilot Context)

| Story ID | Nom | Raison Simplification | SP Économisé |
|----------|-----|----------------------|-------------|
| 1.1 | YAML Context Loading | Copilot fournit context | 5 SP |
| 1.2 | Hierarchical Merge | Pas besoin multi-layer | 5 SP |
| 1.4 | L1 Cache | SessionState en mémoire suffit | 4 SP |

### Stories Déplacées

| Story ID | Nom | Destination | Raison |
|----------|-----|-------------|---------|
| 1.3 | Placeholder Resolution | Epic 6 | Utilisé pour agent profile templates |
| 4.2 | Placeholder Resolution | Epic 6 | Fusionné avec 1.3 |
| 4.4 | Output File Saving | Epic 6 | Spécifique à agent profile generation |

---

## 🔍 APPENDIX B: Comparaison Options Architecturales

| Critère | Option A (Simple) | **Option B (Hybrid)** ✅ | Option C (Refactor) |
|---------|------------------|----------------------|-------------------|
| **Timeline** | 3-4 jours | **5-7 jours** | 9-10 jours |
| **Code Reuse** | 80% | **40-50%** | 20% |
| **Risk** | High (dette) | **Medium** | Low |
| **Token Reduction** | 40% | **40-50%** | 50-60% |
| **Quality** | Medium | **High** | Very High |
| **Maintenance** | High debt | **Acceptable** | Low |
| **Recommandation** | ❌ Non | ✅ **OUI** | ⚠️ Post-MVP |

**Verdict:** Option B est le **sweet spot** pour MVP - balance qualité/vitesse/risque.

---

## 🎯 APPENDIX C: Mapping Stories Original → Révisé

### EPIC 1: Context Layer
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 1.1 (YAML Loading) | - | ❌ SUPPRIMÉ | Copilot context |
| 1.2 (Merge) | - | ❌ SUPPRIMÉ | Pas besoin |
| 1.3 (Placeholders) | 6.3-NEW | ✅ DÉPLACÉ | Templates |
| 1.4 (Cache) | - | ❌ SUPPRIMÉ | SessionState suffit |
| 1.5 (Tests) | 1.1-NEW | 🔄 MODIFIÉ | Tests SessionState |
| - | 1.1-NEW | ✨ NOUVEAU | SessionState |
| - | 1.2-NEW | ✨ NOUVEAU | Copilot context |

### EPIC 2: Dispatcher
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 2.1 (Complexity) | 2.1-MODIFIED | ✅ CONSERVÉ | 100% réutilisable |
| 2.2 (Routing) | 2.2-MODIFIED | 🔄 MODIFIÉ | Route Task Tool |
| 2.3 (Metrics) | 5.2-NEW | ✅ DÉPLACÉ | Epic 5 |
| 2.4 (Tests) | 2.2-MODIFIED | 🔄 INTÉGRÉ | Dans routing story |
| - | 2.3-NEW | ✨ NOUVEAU | TaskToolInterface |

### EPIC 3: Worker Pool
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 3.1 (LLM Provider) | - | ❌ SUPPRIMÉ | Task Tool |
| 3.2 (Worker Execution) | - | ❌ SUPPRIMÉ | Task Tool |
| 3.3 (Fallback) | - | ❌ SUPPRIMÉ | Task Tool |
| 3.4 (Metrics) | 5.2-NEW | ✅ DÉPLACÉ | Epic 5 |
| 3.5 (Tests) | - | ❌ SUPPRIMÉ | Pas Worker |
| - | 3.1-NEW | ✨ NOUVEAU | Local Executor |

### EPIC 4: Workflow
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 4.1 (YAML Loading) | 4.1-NEW | 🔄 REMPLACÉ | State Machine |
| 4.2 (Placeholders) | 6.3-NEW | ✅ DÉPLACÉ | Templates |
| 4.3 (Retry) | 4.1-NEW | 🔄 INTÉGRÉ | State Machine |
| 4.4 (File Saving) | 6.4-NEW | ✅ DÉPLACÉ | Profile gen |
| 4.5 (Orchestration) | 4.2/3/4-NEW | 🔄 REMPLACÉ | States logic |
| 4.6 (Demo) | 6.2-MODIFIED | 🔄 MODIFIÉ | Demo scenario |

### EPIC 5: Observability
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 5.1 (Winston) | 5.1-NEW | 🔄 SIMPLIFIÉ | console.log |
| 5.2 (Metrics) | 5.2-NEW | 🔄 SIMPLIFIÉ | Basic counters |
| 5.3 (Dashboard) | - | ❌ SUPPRIMÉ | Hors MVP |
| 5.4 (Tests) | 5.3-NEW | 🔄 MODIFIÉ | Error tracking |

### EPIC 6: Integration
| Original | Révisé | Status | Note |
|----------|--------|--------|------|
| 6.1 (Integration) | 6.1-MODIFIED | 🔄 MODIFIÉ | Copilot CLI |
| 6.2 (Demo) | 6.2-MODIFIED | 🔄 MODIFIÉ | Agent demo |
| 6.3 (Docs) | 6.5-NEW | 🔄 DÉCOMPOSÉ | Plus détaillé |
| 6.4 (E2E Tests) | 6.6-NEW | 🔄 MODIFIÉ | Validation |
| 6.5 (Performance) | 6.6-NEW | 🔄 INTÉGRÉ | Dans E2E |
| 6.6 (Release) | 6.6-NEW | 🔄 INTÉGRÉ | Dans E2E |
| - | 6.3-NEW | ✨ NOUVEAU | Templates |
| - | 6.4-NEW | ✨ NOUVEAU | Validator |

---

## ✅ VALIDATION CHECKLIST

### Avant Démarrage
- [ ] Architecture Winston validée par Yan ✅
- [ ] Option B approuvée ✅
- [ ] Document épics révisés lu et compris
- [ ] Équipe dev briefée
- [ ] Environnement setup (Node.js, deps)

### Pendant Dev (Daily)
- [ ] Daily progress check
- [ ] Stories complétées marquées
- [ ] Tests pass (unit + integration)
- [ ] Branch git créée par story
- [ ] Code review (si équipe)

### Fin Sprint (Jour 5)
- [ ] Tous les tests pass (unit, integration, E2E)
- [ ] Documentation complète
- [ ] Demo fonctionne
- [ ] Success criteria validés
- [ ] Agent profile Copilot CLI testé manuellement
- [ ] README accurate
- [ ] Zero emoji pollution (Mantra IA-23)
- [ ] Performance < 30s full workflow

---

## 📞 CONTACTS & ESCALATION

**Product Manager:** John (moi-même)  
**Architecte:** Winston  
**Validateur:** Yan  
**Équipe Dev:** TBD

**Escalation:**
- Blockers techniques → Winston
- Décisions produit → John
- Validation finale → Yan

---

## 🎯 CONCLUSION

Ce document révise complètement les épics et stories BYAN v2.0 pour l'architecture **Option B (Hybrid Integration)** avec GitHub Copilot CLI.

**Réductions Clefs:**
- **47% réduction effort** (145 SP → 77 SP)
- **Timeline:** 7 jours → 5 jours
- **Focus:** Agent profile Copilot CLI (validation + templates)

**Nouvelles Stories:** 14 stories créées pour Option B  
**Stories Supprimées:** 25 stories obsolètes (Worker Pool, YAML Context)  
**Stories Adaptées:** 4 stories modifiées (Dispatcher, Integration)

**Prochaine Étape:** 🚀 **Démarrer Jour 1 - Foundation**

---

**Document Créé Par:** John (Product Manager)  
**Date:** 2025-02-04  
**Status:** ✅ PRÊT POUR IMPLÉMENTATION  
**Approuvé Par:** En attente validation Yan

---

**FIN DU DOCUMENT**

_Ce document remplace: `/home/yan/conception/_byan-output/planning-artifacts/byan-v2-epics-stories.md` (original)_
