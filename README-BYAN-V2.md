# BYAN v2.0 - Intelligent Agent Creator for GitHub Copilot CLI

**BYAN** (Builder of YAN) v2.0 is a specialized GitHub Copilot CLI agent that creates custom AI agents through intelligent, structured interviews.

## 🎯 What is BYAN?

BYAN guides you through a conversational interview to understand your needs, then automatically generates production-ready agent profiles for GitHub Copilot CLI. It applies **Merise Agile + TDD methodology** with **64 core mantras** to ensure quality and consistency.

### Key Features

#### Core Capabilities
- **Intelligent Interview System**: 4-phase structured interview (Context → Business → Agent Needs → Validation)
- **Automatic Profile Generation**: Creates `.md` agent files with YAML frontmatter + agent specifications
- **Built-in Validation**: Validates agent profiles against GitHub Copilot CLI requirements
- **Template System**: Flexible templates with placeholder resolution
- **Quality Enforcement**: Mantra IA-23 (Zero Emoji Pollution), clean code principles
- **State Machine Workflow**: INTERVIEW → ANALYSIS → GENERATION → COMPLETED

#### 🆕 BMAD Features (v2.1.0)

**NEW: 4 Advanced Modules for Enhanced Agent Creation**

1. **📚 Glossary Builder**
   - Auto-builds domain-specific glossaries during interviews
   - Validates definition clarity (min score: 0.7)
   - Auto-triggers for complex domains (ecommerce, finance, healthcare)
   - Suggests related concepts based on context
   - **Tests**: 86/86 passing

2. **🔍 Five Whys Analyzer**
   - Automated root cause analysis using "5 Whys" technique
   - Detects pain points with 10+ keywords
   - Asks up to 5 sequential WHY questions
   - Early root cause detection at depth 3+
   - Categorizes causes (technical/process/people/resource)
   - **Tests**: 93/93 passing

3. **👂 Active Listener**
   - Intelligent response processing with reformulation
   - Automatic reformulation every 3rd response
   - Validates confirmations and detects ambiguity
   - Analyzes session patterns
   - Generates session summaries with insights
   - **Tests**: 124/124 passing

4. **✅ Mantras Validator**
   - Validates agents against 64 BMAD/IA mantras
   - Category-based validation (Philosophy, Process, Quality, AI-Specific)
   - Compliance scoring (target: 80%+)
   - Detailed violation reports
   - Self-validating (meta!)
   - **Tests**: 67/67 passing

**Total BMAD Tests**: 417/417 passing (100%)

See [BMAD-QUICK-REFERENCE.md](./BMAD-QUICK-REFERENCE.md) for usage examples.

## 📦 Installation

### Option 1: Via NPM (Recommandé)

```bash
# Installation globale
npm install -g create-byan-agent

# OU utilisation directe avec npx
npx create-byan-agent
```

### Option 2: Via Git (Pour Développement)

```bash
# Cloner le repository
git clone <repository-url>
cd <repository-directory>

# Installer les dépendances
npm install

# Lancer les tests
npm test
```

## 🎬 Quick Start

### Utilisation via NPX

```bash
# Créer un agent interactivement
npx create-byan-agent

# Ou utiliser l'API
node -e "
const ByanV2 = require('create-byan-agent');
const byan = new ByanV2();
byan.startSession().then(() => {
  console.log('BYAN démarré!');
});
"
```

### Utilisation Programmatique

```javascript
const ByanV2 = require('create-byan-agent');

// Créer une instance
const byan = new ByanV2({
  maxQuestions: 12,
  outputDir: './_bmad-output/bmb-creations'
});

// Démarrer une session
await byan.startSession();

// Obtenir une question
const question = await byan.getNextQuestion();
console.log(question.text);

// Soumettre une réponse
await byan.submitResponse('Ma réponse');

// Continuer jusqu'à complétion...
```
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
const ByanV2 = require('create-byan-agent');

async function createCodeReviewAgent() {
  const byan = new ByanV2();
  
  await byan.startSession();
  
  // Answer interview questions
  const responses = [
    'code-review-assistant',
    'An agent that reviews code for bugs and best practices',
    'Software Development',
    'Small team (1-5)',
    'Yes',
    'Code analysis, bug detection, best practices',
    'Professional and constructive',
    'Static analysis, pattern detection',
    'Markdown reports with examples',
    'Medium complexity',
    'Yes',
    'Yes'
  ];
  
  for (const response of responses) {
    await byan.submitResponse(response);
  }
  
  const profile = await byan.generateProfile();
  console.log('✅ Agent created:', profile.filePath);
}

createCodeReviewAgent();
```

### Example 2: With BMAD Features

```javascript
const ByanV2 = require('create-byan-agent');

async function createWithBMAD() {
  const byan = new ByanV2({
    bmad_features: {
      glossary_builder: { enabled: true },
      five_whys: { enabled: true },
      active_listener: { enabled: true },
      mantras_validator: { enabled: true }
    }
  });
  
  await byan.startSession();
  
  // Start glossary for ecommerce domain
  const glossary = byan.startGlossary('ecommerce');
  byan.addConcept('Order', 'A customer purchase request...');
  
  // Detect pain points
  const detection = byan.detectPainPoints('Slow checkout process');
  if (detection.needsWhys) {
    const question = byan.askWhy();
    // ... 5 Whys analysis
  }
  
  // Generate and validate
  const profile = await byan.generateProfile();
  const validation = byan.validateAgent(profile.content);
  
  console.log(`Score: ${validation.score * 100}%`);
}

createWithBMAD();
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

**Current Test Status**: 
- **Total**: 1,308 tests passing (100%)
- **Core v2.0**: 891/891 passing
- **BMAD v2.1**: 417/417 passing
- **Coverage**: 95%+

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
