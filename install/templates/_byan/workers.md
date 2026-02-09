# BYAN v2 Workers Architecture

Documentation complète des 6 workers (modules fonctionnels) de BYAN v2.

**Version:** 2.0.0  
**Last Updated:** 2026-02-07

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Context Worker](#1-context-worker)
3. [Dispatcher Worker](#2-dispatcher-worker)
4. [Generation Worker](#3-generation-worker)
5. [Orchestrator Worker](#4-orchestrator-worker)
6. [Observability Worker](#5-observability-worker)
7. [Integration Worker](#6-integration-worker)
8. [Architecture & Communication](#architecture--communication)

---

## Vue d'ensemble

Les workers BYAN v2 sont des modules fonctionnels autonomes qui collaborent pour orchestrer la création d'agents intelligents.

### Principes de Design

1. **Single Responsibility** - Chaque worker a une responsabilité unique et claire
2. **Loose Coupling** - Workers communiquent via interfaces définies
3. **High Cohesion** - Fonctionnalités liées regroupées dans même worker
4. **Testability** - Chaque worker est testable indépendamment
5. **Observability** - Tous les workers loggent et émettent des métriques

### Workers Map

```
┌─────────────────────────────────────────────────────────┐
│                     ByanV2 (Core)                        │
│                  Orchestration Layer                     │
└──────────────┬─────────────────────────┬────────────────┘
               │                         │
       ┌───────▼────────┐        ┌──────▼─────────┐
       │  ORCHESTRATOR  │◄───────┤    CONTEXT     │
       │  State Machine │        │ Session & Data │
       └───────┬────────┘        └────────────────┘
               │
       ┌───────▼────────┐
       │   DISPATCHER   │
       │  Task Router   │
       └───────┬────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐  ┌──▼───┐  ┌───▼─────┐
│ GENER │  │ INTEG│  │  OBSERV │
│ ATION │  │RATION│  │ ABILITY │
└───────┘  └──────┘  └─────────┘
```

---

## 1. Context Worker

**Location:** `src/byan-v2/context/`

**Responsabilité:** Gestion du contexte de session et persistance des données

### Modules

#### 1.1 CopilotContext (`copilot-context.js`)

**Rôle:** Collecte et maintient le contexte d'exécution Copilot CLI

**Capabilities:**
- Détecte environnement d'exécution (CLI, standalone, CI)
- Collecte metadata session (user, repo, branch)
- Fournit contexte aux autres workers

**API:**

```javascript
class CopilotContext {
  constructor();
  
  /**
   * Detect execution environment
   * @returns {string} 'copilot' | 'standalone' | 'ci'
   */
  detectEnvironment(): string;
  
  /**
   * Get current user context
   * @returns {Object} { username, email, githubToken }
   */
  getUserContext(): Object;
  
  /**
   * Get repository context
   * @returns {Object} { owner, repo, branch, commitSha }
   */
  getRepoContext(): Object;
  
  /**
   * Get full context snapshot
   * @returns {Object} Complete context
   */
  getSnapshot(): Object;
}
```

**Usage:**

```javascript
const context = new CopilotContext();
const env = context.detectEnvironment();
console.log('Running in:', env);

const repoCtx = context.getRepoContext();
console.log('Repo:', repoCtx.repo);
```

#### 1.2 SessionState (`session-state.js`)

**Rôle:** Gestion de l'état de session interview BYAN

**Capabilities:**
- Persiste questions et réponses
- Stocke metadata de session
- Gère historique et backups
- Thread-safe pour concurrence

**API:**

```javascript
class SessionState {
  constructor(sessionId?: string);
  
  /**
   * Initialize new session
   * @returns {string} Session ID
   */
  initialize(): string;
  
  /**
   * Add question to session
   * @param {string} question
   */
  addQuestion(question: string): void;
  
  /**
   * Add response to last question
   * @param {string} questionId
   * @param {string} response
   */
  addResponse(questionId: string, response: string): void;
  
  /**
   * Get all questions and responses
   * @returns {Array} Interview history
   */
  getHistory(): Array;
  
  /**
   * Get session metadata
   * @returns {Object} Metadata
   */
  getMetadata(): Object;
  
  /**
   * Save session to disk
   * @param {string} path - Output path
   */
  save(path: string): Promise<void>;
  
  /**
   * Load session from disk
   * @param {string} sessionId
   */
  static load(sessionId: string): Promise<SessionState>;
}
```

**Storage:**

```javascript
// Session data structure
{
  sessionId: "uuid-v4",
  timestamp: 1733500000000,
  env: "copilot",
  user: {...},
  repo: {...},
  interview: {
    questions: [
      { id: "q1", text: "...", timestamp: 123 },
      { id: "q2", text: "...", timestamp: 456 }
    ],
    responses: [
      { questionId: "q1", response: "...", timestamp: 234 },
      { questionId: "q2", response: "...", timestamp: 567 }
    ]
  },
  metadata: {
    currentPhase: "BUSINESS",
    questionsAsked: 6,
    completed: false
  }
}
```

**Usage:**

```javascript
const session = new SessionState();
session.initialize();

session.addQuestion('What is your project domain?');
session.addResponse('q1', 'E-commerce platform');

await session.save('_byan/memory/session-abc123.json');
```

---

## 2. Dispatcher Worker

**Location:** `src/byan-v2/dispatcher/`

**Responsabilité:** Routage intelligent des tâches vers workers appropriés

### Modules

#### 2.1 ComplexityScorer (`complexity-scorer.js`)

**Rôle:** Évalue la complexité d'une tâche pour déterminer le routage

**Capabilities:**
- Analyse sémantique du texte
- Calcule score de complexité (0.0 - 1.0)
- Identifie patterns de tâches complexes

**Algorithme:**

```javascript
// Complexity factors
const factors = {
  length: responseLength / 1000,           // Longer = more complex
  keywords: countComplexKeywords(text),     // Technical terms
  ambiguity: detectAmbiguity(text),         // Unclear requirements
  multiDomain: detectMultipleDomains(text)  // Cross-domain knowledge
};

// Weighted score
const score = 
  factors.length * 0.2 +
  factors.keywords * 0.3 +
  factors.ambiguity * 0.3 +
  factors.multiDomain * 0.2;
```

**API:**

```javascript
class ComplexityScorer {
  /**
   * Calculate complexity score
   * @param {string} text - Text to analyze
   * @returns {number} Score 0.0-1.0
   */
  score(text: string): number;
  
  /**
   * Get complexity level
   * @param {string} text
   * @returns {string} 'low' | 'medium' | 'high'
   */
  getComplexityLevel(text: string): string;
  
  /**
   * Explain complexity factors
   * @param {string} text
   * @returns {Object} Breakdown
   */
  explain(text: string): Object;
}
```

**Usage:**

```javascript
const scorer = new ComplexityScorer();

const text = "Build a microservices architecture with event sourcing...";
const score = scorer.score(text);  // 0.82

const level = scorer.getComplexityLevel(text);  // "high"
```

#### 2.2 TaskRouter (`task-router.js`)

**Rôle:** Route les tâches vers le worker approprié (local ou délégué)

**Capabilities:**
- Décide local execution vs task tool delegation
- Sélectionne agent type pour délégation (explore, task, general-purpose)
- Gère fallback si délégation échoue

**Routing Logic:**

```javascript
if (complexityScore < THRESHOLD_LOW) {
  // Simple task → Local execution
  return localExecutor.execute(task);
  
} else if (complexityScore < THRESHOLD_MEDIUM) {
  // Medium → Explore agent
  return taskTool.invoke('explore', task);
  
} else {
  // High complexity → General-purpose agent
  return taskTool.invoke('general-purpose', task);
}
```

**API:**

```javascript
class TaskRouter {
  constructor(config);
  
  /**
   * Route task to appropriate executor
   * @param {Object} task
   * @returns {Promise<Object>} Result
   */
  async route(task: Object): Promise<Object>;
  
  /**
   * Get routing decision without executing
   * @param {Object} task
   * @returns {Object} { executor, reason }
   */
  decideRoute(task: Object): Object;
  
  /**
   * Get routing statistics
   * @returns {Object} Stats
   */
  getStats(): Object;
}
```

**Config:**

```yaml
dispatcher:
  thresholds:
    low: 0.3
    medium: 0.6
  fallback: local  # local | error
  max_retries: 3
```

#### 2.3 LocalExecutor (`local-executor.js`)

**Rôle:** Exécution locale des tâches simples sans délégation

**Capabilities:**
- Template rendering
- Simple text transformations
- Basic validation
- File I/O operations

**API:**

```javascript
class LocalExecutor {
  /**
   * Execute task locally
   * @param {Object} task
   * @returns {Promise<Object>} Result
   */
  async execute(task: Object): Promise<Object>;
}
```

#### 2.4 TaskToolInterface (`task-tool-interface.js`)

**Rôle:** Interface avec GitHub Copilot CLI task tool (sous-agents)

**Capabilities:**
- Invoke explore agent
- Invoke task agent
- Invoke general-purpose agent
- Parse results

**API:**

```javascript
class TaskToolInterface {
  /**
   * Invoke task tool agent
   * @param {string} agentType - 'explore' | 'task' | 'general-purpose'
   * @param {Object} task
   * @returns {Promise<Object>} Result
   */
  async invoke(agentType: string, task: Object): Promise<Object>;
  
  /**
   * Check if task tool available
   * @returns {boolean}
   */
  isAvailable(): boolean;
}
```

**Usage:**

```javascript
const router = new TaskRouter();

const task = {
  type: 'analyze_codebase',
  description: 'Find all authentication patterns',
  context: {...}
};

const result = await router.route(task);
```

---

## 3. Generation Worker

**Location:** `src/byan-v2/generation/`

**Responsabilité:** Génération et validation des profils d'agents

### Modules

#### 3.1 ProfileTemplate (`profile-template.js`)

**Rôle:** Gestion des templates markdown pour agents

**Capabilities:**
- Load templates from filesystem
- Render templates avec placeholders
- Support multiple template types
- Validation syntaxe markdown

**Template Format:**

```markdown
---
name: {{agent_name}}
description: "{{agent_description}}"
version: "{{agent_version}}"
---

# {{agent_title}}

## Persona

{{agent_persona}}

## Capabilities

{{#each capabilities}}
- {{this}}
{{/each}}

## Knowledge Base

{{agent_knowledge}}
```

**API:**

```javascript
class ProfileTemplate {
  constructor(templatePath?: string);
  
  /**
   * Load template from file
   * @param {string} templateName
   */
  loadTemplate(templateName: string): void;
  
  /**
   * Render template with data
   * @param {Object} data
   * @returns {string} Rendered markdown
   */
  render(data: Object): string;
  
  /**
   * List available templates
   * @returns {Array<string>}
   */
  listTemplates(): Array<string>;
  
  /**
   * Validate template syntax
   * @returns {boolean}
   */
  validate(): boolean;
}
```

**Usage:**

```javascript
const template = new ProfileTemplate();
template.loadTemplate('default-agent');

const profile = template.render({
  agent_name: 'code-reviewer',
  agent_description: 'Code review assistant',
  agent_version: '1.0.0',
  capabilities: ['Review JS', 'Security checks'],
  agent_knowledge: 'OWASP Top 10, ES2024'
});
```

#### 3.2 AgentProfileValidator (`agent-profile-validator.js`)

**Rôle:** Validation des profils générés contre SDK requirements

**Capabilities:**
- Validate YAML frontmatter
- Check required fields
- Enforce naming conventions
- Detect emoji pollution (Mantra IA-23)
- SDK compliance verification

**Validation Rules:**

```javascript
const rules = {
  frontmatter: {
    required: ['name', 'description', 'version'],
    optional: ['icon', 'tags', 'dependencies']
  },
  name: {
    pattern: /^[a-z][a-z0-9-]*[a-z0-9]$/,
    minLength: 3,
    maxLength: 50
  },
  description: {
    minLength: 20,
    maxLength: 200
  },
  version: {
    pattern: /^\d+\.\d+\.\d+$/
  },
  emojiPollution: {
    allowedSections: ['user_docs'],  // Only in user-facing docs
    technicalSections: ['yaml', 'code', 'metadata']  // Zero tolerance
  }
};
```

**API:**

```javascript
class AgentProfileValidator {
  /**
   * Validate complete profile
   * @param {string} profilePath
   * @returns {Promise<Object>} Validation result
   */
  async validateProfile(profilePath: string): Promise<Object>;
  
  /**
   * Validate frontmatter only
   * @param {Object} frontmatter
   * @returns {Object} Result
   */
  validateFrontmatter(frontmatter: Object): Object;
  
  /**
   * Check emoji pollution (Mantra IA-23)
   * @param {string} content
   * @returns {Array} Violations
   */
  detectEmojiPollution(content: string): Array;
  
  /**
   * Verify SDK compliance
   * @param {string} profile
   * @returns {boolean}
   */
  verifySdkCompliance(profile: string): boolean;
}
```

**Usage:**

```javascript
const validator = new AgentProfileValidator();

const result = await validator.validateProfile('agent.md');

if (result.valid) {
  console.log('✅ Valid agent profile');
} else {
  console.error('❌ Errors:', result.errors);
  console.warn('⚠️  Warnings:', result.warnings);
}
```

---

## 4. Orchestrator Worker

**Location:** `src/byan-v2/orchestrator/`

**Responsabilité:** Orchestration des états et workflow BYAN

### Modules

#### 4.1 StateMachine (`state-machine.js`)

**Rôle:** Machine à états pour workflow BYAN

**States:**
```
INIT → INTERVIEW → ANALYSIS → GENERATION → COMPLETED
         ↓           ↓            ↓
       ERROR       ERROR        ERROR
```

**Transitions:**

```javascript
const transitions = {
  INIT: ['INTERVIEW'],
  INTERVIEW: ['ANALYSIS', 'ERROR'],
  ANALYSIS: ['GENERATION', 'ERROR'],
  GENERATION: ['COMPLETED', 'ERROR'],
  COMPLETED: [],
  ERROR: ['INIT']  // Restart
};
```

**API:**

```javascript
class StateMachine {
  constructor(initialState?: string);
  
  /**
   * Get current state
   * @returns {string}
   */
  getCurrentState(): string;
  
  /**
   * Transition to new state
   * @param {string} newState
   * @throws {Error} If transition invalid
   */
  transition(newState: string): void;
  
  /**
   * Check if transition valid
   * @param {string} targetState
   * @returns {boolean}
   */
  canTransition(targetState: string): boolean;
  
  /**
   * Get state history
   * @returns {Array}
   */
  getHistory(): Array;
  
  /**
   * Reset to initial state
   */
  reset(): void;
}
```

**Usage:**

```javascript
const sm = new StateMachine('INIT');

sm.transition('INTERVIEW');  // Valid
console.log(sm.getCurrentState());  // 'INTERVIEW'

sm.transition('COMPLETED');  // Throws Error (invalid)
```

#### 4.2 InterviewState (`interview-state.js`)

**Rôle:** Gestion du workflow d'interview (4 phases, 12 questions)

**Phases:**
1. CONTEXT (Q1-Q3)
2. BUSINESS (Q4-Q6)
3. AGENT_NEEDS (Q7-Q9)
4. VALIDATION (Q10-Q12)

**API:**

```javascript
class InterviewState {
  constructor(sessionState);
  
  /**
   * Ask next question
   * @returns {Object|null} Question or null if complete
   */
  askNextQuestion(): Object|null;
  
  /**
   * Process user response
   * @param {string} response
   * @returns {boolean} Interview complete?
   */
  processResponse(response: string): boolean;
  
  /**
   * Check if phase complete
   * @param {string} phase
   * @returns {boolean}
   */
  isPhaseComplete(phase: string): boolean;
  
  /**
   * Check if can transition to ANALYSIS
   * @returns {boolean}
   */
  canTransitionToAnalysis(): boolean;
  
  /**
   * Get all responses
   * @returns {Object} Responses by phase
   */
  getAllResponses(): Object;
}
```

**Détails:** Voir `_byan/workflows/interview-workflow.md`

#### 4.3 AnalysisState (`analysis-state.js`)

**Rôle:** Analyse des réponses interview pour extraire concepts

**Capabilities:**
- Extract key concepts from responses
- Identify agent type (code-review, test-automation, etc.)
- Detect knowledge domains
- Map capabilities to implementations
- Identify gaps in requirements

**API:**

```javascript
class AnalysisState {
  constructor(interviewResponses);
  
  /**
   * Analyze interview responses
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(): Promise<Object>;
  
  /**
   * Extract concepts from text
   * @param {string} text
   * @returns {Array<string>}
   */
  extractConcepts(text: string): Array<string>;
  
  /**
   * Identify agent type
   * @returns {string} Agent type
   */
  identifyAgentType(): string;
  
  /**
   * Identify gaps in requirements
   * @returns {Array<string>}
   */
  identifyGaps(): Array<string>;
  
  /**
   * Generate recommendations
   * @returns {Array<Object>}
   */
  recommend(): Array<Object>;
}
```

**Analysis Output:**

```javascript
{
  concepts: ['code review', 'security', 'JavaScript', 'OWASP'],
  agentType: 'code-review-security',
  domains: ['security', 'web-dev'],
  capabilities: [
    { name: 'analyze-js-code', priority: 'high' },
    { name: 'detect-vulnerabilities', priority: 'high' },
    { name: 'suggest-fixes', priority: 'medium' }
  ],
  gaps: ['No mention of automated testing'],
  recommendations: [
    { type: 'add_capability', value: 'integrate-with-ci' },
    { type: 'add_knowledge', value: 'WCAG-accessibility' }
  ]
}
```

#### 4.4 GenerationState (`generation-state.js`)

**Rôle:** Génération du profil agent final

**Capabilities:**
- Map analysis to template data
- Select appropriate template
- Render profile
- Validate generated profile
- Save to filesystem

**API:**

```javascript
class GenerationState {
  constructor(analysisResult, config);
  
  /**
   * Generate agent profile
   * @returns {Promise<string>} Generated profile content
   */
  async generateProfile(): Promise<string>;
  
  /**
   * Select template based on analysis
   * @returns {string} Template name
   */
  selectTemplate(): string;
  
  /**
   * Map analysis to template data
   * @returns {Object} Template variables
   */
  mapToTemplateData(): Object;
  
  /**
   * Save profile to file
   * @param {string} content
   * @returns {Promise<string>} File path
   */
  async saveProfile(content: string): Promise<string>;
}
```

**Usage:**

```javascript
// After ANALYSIS state
const genState = new GenerationState(analysisResult, config);
const profile = await genState.generateProfile();

// profile is saved to: _byan-output/agent-name.md
console.log('Agent created:', profile);
```

---

## 5. Observability Worker

**Location:** `src/byan-v2/observability/`

**Responsabilité:** Logging, métriques, error tracking

### Modules

#### 5.1 Logger (`logger.js`)

**Rôle:** Structured logging for all workers

**Levels:** DEBUG, INFO, WARN, ERROR

**API:**

```javascript
class Logger {
  constructor(namespace?: string);
  
  debug(message: string, context?: Object): void;
  info(message: string, context?: Object): void;
  warn(message: string, context?: Object): void;
  error(message: string, error?: Error, context?: Object): void;
  
  /**
   * Set log level
   * @param {string} level - 'debug' | 'info' | 'warn' | 'error'
   */
  setLevel(level: string): void;
}
```

**Output Format:**

```json
{
  "timestamp": "2026-02-07T12:00:00.000Z",
  "level": "INFO",
  "namespace": "orchestrator.interview",
  "message": "Question asked",
  "context": {
    "phase": "CONTEXT",
    "questionNumber": 1
  }
}
```

#### 5.2 MetricsCollector (`metrics-collector.js`)

**Rôle:** Collecte et agrégation de métriques

**Metrics:**
- Session count
- Average questions per session
- Success rate
- Delegation rate
- Average duration

**API:**

```javascript
class MetricsCollector {
  /**
   * Record metric
   * @param {string} name
   * @param {number} value
   * @param {Object} tags
   */
  record(name: string, value: number, tags?: Object): void;
  
  /**
   * Increment counter
   * @param {string} name
   * @param {Object} tags
   */
  increment(name: string, tags?: Object): void;
  
  /**
   * Get metric summary
   * @param {string} name
   * @returns {Object} Stats
   */
  getSummary(name: string): Object;
  
  /**
   * Export all metrics
   * @returns {Object}
   */
  export(): Object;
}
```

#### 5.3 ErrorTracker (`error-tracker.js`)

**Rôle:** Track and analyze errors

**API:**

```javascript
class ErrorTracker {
  /**
   * Track error occurrence
   * @param {Error} error
   * @param {Object} context
   */
  track(error: Error, context?: Object): void;
  
  /**
   * Get error statistics
   * @returns {Object}
   */
  getStats(): Object;
  
  /**
   * Get recent errors
   * @param {number} limit
   * @returns {Array}
   */
  getRecent(limit: number): Array;
}
```

---

## 6. Integration Worker

**Location:** `src/byan-v2/integration/`

**Responsabilité:** Intégrations avec systèmes externes

**Status:** Module présent, implémentations futures

**Planned Integrations:**
- GitHub API (import agents from repos)
- NPM registry (import from packages)
- Claude/OpenAI (advanced analysis)
- Vector DB (knowledge base)

---

## Architecture & Communication

### Worker Communication Pattern

```javascript
// ByanV2 Core orchestrates all workers

class ByanV2 {
  constructor(config) {
    // Initialize workers
    this.sessionState = new SessionState();
    this.stateMachine = new StateMachine('INIT');
    this.logger = new Logger('byan-v2');
    this.metrics = new MetricsCollector();
    
    // Orchestrator workers
    this.interviewState = new InterviewState(this.sessionState);
    this.analysisState = new AnalysisState();
    this.generationState = new GenerationState();
    
    // Dispatcher workers
    this.taskRouter = new TaskRouter(config);
    
    // Generation workers
    this.profileTemplate = new ProfileTemplate();
    this.validator = new AgentProfileValidator();
  }
  
  async startSession() {
    // 1. Context: Initialize session
    this.sessionState.initialize();
    
    // 2. Orchestrator: Transition to INTERVIEW
    this.stateMachine.transition('INTERVIEW');
    
    // 3. Observability: Log & metrics
    this.logger.info('Session started');
    this.metrics.increment('sessions_started');
  }
  
  async getNextQuestion() {
    // Orchestrator: Ask question
    const question = this.interviewState.askNextQuestion();
    
    // Observability: Log
    this.logger.debug('Question asked', { question });
    
    return question;
  }
  
  async submitResponse(response) {
    // Context: Store response
    this.sessionState.addResponse(response);
    
    // Dispatcher: Route if complex
    if (this.taskRouter.shouldDelegate(response)) {
      response = await this.taskRouter.route(response);
    }
    
    // Orchestrator: Process response
    const complete = this.interviewState.processResponse(response);
    
    // Transition if complete
    if (complete) {
      this.stateMachine.transition('ANALYSIS');
    }
  }
  
  async generateProfile() {
    // Orchestrator: Analyze
    this.stateMachine.transition('ANALYSIS');
    const analysis = await this.analysisState.analyze(
      this.interviewState.getAllResponses()
    );
    
    // Orchestrator: Generate
    this.stateMachine.transition('GENERATION');
    this.generationState = new GenerationState(analysis);
    const profile = await this.generationState.generateProfile();
    
    // Generation: Validate
    const validation = await this.validator.validateProfile(profile);
    if (!validation.valid) {
      throw new Error('Invalid profile generated');
    }
    
    // Context: Save
    await this.sessionState.save();
    
    // Orchestrator: Complete
    this.stateMachine.transition('COMPLETED');
    
    // Observability: Metrics
    this.metrics.increment('profiles_generated');
    
    return profile;
  }
}
```

### Data Flow

```
User Input
    ↓
SessionState (Context) → Store
    ↓
ComplexityScorer (Dispatcher) → Analyze
    ↓
TaskRouter (Dispatcher) → Route
    ↓
LocalExecutor | TaskTool → Execute
    ↓
InterviewState (Orchestrator) → Process
    ↓
[Repeat until interview complete]
    ↓
AnalysisState (Orchestrator) → Extract concepts
    ↓
GenerationState (Orchestrator) → Select template
    ↓
ProfileTemplate (Generation) → Render
    ↓
AgentProfileValidator (Generation) → Validate
    ↓
SessionState (Context) → Save
    ↓
Logger/Metrics (Observability) → Track
    ↓
Agent Profile Output
```

---

## Testing

Chaque worker a sa suite de tests:

```
__tests__/byan-v2/
  ├── context/
  │   ├── copilot-context.test.js
  │   └── session-state.test.js
  ├── dispatcher/
  │   ├── complexity-scorer.test.js
  │   ├── task-router.test.js
  │   └── local-executor.test.js
  ├── generation/
  │   ├── profile-template.test.js
  │   └── agent-profile-validator.test.js
  ├── orchestrator/
  │   ├── state-machine.test.js
  │   ├── interview-state.test.js
  │   ├── analysis-state.test.js
  │   └── generation-state.test.js
  ├── observability/
  │   ├── logger.test.js
  │   ├── metrics-collector.test.js
  │   └── error-tracker.test.js
  └── integration/
      └── full-flow.test.js
```

**Coverage:** 881/881 tests passing (100%)

---

## Configuration

**File:** `_byan/config.yaml`

```yaml
# Context Worker
context:
  session_timeout: 1800  # 30 minutes
  auto_save: true
  backup_retention: 10

# Dispatcher Worker
dispatcher:
  complexity_thresholds:
    low: 0.3
    medium: 0.6
  enable_delegation: true
  fallback_strategy: local

# Generation Worker
generation:
  default_template: default-agent
  output_dir: _byan-output
  validate_on_generate: true

# Observability Worker
observability:
  log_level: info  # debug | info | warn | error
  metrics_enabled: true
  error_tracking: true
```

---

## Performance

### Benchmarks

| Worker | Avg Time | Max Time |
|--------|----------|----------|
| Context | < 10ms | 50ms |
| Dispatcher | < 100ms | 500ms |
| Generation | < 200ms | 1s |
| Orchestrator | < 50ms | 200ms |
| Observability | < 1ms | 10ms |

**Total interview flow:** ~2 seconds (12 questions automated)

---

## Roadmap

### Planned Enhancements

**Context Worker:**
- [ ] Multi-user session support
- [ ] Distributed session storage (Redis)
- [ ] Session replay for debugging

**Dispatcher Worker:**
- [ ] ML-based complexity scoring
- [ ] Adaptive routing based on feedback
- [ ] Parallel task execution

**Generation Worker:**
- [ ] Multi-language templates (FR, ES, DE)
- [ ] Custom template creation wizard
- [ ] Agent versioning system

**Orchestrator Worker:**
- [ ] Workflow branching (conditional paths)
- [ ] Resume interrupted sessions
- [ ] Collaborative interviews

**Observability Worker:**
- [ ] OpenTelemetry integration
- [ ] Grafana dashboards
- [ ] Alert system

**Integration Worker:**
- [ ] GitHub API integration
- [ ] NPM package importer
- [ ] LLM provider abstraction

---

## References

- Main class: `src/byan-v2/index.js`
- Workflows: `_byan/workflows/`
- Tests: `__tests__/byan-v2/`
- Config: `_byan/config.yaml`

---

**Status:** ✅ OPERATIONAL  
**Test Coverage:** 881/881 (100%)  
**Version:** 2.0.0  
**Last Updated:** 2026-02-07  
**Maintainer:** BYAN v2 Team
