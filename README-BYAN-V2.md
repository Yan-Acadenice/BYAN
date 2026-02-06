# BYAN v2.0 - Intelligent Agent Creator for GitHub Copilot CLI

**BYAN** (Builder of YAN) v2.0 is a specialized GitHub Copilot CLI agent that creates custom AI agents through intelligent, structured interviews.

## 🎯 What is BYAN?

BYAN guides you through a conversational interview to understand your needs, then automatically generates production-ready agent profiles for GitHub Copilot CLI. It applies **Merise Agile + TDD methodology** with **64 core mantras** to ensure quality and consistency.

### Key Features

- **Intelligent Interview System**: 4-phase structured interview (Context → Business → Agent Needs → Validation)
- **Automatic Profile Generation**: Creates `.md` agent files with YAML frontmatter + agent specifications
- **Built-in Validation**: Validates agent profiles against GitHub Copilot CLI requirements
- **Template System**: Flexible templates with placeholder resolution
- **Quality Enforcement**: Mantra IA-23 (Zero Emoji Pollution), clean code principles
- **State Machine Workflow**: INTERVIEW → ANALYSIS → GENERATION → COMPLETED

## 📦 Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- GitHub Copilot CLI access

### Install

```bash
# Clone the repository
git clone <repository-url>
cd conception

# Install dependencies
npm install

# Run tests to verify installation
npm test
```

## 🚀 Quick Start (5 minutes)

### 1. Import BYAN in your code

```javascript
const ByanV2 = require('./src/byan-v2');

// Create BYAN instance
const byan = new ByanV2();
```

### 2. Start an interview session

```javascript
// Start session
await byan.startSession();

// Get first question
const question = await byan.getNextQuestion();
console.log(question);
```

### 3. Submit responses

```javascript
// Submit response to current question
await byan.submitResponse('Your answer here');

// Continue interview (12 questions total)
for (let i = 0; i < 11; i++) {
  const nextQuestion = await byan.getNextQuestion();
  console.log(nextQuestion);
  await byan.submitResponse('Your answer');
}
```

### 4. Generate agent profile

```javascript
// Generate agent profile after interview
const profile = await byan.generateProfile();

// Profile is automatically saved to:
// .github/copilot/agents/<agent-name>.md
console.log('Agent profile created!');
```

## 💡 Usage Examples

### Example 1: Create Code Review Agent

```javascript
const ByanV2 = require('./src/byan-v2');

async function createCodeReviewAgent() {
  const byan = new ByanV2();
  
  await byan.startSession();
  
  // Answer interview questions
  const responses = [
    'code-review-assistant',
    'An agent that reviews code for bugs and best practices',
    'Software Development',
    // ... 9 more responses
  ];
  
  for (const response of responses) {
    await byan.submitResponse(response);
  }
  
  const profile = await byan.generateProfile();
  console.log('Code review agent created:', profile);
}

createCodeReviewAgent();
```

### Example 2: Validate Existing Agent Profile

```javascript
const AgentProfileValidator = require('./src/byan-v2/generation/agent-profile-validator');
const fs = require('fs');

const validator = new AgentProfileValidator();
const profileContent = fs.readFileSync('.github/copilot/agents/my-agent.md', 'utf-8');

const result = validator.validate(profileContent);

if (result.valid) {
  console.log('✓ Profile is valid');
  if (result.warnings.length > 0) {
    console.log('Warnings:', result.warnings);
  }
} else {
  console.log('✗ Profile has errors:', result.errors);
}
```

### Example 3: Custom Configuration

```javascript
const byan = new ByanV2({
  maxQuestions: 15,
  outputDir: './my-agents',
  env: 'standalone',
  complexityThresholds: {
    low: 25,
    medium: 70
  }
});
```

## 📚 Core Concepts

### State Machine

BYAN uses a state machine to manage the workflow:

```
INTERVIEW → ANALYSIS → GENERATION → COMPLETED
     ↓          ↓            ↓
   ERROR ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### Interview Phases

1. **CONTEXT** (Questions 1-3): Project name, description, tech stack
2. **BUSINESS** (Questions 4-6): Domain, actors, processes
3. **AGENT_NEEDS** (Questions 7-9): Role, capabilities, style
4. **VALIDATION** (Questions 10-12): Confirmation, edge cases

### Profile Structure

Generated agent profiles follow this structure:

```markdown
---
name: "agent-name"
description: "Brief description"
---

