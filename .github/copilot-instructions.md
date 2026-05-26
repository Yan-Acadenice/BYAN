# GitHub Copilot Instructions for BMAD Platform

## Project Overview

**BMAD (Business Modeling & Agent Development)** is a modular AI-agent platform that orchestrates specialized agents through structured workflows. The project implements **Merise Agile + TDD methodology** with 64 core mantras applied systematically across all agent creation and workflows.

**Key Modules:**
- **Core** (`_bmad/core/`): Platform foundation with party-mode, brainstorming, and base tasks
- **BMM** (`_bmad/bmm/`): Complete software development lifecycle (Analysis → Planning → Solutioning → Implementation)
- **BMB** (`_bmad/bmb/`): Meta-system for building agents, modules, and workflows
- **TEA** (`_bmad/tea/`): Test Architecture module (ATDD, automation, CI/CD, NFR assessment)
- **CIS** (`_bmad/cis/`): Creative Innovation & Strategy (design thinking, problem solving, storytelling)

## Architecture

### Agent System

**Agent Format:** Markdown files with YAML frontmatter + XML definitions
- Location: `_bmad/{module}/agents/{agent-name}.md`
- Structure: Frontmatter → Activation → Persona → Menu → Knowledge Base → Capabilities
- Activation is critical: Multi-step sequence that loads config, displays menu, waits for user input
- Menu handlers: `exec`, `workflow`, `tmpl`, `data`, `action`, `validate-workflow`

**Multi-Platform Support:**
- GitHub Copilot CLI (`.github/agents/*.md`)
- VSCode extensions
- Claude Code / Anthropic
- Codex platform (`.codex/prompts/*.md`)

**Agent Manifest:** `_bmad/_config/agent-manifest.csv` - Single source of truth for all installed agents

### Workflow System

**Workflow Format:** Markdown-based, multi-step, with YAML or MD steps
- Location: `_bmad/{module}/workflows/{workflow-name}/workflow.{md|yaml}`
- Steps: Separate files in `steps/` subdirectory for complex workflows
- Manifest: `_bmad/_config/workflow-manifest.csv` (name, description, module, path)
- Config resolution: `{project-root}`, `{output_folder}`, `{user_name}`, `{communication_language}`

**Workflow Types:**
- **Tri-modal:** Create / Validate / Edit (e.g., PRD, Architecture, Agents)
- **Sequential:** Multi-phase guided processes (e.g., Interview, Sprint Planning)
- **Standalone Tasks:** One-off utilities (e.g., Editorial Review, Shard Doc)

### Configuration System

**Module Configs:** Each module has `_bmad/{module}/config.yaml`
```yaml
user_name: Yan
communication_language: Francais|English
document_output_language: Francais|English
output_folder: "{project-root}/_bmad-output"
```

**Critical Variables:**
- `{project-root}`: Repository root
- `{planning_artifacts}`: `_bmad-output/planning-artifacts/`
- `{implementation_artifacts}`: `_bmad-output/implementation-artifacts/`
- `{project_knowledge}`: `docs/`

### Directory Structure

```
{project-root}/
├── _bmad/                          # Platform code
│   ├── _config/                    # Manifests (agents, workflows, tasks)
│   ├── _memory/                    # Agent persistent memory
│   ├── core/                       # Core module
│   │   ├── agents/
│   │   ├── workflows/
│   │   ├── tasks/
│   │   └── config.yaml
│   ├── bmm/                        # SDLC module
│   ├── bmb/                        # Builder module
│   ├── tea/                        # Test Architecture module
│   └── cis/                        # Innovation module
├── _bmad-output/                   # Generated artifacts
│   ├── planning-artifacts/
│   ├── implementation-artifacts/
│   └── bmb-creations/              # BYAN-created agents
├── .github/
│   └── agents/                     # GitHub Copilot agent definitions
└── .codex/
    └── prompts/                    # Codex/OpenCode agent definitions
```

## Code Conventions

### Agent Creation (BYAN/BMB Module)

**64 Mantras Applied:**
- **Mantra #37:** Ockham's Razor - Simplicity first, MVP approach
- **Mantra #39:** Every action has consequences - Evaluate before executing
- **Mantra IA-1:** Trust But Verify - Challenge all requirements
- **Mantra IA-16:** Challenge Before Confirm - Play devil's advocate
- **Mantra IA-23:** No Emoji Pollution - Zero emojis in code, commits, technical specs
- **Mantra IA-24:** Clean Code - Self-documenting, minimal comments

