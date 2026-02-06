---
project_name: BYAN v2.0 - Orchestration Platform
version: 2.0.0-HYPER-MVP
created_date: 2026-02-04
author: John (Product Manager)
user: Yan
status: Ready for Implementation
timeline: 7 jours (1 semaine)
inputDocuments:
  - /home/yan/conception/_bmad-output/architecture/byan-v2-0-architecture-node.md
  - /home/yan/conception/src/core/ (implementation skeletons)
---

# BYAN v2.0 - Épics & Stories

## 📋 CONTEXTE DU PROJET

**Problème Résolu:**
- Réduction de 40-50% des requêtes LLM via routing intelligent
- Context hiérarchique: Platform → Project → Story
- Workflows déclaratifs en YAML
- Observabilité complète (logs + metrics)

**Stack Technique:**
- Node.js >= 18.0.0
- JavaScript pur (pas TypeScript pour MVP)
- Dependencies: js-yaml, node-cache, winston, fs-extra, jest

**Success Criteria:**
- Context loading < 50ms
- Worker pool répond < 2s
- Dispatcher accuracy 70%+
- Test coverage > 80%
- 40-50% réduction requêtes
- 0 emoji pollution (Mantra IA-23)

---

## 🎯 EPIC 1: Context Layer Refactoring

**Objectif:** Transformer le simple in-memory store actuel en système hiérarchique YAML avec héritage Platform → Project → Story et résolution de placeholders.

**Value Statement:** Permet de partager le contexte entre agents avec une structure claire, réduisant la duplication et améliorant la cohérence des données.

**Size:** L (Large)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 1-2 (12-16h)

### GAP Identifié:
**Current State:** `context.js` est un simple store clé-valeur en mémoire sans structure hiérarchique, sans support YAML, sans cache.

**Target State:** Système multi-niveaux avec:
- Chargement YAML (platform.yaml, project.yaml, story.yaml)
- Merge hiérarchique avec override enfant
- Résolution de placeholders `{key}`
- Cache L1 (node-cache) avec TTL
- Performance < 50ms

---

### Story 1.1: Implement YAML Context Loading

**As a** developer  
**I want** to load context from YAML files at different levels  
**So that** I can organize context hierarchically

**Acceptance Criteria:**

**AC1:** Function `loadContext(level, id)` exists in ContextLayer class
- GIVEN level = 'platform'
- WHEN calling loadContext('platform')
- THEN it loads `_bmad/_context/platform.yaml` and returns parsed object

**AC2:** Function supports project-level loading
- GIVEN level = 'project' and id = {projectId: 'my-project'}
- WHEN calling loadContext('project', id)
- THEN it loads `_bmad/_context/my-project/project.yaml`
- AND returns parsed object

**AC3:** Function supports story-level loading
- GIVEN level = 'story' and id = {projectId: 'proj1', storyId: 'story1'}
- WHEN calling loadContext('story', id)
- THEN it loads platform, project, and story YAML files
- AND returns NOTHING yet (merging is Story 1.2)

**AC4:** Error handling for missing files
- GIVEN a YAML file does not exist
- WHEN calling loadContext with that path
- THEN it throws descriptive error with file path

**AC5:** YAML parsing validation
- GIVEN a malformed YAML file
- WHEN loading context
- THEN it throws YAML parse error with line number

**Dependencies:** None  
**Estimation:** 5 SP (Story Points)  
**Technical Notes:**
- Use `js-yaml` library for parsing
- Use `fs-extra` for async file operations
- Use `path.join(process.cwd(), '_bmad/_context', ...)` for paths

---

### Story 1.2: Implement Hierarchical Context Merging

**As a** developer  
**I want** context to merge hierarchically with child overrides  
**So that** story-specific values override project defaults, which override platform defaults

**Acceptance Criteria:**

**AC1:** Merge platform + project contexts
- GIVEN platform context = `{env: 'prod', region: 'us-east-1'}`
- AND project context = `{region: 'eu-west-1', projectName: 'my-proj'}`
- WHEN merging contexts
- THEN result = `{env: 'prod', region: 'eu-west-1', projectName: 'my-proj'}`

**AC2:** Merge all three levels (platform + project + story)
- GIVEN platform, project, and story contexts
- WHEN calling loadContext('story', id)
- THEN result contains merged data with story overriding project overriding platform

**AC3:** Deep merge for nested objects
- GIVEN platform = `{api: {timeout: 5000, retries: 3}}`
- AND story = `{api: {timeout: 10000}}`
- WHEN merging
- THEN result = `{api: {timeout: 10000, retries: 3}}`

**AC4:** Array values are replaced, not merged
- GIVEN platform = `{tags: ['prod', 'stable']}`
- AND story = `{tags: ['experimental']}`
- WHEN merging
- THEN result = `{tags: ['experimental']}` (not concatenated)

**Dependencies:** Story 1.1  
**Estimation:** 5 SP  
**Technical Notes:**
- Use lodash.merge or custom deep merge function
- Document merge strategy in code comments

---

### Story 1.3: Implement Placeholder Resolution

**As a** developer  
**I want** to resolve placeholders like `{user_name}` in text  
**So that** I can dynamically inject context values

**Acceptance Criteria:**

**AC1:** Function `resolvePlaceholders(text, context)` exists
- GIVEN text = "Hello {user_name}, welcome to {project}"
- AND context = {user_name: 'Yan', project: 'BYAN'}
- WHEN calling resolvePlaceholders
- THEN returns "Hello Yan, welcome to BYAN"

**AC2:** Multiple placeholders in same string
- GIVEN text with 5+ placeholders
- WHEN resolving
- THEN all placeholders are replaced correctly

**AC3:** Nested context values
- GIVEN context = {user: {name: 'Yan', role: 'dev'}}
- AND text = "User: {user.name} ({user.role})"
- WHEN resolving
- THEN returns "User: Yan (dev)"

**AC4:** Missing placeholders remain unchanged
- GIVEN text = "Hello {missing_key}"
- AND context does not contain 'missing_key'
- WHEN resolving
- THEN returns "Hello {missing_key}" (unchanged)

**AC5:** Escape sequences for literal braces
- GIVEN text = "Use \\{key\\} for placeholders"
- WHEN resolving
- THEN preserves literal braces

