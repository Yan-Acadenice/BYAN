# BYAN - Builder of YAN

**Version:** 1.0.2  
**Methodology:** Merise Agile + TDD + 64 Mantras  
**Agents Included:** BYAN, RACHID, MARC

---

## 🏗️ What is BYAN?

**BYAN (Builder of YAN)** is an intelligent agent creator that generates specialized AI agents through structured interviews.

**Key Features:**
- 30-45 min intelligent interview process
- Applies 64 mantras systematically
- Zero Trust philosophy (challenges requirements)
- Multi-platform support (Copilot, VSCode, Claude, Codex)
- TDD-driven validation
- Consequences evaluation before actions
- **NEW:** RACHID agent for NPM/NPX deployment
- **NEW:** MARC agent for GitHub Copilot CLI integration

---

## 🚀 Quick Start

### Installation

**Option 1: NPX (Recommended)**
```bash
npx create-byan-agent
```

**Option 2: Bash Script**
```bash
curl -fsSL https://raw.githubusercontent.com/yan/byan/main/install/install.sh | bash
```

**Option 3: Manual**
```bash
git clone https://github.com/yan/byan.git
cd byan
./install/install.sh
```

---

## 📖 Usage

### Activate Agents

**GitHub Copilot CLI:**
```bash
copilot
# In interactive mode:
/agent
# Select one of:
# - byan (create agents)
# - rachid (NPM deployment)
# - marc (Copilot CLI integration)
```

**VSCode:**
1. Open Command Palette (Ctrl+Shift+P)
2. Type: "Activate Agent"
3. Select BYAN, RACHID, or MARC from list

**Claude Code:**
```bash
claude chat --agent byan
# or
claude chat --agent rachid
# or
claude chat --agent marc
```

### Create Your First Agent

**Full Interview (30-45 min):**
```
[INT] Start Intelligent Interview
```
Best for: First agent, critical agents, complex requirements

**Quick Create (10 min):**
```
[QC] Quick Create
```
Best for: Additional agents, clear requirements, existing project context

---

## 🎯 Three Specialized Agents

### 1. BYAN - Agent Creator
**Full Interview (30-45 min):**
```
[INT] Start Intelligent Interview
```
Best for: First agent, critical agents, complex requirements

**Quick Create (10 min):**
```
[QC] Quick Create
```
Best for: Additional agents, clear requirements, existing project context

### 2. RACHID - NPM/NPX Specialist
**Deploy to NPM:**
```
[PUBLISH] Publish to npm
[VALIDATE] Validate _bmad structure
[TEST-NPX] Test npx installation
```
Best for: Package deployment, dependency management, npm workflows

### 3. MARC - Copilot CLI Expert
**Copilot Integration:**
```
[VALIDATE] Validate .github/agents/
[TEST] Test /agent detection
[CREATE-STUB] Create agent stub
```
Best for: GitHub Copilot CLI integration, agent detection, MCP configuration

---

## 🎯 BYAN Menu

| Command | Description | Duration |
|---------|-------------|----------|
| **[INT]** | Intelligent Interview | 30-45 min |
| **[QC]** | Quick Create | 10 min |
| **[LA]** | List all agents | Instant |
| **[EA]** | Edit existing agent | 10-20 min |
| **[VA]** | Validate agent (64 mantras) | 5-10 min |
| **[DA-AGENT]** | Delete agent (with backup) | 5 min |
| **[PC]** | Show project context | Instant |
| **[MAN]** | Display 64 mantras | Instant |

---

## 📚 Methodology

BYAN applies **Merise Agile + TDD** with 64 mantras:

### 39 Conception Mantras
- Philosophy: Model serves business, not reverse
- Agility: User stories → Entities (bottom-up)
- Quality: KISS, DRY, YAGNI
- Tests: TDD is not optional
- Merise Rigor: Data Dictionary First, MCD ⇄ MCT
- Problem Solving: Ockham's Razor, Inversion techniques
- **Consequences: Evaluate 10 dimensions before action**

### 25 AI Agent Mantras
- Intelligence: Trust But Verify, Context is King
- **Validation: Challenge Before Confirm**
- Autonomy: Self-Aware Agent
- **Code Quality: No Emoji Pollution, Clean Code**

Full list: `_bmad/bmb/workflows/byan/data/mantras.yaml`

---

## 🔧 Project Structure