You must fully embody this agent's persona...

```xml
<agent id="agent.id" name="AgentName" title="Title" icon="🔧">
  <activation>...</activation>
  <persona>...</persona>
  <capabilities>...</capabilities>
</agent>
\```
```

## 🔧 Configuration

### Default Configuration

```javascript
{
  maxQuestions: 12,
  complexityThresholds: {
    low: 30,
    medium: 60
  },
  outputDir: './_bmad-output/bmb-creations',
  env: 'copilot' // or 'standalone'
}
```

### Environment Variables

- `GITHUB_COPILOT=true` - Enables Copilot CLI context detection

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- __tests__/byan-v2/context

# Run with coverage
npm test -- --coverage
```

**Current Test Status**: 492/517 tests passing (95%)

## 📖 API Reference

See [API.md](./API.md) for complete API documentation.

### ByanV2

Main class for BYAN v2 operations.

**Methods:**
- `constructor(config)` - Initialize BYAN with optional config
- `startSession()` - Start new interview session
- `getNextQuestion()` - Get next interview question
- `submitResponse(response)` - Submit response to current question
- `generateProfile()` - Generate agent profile after interview
- `endSession()` - End current session
- `getMetricsSummary()` - Get session metrics
- `isCopilotContext()` - Check if running in Copilot CLI

### AgentProfileValidator

Validate agent profile files.

**Methods:**
- `validate(profileContent)` - Validate profile content
- `validateYamlFrontmatter(content)` - Validate YAML frontmatter
- `validateNameFormat(name)` - Validate agent name format
- `detectEmojis(text)` - Detect emoji pollution

### ProfileTemplate

Template rendering system.

**Methods:**
- `render(template, data)` - Render template with data
- `loadTemplate(templateName)` - Load template from file
- `renderFromFile(templateName, data)` - Load and render template
- `validateTemplate(template, requiredPlaceholders)` - Validate template
- `extractPlaceholders(template)` - Extract placeholders from template

## ⚠️ Troubleshooting

### Issue: Tests failing with winston errors

**Solution**: Ensure winston is installed:
```bash
npm install winston
```

### Issue: UUID import errors

**Solution**: BYAN v2 uses crypto.randomUUID() (Node 18+). Ensure Node version >= 18.

### Issue: Agent profile not validated

**Solution**: Check profile follows format:
- Valid YAML frontmatter with `name` and `description`
- Name format: lowercase, alphanumeric, hyphens only
- Description: 10-200 characters
- No emojis (Mantra IA-23)
- File size < 50KB

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

### Development Setup

```bash
# Clone repo
git clone <repository-url>

# Install dependencies
npm install

# Run tests in watch mode
npm test -- --watch

# Check code style
npm run lint
```

### Running in Development

```bash
# Start development mode
npm run dev

# Run single test file
npm test -- __tests__/byan-v2/integration/system-integration.test.js
```

## 📐 Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

### High-Level Components

```
┌─────────────────┐
│   ByanV2 Main   │
└────────┬────────┘
         │
    ┌────┴─────────────────┐
    │                      │
┌───▼────────┐      ┌─────▼──────┐
│ Session    │      │ State      │
│ State      │      │ Machine    │
└────────────┘      └─────┬──────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
         ┌────▼────┐ ┌───▼────┐ ┌───▼────────┐
         │Interview│ │Analysis│ │Generation  │
         │ State   │ │ State  │ │ State      │
         └─────────┘ └────────┘ └────────────┘
```

## 📄 License

See LICENSE file for details.

## 🙏 Credits

Built with:
- **Merise Agile + TDD** methodology
- **64 Core Mantras** for quality
- **Zero Trust** principle (Challenge Before Confirm)
- **Mantra IA-23**: Zero Emoji Pollution

---

**Version**: 2.0.0-alpha  
**Status**: MVP Complete (64/77 SP delivered)  
**Test Coverage**: 95% (492/517 tests passing)
