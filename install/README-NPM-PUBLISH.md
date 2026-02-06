# BYAN - Intelligent AI Agent Creator

**Create custom AI agents in 15 minutes** | GitHub Copilot CLI, VSCode, Claude Code

## Quick Start

```bash
npx create-byan-agent
```

That's it! The installer launches automatically.

## What is BYAN?

BYAN guides you through an intelligent interview to create personalized AI agents:

1. ✅ Answer 12-15 simple questions (15-30 min)
2. ✅ BYAN analyzes your needs
3. ✅ Custom agent generated automatically
4. ✅ Ready to use immediately

## Installation

### Option 1: NPX (Recommended)

```bash
npx create-byan-agent
```

### Option 2: Global Install

```bash
npm install -g create-byan-agent
create-byan-agent
```

## Create Your First Agent

### 1. Launch BYAN

**GitHub Copilot CLI:**
```bash
gh copilot
@byan
```

**Command Line:**
```bash
npx create-byan-agent
```

### 2. Choose Mode

**🎤 Full Interview (15-30 min)** - Recommended for first agent
- 12-15 questions
- In-depth analysis
- Ultra-personalized agent

**⚡ Quick Create (5 min)** - For experienced users
- 3-5 essential questions
- Functional agent quickly

### 3. Answer Questions

BYAN asks questions in 4 categories:

1. **Context**: Your project, goals
2. **Business**: Domain, constraints
3. **Agent**: Desired skills, tasks
4. **Validation**: Confirmation, adjustments

### 4. Automatic Generation

```
✅ Complete analysis
✅ Agent created: my-dev-agent.md
✅ Validated and ready
```

Agent saved to:
- GitHub Copilot: `.github/copilot/agents/`
- Other platforms: `.codex/prompts/`

## Usage Examples

### Code Review Agent

```bash
npx create-byan-agent

# BYAN asks:
# Purpose? → "Review JavaScript code"
# Tasks? → "Detect bugs, suggest optimizations"
# Constraints? → "Follow our style guide"

# Result: code-reviewer.md created in 2 seconds
```

### Documentation Agent

```bash
npx create-byan-agent

# Purpose? → "Generate API documentation"
# Tech? → "Node.js, Express, MongoDB"
# Format? → "Markdown with examples"

# Result: doc-generator.md ready
```

## Use Your Agent

### With GitHub Copilot CLI

```bash
gh copilot
@my-dev-agent
# Your agent responds!
```

### With VSCode

1. Command Palette (Ctrl+Shift+P)
2. "GitHub Copilot: Chat"
3. Type `@my-dev-agent`

### With Claude Code

```bash
claude chat --agent my-dev-agent
```

## Key Concepts (v2.0)

### 1. Intelligent Interview (4 phases)

```
CONTEXT → BUSINESS → AGENT → VALIDATION
```

Minimum 3 questions per phase = 12 total

### 2. State Machine

```
INTERVIEW → ANALYSIS → GENERATION → COMPLETED
```

### 3. Template System

Agents generated from professional templates with YAML frontmatter + XML structure.

### 4. Automatic Validation

- ✅ Correct YAML format
- ✅ Valid XML structure
- ✅ No emojis in code (Mantra IA-23)
- ✅ Valid agent name
- ✅ Clear description

### 5. Methodology: 64 Mantras

Quality principles applied:
- **#37 Ockham's Razor**: Simplicity first
- **IA-1 Trust But Verify**: Verify user needs
- **IA-23 No Emoji Pollution**: Clean code
- **IA-24 Clean Code**: Self-documenting

## Advanced Configuration

### Customize Output

```javascript
const ByanV2 = require('create-byan-agent');

const byan = new ByanV2({
  outputFolder: './my-agents',
  language: 'en',
  template: 'custom'
});
```

### Programmatic Usage

```javascript
const ByanV2 = require('create-byan-agent');

async function createAgent() {
  const byan = new ByanV2();
  await byan.startSession();
  
  const responses = [
    'Backend development agent',
    'REST API in Node.js',
    'Tests, docs, deployment',
    // ... 12 responses total
  ];
  
  for (const response of responses) {
    await byan.getNextQuestion();
    await byan.submitResponse(response);
  }
  
  const profile = await byan.generateProfile();
  console.log('Agent created:', profile);
}
```

## Useful Commands

```bash
# List agents
ls .github/copilot/agents/

# Edit agent
code .github/copilot/agents/my-agent.md

# Validate agent
npx create-byan-agent --validate my-agent.md

# Version
npx create-byan-agent --version
```

## Help & Support

### Get Help

```
/bmad-help
```

### Documentation

- [Full Guide](https://github.com/Yan-Acadenice/BYAN/blob/main/GUIDE-UTILISATION.md)
- [API Reference](https://github.com/Yan-Acadenice/BYAN/blob/main/API-BYAN-V2.md)
- [Examples](https://github.com/Yan-Acadenice/BYAN/tree/main/examples)

### Common Issues

**Agent doesn't appear in Copilot**
```bash
cat .github/copilot/agents/my-agent.md
gh copilot quit && gh copilot
```

**"Node version too old"**
```bash
node --version  # Must be >= 18
nvm install 18 && nvm use 18
```

**Tests fail**
```bash
rm -rf node_modules package-lock.json
npm install && npm test
```

## Stats (v2.0)

- ✅ **881/881 tests passing (100%)**
- ✅ **14 modules**
- ✅ **77 Story Points delivered**
- ✅ **Agent in < 2 seconds** after interview
- ✅ **64 mantras** applied automatically

## Use Cases

**Developers**: Code review, test generation, refactoring, security analysis

**Writers**: Documentation, proofreading, translation, content creation

**Project Managers**: Ticket analysis, reports, planning, prioritization

**Designers**: UI components, accessibility, CSS optimization, design systems

## License

MIT License

## Contributors

**Core Team:**
- **BYAN**: Intelligent agent creator
- **RACHID**: NPM/NPX deployment specialist
- **MARC**: GitHub Copilot CLI integration expert
- **PATNOTE**: Update manager
- **CARMACK**: Token optimizer

## Links

- 📦 [NPM](https://www.npmjs.com/package/create-byan-agent)
- 🐙 [GitHub](https://github.com/Yan-Acadenice/BYAN)
- 📚 [Full Docs](https://github.com/Yan-Acadenice/BYAN/blob/main/install/README.md)

---

**BYAN v2.0** - Create professional AI agents in 15 minutes 🚀