**Dependencies:** Story 1.2  
**Estimation:** 3 SP  
**Technical Notes:**
- Use regex `/\{([^}]+)\}/g` for placeholder matching
- Support dot notation for nested values

---

### Story 1.4: Implement L1 Cache with node-cache

**As a** developer  
**I want** context to be cached in memory  
**So that** repeated loads are fast (< 5ms)

**Acceptance Criteria:**

**AC1:** Cache initialization
- GIVEN ContextLayer is instantiated
- WHEN constructor runs
- THEN node-cache instance is created with default TTL = 300s (5 minutes)

**AC2:** Cache hit reduces load time
- GIVEN context has been loaded once
- WHEN loading same context again
- THEN it returns from cache (not filesystem)
- AND load time < 5ms

**AC3:** Cache key generation
- GIVEN level = 'story' and id = {projectId: 'p1', storyId: 's1'}
- WHEN generating cache key
- THEN key = 'story:p1:s1'

**AC4:** Cache invalidation method
- GIVEN cached context
- WHEN calling `clearCache(level, id)`
- THEN that specific cache entry is removed

**AC5:** Cache TTL expiration
- GIVEN cached context with TTL = 10s
- WHEN waiting 11 seconds
- THEN next load hits filesystem (cache expired)

**AC6:** Cache statistics
- GIVEN `getCacheStats()` method
- WHEN calling it
- THEN returns {hits: N, misses: M, hitRate: X%}

**Dependencies:** Story 1.3  
**Estimation:** 4 SP  
**Technical Notes:**
- npm install node-cache
- Use cache.get(key), cache.set(key, value, ttl)
- Track hits/misses manually

---

### Story 1.5: Context Layer Integration Tests

**As a** QA engineer  
**I want** comprehensive integration tests  
**So that** the entire context layer works end-to-end

**Acceptance Criteria:**

**AC1:** Test setup: Create sample YAML files
- Create `__tests__/fixtures/_context/` directory
- Add platform.yaml, project1/project.yaml, project1/story1/story.yaml

**AC2:** Test: Load and merge story context
- GIVEN fixture YAML files
- WHEN loading story context
- THEN result contains correctly merged data from all 3 levels

**AC3:** Test: Placeholder resolution with merged context
- GIVEN text with placeholders
- WHEN resolving with story-level context
- THEN placeholders use merged values

**AC4:** Test: Cache behavior
- First load → cache miss
- Second load → cache hit
- After clearCache() → cache miss

**AC5:** Test: Error scenarios
- Missing YAML files throw errors
- Malformed YAML throws parse errors

**AC6:** Performance test
- GIVEN 100 consecutive loads (with cache)
- WHEN measuring average time
- THEN avg < 5ms per load

**AC7:** Test coverage > 90% for context.js

**Dependencies:** Stories 1.1-1.4  
**Estimation:** 3 SP  
**Technical Notes:**
- Use Jest for testing
- Use `jest.mock('fs-extra')` if needed

---

## 🎯 EPIC 2: Economic Dispatcher Algorithm

**Objectif:** Remplacer le keyword matcher simple par un algorithme de calcul de complexité (0-100) avec routing intelligent vers Worker (< 30), Worker+fallback (30-60), ou Agent (> 60).

**Value Statement:** Réduit les coûts LLM de 40-50% en routant les tâches simples vers des modèles légers, tout en maintenant la qualité pour les tâches complexes.

**Size:** M (Medium)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 2-3 (12-14h)

### GAP Identifié:
**Current State:** Dispatcher utilise uniquement pattern matching par mots-clés (haiku/sonnet/opus).

**Target State:** Algorithme multi-facteurs:
- Facteur 1: Token count estimation
- Facteur 2: Type de tâche (validation=5, reasoning=70)
- Facteur 3: Context size
- Facteur 4: Complexity keywords
- Score final 0-100 → routing decision

---

### Story 2.1: Implement Complexity Scoring Algorithm

**As a** dispatcher  
**I want** to calculate task complexity score (0-100)  
**So that** I can route tasks to appropriate executors

**Acceptance Criteria:**

**AC1:** Function `calculateComplexity(task)` exists
- GIVEN task object with {input, type, context, agentName}
- WHEN calling calculateComplexity
- THEN returns numeric score between 0-100

**AC2:** Factor 1 - Token count estimation
- GIVEN task.input = "simple text with 10 words here exactly"
- WHEN calculating
- THEN token estimate = wordCount * 1.3 = 13 tokens
- AND contributes min(13/100, 30) = 0.13 to score

**AC3:** Factor 2 - Task type mapping
- GIVEN task.type = 'validation'
- THEN contributes +5 to score
- GIVEN task.type = 'architecture'
- THEN contributes +80 to score

**AC4:** Factor 3 - Context size
- GIVEN task.context with JSON.stringify length = 25000 chars
- WHEN calculating
- THEN contributes min(25000/5000, 20) = 20 to score

**AC5:** Factor 4 - Complexity keywords
- GIVEN task.input contains 'analyze', 'design', 'optimize'
- WHEN calculating
- THEN contributes 3 keywords * 5 = 15 to score

**AC6:** Score capping at 100
- GIVEN all factors sum to 125
- WHEN calculating final score
- THEN returns Math.min(125, 100) = 100

**AC7:** Test cases with expected scores
- Simple validation task → score ~10-20
- Medium extraction task → score ~40-50
- Complex architecture task → score ~80-100

**Dependencies:** None  
**Estimation:** 5 SP  
**Technical Notes:**
- Document formula in code comments
- Make factor weights configurable in future

---

### Story 2.2: Implement Task Routing Logic

**As a** dispatcher  
**I want** to route tasks based on complexity score  
**So that** simple tasks use workers and complex tasks use agents

**Acceptance Criteria:**

**AC1:** Function `routeTask(task)` exists
- GIVEN task with complexity score
- WHEN calling routeTask
- THEN returns executor reference (Worker or Agent)

**AC2:** Route to Worker for simple tasks (score < 30)
- GIVEN task with complexity = 25
- WHEN routing
- THEN returns available Worker instance
- AND worker.fallbackToAgent = false

**AC3:** Route to Worker with fallback for medium tasks (30-60)
- GIVEN task with complexity = 45
- WHEN routing
- THEN returns available Worker instance
- AND worker.fallbackToAgent = true