**Agent XML Structure:**
```xml
<agent id="agent-id" name="AgentName" title="Title" icon="🔧">
  <activation critical="MANDATORY">
    <step n="1">Load persona</step>
    <step n="2">Load config from {project-root}/_bmad/{module}/config.yaml</step>
    <step n="3">Store session variables</step>
    <step n="4-6">Display menu and wait for input</step>
  </activation>
  <persona>...</persona>
  <menu>...</menu>
  <capabilities>...</capabilities>
</agent>
```

### Workflow Creation

**Workflow Frontmatter:**
```yaml
---
name: workflow-name
description: Brief description
---
```

**Step Files:** Use numbered prefixes (`step-01-`, `step-02-`)

**Config Resolution:** Always resolve `{project-root}` and other variables from module config

### Merise Agile + TDD Principles

**Data Dictionary First:** Define all data entities before modeling (Mantra #33)

**MCD ⇄ MCT Cross-validation:** Ensure coherence between data (MCD) and treatments (MCT) (Mantra #34)

**Bottom-Up from User Stories:** Entities emerge from user stories, not reverse

**Incremental Design:** Sprint 0 = skeletal MCD, enriched sprint-by-sprint

**Test-Driven at All Levels:** Conceptual tests before implementation

### Git Commit Convention

**NO EMOJIS IN COMMITS** (Mantra IA-23)

Format: `<type>: <description>`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Examples:
  - `feat: add BYAN intelligent interview workflow`
  - `fix: resolve config loading race condition`
  - `docs: update agent creation guide`

### Code Quality

**Self-Documenting Code:**
- Variable/function names explain purpose
- Avoid useless comments like `// increment counter`
- Comments only for WHY, not WHAT

**Clean Code Principles:**
- Functions do one thing
- Minimal parameters (max 3)
- No side effects in pure functions

## Development Workflows

### Phase 0: Project Setup
```bash
# Document existing project (brownfield)
# Activates: Analyst agent
@bmad-bmm-document-project

# Generate project-context.md for AI agents
@bmad-bmm-generate-project-context
```

### Phase 1: Analysis
```bash
# Brainstorm project ideas
@bmad-brainstorming

# Create product brief
@bmad-bmm-create-brief

# Research (market/domain/technical)
@bmad-bmm-research research_type=market
```

### Phase 2: Planning
```bash
# Create PRD (required)
@bmad-bmm-create-prd

# Create UX design (optional, for UI projects)
@bmad-bmm-create-ux-design

# Validate PRD
@bmad-bmm-validate-prd
```

### Phase 3: Solutioning
```bash
# Create architecture (required)
@bmad-bmm-create-architecture

# Create epics and stories (required)
@bmad-bmm-create-epics-and-stories

# Check implementation readiness
@bmad-bmm-check-implementation-readiness
```

### Phase 4: Implementation
```bash
# Generate sprint plan
@bmad-bmm-sprint-planning

# Check sprint status
@bmad-bmm-sprint-status

# Create story (from epic)
@bmad-bmm-create-story

# Develop story
@bmad-bmm-dev-story

# Code review
@bmad-bmm-code-review

# QA automation (add tests)
@bmad-bmm-qa-automate

# Retrospective (after epic)
@bmad-bmm-retrospective
```

### Quick Flow (Brownfield/Small Changes)
```bash
# Quick spec (conversational)
@bmad-bmm-quick-spec

# Quick dev (direct implementation)
@bmad-bmm-quick-dev
```

### Meta-Workflows (BMB Module)
```bash
# Create new agent via intelligent interview
# Activates: BYAN agent
@bmad-bmb-agent mode=create

# Create new workflow
@bmad-bmb-workflow mode=create

# Create new module
@bmad-bmb-module mode=create
```

### Testing Workflows (TEA Module)
```bash
# Initialize test framework (Playwright/Cypress)
@bmad-tea-testarch-framework

# Generate ATDD tests (before implementation)
@bmad-tea-testarch-atdd

# Expand test automation coverage
@bmad-tea-testarch-automate

# Generate traceability matrix
@bmad-tea-testarch-trace

# Assess NFRs (performance, security)
@bmad-tea-testarch-nfr-assess

# Setup CI/CD pipeline
@bmad-tea-testarch-ci
```

## Agent Personalities

When working with agents, respect their distinct communication styles:

- **BYAN (Builder):** Professional consultant, challenges requirements, Zero Trust
- **Analyst (Mary):** Treasure hunter energy, excited by patterns
- **PM (John):** Relentlessly asks WHY, direct and data-sharp
- **Architect (Winston):** Calm pragmatist, balances "could be" vs "should be"
- **Dev (Amelia):** Ultra-succinct, speaks in file paths and AC IDs
- **SM (Bob):** Crisp and checklist-driven, zero tolerance for ambiguity
- **Quinn (QA):** Practical, ships fast, coverage first
- **UX Designer (Sally):** Tells user stories with empathy, paints pictures
- **Tech Writer (Paige):** Patient educator, clarity above all
- **TEA (Murat):** Risk-based testing expert, strong opinions weakly held
- **Carson (Brainstorming):** Enthusiastic improv coach, YES AND energy

## Special Commands

### `/bmad-help`
Get contextual advice on what to do next. Can be combined with your question:
```
/bmad-help I want to create an agent for backend development
/bmad-help where should I start with this API project
```

### Party Mode
Orchestrates multi-agent discussions:
```
@bmad-party-mode
```

### Tasks (Standalone Utilities)

**Editorial Review:**
```bash
# Prose review (clinical copy-editing)
@bmad-editorial-review-prose

# Structure review (cuts, reorganization)
@bmad-editorial-review-structure
```

**Documentation:**
```bash
# Generate index.md for directory
@bmad-index-docs

# Split large markdown into smaller files
@bmad-shard-doc
```

**Adversarial Review:**
```bash
# Cynical review to find problems
@bmad-review-adversarial-general
```

## Anti-Patterns to Avoid

**DO NOT:**
- ❌ Use emojis in code, commits, or technical documentation
- ❌ Add descriptive comments explaining obvious code
- ❌ Create "big bang" features - prefer incremental
- ❌ Skip MCD ⇄ MCT validation in Merise workflows
- ❌ Accept user requirements blindly without validation
- ❌ Pre-load resources - load at runtime only (except config in activation step 2)
- ❌ Add features "just in case" (YAGNI principle)
- ❌ Create technical solutions before understanding business needs

**DO:**
- ✅ Challenge requirements systematically (Challenge Before Confirm)
- ✅ Evaluate consequences before actions (10-dimension checklist)
- ✅ Apply Ockham's Razor - simplicity first
- ✅ Start with Data Dictionary in Merise modeling
- ✅ Use self-documenting code with minimal comments
- ✅ Commit early and often with clean messages
- ✅ Test-driven at conceptual level before implementation

## Working with Existing Codebases

When analyzing brownfield projects:

1. **Run Document Project workflow** (`@bmad-bmm-document-project`) to scan and understand codebase
2. **Generate Project Context** (`@bmad-bmm-generate-project-context`) for LLM-optimized rules/patterns
3. **Use Quick Flow** for changes within established patterns
4. **Use full BMAD flow** for significant new features

## Communication Languages

**User Language:** Configured in `_bmad/{module}/config.yaml`
- `communication_language: Francais` → Agents speak French
- `communication_language: English` → Agents speak English
- `document_output_language`: Controls artifact language

**Technical outputs** (code, commits) always in English regardless of user language.

## Testing

**Test Levels (prefer lower):**
- Unit > Integration > E2E
- API tests are first-class citizens, not just UI support

**Test Coverage:**
- All new code requires unit tests
- Critical paths require integration tests
- User journeys require E2E tests

**Framework Detection:**
- Platform auto-detects: Playwright, Cypress, Jest, Vitest, pytest, RSpec
- Use existing project patterns

## Additional Context

**Modules Summary:**

| Module | Purpose | Key Agents | Main Workflows |
|--------|---------|------------|----------------|
| **Core** | Platform foundation | bmad-master | brainstorming, party-mode |
| **BMM** | Software development | Analyst, PM, Architect, Dev, SM, Quinn | create-prd, create-architecture, dev-story, code-review |
| **BMB** | Meta-system builder | BYAN, Agent-Builder, Module-Builder | agent (create/edit/validate), module, workflow |
| **TEA** | Test architecture | TEA (Murat) | testarch-framework, atdd, automate, trace, nfr-assess, ci |
| **CIS** | Innovation & creativity | Carson, Dr. Quinn, Maya, Victor | brainstorming, design-thinking, problem-solving, innovation-strategy |

**Project Context Files:**
- `_bmad-output/planning-artifacts/` - PRDs, architecture, epics/stories
- `_bmad-output/implementation-artifacts/` - Sprint plans, stories, code reviews
- `docs/` or `{project_knowledge}` - Long-term documentation

**State Management:**
- Workflows persist state in frontmatter
- Agent memory in `_bmad/_memory/{agent-name}-sidecar/`
- Sprint tracking in `sprint-status.yaml`

**Resource Loading:**
- Never pre-load resources
- Load at runtime when workflow executes
- Exception: Config loading in agent activation step 2

## References

- BYAN README: `install/README.md`
- Workflow Manifests: `_bmad/_config/workflow-manifest.csv`
- Agent Manifests: `_bmad/_config/agent-manifest.csv`
- Task Manifests: `_bmad/_config/task-manifest.csv`
- Module Help: `_bmad/{module}/module-help.csv`

## Agent Native Capabilities

All BMAD agents are **natively workflow-aware and delegation-capable**. These capabilities are loaded automatically via the soul-activation protocol (`_byan/core/activation/soul-activation.md`).

### Invoke Workflows
```
@bmad-{module}-{workflow}
Example: @bmad-bmm-create-prd, @bmad-tea-testarch-atdd, @bmad-bmb-agent
```
Manifests: `_bmad/_config/workflow-manifest.csv`

### Delegate to Agents
```
@bmad-agent-{name}
Example: @bmad-agent-bmm-dev, @bmad-agent-byan, @bmad-agent-bmm-analyst
```
Manifests: `_bmad/_config/agent-manifest.csv`

### Context Variables
Available after config loading: `{project-root}`, `{output_folder}`, `{planning_artifacts}`, `{implementation_artifacts}`, `{user_name}`, `{communication_language}`

### Multi-Agent Orchestration
- Agents can **invoke other agents** mid-workflow for specialized tasks
- Agents can **launch workflows** directly via menu handlers (`exec`, `workflow`)
- **Party Mode** (`@bmad-party-mode`) enables multi-agent discussions
- **Pipeline**: Chain agents sequentially (PM → Architect → Dev → QA)

### Menu Handlers
Agents execute actions via: `exec`, `workflow`, `tmpl`, `data`, `action`, `validate-workflow`

### Soul System
Agents load personality (soul.md), voice (tao.md), and memory (soul-memory.md) via the centralized protocol at `_byan/core/activation/soul-activation.md`.

<!-- BYAN-STRICT:BEGIN (Generated by byan-sync-rules from _byan/_config/strict-mode.yaml. Do not hand-edit.) -->
## BYAN Strict Mode

[STRICT MODE ACTIVE]
You are under BYAN Strict Mode. Before building:
  1. Lock the scope (byan_strict_lock_scope) with testable acceptance criteria.
While building:
  2. Do not downgrade the scope. Surface any gap, do not cut silently.
Before delivering:
  3. Run >= 3 self-verify passes (byan_strict_self_verify), re-reading the
     original request each time. The last pass must report verdict "ok".
  4. Call byan_strict_complete to earn the audit token.
Hard claims (security/performance/compliance) require LEVEL-1 sourcing (95%).
A commit without a fresh, matching audit token is blocked by the pre-commit gate.

Use the `byan` MCP strict tools to lock scope, self-verify (>= 3 passes),
and complete. The pre-commit gate is the final net: a commit without a fresh,
matching audit token is rejected.

Hard mantras:

- **STRICT-1 Scope Lock First** — Reformulate the request and lock the scope before any build. The locked scope is the contract for the rest of the task.
- **STRICT-2 No Downgrade** — Deliver the scope that was asked. Do not substitute an MVP, a stub, or a "simplified version" unless the user approves it and it is recorded in the audit trail.
- **STRICT-3 No Silent Cut** — If a part of the scope cannot be done, surface it as a gap in the self_verify findings. Do not drop it quietly.
- **STRICT-4 Self-Verify Three Times** — Run at least three self-verification passes against the locked acceptance criteria before calling complete.
- **STRICT-5 Re-Read The Original** — Each self-verify pass re-reads the original request, not your own summary of it.
- **STRICT-6 Evidence Over Assertion** — A "done" claim needs an artifact (test output, file diff, command result), not a statement.
- **STRICT-7 Hard Claim Floor** — Claims in security, performance, or compliance need LEVEL-1 sourcing (95%) or they are BLOCKED.
- **STRICT-8 Gap Is Not Failure** — Reporting a gap is the correct behavior. Hiding a gap is the violation.
- **STRICT-9 Audit Trail** — Every scope lock, verify pass, and completion is appended to the audit log. The commit gate reads this trail.
- **STRICT-10 No Premature Complete** — complete is rejected below three passes or when the last pass found a gap.
- **STRICT-11 Honest Status** — Report failing tests with their output. Report skipped steps as skipped. Do not round a partial result up to "done".
- **STRICT-12 Full Over Fast** — When the user states "complete, no cost compromise", speed is out of scope. Do not re-question the budget under the guise of an estimate.
<!-- BYAN-STRICT:END -->
