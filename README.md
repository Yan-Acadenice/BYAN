# BYAN v2.3.2 - Build Your AI Network

[![npm version](https://img.shields.io/npm/v/create-byan-agent.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-1308%2F1308-brightgreen.svg)](https://github.com/yannsix/byan-v2)
[![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org)

**🏛️ Intelligent AI Agent Ecosystem** | Powered by Merise Agile + TDD + 64 Mantras

Create custom AI agents through intelligent interviews + **Hermes Universal Dispatcher** for intelligent routing across 35+ specialized agents.

### 🎯 New in v2.3.2: Hermes - Universal Dispatcher

**One entry point to rule them all** 🏛️

```bash
@hermes          # → Menu-driven navigation to 35+ agents
@hermes @dev     # → Direct invocation  
@hermes rec créer API backend  # → Smart routing
@hermes pipe feature complète  # → Multi-agent pipelines
```

**Features:**
- 🎯 **Smart Routing**: Describe your task → Hermes recommends best agents
- 🔗 **Pipelines**: Pre-configured multi-agent workflows (Feature Complete, Bug Fix, etc.)
- 📋 **Agent Directory**: Browse 35+ agents organized by module (core, bmm, bmb, cis, tea)
- 💰 **Cost Optimizer**: 87.5% LLM cost savings (optional integration)
- 🌐 **Multi-Platform**: GitHub Copilot CLI, Claude Code, Codex
- 🪶 **Node 12+ Compatible**: Works on legacy servers

[→ Full Hermes Guide](./install/HERMES-GUIDE.md)

---

## 🚀 Quick Start

### Install & Run

```bash
# Using npx (recommended - no installation needed)
npx create-byan-agent

# Or install globally
npm install -g create-byan-agent

# Then run
create-byan-agent
```

### Programmatic Usage

```javascript
const ByanV2 = require('create-byan-agent');

const byan = new ByanV2({
  maxQuestions: 12,
  outputDir: './_byan-output'
});

await byan.startSession();

// Interactive interview (12 questions)
while (!byan.isComplete()) {
  const question = byan.getNextQuestion();
  const answer = await getUserInput(question.text);
  await byan.submitResponse(answer);
}

// Generate agent profile
const profile = await byan.generateProfile();
console.log('Agent created:', profile.filePath);
```

---

## ✨ What's New in v2.1.0

### 4 New BMAD Modules

**📚 Glossary Builder** - Auto-builds domain vocabularies
- Auto-triggers for complex domains (ecommerce, finance, healthcare)
- Validates definition clarity (min 70%)
- Suggests related concepts

**🔍 Five Whys Analyzer** - Root cause analysis
- Detects pain points automatically
- 5 sequential WHY questions
- Categorizes causes (technical/process/people/resource)

**👂 Active Listener** - Intelligent response processing
- Auto-reformulation every 3rd response
- Validates confirmations
- Session summaries with insights

**✅ Mantras Validator** - Quality validation
- 64 BMAD/IA mantras
- Compliance scoring (target: 80%+)
- Category-based validation

**417 new tests** | **100% passing** | **95%+ coverage** | **< 10% overhead**

---

## 🎯 Features

### Core Capabilities

- **Intelligent 4-Phase Interview**: Context → Business → Agent Needs → Validation
- **Automatic Profile Generation**: Creates `.md` agent files with YAML frontmatter
- **Built-in Validation**: Validates against GitHub Copilot CLI requirements
- **Template System**: Flexible templates with placeholder resolution
- **Quality Enforcement**: Zero emoji policy, clean code principles
- **State Machine Workflow**: INTERVIEW → ANALYSIS → GENERATION → COMPLETED

### Advanced BMAD Features (v2.1.0)

- **Domain Glossaries**: Auto-build glossaries with clarity validation
- **Root Cause Analysis**: 5 Whys technique for pain point analysis
- **Active Listening**: Intelligent reformulation and validation
- **Mantra Validation**: 64 mantras compliance checking

### 100% Backwards Compatible

All v2.0.0 code works unchanged in v2.1.0. BMAD features are opt-in.

---

## 📖 Usage Examples

### Example 1: Basic Agent Creation

```javascript
const ByanV2 = require('create-byan-agent');

async function createAgent() {
  const byan = new ByanV2();
  await byan.startSession();
  
  // Answer 12 interview questions
  await byan.submitResponse('code-review-assistant');
  await byan.submitResponse('Reviews code for bugs and best practices');
  // ... 10 more responses
  
  const profile = await byan.generateProfile();
  console.log('✅ Agent created');
}
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
  
  // Glossary auto-triggers for complex domains
  const glossary = byan.startGlossary('ecommerce');
  byan.addConcept('Order', 'Customer purchase request...');
  
  // Pain point detection
  const detection = byan.detectPainPoints('Slow checkout');
  if (detection.needsWhys) {
    const question = byan.askWhy();
    // ... 5 Whys analysis
  }
  
  // Generate and validate
  const profile = await byan.generateProfile();
  const validation = byan.validateAgent(profile.content);
  
  console.log(`Score: ${validation.score * 100}%`);
}
```

### Example 3: Validate Existing Agent

```javascript
const ByanV2 = require('create-byan-agent');
const fs = require('fs');

const byan = new ByanV2({
  bmad_features: {
    mantras_validator: { enabled: true }
  }
});

const agentContent = fs.readFileSync('my-agent.md', 'utf-8');
const validation = byan.validateAgent(agentContent);

console.log(`Compliance: ${validation.score * 100}%`);
console.log(`Compliant: ${validation.compliant.length}/64`);
console.log(`Non-compliant: ${validation.nonCompliant.length}/64`);
```

---

## 🔧 Configuration

### Basic Configuration

```javascript
const byan = new ByanV2({
  maxQuestions: 12,
  outputDir: './_byan-output/bmb-creations',
  sessionId: 'my-session'
});
```

### BMAD Configuration

```javascript
const byan = new ByanV2({
  bmad_features: {
    glossary_builder: {
      enabled: true,
      auto_trigger_domains: ['ecommerce', 'finance', 'healthcare'],
      min_concepts: 5,
      clarity_threshold: 0.7
    },
    five_whys: {
      enabled: true,
      max_depth: 5,
      auto_trigger: true
    },
    active_listener: {
      enabled: true,
      reformulation_frequency: 3
    },
    mantras_validator: {
      enabled: true,
      min_compliance_score: 0.8
    }
  }
});
```

---

## 📊 Quality Metrics

- **Tests**: 1,308/1,308 passing (100%)
  - Core v2.0: 891 tests
  - BMAD v2.1: 417 tests
- **Coverage**: 95%+
- **Performance**: < 10% overhead vs v2.0.0
- **Principles**: KISS, DRY, SOLID, TDD
- **Standards**: Zero emojis (Mantra IA-23)

---

## 📚 API Reference

### Main Class: ByanV2

#### Core Methods

- `constructor(config)` - Initialize BYAN
- `startSession()` - Start interview session
- `getNextQuestion()` - Get next interview question
- `submitResponse(answer)` - Submit answer
- `generateProfile()` - Generate agent profile
- `isComplete()` - Check if interview complete

#### Glossary Builder (BMAD)

- `startGlossary(domain, options)` - Initialize glossary
- `addConcept(term, definition)` - Add concept
- `getConcepts()` - Get all concepts
- `getGlossary()` - Get full glossary

#### Five Whys Analyzer (BMAD)

- `detectPainPoints(response)` - Detect pain points
- `askWhy()` - Get WHY question
- `processWhyAnswer(answer)` - Process answer
- `getRootCause()` - Get root cause analysis

#### Active Listener (BMAD)

- `listen(input, context)` - Process input with listening
- `reformulate(input, style)` - Reformulate input
- `validateResponse(input)` - Validate confirmation
- `summarizeSession()` - Generate session summary

#### Mantras Validator (BMAD)

- `validateAgent(definition)` - Validate against mantras
- `generateComplianceReport()` - Generate report
- `validateMantra(mantraId, content)` - Validate specific mantra
- `getMantras(category)` - Get mantras by category

---

## 🔄 Migration from v2.0.0

**Good news**: Zero breaking changes! Your v2.0.0 code works unchanged.

```javascript
// v2.0.0 code - still works in v2.1.0
const ByanV2 = require('create-byan-agent');
const byan = new ByanV2();
await byan.startSession();
// ... your existing workflow
```

To use new BMAD features, simply enable them in config. See [MIGRATION.md](https://github.com/yannsix/byan-v2/blob/main/MIGRATION-v2.0-to-v2.1.md) for details.

---

## 📖 Documentation

- [Full Documentation](https://github.com/yannsix/byan-v2/blob/main/README-BYAN-V2.md)
- [CHANGELOG v2.1.0](https://github.com/yannsix/byan-v2/blob/main/CHANGELOG-v2.1.0.md)
- [Migration Guide](https://github.com/yannsix/byan-v2/blob/main/MIGRATION-v2.0-to-v2.1.md)
- [Manual Testing Guide](https://github.com/yannsix/byan-v2/blob/main/BYAN-V2.1.0-MANUAL-TEST-PLAN.md)
- [BMAD Quick Reference](https://github.com/yannsix/byan-v2/blob/main/BMAD-QUICK-REFERENCE.md)

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to our [GitHub repository](https://github.com/yannsix/byan-v2).

---

## 👥 Contributors

### Core Team
- **[Yan-Acadenice](https://github.com/Yan-Acadenice)** - Creator & Lead Developer

### Special Contributors
- **[Wazadriano](https://github.com/Wazadriano)** - Hermes Universal Dispatcher (v2.3.2)
  - Designed and documented the Hermes agent architecture
  - Smart routing rules and multi-agent pipelines
  - Complete integration with BYAN ecosystem

---

## 💝 Credits

**Créé avec passion par [Yan-Acadenice](https://github.com/Yan-Acadenice)**  
Pour la communauté [Acadenice](https://acadenice.fr/)

---

## 📄 License

MIT © [Yan-Acadenice](https://github.com/Yan-Acadenice)

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/yannsix/byan-v2/issues)
- **Repository**: [github.com/yannsix/byan-v2](https://github.com/yannsix/byan-v2)

---

## 🎯 Use Cases

### For Solo Developers
Create specialized agents for your workflow without complex setup.

### For Teams
Build consistent agent profiles following team standards and mantras.

### For Agencies
Rapid agent prototyping with built-in quality validation.

### For Open Source
Generate well-documented agent profiles for public repositories.

---

## 🌟 Highlights

- ✅ **Zero Setup**: Works immediately with npx
- ✅ **Intelligent**: Smart interview adapts to your answers
- ✅ **Quality**: Built-in validation against 64 mantras
- ✅ **Fast**: Create agents in 10-15 minutes
- ✅ **Flexible**: Use as CLI or programmatically
- ✅ **Tested**: 1,308 tests, 100% passing
- ✅ **Compatible**: Works with v2.0.0 code unchanged

---

**Ready to create your first AI agent?**

```bash
npx create-byan-agent
```

🚀 Let's build something amazing!