**AC4:** Route to Agent for complex tasks (score > 60)
- GIVEN task with complexity = 75
- WHEN routing
- THEN returns Agent instance from agentRegistry
- AND uses task.agentName to select agent

**AC5:** Worker pool availability check
- GIVEN all workers are busy
- WHEN routing task with complexity < 30
- THEN waits for worker to become available
- OR routes to agent after timeout (5s)

**AC6:** Routing metrics tracking
- Track: routingDecisions = {worker: N, workerFallback: M, agent: P}
- Track: avgComplexityPerRoute

**Dependencies:** Story 2.1  
**Estimation:** 5 SP  
**Technical Notes:**
- Inject WorkerPool and AgentRegistry via constructor
- Add timeout for worker availability

---

### Story 2.3: Add Routing Metrics & Observability

**As a** platform operator  
**I want** to see routing decisions and accuracy  
**So that** I can optimize the algorithm

**Acceptance Criteria:**

**AC1:** Method `getRoutingStats()` exists
- Returns object with:
  - totalTasksRouted: N
  - workerRouted: N
  - workerWithFallback: N
  - agentRouted: N
  - avgComplexityScore: X

**AC2:** Fallback tracking
- GIVEN task routed to worker with fallback
- AND worker execution fails
- WHEN falling back to agent
- THEN increment fallbacksTriggered counter

**AC3:** Routing accuracy calculation
- Track: tasksSucceededFirstTry / totalTasks
- If fallback happened → considered routing miss

**AC4:** Logging integration
- GIVEN StructuredLogger instance
- WHEN routing decision is made
- THEN log: {event: 'task_routed', taskId, complexity, route, timestamp}

**AC5:** Performance metrics
- Track: avgRoutingDecisionTime (should be < 10ms)

**Dependencies:** Story 2.2, EPIC 5 (Logger)  
**Estimation:** 3 SP  
**Technical Notes:**
- Store metrics in memory for MVP
- Future: Export to Prometheus/CloudWatch

---

### Story 2.4: Dispatcher Unit & Integration Tests

**As a** developer  
**I want** comprehensive tests for dispatcher  
**So that** routing logic is reliable

**Acceptance Criteria:**

**AC1:** Unit tests for complexity calculation
- Test all 4 factors independently
- Test score capping at 100
- Test edge cases (empty input, huge context)

**AC2:** Unit tests for routing logic
- Mock WorkerPool and AgentRegistry
- Test routing for score ranges: 0-29, 30-60, 61-100

**AC3:** Integration test: End-to-end routing
- GIVEN real task objects
- WHEN calculating complexity and routing
- THEN verify correct executor is selected

**AC4:** Performance test
- GIVEN 1000 tasks
- WHEN routing sequentially
- THEN avg decision time < 10ms

**AC5:** Test coverage > 90% for dispatcher.js

**Dependencies:** Stories 2.1-2.3  
**Estimation:** 4 SP  
**Technical Notes:**
- Use Jest mock functions
- Test with realistic task objects

---

## 🎯 EPIC 3: Worker Pool LLM Integration

**Objectif:** Transformer le Worker Pool générique en système d'exécution LLM avec appel à Haiku-like model, fallback vers Agent, et métriques de coût/performance.

**Value Statement:** Permet l'exécution réelle de tâches via LLM légers avec fallback automatique, garantissant qualité et économie.

**Size:** L (Large)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 3-4 (14-16h)

### GAP Identifié:
**Current State:** Worker exécute des fonctions JavaScript génériques, pas d'appel LLM.

**Target State:** 
- Integration avec LLM provider (OpenAI, Anthropic, ou mock)
- Fallback automatique Agent si échec Worker
- Métriques: tokens, cost, duration

---

### Story 3.1: Design LLM Provider Interface

**As a** developer  
**I want** an abstracted LLM provider interface  
**So that** I can swap providers (OpenAI, Anthropic, Mock) easily

**Acceptance Criteria:**

**AC1:** Interface `ILLMProvider` defined
```javascript
class ILLMProvider {
  async call(prompt, options) {
    // Returns: {text, tokens, duration, cost}
  }
}
```

**AC2:** MockLLMProvider implementation for tests
- Returns predefined responses
- Simulates token count (wordCount * 1.3)
- Simulates cost ($0.0003 per 1k tokens)
- Simulates duration (100-300ms)

**AC3:** OpenAIProvider stub (future implementation)
- Constructor accepts API key
- call() method prepared for OpenAI API

**AC4:** Configuration for provider selection
- Read from env var: `BYAN_LLM_PROVIDER=mock|openai|anthropic`
- Default to 'mock' for MVP

**Dependencies:** None  
**Estimation:** 3 SP  
**Technical Notes:**
- Use strategy pattern for provider selection
- Document API contract clearly

---

### Story 3.2: Implement Worker LLM Execution

**As a** worker  
**I want** to execute tasks using LLM  
**So that** I can process AI-powered requests

**Acceptance Criteria:**

**AC1:** Worker.execute() modified to call LLM
- GIVEN task object with {input, context, type}
- WHEN executing task
- THEN constructs prompt from input + context
- AND calls llmProvider.call(prompt)
- AND returns formatted result

**AC2:** Prompt construction
- GIVEN task.input = "Validate this schema"
- AND task.context = {schema: {...}}
- WHEN constructing prompt
- THEN prompt = `[TASK] ${input}\n\n[CONTEXT]\n${JSON.stringify(context)}`

**AC3:** Response formatting
- GIVEN LLM response
- WHEN processing result
- THEN returns: {output, tokens, duration, costEstimated, success: true}

**AC4:** Error handling
- GIVEN LLM call fails (network error, rate limit)
- WHEN executing
- THEN throw error with details for potential fallback

**AC5:** Timeout enforcement
- GIVEN task with default timeout = 30s
- WHEN LLM call exceeds 30s
- THEN abort and throw timeout error

**Dependencies:** Story 3.1  
**Estimation:** 5 SP  
**Technical Notes:**
- Use AbortController for timeout
- Sanitize sensitive data in logs

---

### Story 3.3: Implement Agent Fallback Mechanism

**As a** worker  
**I want** to fallback to Agent execution on failure  
**So that** tasks succeed even when worker encounters issues

**Acceptance Criteria:**

**AC1:** Worker property `fallbackToAgent` added
- Default: false
- Set to true by Dispatcher for medium-complexity tasks

