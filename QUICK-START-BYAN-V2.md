# BYAN v2 - Quick Start Guide

**Version:** 2.0.0  
**Status:** Production-ready  
**Tests:** 881/881 passing (100%)

---

## 🚀 Installation

### Option 1: NPM Package (Global)

```bash
npm install -g create-byan-agent
byan-v2 create
```

### Option 2: NPX (No install)

```bash
npx create-byan-agent
```

### Option 3: GitHub Copilot CLI (Conversational)

```bash
# Dans Copilot CLI
@byan-v2 create agent
```

### Option 4: Clone & Use

```bash
git clone https://github.com/Yan-Acadenice/BYAN.git
cd BYAN
npm install
node bin/byan-v2-cli.js create
```

---

## 💬 Usage in Copilot CLI

### Create an agent

```
User: @byan-v2 create agent

BYAN v2: 
🎤 Starting intelligent interview (12 questions, ~15 min)

PHASE 1: CONTEXT
Q1: What is the main purpose of your agent?
```

**Respond naturally:**
```
User: I need an agent to help with API testing and Postman automation
```

**Continue for 12 questions**, then:

```
BYAN v2:
✅ Agent generated: .github/copilot/agents/api-testing-assistant.md
🚀 Ready to use: @api-testing-assistant
```

### Check status

```
@byan-v2 status
```

**Output:**
```
State: INTERVIEW
Phase: CONTEXT
Progress: 3/12 questions
Session ID: abc-123-def
```

### Validate existing agent

```
@byan-v2 validate .github/copilot/agents/my-agent.md
```

### Get help

```
@byan-v2 help
```

---

## 🖥️ Programmatic Usage (Node.js)

### Simple example

```javascript
const ByanV2 = require('create-byan-agent/src/byan-v2');

async function createAgent() {
  const byan = new ByanV2();
  
  // Start interview
  await byan.startSession();
  
  // Answer 12 questions
  for (let i = 0; i < 12; i++) {
    const question = await byan.getNextQuestion();
    console.log(`Q${i+1}: ${question}`);
    
    // Your logic to get answer
    const answer = await getUserInput();
    
    await byan.submitResponse(answer);
  }
  
  // Generate agent profile
  const profile = await byan.generateProfile();
  console.log('Agent created:', profile.filePath);
}

createAgent();
```

### With custom config

```javascript
const ByanV2 = require('create-byan-agent/src/byan-v2');

const byan = new ByanV2({
  maxQuestions: 15,        // Override default 12
  sessionId: 'my-session', // Use specific session ID
  llmBackend: 'openai'     // Or 'anthropic', 'custom'
});

await byan.startSession();
// ... rest of workflow
```

---

## 📋 Interview Phases

| Phase | Questions | Focus |
|-------|-----------|-------|
| **CONTEXT** | Q1-Q3 | What are you building? Goals? Tech stack? |
| **BUSINESS** | Q4-Q6 | Domain knowledge? Terminology? Rules? |
| **AGENT_NEEDS** | Q7-Q9 | What should agent do? How communicate? |
| **VALIDATION** | Q10-Q12 | Confirm all details? Any changes? |

---

## 🎯 Example Agents You Can Create

### 1. Code Review Agent
**Purpose:** Review pull requests, check standards, suggest improvements

**CONTEXT:** Code review automation, GitHub integration, focus on best practices  
**BUSINESS:** Software engineering domain, clean code, security  
**AGENT_NEEDS:** Analyze diffs, comment on issues, suggest refactorings  

### 2. API Testing Agent
**Purpose:** Test REST APIs, generate test cases, validate responses

**CONTEXT:** API testing, Postman, CI/CD integration  
**BUSINESS:** API contracts, HTTP methods, status codes  
**AGENT_NEEDS:** Execute requests, validate JSON, generate reports  

### 3. Documentation Agent
**Purpose:** Write technical documentation, README files, API docs

**CONTEXT:** Documentation generation, Markdown, clear explanations  
**BUSINESS:** Technical writing, user guides, API references  
**AGENT_NEEDS:** Analyze code, generate docs, follow style guides  

### 4. Database Migration Agent
**Purpose:** Create database migrations, handle schema changes

**CONTEXT:** Database migrations, version control, safety first  
**BUSINESS:** SQL, schema design, data integrity  
**AGENT_NEEDS:** Generate migration scripts, validate changes, rollback support  

---

## 🔧 CLI Commands

### Via Copilot CLI

```bash
@byan-v2 create agent      # Start full interview
@byan-v2 status            # Show session state
@byan-v2 validate <file>   # Validate agent profile
@byan-v2 help              # Show help
```

### Via Node.js CLI

```bash
node bin/byan-v2-cli.js create
node bin/byan-v2-cli.js status
node bin/byan-v2-cli.js validate .github/copilot/agents/my-agent.md
node bin/byan-v2-cli.js help
```

### Via NPM package

```bash
byan-v2 create
byan-v2 status
byan-v2 validate <file>
byan-v2 help
```

