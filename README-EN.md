# BYAN v2.6.0 — Build Your AI Network

[![npm](https://img.shields.io/npm/v/create-byan-agent.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-1444%2F1466-brightgreen.svg)](https://github.com/Yan-Acadenice/BYAN)
[![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org)

**Intelligent AI Agent Creator** | Merise Agile + TDD + 64 Mantras

> La documentation française est disponible ici : [README.md](./README.md)

---

## Hello

Hello everyone! I have the honor to introduce you to **BYAN**, your friend on your projects — whether you're a developer, a vibe coder, or just curious.

> **Important:** I want to clarify that this is an unfinished project, more of an MVP/proof of concept than a real finished production version. It's an actively evolving tool, and that's precisely where its value lies.

### Why BYAN exists

To understand the context of BYAN, you need to understand why I decided to create it. The basic problem is simple.

I found myself with a big project on my hands, very tight deadlines, no budget, and an inexperienced team to do it. This led me to do stupid crunches with depressed developers.

To solve this problem, I had the idea of using AI agents to accelerate the project's development. Thanks to one of my dev students (credited in the project contributors) to whom I teach, I discovered the **BMAD** method, which is an AI agent framework. Initially skeptical, I was blown away by the results, although these AI agents suffered from the usual AI biases, particularly depending on the model used and who uses it and how.

Then a simple idea came: **what if we could put a framework around all these agents to bring them "intelligence", regardless of the project, by setting basic rules and constraints to counter the biases of AI models?**

That's when I came up with the idea of instilling **mantras** in them — absolute rules that the agent must comply with. Epistemic, methodological, and behavioral guardrails that transform a verbose LLM into a reliable partner.

Now, the problem arises in multi-agent systems: how do I make sure all my agents have these good practices and rules?

You just need to establish them at the source, that is, **at agent creation time**. That's where BYAN comes in: it will assist you in the intelligent creation of AI agents.

### What BYAN is not

However, be careful: **BYAN is not magic**. The goal is to push the "human-machine" collaboration to make AI agents an extension of your brain. So BYAN will challenge you, test your problem and your solution — but used incorrectly, it won't solve your problems like magic.

It's just an intelligent agent with the right soft skills and hard skills to accompany you in the realization of your projects.

---

## Installation

### Prerequisites

- Node.js >= 12.0.0
- npm >= 6.0.0
- A GitHub Copilot, Claude Code, or Codex account (depending on your target platform)

### Quick install (recommended)

No prior installation is required. Just run:

```bash
# Create a new BYAN project (via npx, no prior installation needed)
npx create-byan-agent

# Or global installation
npm install -g create-byan-agent
create-byan-agent
```

The installer (Yanstaller) guides you interactively through the process:

```
? Project name: my-project
? Communication language: English
? Target platform: GitHub Copilot CLI
? Enable scientific fact-checking? [Y/n]
? Enable ELO trust system? [Y/n]
? Optimize LLM costs automatically (~54% savings)? [Y/n]
```

### Project structure after installation

At the end of installation, your project contains:

```
your-project/
  _byan/               # BYAN platform — system core
    _config/           # Agent and workflow manifests
    _memory/           # Persistent memory (ELO, fact-graph, session-state)
    agents/            # Available agents (core, bmm, bmb, cis, tea)
    workflows/         # Guided workflows
    knowledge/         # Knowledge base sources (axioms, benchmarks)
    config.yaml        # Main configuration (language, user, paths)
  .github/agents/      # GitHub Copilot CLI wrappers
  .claude/             # Claude Code integration (if enabled)
  .codex/              # Codex/OpenCode integration (if enabled)
  bin/byan-v2-cli.js   # BYAN CLI
```

### Available CLI commands

Once installed, you can use the BYAN CLI:

```bash
# Start the intelligent interview (creates an agent in 12 questions)
node bin/byan-v2-cli.js create

# Check session status
node bin/byan-v2-cli.js status

# ELO trust system — confidence score per technical domain
node bin/byan-v2-cli.js elo summary
node bin/byan-v2-cli.js elo context security
node bin/byan-v2-cli.js elo record javascript VALIDATED

# Scientific fact-checking — verify an assertion
node bin/byan-v2-cli.js fc check "Redis is always faster than PostgreSQL"
node bin/byan-v2-cli.js fc parse "This is obviously the best approach"
node bin/byan-v2-cli.js fc graph
```

### Programmatic usage (via npm)

```javascript
const ByanV2 = require('create-byan-agent');

const byan = new ByanV2({ maxQuestions: 12 });
await byan.startSession();

// Guided interview
while (!byan.isComplete()) {
  const question = byan.getNextQuestion();
  const answer = await getUserInput(question.text);
  await byan.submitResponse(answer);
}

// Generate agent profile
const profile = await byan.generateProfile();
console.log('Agent created:', profile.filePath);

// Fact-check
const result = byan.checkClaim("Redis is faster");
console.log(result.assertionType, result.score + '%');

// ELO score
const ctx = byan.getClaimContext('security');
console.log('Scaffold level:', ctx.scaffoldLevel);
```

### Activate agents in GitHub Copilot CLI

Once installed, agents are available via `@agent-name`:

```bash
@hermes            # Universal dispatcher — recommends the right agent
@byan              # Agent creator (intelligent interview)
@analyst           # Business analyst (Mary)
@architect         # Technical architect (Winston)
@pm                # Product Manager (John)
@dev               # Developer (Amelia)
@fact-checker      # Scientific fact-check
# ... and 30+ other agents
```

---

## List of Available Agents

BYAN contains **27 specialized agents** organized into **5 modules**:

### Core — Platform Foundation

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **hermes** | Dispatcher | Universal router — recommends the right agent for your task | "Which agent to build a REST API?" |
| **bmad-master** | Orchestrator | Runs BMAD workflows and tasks directly | Launch a complete workflow without intermediaries |
| **yanstaller** | Installer | Intelligent and interactive BYAN installation | Initial setup of a new project |
| **expert-merise-agile** | Expert | Merise Agile design + MCD/MCT + functional specs | Database schema modeling |

### BMB — Agent and Module Builders

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **byan** | Builder | Agent creator via intelligent interview (12 questions, 64 mantras). Includes [FC] fact-check and [ELO] | Create a specialized agent for your domain |
| **fact-checker** | Scientist | Fact-check assertions, audit documents, analyze reasoning chains | Verify a technical spec before sprint |
| **agent-builder** | Bond | Expert in building BMAD-compliant agents | Build a complex agent manually |
| **module-builder** | Morgan | BYAN complete module architect | Create a new business module |
| **workflow-builder** | Wendy | Guided workflow designer | Design a multi-step process |
| **marc** | Specialist | GitHub Copilot CLI integration | Deploy agents to Copilot |
| **rachid** | Specialist | npm/npx deployment | Publish a BYAN package |
| **carmack** | Optimizer | Token optimization (-46%) | Reduce agent usage cost |
| **patnote** | Manager | BYAN updates and conflict resolution | Update an existing BYAN project |
| **claude** | Specialist | Claude Code + MCP integration | Configure agents on Claude |
| **codex** | Specialist | OpenCode/Codex integration | Configure agents on Codex |

### BMM — Software Development Lifecycle

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **analyst** | Mary | Business analysis, market research, product brief | "I have an idea, help me structure it" |
| **pm** | John | Product management, PRD creation, roadmap | Write a Product Requirements Document |
| **architect** | Winston | Technical architecture, tech stack, patterns | Design a system's architecture |
| **ux-designer** | Sally | UX/UI design, user empathy, user flows | Create wireframes and user journeys |
| **dev** | Amelia | Implementation, coding, ultra-succinct | Develop a user story |
| **sm** | Bob | Scrum master, sprint planning, backlog grooming | Prepare and plan a sprint |
| **quinn** | Quinn | QA engineer, tests, code coverage | Generate tests for a feature |
| **tech-writer** | Paige | Documentation, user guides, clarity | Write API documentation |
| **quick-flow-solo-dev** | Barry | Fast development on existing code (brownfield) | Small features without ceremony |

### CIS — Creative Innovation & Strategy

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **brainstorming-coach** | Carson | Ideation, "YES AND" energy, 20+ techniques | "I have a complex problem, help me think" |
| **creative-problem-solver** | Dr. Quinn | Systematic problem solving (TRIZ, Theory of Constraints) | Unblock a difficult technical problem |
| **design-thinking-coach** | Maya | Human-centered design, empathy maps | Design a user-centered solution |
| **innovation-strategist** | Victor | Innovation strategy, Blue Ocean, disruption | Find a differentiating angle for a product |
| **presentation-master** | Caravaggio | Presentations, slides, visual storytelling | Create a pitch deck or technical presentation |
| **storyteller** | Sophia | Storytelling, narratives, brand communication | Write engaging copy |

### TEA — Test Engineering & Architecture

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **tea** | Murat | Master test architect — ATDD, NFR, CI/CD, risk-based testing | Design a complete project test strategy |

---

## Contributors

### Creator & Lead Developer

**[Yan-Acadenice](https://github.com/Yan-Acadenice)** — Design, architecture, and development of BYAN

### Main Contributor — Hermes Agent

**[Wazadriano](https://github.com/orgs/Centralis-V3/people/Wazadriano)** — Hermes Universal Dispatcher (v2.3.2)
- Architecture and design of the Hermes universal dispatcher
- Intelligent routing rules and multi-agent pipelines
- Full integration with the BYAN ecosystem

### Acknowledgments

BYAN is built on top of the **[BMAD method](https://github.com/bmadcode/BMAD-METHOD)**, discovered through a student from **[Acadenice](https://acadenice.fr/)** to whom I teach.

---

## BYAN Architecture Explanation — Workflow/Context/Agent/Worker (WCAW)

BYAN is organized around four core concepts that work together:

### Agent

An agent is an AI specialist with a defined identity. It has:
- **Persona**: who it is, communication style, strengths
- **Menu**: available actions, each linked to a workflow or command
- **Rules**: absolute constraints it cannot violate (the 64 mantras)
- **Capabilities**: what it can do, what it won't

Agents are defined in Markdown with XML sections. They are stored in `_byan/{module}/agents/` and exposed on each platform via a lightweight wrapper (`.github/agents/`, `.claude/`, `.codex/prompts/`).

### Workflow

A workflow is a guided sequence of steps that an agent follows to accomplish a complex task. For example, the `create-prd` workflow guides the PM agent through creating a Product Requirements Document in 6 structured steps.

Workflow types:
- **Tri-modal**: Create / Validate / Edit (e.g., PRD, Architecture)
- **Sequential**: multi-phase guided processes (e.g., BYAN 4-phase interview)
- **Utilities**: one-off tasks (e.g., fact-check, shard-doc)

### Context Layer

The context is the shared memory and state layer across all agents on a project. It contains:
- `_byan/config.yaml`: global configuration (language, username, output paths)
- `_byan/_memory/elo-profile.json`: persistent ELO trust score per domain
- `_byan/_memory/fact-graph.json`: verified knowledge base (persists across sessions)
- `_byan-output/`: all generated artifacts (PRD, architecture, stories, fact sheets)
- `_byan/knowledge/`: verified sources, axioms, ELO benchmarks per domain

### Worker

A worker is an npm-installable utility module that does specific work independently of the agent/workflow cycle. It can be used directly in your code.

Available workers:
- `_byan/workers/fact-check-worker.js`: scientific claim verification
- `_byan/workers/cost-optimizer.js`: intelligent LLM routing (~54% savings)

```javascript
const FactCheckWorker = require('./_byan/workers/fact-check-worker');
const fc = new FactCheckWorker({ verbose: true });

// Verify a claim
fc.check("Redis is always faster than PostgreSQL");
// → { assertionType: 'HYPOTHESIS', level: 5, score: 20, status: 'OPINION' }

// Detect implicit claims in text
fc.parse("This is obviously the best security approach");
// → [{ matched: 'obviously', position: 8, ... }]
```

---

## Architecture Diagram — WCAW

The conceptual diagram below shows how the four components interact. **Hermes** is the universal entry point: it receives your request and routes it to the right agent.

```
YOU  →  @hermes "I want to create an agent"
              │
              ▼
    ┌─────────────────────────────────────────────────────────┐
    │                  AGENT (AI specialist)                   │
    │    Persona · Menu · Rules (64 mantras) · Capabilities    │
    └────────────┬─────────────────────────┬───────────────────┘
                 │ triggers                │ calls
                 ▼                         ▼
    ┌────────────────────┐    ┌─────────────────────────────┐
    │     WORKFLOW       │    │          WORKER              │
    │  Guided steps      │    │  ELO Engine                 │
    │  Generated artifacts│    │  Fact-Checker               │
    │  Validation steps  │    │  Cost Optimizer             │
    └────────┬───────────┘    └─────────────┬───────────────┘
             │ reads/writes                 │ persists
             ▼                              ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    CONTEXT LAYER                         │
    │  config.yaml · elo-profile.json · fact-graph.json        │
    │  _byan-output/ · _byan/knowledge/ · session-state        │
    └─────────────────────────────────────────────────────────┘
```

### Interactive draw.io diagrams

For a more detailed visualization, open these files with draw.io:

- **BYAN global architecture**: [byan-architecture.drawio](./byan-architecture.drawio)
- **Workflow/Context/Agent/Worker concept**: [byan-wcaw-concept.drawio](./byan-wcaw-concept.drawio)

---

## ELO Trust System — Epistemic Confidence

BYAN v2.6.0 introduces per-domain confidence calibration (Glicko-2 algorithm, 0-1000 scale).

| ELO Range | Level | BYAN Behavior |
|-----------|-------|---------------|
| 0–200 | Apprentice | Full explanations, analogies, maximum scaffolding |
| 201–450 | Beginner | Step-by-step guidance, frequent verification |
| 450–550 | Dead zone | Intense challenge (Dunning-Kruger peak) |
| 551–750 | Intermediate | Moderate challenge, tested hypotheses |
| 751–900 | Advanced | Minimal challenge, peer-level discussion |
| 901–1000 | Expert | Short responses, no basic explanations |

**Principle:** a low score doesn't punish — it increases pedagogy. BYAN adapts to your actual level, not your declared one.

---

## Scientific Fact-Check

BYAN applies Zero Trust to itself: every claim must be **demonstrable**, **quantifiable**, **reproducible**.

```
[REASONING]              Logical deduction — no truth guarantee
[HYPOTHESIS]             Plausible in context — verify before acting
[CLAIM L{n}]             Sourced assertion — level 1 to 5
[FACT USER-VERIFIED date] Validated by user with proof artifact
```

Strict domains: `security` / `performance` / `compliance` → LEVEL-2 minimum or BLOCKED.

---

## Main Workflows

| Workflow | Description | Main agent |
|----------|-------------|-----------|
| `create-prd` | Create a Product Requirements Document | pm |
| `create-architecture` | Design technical architecture | architect |
| `create-epics-and-stories` | Break down into epics and user stories | sm |
| `sprint-planning` | Plan a sprint | sm |
| `dev-story` | Develop a user story | dev |
| `code-review` | Review code | dev / quinn |
| `quick-spec` | Quick conversational spec | quick-flow-solo-dev |
| `quick-dev` | Fast dev on existing code | quick-flow-solo-dev |
| `testarch-atdd` | Generate ATDD tests before implementation | tea |
| `fact-check` | Analyze an assertion or document | fact-checker |
| `elo-workflow` | Consult and manage ELO trust score | byan |

---

## Supported Platforms

| Platform | Invocation | Config path |
|----------|-----------|-------------|
| GitHub Copilot CLI | `@agent-name` | `.github/agents/*.md` |
| Claude Code | `@agent-name` | `.claude/rules/*.md` |
| Codex / OpenCode | `@agent-name` | `.codex/prompts/*.md` |
| Direct CLI | `node bin/byan-v2-cli.js` | `_byan/config.yaml` |

---

## License

MIT © [Yan-Acadenice](https://github.com/Yan-Acadenice)

---

*Built out of frustration, curiosity, and the desire for AI to be genuinely useful — not just impressive.*