**AC2:** Fallback triggered on execution error
- GIVEN worker.execute() throws error
- AND worker.fallbackToAgent = true
- WHEN error is caught
- THEN call agentRegistry.getAgent(task.agentName).execute(task)

**AC3:** Fallback result includes metadata
- GIVEN fallback execution succeeds
- WHEN returning result
- THEN add flag: {usedFallback: true, originalError: '...'}

**AC4:** Fallback failure handling
- GIVEN both worker AND agent fail
- WHEN executing task
- THEN throw combined error with both failure details

**AC5:** Metrics for fallback
- Track: fallbacksTriggered, fallbackSuccesses, fallbackFailures

**AC6:** Logging
- Log when fallback is triggered
- Log final result (success/failure)

**Dependencies:** Story 3.2  
**Estimation:** 5 SP  
**Technical Notes:**
- Inject AgentRegistry into Worker constructor
- Add integration test with mock agent

---

### Story 3.4: Add Worker Execution Metrics

**As a** platform operator  
**I want** detailed metrics for worker executions  
**So that** I can track performance and costs

**Acceptance Criteria:**

**AC1:** MetricsCollector for worker stats
- Track per worker: {id, tasksExecuted, totalTokens, totalCost, totalDuration}
- Aggregate across pool: {avgDuration, avgTokens, totalCost}

**AC2:** Cost calculation
- GIVEN tokens = 1000, model = 'haiku'
- WHEN calculating cost
- THEN cost = (tokens / 1000) * HAIKU_COST_PER_1K ($0.0003)

**AC3:** Performance percentiles
- Track p50, p95, p99 response times
- Use simple in-memory array for MVP

**AC4:** Method `WorkerPool.getMetrics()` returns:
```javascript
{
  totalTasks: N,
  successRate: X%,
  avgDuration: Xms,
  avgTokens: N,
  totalCost: $X.XX,
  fallbackRate: X%
}
```

**AC5:** Integration with StructuredLogger
- Log metrics every 100 tasks OR every 5 minutes

**Dependencies:** Story 3.3, EPIC 5 (Logger)  
**Estimation:** 4 SP  
**Technical Notes:**
- Use performance.now() for high-resolution timing
- Store raw data points for percentile calculation

---

### Story 3.5: Worker Pool Integration Tests

**As a** QA engineer  
**I want** end-to-end tests for worker pool  
**So that** LLM integration works correctly

**Acceptance Criteria:**

**AC1:** Test: Simple task execution with MockLLM
- GIVEN task with complexity < 30
- WHEN submitting to pool
- THEN worker executes using MockLLM
- AND returns successful result

**AC2:** Test: Fallback scenario
- GIVEN task routed to worker with fallbackToAgent=true
- AND MockLLM throws error
- WHEN executing
- THEN fallback to mock agent succeeds

**AC3:** Test: Concurrent task execution
- GIVEN pool size = 3
- WHEN submitting 10 tasks simultaneously
- THEN max 3 execute concurrently
- AND all 10 eventually complete

**AC4:** Test: Metrics accuracy
- GIVEN 50 tasks executed
- WHEN checking metrics
- THEN totals match actual executions

**AC5:** Test coverage > 85% for worker-pool.js

**Dependencies:** Stories 3.1-3.4  
**Estimation:** 4 SP  
**Technical Notes:**
- Use MockLLMProvider for all tests
- Mock AgentRegistry for fallback tests

---

## 🎯 EPIC 4: Workflow Executor YAML

**Objectif:** Transformer le skeleton WorkflowExecutor en orchestrateur complet capable de charger des workflows YAML, exécuter des étapes séquentielles avec retry, sauvegarder les outputs, et gérer les dépendances entre steps.

**Value Statement:** Permet de définir des workflows complexes de manière déclarative (YAML), facilitant l'orchestration multi-agents et la maintenabilité.

**Size:** L (Large)  
**Priority:** P1 (Important)  
**Timeline:** Jour 4-5 (14-18h)

### GAP Identifié:
**Current State:** WorkflowExecutor exécute des steps basiques avec stub simulation.

**Target State:**
- Chargement de workflows YAML
- Résolution de placeholders dans inputs ({step.resultX})
- Retry logic avec exponential backoff
- Output file saving
- Integration avec Dispatcher + ContextLayer

---

### Story 4.1: Implement YAML Workflow Loading

**As a** workflow author  
**I want** to define workflows in YAML  
**So that** I can version-control and share orchestration logic

**Acceptance Criteria:**

**AC1:** Function `loadWorkflow(yamlPath)` exists
- GIVEN path to workflow YAML file
- WHEN calling loadWorkflow
- THEN returns parsed workflow object

**AC2:** Workflow schema validation
- Workflow must have: {name, version, steps[]}
- Each step must have: {id, type, input}
- Optional step fields: {agent, retry, output_file}

**AC3:** Example workflow structure
```yaml
name: simple-prd-creation
version: 1.0
context_level: story
context_id:
  projectId: "my-project"
  storyId: "story-001"
steps:
  - id: extract_requirements
    type: agent
    agent: analyst
    input: "Extract requirements from: {context.inputDoc}"
    output_file: "{output_folder}/requirements.md"
    retry:
      max_attempts: 3
      delay: 2000
  - id: validate_requirements
    type: worker
    input: "Validate requirements: {step.extract_requirements.output}"
```

**AC4:** Error handling for invalid YAML
- Missing required fields → throw validation error
- Malformed YAML → throw parse error

**Dependencies:** None  
**Estimation:** 4 SP  
**Technical Notes:**
- Use js-yaml for parsing
- Define JSON Schema for validation (future: use ajv)

---

### Story 4.2: Implement Step Input Placeholder Resolution

**As a** workflow executor  
**I want** to resolve placeholders in step inputs  
**So that** steps can reference previous results and context

**Acceptance Criteria:**

**AC1:** Resolve context placeholders
- GIVEN step.input = "User: {context.user_name}"
- AND context loaded from ContextLayer
- WHEN resolving input
- THEN input = "User: Yan"

**AC2:** Resolve step result placeholders
- GIVEN step.input = "Validate: {step.extract_requirements.output}"
- AND previous step 'extract_requirements' returned {output: "FR1, FR2"}
- WHEN resolving input
- THEN input = "Validate: FR1, FR2"

