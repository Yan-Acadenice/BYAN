# BYAN v2.6.0 — Build Your AI Network

[![npm](https://img.shields.io/npm/v/create-byan-agent.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-1444%2F1466-brightgreen.svg)](https://github.com/Yan-Acadenice/BYAN)
[![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org)

**Intelligent AI Agent Creator** | Merise Agile + TDD + 64 Mantras

> La documentation française est disponible ici : [README.md](./README.md)

---

## Welcome

**BYAN** is your AI companion on any project — whether you're a seasoned developer, a vibe coder, or just curious about what AI agents can do.

> **Important:** BYAN is an MVP / proof of concept. It's not a finished production release. It's an actively evolving tool, and that's precisely where its value lies.

### Why BYAN exists

It started simply: a large project, tight deadlines, no budget, and an inexperienced team. What followed were brutal crunch periods, burnt-out developers, and mediocre results.

To escape that situation, I turned to AI agents to accelerate development. One of my students introduced me to the **BMAD** method — an AI agent orchestration framework. Initially skeptical, I was impressed by the results, even though these agents suffered from the usual LLM biases: hallucinations, overconfidence, and heavy dependence on how you phrased things.

A simple idea emerged: **what if we gave all these agents a shared framework that injects intelligence regardless of the project or the underlying model?**

The answer was to instill **mantras** — absolute rules that every agent must follow. Epistemic, methodological, and behavioral guardrails that transform a verbose LLM into a reliable partner.

The next question: in a multi-agent system, how do you guarantee every agent shares these best practices? By embedding them at the source — **at agent creation time**. That's where BYAN comes in.

### What BYAN is not

BYAN isn't magic. It won't solve your problems automatically. Its goal is to maximize **human-machine collaboration** — making AI agents a genuine extension of your brain, not a replacement for thinking. BYAN will challenge your problem statement, question your assumptions, and help you design agents that hold up — not agents you constantly have to babysit.

---

## Installation

### Prerequisites

- Node.js >= 12.0.0
- npm >= 6.0.0
- GitHub Copilot, Claude Code, or Codex account (depending on your target platform)

### Quick install (recommended)

```bash
# Create a new BYAN project (no prior installation needed)
npx create-byan-agent

# Or install globally
npm install -g create-byan-agent
create-byan-agent
```

The installer (Yanstaller) guides you interactively:

```
? Project name: my-project
? Communication language: English
? Target platform: GitHub Copilot CLI
? Enable scientific fact-checking? [Y/n]
? Enable ELO trust system? [Y/n]
? Optimize LLM costs automatically (~54% savings)? [Y/n]
```

After installation, your project contains:

```
your-project/
  _byan/               # BYAN platform
    _config/           # Agent and workflow manifests
    _memory/           # Persistent memory (ELO, fact-graph)
    agents/            # Available agents
    workflows/         # Guided workflows
    knowledge/         # Verified knowledge base and sources
    config.yaml        # Main configuration
  .github/agents/      # GitHub Copilot CLI wrappers
  .claude/             # Claude Code integration (if enabled)
  .codex/              # Codex/OpenCode integration (if enabled)
  bin/byan-v2-cli.js   # BYAN CLI
```

### CLI usage

```bash
# Start the intelligent interview (creates an agent in 12 questions)
node bin/byan-v2-cli.js create

# Check session status
node bin/byan-v2-cli.js status

# ELO trust system — confidence score per domain
node bin/byan-v2-cli.js elo summary
node bin/byan-v2-cli.js elo context security
node bin/byan-v2-cli.js elo record javascript VALIDATED

# Scientific fact-checking
node bin/byan-v2-cli.js fc check "Redis is always faster than PostgreSQL"
node bin/byan-v2-cli.js fc parse "This is obviously the best approach"
node bin/byan-v2-cli.js fc graph
```

### Programmatic usage

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

---

## Architecture

BYAN is built around four core concepts that work together:

### Agent

An agent is an AI specialist with a defined identity. It has:
- **Persona**: who it is, communication style, strengths
- **Menu**: available actions, each linked to a workflow or command
- **Rules**: absolute constraints it cannot violate (the 64 mantras)
- **Capabilities**: what it can do, what it won't

Agents are Markdown files with XML sections. They live in `_byan/{module}/agents/` and are exposed on each platform via a lightweight wrapper (`.github/agents/`, `.claude/`, `.codex/prompts/`).

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

fc.check("Redis is always faster than PostgreSQL");
// → { assertionType: 'HYPOTHESIS', level: 5, score: 20, status: 'OPINION' }

fc.parse("This is obviously the best security approach");
// → [{ matched: 'obviously', position: 8, ... }]
```

### Architecture diagram

```
┌─────────────────────────────────────────────────────────────┐
│                          USER                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ @agent or command
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   AGENT (AI specialist)                     │
│  Persona + Menu + Rules (64 mantras) + Capabilities         │
└────────────┬──────────────────────────────┬─────────────────┘
             │ executes                      │ uses
             ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────┐
│       WORKFLOW         │    │          WORKER               │
│  Guided steps          │    │  fact-check / cost-optimizer  │
│  Generated artifacts   │    │  ELO engine                   │
└────────────┬───────────┘    └──────────────┬───────────────┘
             │ reads/writes                   │ persists
             ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     CONTEXT LAYER                           │
│  config.yaml · elo-profile.json · fact-graph.json           │
│  _byan-output/ · _byan/knowledge/ · session state           │
└─────────────────────────────────────────────────────────────┘
```

> Interactive draw.io diagram: [byan-architecture.drawio](./byan-architecture.drawio)

---

## ELO Trust System

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

## Agent Catalog

### Core — Platform Foundation

| Agent | Persona | Role | Typical use case |
|-------|---------|------|-----------------|
| **hermes** | Dispatcher | Universal router — recommends the right agent for your task | "Which agent to build a REST API?" |
| **bmad-master** | Orchestrator | Runs BMAD workflows and tasks directly | Launch a complete workflow without intermediaries |
| **yanstaller** | Installer | Interactive BYAN installation | Initial setup of a new project |
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
| **tea** | Murat | Master test architect — ATDD, NFR, CI/CD, risk-based | Design a complete project test strategy |

---

## Supported Platforms

| Platform | Invocation | Config path |
|----------|-----------|-------------|
| GitHub Copilot CLI | `@agent-name` | `.github/agents/*.md` |
| Claude Code | `@agent-name` | `.claude/rules/*.md` |
| Codex / OpenCode | `@agent-name` | `.codex/prompts/*.md` |
| Direct CLI | `node bin/byan-v2-cli.js` | `_byan/config.yaml` |

---

## Contributors

### Creator & Lead Developer

**[Yan-Acadenice](https://github.com/Yan-Acadenice)** — Architecture, design, and development of BYAN

### Main Contributor — Hermes

**[Wazadriano](https://github.com/orgs/Centralis-V3/people/Wazadriano)** — Hermes Universal Dispatcher (v2.3.2)
- Architecture and design of the Hermes universal dispatcher
- Intelligent routing rules and multi-agent pipelines
- Full integration with the BYAN ecosystem

### Acknowledgments

BYAN is built on top of the **[BMAD method](https://github.com/bmadcode/BMAD-METHOD)**, discovered through a student from **[Acadenice](https://acadenice.fr/)**.

---

## License

MIT © [Yan-Acadenice](https://github.com/Yan-Acadenice)

---

*Built out of frustration, curiosity, and the desire for AI to be genuinely useful — not just impressive.*