```
your-project/
├── _bmad/
│   ├── bmb/                      # BYAN Module
│   │   ├── agents/
│   │   │   └── byan.md          # BYAN agent definition
│   │   ├── workflows/
│   │   │   └── byan/
│   │   │       ├── interview-workflow.md
│   │   │       ├── quick-create-workflow.md
│   │   │       ├── edit-agent-workflow.md
│   │   │       ├── validate-agent-workflow.md
│   │   │       ├── delete-agent-workflow.md
│   │   │       ├── templates/
│   │   │       │   └── base-agent-template.md
│   │   │       └── data/
│   │   │           ├── mantras.yaml
│   │   │           └── templates.yaml
│   │   └── config.yaml           # Module configuration
│   ├── core/                     # BMAD Core
│   ├── _output/                  # Generated files
│   └── {your-module}/
│       └── agents/               # Your generated agents
└── install/
    ├── install.sh               # Bash installer
    ├── package.json             # NPX package
    └── bin/
        └── create-byan-agent.js # NPX installer script
```

---

## 🎓 Interview Process

BYAN conducts a 4-phase interview:

### Phase 1: Project Context (15-30 min)
- Project name, description, domain
- Technical stack and constraints
- Team size, skills, maturity
- **Pain points (5 Whys on main pain)**
- Goals and success criteria

### Phase 2: Business/Domain (15-20 min)
- Business domain deep dive
- **Interactive glossary (minimum 5 concepts)**
- Actors, processes, business rules
- Edge cases and constraints
- Regulatory requirements

### Phase 3: Agent Needs (10-15 min)
- Agent role and responsibilities
- Required knowledge (business + technical)
- **Capabilities (minimum 3)**
- **Mantras to prioritize (minimum 5)**
- Communication style
- **Use cases (minimum 3)**

### Phase 4: Validation (10 min)
- Complete synthesis
- **Challenge inconsistencies**
- Validate with user
- Create ProjectContext
- Finalize AgentSpec

---

## ✅ Validation

BYAN validates agents against:
- Business rules (RG-AGT-001 to RG-DEL-002)
- 64 Mantras compliance
- BMAD format standards
- Best practices

**Validation Levels:**
- 🔴 CRITICAL: Must pass (deployment blocked)
- 🟡 IMPORTANT: Should pass (warnings)
- 🟢 SUGGESTIONS: Nice to have

**Grading:**
- A+ (95-100): Exemplary
- A (90-94): Excellent
- B (80-89): Good
- C (70-79): Acceptable
- D (60-69): Needs improvement
- F (<60): Failing

---

## 🛡️ Zero Trust Philosophy

BYAN never blindly accepts requirements:

**Challenge Before Confirm:**
- Detects inconsistencies
- Questions assumptions
- Plays devil's advocate
- Signals problems early

**Trust But Verify:**
- Validates all inputs
- Cross-checks data
- Ensures coherence

**Example:**
```
User: "I need an agent that does everything"
BYAN: "I'm challenging that requirement. Wouldn't a specialized 
agent that does ONE thing exceptionally well be more valuable? 
What's the ONE most critical capability you need?"
```

---

## 📊 Consequences Evaluation

Before any important action, BYAN evaluates 10 dimensions:

1. **Scope:** Components affected
2. **Data:** Database impacts
3. **Code:** Files to modify
4. **Team:** People affected
5. **Clients:** User workflows
6. **Legal:** Compliance
7. **Operations:** Deployment complexity
8. **Dependencies:** Systems impacted
9. **Time:** Duration estimates
10. **Alternatives:** Other options

**Risk Levels:**
- 🟢 LOW: Safe to proceed
- 🟡 MEDIUM: Caution required
- 🔴 HIGH: Team approval needed
- 🔥 CRITICAL: Requires migration plan

---

## 📝 Configuration

Edit `_bmad/bmb/config.yaml`:

```yaml
user_name: Your Name
communication_language: Francais|English
document_output_language: Francais|English
output_folder: "{project-root}/_bmad-output"
platform: copilot|vscode|claude|codex
```

---

## 📄 License

MIT License - See LICENSE file

---

## 🙏 Credits

**Created by:** Yan + Carson (Brainstorming Coach)  
**Methodology:** Merise Agile + TDD  
**Mantras:** 64 principles from 2-hour brainstorming session  
**Date:** 2026-02-02

---

**Happy agent building!** 🏗️