**AC3:** Nested placeholder resolution
- Support: {step.stepId.result.nestedField}
- Support: {context.project.name}

**AC4:** Error on missing dependencies
- GIVEN step references {step.nonexistent}
- WHEN resolving
- THEN throw error: "Step 'nonexistent' not found in results"

**AC5:** Function `resolveStepInput(input, context, stepResults)` implements this

**Dependencies:** Story 4.1, EPIC 1 (ContextLayer)  
**Estimation:** 4 SP  
**Technical Notes:**
- Extend placeholder resolution from ContextLayer
- Use regex with support for dot notation

---

### Story 4.3: Implement Step Execution with Retry

**As a** workflow executor  
**I want** steps to retry on failure  
**So that** transient errors don't break workflows

**Acceptance Criteria:**

**AC1:** Function `executeStep(step, context, stepResults)` exists
- GIVEN step configuration
- WHEN executing
- THEN routes via Dispatcher
- AND returns result object

**AC2:** Retry logic for failed steps
- GIVEN step.retry = {max_attempts: 3, delay: 2000}
- AND first execution fails
- WHEN retrying
- THEN waits 2s before attempt 2
- THEN waits 4s before attempt 3 (exponential backoff)
- THEN returns last error if all attempts fail

**AC3:** No retry for steps without retry config
- GIVEN step without retry field
- WHEN execution fails
- THEN throws error immediately (max_attempts = 1)

**AC4:** Retry metrics tracking
- Track: {stepId, attemptNumber, success, error}

**AC5:** Logging each attempt
- Log: {event: 'step_execution', stepId, attempt, status}

**Dependencies:** Story 4.2, EPIC 2 (Dispatcher)  
**Estimation:** 5 SP  
**Technical Notes:**
- Use setTimeout for delay
- Exponential backoff: delay * (2 ^ attemptNumber)

---

### Story 4.4: Implement Output File Saving

**As a** workflow author  
**I want** step outputs saved to files  
**So that** I can review/use generated artifacts

**Acceptance Criteria:**

**AC1:** Save output when step.output_file is specified
- GIVEN step.output_file = "{output_folder}/requirements.md"
- AND step execution returns {output: "FR1\nFR2"}
- WHEN step completes
- THEN file is created at resolved path
- AND contains "FR1\nFR2"

**AC2:** Placeholder resolution in output path
- GIVEN output_file = "{output_folder}/{step.extract.id}_result.md"
- WHEN resolving
- THEN path = "/path/to/_bmad-output/extract_requirements_result.md"

**AC3:** Directory creation if needed
- GIVEN output path = "/new/dir/file.md"
- AND directory '/new/dir' doesn't exist
- WHEN saving
- THEN create directory recursively

**AC4:** Overwrite behavior
- GIVEN file already exists
- WHEN saving output
- THEN overwrite existing file (log warning)

**AC5:** Error handling
- GIVEN output path is invalid (permission denied)
- WHEN attempting save
- THEN log error but don't fail workflow

**Dependencies:** Story 4.3  
**Estimation:** 3 SP  
**Technical Notes:**
- Use fs-extra.outputFile (creates dirs automatically)
- Log file path after successful save

---

### Story 4.5: Implement Complete Workflow Orchestration

**As a** workflow executor  
**I want** to orchestrate all steps sequentially  
**So that** complex multi-step workflows execute correctly

**Acceptance Criteria:**

**AC1:** Method `executeWorkflow(workflowPath)` orchestrates full workflow
- Load YAML workflow
- Load context from ContextLayer (if context_level specified)
- Execute steps sequentially
- Return summary: {success, stepsCompleted, totalSteps, results, errors}

**AC2:** Sequential execution with dependencies
- Step N+1 can reference output of step N
- Steps execute in order defined in YAML

**AC3:** Stop on critical failure
- GIVEN step fails after all retries
- AND step.continue_on_error = false (default)
- WHEN workflow executing
- THEN stop execution, return partial results

**AC4:** Continue on non-critical failure
- GIVEN step fails
- AND step.continue_on_error = true
- WHEN workflow executing
- THEN log error, continue to next step

**AC5:** Workflow result summary
```javascript
{
  success: true,
  workflowName: "simple-prd",
  stepsCompleted: 5,
  totalSteps: 5,
  duration: 12000,
  results: {stepId: {...}, ...},
  errors: []
}
```

**AC6:** Integration with all prior systems
- ContextLayer for context loading
- Dispatcher for routing
- WorkerPool + Agents for execution
- StructuredLogger for logging

**Dependencies:** Stories 4.1-4.4  
**Estimation:** 5 SP  
**Technical Notes:**
- Use async/await for sequential execution
- Track overall workflow timing

---

### Story 4.6: Create Demo Workflow & Tests

**As a** developer  
**I want** a working demo workflow  
**So that** I can validate end-to-end functionality

**Acceptance Criteria:**

**AC1:** Demo workflow YAML created
- File: `demo/simple-validation-workflow.yaml`
- 3 steps: extract, validate, summarize
- Uses both worker and agent types
- Includes retry config

**AC2:** Demo execution script
- File: `demo/run-demo.js`
- Loads demo workflow
- Executes via WorkflowExecutor
- Prints results to console

**AC3:** Integration test: Execute demo workflow
- GIVEN demo workflow with MockLLM provider
- WHEN executing workflow
- THEN all steps complete successfully
- AND output files are created

**AC4:** Unit tests for workflow executor
- Test: Load valid/invalid YAML
- Test: Placeholder resolution
- Test: Retry logic
- Test: Output file saving

**AC5:** Test coverage > 85% for workflow-executor.js

**Dependencies:** Story 4.5  
**Estimation:** 5 SP  
**Technical Notes:**
- Use fixtures for test workflows
- Mock all external dependencies

---

## 🎯 EPIC 5: Observability & Metrics

**Objectif:** Implémenter un système complet de logging structuré (Winston) et de métriques en temps réel pour tracking des coûts, performance, et comportement du système.

**Value Statement:** Fournit visibilité complète sur le système pour debugging, optimisation, et tracking des coûts LLM.

**Size:** M (Medium)  
**Priority:** P2 (Nice to have for MVP)  
**Timeline:** Jour 5 (6-8h)

### GAP Identifié:
**Current State:** StructuredLogger basique en mémoire, pas de persistence, pas de metrics collector structuré.

