# BYAN v2.0 API Documentation

Complete API reference for BYAN v2.0 classes and methods.

## Table of Contents

- [ByanV2](#byanv2)
- [SessionState](#sessionstate)
- [StateMachine](#statemachine)
- [AgentProfileValidator](#agentprofilevalidator)
- [ProfileTemplate](#profiletemplate)
- [TaskRouter](#taskrouter)
- [Logger](#logger)
- [MetricsCollector](#metricscollector)

---

## ByanV2

Main class orchestrating BYAN v2 workflow.

### Constructor

```javascript
new ByanV2(config?: object)
```

**Parameters:**
- `config` (optional): Configuration object
  - `sessionId`: Custom session ID (default: auto-generated UUID)
  - `maxQuestions`: Max interview questions (default: 12)
  - `outputDir`: Output directory for agents (default: `./_bmad-output/bmb-creations`)
  - `env`: Environment ('copilot' or 'standalone')
  - `complexityThresholds`: { low: number, medium: number }
  - `sessionState`, `logger`, `stateMachine`: Dependency injection for testing

**Example:**
```javascript
const byan = new ByanV2({
  maxQuestions: 15,
  outputDir: './my-agents'
});
```

### startSession()

Start new interview session and transition to INTERVIEW state.

```javascript
async startSession(): Promise<string>
```

**Returns:** Session ID

**Example:**
```javascript
const sessionId = await byan.startSession();
console.log('Session started:', sessionId);
```

### getNextQuestion()

Get next interview question in current phase.

```javascript
async getNextQuestion(): Promise<string>
```

**Returns:** Question text

**Throws:** Error if not in INTERVIEW state

**Example:**
```javascript
const question = await byan.getNextQuestion();
console.log('Q:', question);
```

### submitResponse(response)

Submit response to current question.

```javascript
async submitResponse(response: string): Promise<{ success: boolean }>
```

**Parameters:**
- `response`: User response (non-empty string)

**Returns:** { success: true }

**Throws:** Error if response is empty

**Example:**
```javascript
await byan.submitResponse('My agent will review code');
```

### generateProfile()

Generate agent profile after completing interview.

```javascript
async generateProfile(): Promise<string>
```

**Returns:** Generated profile content (markdown)

**Throws:** Error if called before interview completion

**Example:**
```javascript
const profile = await byan.generateProfile();
fs.writeFileSync('agent.md', profile);
```

### endSession()

End current session and transition to COMPLETED state.

```javascript
async endSession(): Promise<{ success: boolean }>
```

**Returns:** { success: true }

**Example:**
```javascript
await byan.endSession();
```

### getMetricsSummary()

Get session metrics summary.

```javascript
getMetricsSummary(): object
```

**Returns:**
```javascript
{
  totalSessions: number,
  avgQuestionsPerSession: number,
  successRate: number,
  delegationRate: number,
  questionsAsked: number,
  profilesGenerated: number,
  errors: number
}
```

**Example:**
```javascript
const metrics = byan.getMetricsSummary();
console.log('Sessions:', metrics.totalSessions);
```

### getSessionSummary()

Get current session summary.

```javascript
async getSessionSummary(): Promise<object>
```

**Returns:**
```javascript
{
  sessionId: string,
  questionsAsked: number,
  state: string,
  timestamp: string (ISO 8601)
}
```

**Example:**
```javascript
const summary = await byan.getSessionSummary();
console.log('State:', summary.state);
```

### isCopilotContext()

Check if running in GitHub Copilot CLI context.

```javascript
isCopilotContext(): boolean
```

**Returns:** true if Copilot CLI environment detected

**Example:**
```javascript
if (byan.isCopilotContext()) {
  console.log('Running in Copilot CLI');
}
```

---

## SessionState

Manages session state and user responses.

### Constructor

```javascript
new SessionState(sessionId: string)
```

**Parameters:**
- `sessionId`: Unique session identifier

### addQuestion(question)

Add question to history.

```javascript
addQuestion(question: string): void
```

### addResponse(response)

Add user response to history.

```javascript
addResponse(response: string): void
```

### setAnalysisResults(results)

Store analysis results.

```javascript
setAnalysisResults(results: object): void
```

### Properties

- `sessionId`: string - Session ID
- `currentState`: string - Current state name
- `questionHistory`: string[] - All questions asked
- `userResponses`: string[] - All user responses
- `analysisResults`: object - Analysis results
- `agentProfileDraft`: string - Draft agent profile

---

## StateMachine

Manages workflow state transitions.

### Constructor

```javascript
new StateMachine(options?: { logger, errorTracker })
```

**Parameters:**
- `options.logger`: Logger instance (optional)
- `options.errorTracker`: ErrorTracker instance (optional)

### transition(newState)

Transition to new state.

```javascript
async transition(newState: string): Promise<void>
```

**Parameters:**
- `newState`: Target state ('INTERVIEW', 'ANALYSIS', 'GENERATION', 'COMPLETED', 'ERROR')

**Throws:** Error if transition is invalid

**Example:**
```javascript
await stateMachine.transition('ANALYSIS');
```

### getCurrentState()

Get current state metadata.

```javascript
getCurrentState(): { name: string, timestamp: number, attempts: number }
```

**Returns:** State metadata object

**Example:**
```javascript
const state = stateMachine.getCurrentState();
console.log('Current state:', state.name);
```

### onStateEnter(stateName, callback)

Register callback for state entry.

```javascript
onStateEnter(stateName: string, callback: Function): void
```

**Example:**
```javascript
stateMachine.onStateEnter('ANALYSIS', () => {
  console.log('Entering analysis');
});
```

### onStateExit(stateName, callback)

Register callback for state exit.

```javascript
onStateExit(stateName: string, callback: Function): void
```

---

## AgentProfileValidator

Validates agent profile files.

### Constructor

```javascript
new AgentProfileValidator()
```

### validate(profileContent)

Validate complete agent profile.

```javascript
validate(profileContent: string): { valid: boolean, errors: string[], warnings: string[] }
```

**Returns:**
- `valid`: true if profile is valid
- `errors`: Array of error messages (blocks validation)
- `warnings`: Array of warning messages (non-blocking)

**Validation Rules:**
- YAML frontmatter required with `name` and `description`
- Name format: lowercase, alphanumeric, hyphens only
- Description: 10-200 characters
- No emojis (Mantra IA-23)
- File size < 50KB
- At least one capabilities section

**Example:**
```javascript
const validator = new AgentProfileValidator();
const result = validator.validate(profileContent);

if (!result.valid) {
  console.error('Errors:', result.errors);
}
if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

### validateYamlFrontmatter(content)

Validate YAML frontmatter only.

```javascript
validateYamlFrontmatter(content: string): { valid: boolean, errors: string[], data: object }
```

### validateNameFormat(name)

Check if name follows format rules.

```javascript
validateNameFormat(name: string): boolean
```

**Returns:** true if valid (lowercase, alphanumeric, hyphens)

### validateDescriptionLength(description)

Check description length.

```javascript
validateDescriptionLength(description: string): boolean
```

**Returns:** true if 10-200 characters

### detectEmojis(text)

Detect emoji characters (Mantra IA-23).

```javascript
detectEmojis(text: string): boolean
```

**Returns:** true if emojis found

### checkFileSize(content)

Check file size limit.

```javascript
checkFileSize(content: string): boolean
```

**Returns:** true if size <= 50KB

### hasCapabilitiesSection(content)

Check for capabilities section.

```javascript
hasCapabilitiesSection(content: string): boolean
```

**Returns:** true if section found

---

## ProfileTemplate

Template rendering system with placeholder resolution.

### render(template, data)

Render template string with data.

```javascript
static render(template: string, data: object): string
```

**Parameters:**
- `template`: Template string with `{{placeholder}}` syntax
- `data`: Data object for placeholder resolution

**Returns:** Rendered template

**Example:**
```javascript
const template = 'Agent: {{name}}, Role: {{role}}';
const data = { name: 'CodeReviewer', role: 'Reviewer' };
const result = ProfileTemplate.render(template, data);
// "Agent: CodeReviewer, Role: Reviewer"
```

### loadTemplate(templateName)

Load template from file.

```javascript
static loadTemplate(templateName: string): string
```

**Parameters:**
- `templateName`: Template filename (without .md extension)

**Returns:** Template content

**Throws:** Error if template not found

**Example:**
```javascript
const template = ProfileTemplate.loadTemplate('default-agent');
```

### renderFromFile(templateName, data)

Load and render template in one call.

```javascript
static renderFromFile(templateName: string, data: object): string
```

**Example:**
```javascript
const profile = ProfileTemplate.renderFromFile('default-agent', {
  agent_name: 'my-agent',
  description: 'My custom agent'
});
```

### validateTemplate(template, requiredPlaceholders)

Validate template structure.

```javascript
static validateTemplate(
  template: string,
  requiredPlaceholders?: string[]
): { valid: boolean, errors: string[], warnings: string[] }
```

**Parameters:**
- `template`: Template content
- `requiredPlaceholders`: Array of required placeholder names (optional)

**Returns:** Validation result

**Example:**
```javascript
const result = ProfileTemplate.validateTemplate(template, ['agent_name', 'description']);
```

### extractPlaceholders(template)

Extract all placeholders from template.

```javascript
static extractPlaceholders(template: string): string[]
```

**Returns:** Array of unique placeholder names

**Example:**
```javascript
const placeholders = ProfileTemplate.extractPlaceholders('{{name}} {{role}}');
// ['name', 'role']
```

### resolvePlaceholder(path, data)

Resolve single placeholder with dot notation support.

```javascript
static resolvePlaceholder(path: string, data: object): any
```

**Parameters:**
- `path`: Placeholder path (supports `obj.prop` and `array.0`)
- `data`: Data object

**Returns:** Resolved value or undefined

**Example:**
```javascript
const data = { user: { name: 'John' }, tags: ['a', 'b'] };
ProfileTemplate.resolvePlaceholder('user.name', data); // 'John'
ProfileTemplate.resolvePlaceholder('tags.0', data); // 'a'
```

---

## TaskRouter

Routes tasks based on complexity scoring.

### Constructor

```javascript
new TaskRouter()
```

### routeTask(task)

Route task to appropriate executor.

```javascript
routeTask(task: { prompt: string, type?: string, metadata?: object }): object
```

**Returns:**
```javascript
{
  executor: 'task' | 'local',
  agentType?: 'task' | 'explore' | 'general-purpose',
  prompt?: string,
  complexity: number,
  reasoning: string
}
```

**Example:**
```javascript
const router = new TaskRouter();
const decision = router.routeTask({
  prompt: 'Review this code',
  type: 'code-review'
});
console.log('Route to:', decision.executor);
```

---

## Logger

Winston-based structured logging.

### Constructor

```javascript
new Logger(options?: { logDir, logFile, consoleOutput, level })
```

### info(message, data)

Log info level message.

```javascript
info(message: string, data?: object): void
```

### warn(message, data)

Log warning message.

```javascript
warn(message: string, data?: object): void
```

### error(message, data)

Log error message.

```javascript
error(message: string, data?: object): void
```

**Example:**
```javascript
const logger = new Logger();
logger.info('Task completed', { duration: 1234, success: true });
```

---

## MetricsCollector

Track task execution and session metrics.

### Constructor

```javascript
new MetricsCollector()
```

### increment(counterName, amount)

Increment counter by name.

```javascript
increment(counterName: string, amount?: number): void
```

**Counters:**
- `sessionsStarted`
- `questionsAsked`
- `analysesCompleted`
- `profilesGenerated`
- `errors`

**Example:**
```javascript
const metrics = new MetricsCollector();
metrics.increment('sessionsStarted');
metrics.increment('questionsAsked', 5);
```

### getSummary()

Get metrics summary.

```javascript
getSummary(): object
```

**Returns:**
```javascript
{
  totalSessions: number,
  avgQuestionsPerSession: number,
  successRate: number,
  delegationRate: number,
  // ... all counters
}
```

### reset()

Reset all metrics.

```javascript
reset(): void
```

---

## Error Handling

All async methods can throw errors. Wrap in try-catch:

```javascript
try {
  await byan.startSession();
} catch (error) {
  console.error('Failed to start session:', error.message);
}
```

Common errors:
- `Response cannot be empty` - submitResponse() with empty string
- `Not in INTERVIEW state` - getNextQuestion() in wrong state
- `Cannot generate profile in current state` - generateProfile() before interview complete
- `Invalid transition from X to Y` - StateMachine invalid transition

---

## TypeScript Support

BYAN v2 is written in JavaScript. For TypeScript projects, create type definitions:

```typescript
declare module './src/byan-v2' {
  export default class ByanV2 {
    constructor(config?: ByanConfig);
    startSession(): Promise<string>;
    getNextQuestion(): Promise<string>;
    submitResponse(response: string): Promise<{ success: boolean }>;
    generateProfile(): Promise<string>;
    // ... etc
  }
  
  export interface ByanConfig {
    sessionId?: string;
    maxQuestions?: number;
    outputDir?: string;
    env?: 'copilot' | 'standalone';
  }
}
```

---

**Version**: 2.0.0-alpha  
**Last Updated**: 2026-02-06