---

## 🧪 Testing

### Run all tests

```bash
npm test
```

**Output:**
```
Test Suites: 25 passed, 25 total
Tests:       881 passed, 881 total
Time:        45.123 s
```

### Run specific test suite

```bash
npm test -- integration
npm test -- state-machine
npm test -- generation
```

### Run integration test

```bash
node test-copilot-integration.js
```

**Output:**
```
✅ Copilot agent profile exists
✅ BMAD agent stub exists
✅ CLI wrapper exists
✅ BYAN v2 source accessible
✅ Integration doc exists
✅ All modules present

All integration tests passed!
```

---

## 📂 Project Structure

```
/
├── .github/
│   ├── copilot/agents/
│   │   └── byan-v2.md              # Copilot CLI agent profile
│   └── agents/
│       └── bmad-agent-byan-v2.md   # BMAD stub
├── bin/
│   └── byan-v2-cli.js              # CLI wrapper
├── src/
│   └── byan-v2/
│       ├── index.js                # Main class
│       ├── context/                # SessionState, CopilotContext
│       ├── dispatcher/             # TaskRouter, ComplexityScorer
│       ├── generation/             # ProfileTemplate, Validator
│       ├── orchestrator/           # StateMachine, Interview, Analysis, Generation
│       └── observability/          # Logger, Metrics, ErrorTracker
├── __tests__/
│   └── byan-v2/                    # 881 tests
├── README-BYAN-V2.md               # Full documentation
├── API-BYAN-V2.md                  # API reference
└── BYAN-V2-COPILOT-CLI-INTEGRATION.md # Integration guide
```

---

## 🎓 Methodology

BYAN v2 applies **64 mantras** from Merise Agile + TDD:

- **#37 Ockham's Razor** - Simplicity first, MVP approach
- **#39 Consequences** - Evaluate 10 dimensions before action
- **IA-1 Trust But Verify** - Challenge all requirements
- **IA-16 Challenge Before Confirm** - Play devil's advocate
- **IA-23 No Emoji Pollution** - Zero emojis in code/specs
- **IA-24 Clean Code** - Self-documenting code

Full list: `_bmad/bmb/workflows/byan/data/mantras.yaml`

---

## 🆘 Troubleshooting

### Agent not detected in Copilot CLI

**Solution:**
```bash
# Check agent file exists
ls .github/copilot/agents/byan-v2.md

# Verify frontmatter
head -5 .github/copilot/agents/byan-v2.md
```

### CLI wrapper not working

**Solution:**
```bash
# Check file is executable
chmod +x bin/byan-v2-cli.js

# Test directly
node bin/byan-v2-cli.js help
```

### Module not found error

**Solution:**
```bash
# Install dependencies
npm install

# Check src/ folder exists
ls src/byan-v2/
```

### Interview stuck at question

**Solution:**
```bash
# Check session state
@byan-v2 status

# Restart if needed (create new session)
@byan-v2 create agent
```

---

## 📚 Resources

### Documentation
- **Full guide:** `README-BYAN-V2.md`
- **API reference:** `API-BYAN-V2.md`
- **Integration:** `BYAN-V2-COPILOT-CLI-INTEGRATION.md`
- **Test plan:** `BYAN-V2-MANUAL-TEST-PLAN.md`

### Code Examples
- **Simple demo:** `demo-byan-v2-simple.js`
- **Full demo:** `demo-byan-v2.js`
- **Workflow test:** `test-byan-v2-workflow.js`

### GitHub
- **Repository:** https://github.com/Yan-Acadenice/BYAN
- **NPM package:** https://www.npmjs.com/package/create-byan-agent
- **Issues:** https://github.com/Yan-Acadenice/BYAN/issues

---

## ❓ FAQ

**Q: How long does the interview take?**  
A: ~15 minutes for 12 questions (4 phases × 3 questions)

**Q: Can I skip questions?**  
A: No, all 12 questions are required for quality agent generation

**Q: Can I edit the generated agent?**  
A: Yes! Edit `.github/copilot/agents/your-agent.md` after generation

**Q: What if I make a mistake in an answer?**  
A: Continue the interview, then edit the generated profile

**Q: Can I create multiple agents?**  
A: Yes, run `@byan-v2 create agent` multiple times

**Q: Does it work offline?**  
A: Yes, interview works offline. Profile generation may need LLM access.

**Q: What's the difference between BYAN v2 and v1?**  
A: v2 has state machine, better interview, validation, 881 tests (100%)

---

## 🎉 Next Steps

1. **Try it:** `@byan-v2 create agent`
2. **Read docs:** `README-BYAN-V2.md`
3. **Run tests:** `npm test`
4. **Share feedback:** https://github.com/Yan-Acadenice/BYAN/issues

---

**Created by:** Yan  
**Version:** 2.0.0 (MVP)  
**License:** MIT  
**Support:** https://github.com/Yan-Acadenice/BYAN