**Target State:**
- Winston logger avec file transports
- Structured JSON logs
- Metrics collector avec aggregations
- Dashboard basique (console output)

---

### Story 5.1: Upgrade Logger to Winston

**As a** platform operator  
**I want** persistent structured logs  
**So that** I can debug issues and analyze system behavior

**Acceptance Criteria:**

**AC1:** Winston logger configuration
- Install winston package
- Configure file transport: `_bmad-output/logs/byan.log`
- JSON format with timestamps
- Log rotation: max 10MB per file, keep 5 files

**AC2:** Log levels maintained: debug, info, warn, error

**AC3:** Structured log format
```json
{
  "timestamp": "2026-02-04T10:30:45.123Z",
  "level": "info",
  "message": "Task executed",
  "meta": {
    "taskId": "task-123",
    "executor": "worker",
    "duration": 250,
    "tokens": 150,
    "cost": 0.000045
  }
}
```

**AC4:** Console transport for development
- Add console transport with colorization
- Enable/disable via env var: `BYAN_LOG_CONSOLE=true`

**AC5:** Backward compatibility
- Existing StructuredLogger interface remains
- Internal implementation uses Winston

**Dependencies:** None  
**Estimation:** 3 SP  
**Technical Notes:**
- npm install winston winston-daily-rotate-file
- Keep in-memory logs for tests

---

### Story 5.2: Implement MetricsCollector

**As a** developer  
**I want** centralized metrics collection  
**So that** all components report metrics consistently

**Acceptance Criteria:**

**AC1:** MetricsCollector class
```javascript
class MetricsCollector {
  recordTaskExecution(taskId, executor, result);
  recordRouting(taskId, complexity, route);
  recordCost(taskId, tokens, cost);
  getMetrics(); // Returns aggregated metrics
}
```

**AC2:** Metrics tracked
- Task executions: {total, success, failed, byExecutor}
- Routing decisions: {worker, workerFallback, agent}
- Costs: {totalTokens, totalCost, avgCostPerTask}
- Performance: {avgDuration, p50, p95, p99}
- Fallbacks: {triggered, succeeded, failed}

**AC3:** Time-series data (simple)
- Track metrics per 5-minute window
- Store last 24 hours (288 windows)

**AC4:** Singleton pattern
- MetricsCollector is global singleton
- Access via `MetricsCollector.getInstance()`

**AC5:** Integration with existing components
- Dispatcher calls recordRouting()
- Worker calls recordTaskExecution()
- WorkflowExecutor logs workflow metrics

**Dependencies:** Story 5.1  
**Estimation:** 5 SP  
**Technical Notes:**
- Use in-memory storage for MVP
- Future: Export to Prometheus

---

### Story 5.3: Create Observability Dashboard (Console)

**As a** platform operator  
**I want** real-time metrics dashboard  
**So that** I can monitor system health

**Acceptance Criteria:**

**AC1:** Dashboard class with display() method
- Renders metrics to console in formatted table

**AC2:** Dashboard content
```
=== BYAN v2.0 Metrics Dashboard ===
Uptime: 2h 15m

Tasks Executed: 1,247
- Workers: 856 (68.6%)
- Workers (fallback): 234 (18.8%)
- Agents: 157 (12.6%)
Success Rate: 98.2%

Performance:
- Avg Duration: 1.2s
- P95 Duration: 3.5s
- P99 Duration: 5.8s

Costs:
- Total Tokens: 1,250,000
- Total Cost: $3.75
- Avg Cost/Task: $0.003

Fallbacks: 234 triggered, 228 succeeded (97.4%)
```

**AC3:** Auto-refresh every 10 seconds (optional)

**AC4:** CLI command to display dashboard
- `node src/dashboard.js` or `npm run dashboard`

**AC5:** Export metrics to JSON
- Method: `dashboard.exportMetrics(path)`
- Saves current metrics to JSON file

**Dependencies:** Story 5.2  
**Estimation:** 4 SP  
**Technical Notes:**
- Use cli-table3 or chalk for formatting
- Keep it simple for MVP

---

### Story 5.4: Add Observability Integration Tests

**As a** QA engineer  
**I want** tests validating observability  
**So that** logging and metrics are reliable

**Acceptance Criteria:**

**AC1:** Test: Winston logs to file
- GIVEN logger configured
- WHEN logging messages
- THEN verify log file is created
- AND contains structured JSON entries

**AC2:** Test: MetricsCollector aggregations
- GIVEN 100 task executions recorded
- WHEN getting metrics
- THEN totals and averages are correct

**AC3:** Test: Dashboard rendering
- GIVEN populated metrics
- WHEN calling dashboard.display()
- THEN formatted output is generated (check string content)

**AC4:** Test: Metrics export
- GIVEN metrics data
- WHEN exporting to JSON
- THEN file contains valid JSON with all metrics

**AC5:** Test coverage > 80% for observability modules

**Dependencies:** Stories 5.1-5.3  
**Estimation:** 3 SP  
**Technical Notes:**
- Mock fs for file write tests
- Capture console.log output for dashboard tests

---

## 🎯 EPIC 6: Integration & Documentation

**Objectif:** Intégrer tous les composants, créer un workflow E2E de démonstration, écrire la documentation (README, QUICKSTART, API docs), et valider les success criteria.

**Value Statement:** Livre un système complet, testé, et documenté prêt pour adoption par les développeurs.

**Size:** L (Large)  
**Priority:** P0 (Critique)  
**Timeline:** Jour 6-7 (12-16h)

### GAP Identifié:
**Current State:** Composants isolés, pas d'intégration E2E, documentation minimale.

**Target State:**
- Système intégré et fonctionnel
- Demo workflow E2E
- Documentation complète
- Tests E2E passing
- Success criteria validés

---

### Story 6.1: System Integration & Dependency Injection

**As a** developer  
**I want** all components properly integrated  
**So that** the system works as a cohesive whole

**Acceptance Criteria:**

**AC1:** Main application class `ByanPlatform`
```javascript
class ByanPlatform {
  constructor(config);
  initialize(); // Sets up all components
  executeWorkflow(workflowPath);
  getMetrics();
  shutdown();
}
```

**AC2:** Dependency injection
- ContextLayer injected into WorkflowExecutor
- LLMProvider injected into WorkerPool
- MetricsCollector shared across all components
- StructuredLogger shared across all components

**AC3:** Configuration management
- Load from `byan.config.js` or env vars
- Config includes: llmProvider, workerPoolSize, logLevel, cacheSettings

**AC4:** Initialization sequence
1. Load config
2. Initialize logger
3. Initialize metrics collector
4. Initialize context layer with cache
5. Initialize LLM provider
6. Initialize worker pool
7. Initialize dispatcher
8. Initialize workflow executor

**AC5:** Graceful shutdown
- Close file handles
- Flush logs
- Save final metrics

**Dependencies:** All prior epics  
**Estimation:** 5 SP  
**Technical Notes:**
- Use config file pattern from existing BMM config
- Add shutdown hooks (process.on('SIGINT'))

---

### Story 6.2: Create End-to-End Demo Workflow

**As a** user  
**I want** a complete demo workflow  
**So that** I can see the platform in action

**Acceptance Criteria:**

**AC1:** Demo scenario: "Simple PRD Creation"
- Workflow: `demo/prd-creation-demo.yaml`
- Steps:
  1. Extract user stories from input (worker)
  2. Validate stories format (worker)
  3. Analyze complexity (agent)
  4. Generate PRD outline (agent)
  5. Format and save (worker)

**AC2:** Demo includes all features
- Multi-level context (platform + project)
- Worker tasks with LLM calls
- Agent tasks
- Step result dependencies
- Retry logic (simulate failure on attempt 1)
- Output file saving

**AC3:** Demo execution script
- `npm run demo` executes the workflow
- Prints progress to console
- Shows final metrics
- Saves outputs to `demo/output/`

**AC4:** Demo runs successfully with MockLLMProvider

**AC5:** Demo validates success criteria
- Context loading < 50ms ✓
- Worker response < 2s ✓
- Workflow completes successfully ✓

**Dependencies:** Story 6.1  
**Estimation:** 5 SP  
**Technical Notes:**
- Use realistic input data
- Include comments in YAML explaining each step

---

### Story 6.3: Write Comprehensive Documentation

**As a** new user  
**I want** clear documentation  
**So that** I can quickly understand and use BYAN v2.0

**Acceptance Criteria:**

**AC1:** README.md includes
- Overview and value proposition
- Architecture diagram (text-based or reference to drawio)
- Quick start guide
- Installation instructions
- Basic usage example
- Links to detailed docs

**AC2:** QUICKSTART.md includes
- Prerequisites (Node.js version)
- Installation steps
- Run demo workflow
- Create your first custom workflow
- Troubleshooting common issues

**AC3:** API.md includes
- ContextLayer API reference
- Dispatcher API reference
- WorkerPool API reference
- WorkflowExecutor API reference
- MetricsCollector API reference
- Code examples for each

**AC4:** WORKFLOWS.md includes
- YAML workflow schema documentation
- All step types explained
- Placeholder syntax reference
- Retry configuration options
- Best practices for workflow design

**AC5:** CONTRIBUTING.md includes
- Development setup
- Running tests
- Code style guide
- How to add new features

**Dependencies:** Story 6.2  
**Estimation:** 5 SP  
**Technical Notes:**
- Use clear examples
- Include diagrams from architecture doc
- Keep language simple and friendly

---

### Story 6.4: End-to-End Integration Tests

**As a** QA engineer  
**I want** comprehensive E2E tests  
**So that** the entire system works correctly

**Acceptance Criteria:**

**AC1:** E2E test suite: `__tests__/e2e/`
- Test: Load context, route task, execute via worker, save output
- Test: Execute workflow with multiple steps
- Test: Workflow with fallback scenario
- Test: Metrics accuracy across workflow execution

**AC2:** Test: Complete platform lifecycle
```javascript
test('Platform full lifecycle', async () => {
  const platform = new ByanPlatform(config);
  await platform.initialize();
  const result = await platform.executeWorkflow('demo/test.yaml');
  expect(result.success).toBe(true);
  const metrics = platform.getMetrics();
  expect(metrics.totalTasks).toBeGreaterThan(0);
  await platform.shutdown();
});
```

**AC3:** Test: Success criteria validation
- Context loading < 50ms
- Worker response < 2s
- 40%+ tasks routed to workers
- Test coverage > 80%

**AC4:** Test: Error scenarios
- Missing workflow file
- Invalid YAML
- All workers busy (timeout)
- LLM provider failure

**AC5:** CI/CD integration
- Tests run via `npm test`
- All tests must pass
- Coverage report generated

**Dependencies:** Story 6.3  
**Estimation:** 6 SP  
**Technical Notes:**
- Use Jest for E2E tests
- Mock external LLM calls
- Test with real file I/O

---

### Story 6.5: Performance Testing & Optimization

**As a** platform operator  
**I want** the system to meet performance targets  
**So that** it's production-ready

**Acceptance Criteria:**

**AC1:** Performance test suite: `__tests__/performance/`
- Test: Context loading < 50ms (avg over 100 runs)
- Test: Dispatcher routing < 10ms (avg over 1000 runs)
- Test: Worker execution < 2s (with MockLLM)
- Test: Memory usage < 300MB during workflow

**AC2:** Load test: Concurrent workflows
- GIVEN 5 workflows executing concurrently
- WHEN monitoring system
- THEN all complete successfully
- AND avg response time < 3s

**AC3:** Optimization if needed
- Profile bottlenecks using Node.js profiler
- Optimize slow code paths
- Add caching where beneficial

**AC4:** Performance report generated
- Document: `PERFORMANCE-REPORT.md`
- Include: Test results, benchmarks, comparison to targets

**AC5:** All performance targets met
- ✅ Context loading < 50ms
- ✅ Worker response < 2s
- ✅ Dispatcher < 10ms
- ✅ RAM usage < 300MB
- ✅ Cache hit rate > 60%

**Dependencies:** Story 6.4  
**Estimation:** 5 SP  
**Technical Notes:**
- Use performance.now() for timing
- Use process.memoryUsage() for RAM
- Run tests multiple times for statistical validity

---

### Story 6.6: Final Validation & Release Prep

**As a** project manager  
**I want** to validate all success criteria  
**So that** the project is ready for delivery

**Acceptance Criteria:**

**AC1:** Success criteria checklist
- ✅ Context loading < 50ms
- ✅ Worker pool responds < 2s
- ✅ Dispatcher accuracy 70%+
- ✅ Workflow YAML works end-to-end
- ✅ RAM usage < 300MB
- ✅ 40-50% reduction in LLM requests
- ✅ Test coverage > 80%
- ✅ 0 emoji pollution in code
- ✅ Clean code (self-documented)

**AC2:** Code quality checks
- ESLint passes with 0 errors
- No TODO/FIXME comments in production code
- All functions have JSDoc comments
- Code complexity metrics acceptable

**AC3:** Documentation review
- All docs spell-checked
- All code examples tested
- All links valid

**AC4:** Package preparation
- package.json metadata updated
- Version set to 2.0.0
- Dependencies locked (package-lock.json)
- .gitignore properly configured

**AC5:** Release notes created
- File: `RELEASE-NOTES-v2.0.0.md`
- Include: Features delivered, breaking changes, migration guide

**Dependencies:** Story 6.5  
**Estimation:** 4 SP  
**Technical Notes:**
- Use checklist template
- Review with stakeholder (Yan)
- Tag release in git

---

## 📊 REQUIREMENTS COVERAGE MAP

| Requirement | Epic(s) | Story(ies) | Status |
|-------------|---------|-----------|--------|
| Context hiérarchique YAML | EPIC 1 | 1.1-1.5 | Planned |
| Complexité 0-100 + routing | EPIC 2 | 2.1-2.4 | Planned |
| Worker Pool LLM | EPIC 3 | 3.1-3.5 | Planned |
| Workflow YAML orchestration | EPIC 4 | 4.1-4.6 | Planned |
| Observabilité complète | EPIC 5 | 5.1-5.4 | Planned |
| Documentation & E2E tests | EPIC 6 | 6.1-6.6 | Planned |

---

## 📈 PROJECT METRICS

**Total Epics:** 6  
**Total Stories:** 30  
**Total Story Points:** 142 SP  

**Estimated Timeline:**
- EPIC 1: 20 SP → ~12-16h (Jour 1-2)
- EPIC 2: 17 SP → ~12-14h (Jour 2-3)
- EPIC 3: 21 SP → ~14-16h (Jour 3-4)
- EPIC 4: 26 SP → ~14-18h (Jour 4-5)
- EPIC 5: 15 SP → ~6-8h (Jour 5)
- EPIC 6: 30 SP → ~12-16h (Jour 6-7)

**Velocity:** Assuming 1 SP ≈ 40-50 minutes

---

## 🚀 IMPLEMENTATION ROADMAP

### Week 1: Core Platform (Epics 1-3)
**Days 1-2:** Context Layer (EPIC 1)  
**Days 2-3:** Economic Dispatcher (EPIC 2)  
**Days 3-4:** Worker Pool LLM (EPIC 3)

### Week 1: Workflows & Observability (Epics 4-5)
**Days 4-5:** Workflow Executor (EPIC 4)  
**Day 5:** Observability (EPIC 5)

### Week 1: Polish & Delivery (Epic 6)
**Days 6-7:** Integration, Documentation, Testing, Validation

---

## ✅ SUCCESS CRITERIA TRACKING

| Criteria | Target | Epic | Validation Story |
|----------|--------|------|------------------|
| Context loading | < 50ms | EPIC 1 | Story 1.5 |
| Worker response | < 2s | EPIC 3 | Story 3.5 |
| Dispatcher accuracy | 70%+ | EPIC 2 | Story 2.3 |
| Workflow E2E | ✓ Works | EPIC 4 | Story 4.6 |
| RAM usage | < 300MB | EPIC 6 | Story 6.5 |
| CPU idle | < 50% | EPIC 6 | Story 6.5 |
| Cache hit rate | 60%+ | EPIC 1 | Story 1.4 |
| LLM reduction | 40-50% | EPIC 2 | Story 2.3 |
| Tasks → workers | 60%+ | EPIC 2 | Story 2.3 |
| Test coverage | 80%+ | All | Story 6.4 |
| Clean code | ✓ Self-doc | All | Story 6.6 |
| 0 emoji pollution | ✓ Zero | All | Story 6.6 |

---

## 🎯 ACCEPTANCE CRITERIA SUMMARY

**Each story includes:**
- Clear "As a... I want... So that..." format
- 5-7 detailed acceptance criteria
- Dependencies explicitly stated
- Story point estimation
- Technical implementation notes

**Quality Gates:**
- All ACs must pass before story marked complete
- Test coverage per story tracked
- Code review required (future: pair with Yan)

---

## 📝 NOTES DE JOHN (PM)

**Challenge & Validation Points:**

1. **Timeline Aggressive:** 7 jours pour 142 SP est ambitieux. Si slippage, prioriser:
   - P0: Epics 1, 2, 3, 6 (Core + validation)
   - P1: Epic 4 (Workflow peut être simplifié)
   - P2: Epic 5 (Observability peut être minimal pour MVP)

2. **Complexité Technique:** L'intégration EPIC 3 (LLM) peut révéler des surprises. Prévoir buffer temps.

3. **Test Coverage 80%+:** Objectif réaliste mais nécessite discipline TDD. Chaque story inclut tests dans estimation.

4. **Mantra IA-23 (0 emoji):** Respect strict dans le code. Documentation peut en avoir (README user-facing).

5. **Success Criteria Mesurables:** Story 6.5 valide TOUS les critères. Si échec, itération rapide nécessaire.

**Risques Identifiés:**
- 🔴 **HAUT:** Integration LLM provider (Story 3.1-3.2) - pas de vrais providers pour MVP
- 🟡 **MOYEN:** Performance targets (Context < 50ms, Worker < 2s) - peut nécessiter optimisation
- 🟢 **BAS:** YAML parsing et workflows - technologie mature

**Recommandations:**
- Daily standups avec Yan (check progress, unblock)
- Commit après chaque story (small iterations)
- Use MockLLMProvider for ALL tests in MVP
- Documentation as you code (not at end)

---

**Document créé par:** John (Product Manager)  
**Date:** 2026-02-04  
**Version:** 1.0  
**Status:** ✅ Ready for Implementation

**Next Steps:**
1. Yan review et approval
2. Setup development environment
3. Create git branches per epic
4. Start EPIC 1 Story 1.1

---

🎉 **Let's ship BYAN v2.0!** 🎉
