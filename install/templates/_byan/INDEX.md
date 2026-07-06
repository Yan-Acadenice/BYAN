# BYAN Index

> Carte du systeme de fichiers BYAN. Genere automatiquement — ne pas editer a la main.
> Source : `_byan/_config/*-manifest.csv` + scan `_byan/projet/`. Regenerer : `byan-build-index`.

## Agents (28)

### bmb
- `agent-builder` — Agent Building Expert — `_byan/agent/agent-builder/agent-builder.md`
- `drawio` — Expert Diagrammes Draw.io — `_byan/agent/drawio/drawio.md`
- `forgeron` — Revelateur d ames — `_byan/agent/forgeron/forgeron.md`
- `module-builder` — Module Creation Master — `_byan/agent/module-builder/module-builder.md`
- `turbo-whisper-integration` — Voice Dictation Integration Specialist — `_byan/agent/turbo-whisper-integration/turbo-whisper-integration.md`
- `workflow-builder` — Workflow Building Master — `_byan/agent/workflow-builder/workflow-builder.md`

### bmm
- `analyst` — Business Analyst — `_byan/agent/analyst/analyst.md`
- `architect` — Architect — `_byan/agent/architect/architect.md`
- `dev` — Developer Agent — `_byan/agent/dev/dev.md`
- `expert-merise-agile` — Expert Merise Agile - Assistant de Conception & Rédaction — `_byan/agent/expert-merise-agile/expert-merise-agile.md`
- `jimmy` — Spécialiste Documentation Technique & Processus Internes — `_byan/agent/jimmy/jimmy.md`
- `mike` — Gestionnaire de Projet — Spécialiste Leantime — `_byan/agent/mike/mike.md`
- `pm` — Product Manager — `_byan/agent/pm/pm.md`
- `quick-flow-solo-dev` — Quick Flow Solo Dev — `_byan/agent/quick-flow-solo-dev/quick-flow-solo-dev.md`
- `quinn` — QA Engineer — `_byan/agent/quinn/quinn.md`
- `sm` — Scrum Master — `_byan/agent/sm/sm.md`
- `tech-writer` — Technical Writer — `_byan/agent/tech-writer/tech-writer.md`
- `ux-designer` — UX Designer — `_byan/agent/ux-designer/ux-designer.md`

### cis
- `brainstorming-coach` — Elite Brainstorming Specialist — `_byan/agent/brainstorming-coach/brainstorming-coach.md`
- `creative-problem-solver` — Master Problem Solver — `_byan/agent/creative-problem-solver/creative-problem-solver.md`
- `design-thinking-coach` — Design Thinking Maestro — `_byan/agent/design-thinking-coach/design-thinking-coach.md`
- `innovation-strategist` — Disruptive Innovation Oracle — `_byan/agent/innovation-strategist/innovation-strategist.md`
- `presentation-master` — Visual Communication + Presentation Expert — `_byan/agent/presentation-master/presentation-master.md`
- `storyteller` — Master Storyteller — `_byan/agent/storyteller/storyteller.md`

### core
- `bmad-master` — BMad Master Executor, Knowledge Custodian, and Workflow Orchestrator — `_byan/agent/bmad-master/bmad-master.md`
- `skeptic` — Scientific Claim Challenger and Epistemic Guard — `_byan/agent/skeptic/skeptic.md`
- `tao` — Le Tao — Directeur de Voix des Agents — `_byan/agent/tao/tao.md`

### tea
- `tea` — Master Test Architect and Quality Advisor — `_byan/agent/tea/tea.md`

## Workflows (47)

### bmb
- `agent` — Tri-modal workflow for creating, editing, and validating BMAD Core compliant agents — `_byan/workflow/simple/agent/workflow.md`
- `byan-benchmark` — DATA-only benchmark engine for any decision fork: options x weighted-criteria matrix + best-first reco + dissent — `_byan/workflow/simple/bmb/byan-benchmark/workflow.md`
- `module` — Quad-modal workflow for creating BMAD modules (Brief + Create + Edit + Validate) — `_byan/workflow/simple/module/workflow.md`
- `turbo-whisper-configure` — Configure Turbo Whisper API, hotkeys, and preferences — `_byan/workflow/simple/turbo-whisper/configure-workflow.md`
- `turbo-whisper-docker-setup` — Setup self-hosted faster-whisper-server with Docker for privacy and cost-free transcription — `_byan/workflow/simple/turbo-whisper/docker-setup-workflow.md`
- `turbo-whisper-install` — Install Turbo Whisper via yanstall wizard with OS detection and dependency resolution — `_byan/workflow/simple/turbo-whisper/install-workflow.md`
- `turbo-whisper-integrate` — Integrate Turbo Whisper with GitHub Copilot CLI, Claude Code, and Codex platforms — `_byan/workflow/simple/turbo-whisper/integrate-workflow.md`
- `workflow` — Create structured standalone workflows using markdown-based step architecture (tri-modal: create, validate, edit) — `_byan/workflow/simple/workflow/workflow.md`

### bmm
- `check-implementation-readiness` — Critical validation workflow that assesses PRD, Architecture, and Epics & Stories for completeness and alignment before implementation. Uses adversarial review approach to find gaps and issues. — `_byan/workflow/simple/3-solutioning/check-implementation-readiness/workflow.md`
- `code-review` — Perform an ADVERSARIAL Senior Developer code review that finds 3-10 specific problems in every story. Challenges everything: code quality, test coverage, architecture compliance, security, performance. NEVER accepts `looks good` - must find minimum issues and can auto-fix with user approval. — `_byan/workflow/simple/4-implementation/code-review/workflow.yaml`
- `correct-course` — Navigate significant changes during sprint execution by analyzing impact, proposing solutions, and routing for implementation — `_byan/workflow/simple/4-implementation/correct-course/workflow.yaml`
- `create-architecture` — Collaborative architectural decision facilitation for AI-agent consistency. Replaces template-driven architecture with intelligent, adaptive conversation that produces a decision-focused architecture document optimized for preventing agent conflicts. — `_byan/workflow/simple/3-solutioning/create-architecture/workflow.md`
- `create-epics-and-stories` — Transform PRD requirements and Architecture decisions into comprehensive stories organized by user value. This workflow requires completed PRD + Architecture documents (UX recommended if UI exists) and breaks down requirements into implementation-ready epics and user stories that incorporate all available technical and design context. Creates detailed, actionable stories with complete acceptance criteria for development teams. — `_byan/workflow/simple/3-solutioning/create-epics-and-stories/workflow.md`
- `create-excalidraw-dataflow` — Create data flow diagrams (DFD) in Excalidraw format — `_byan/workflow/simple/excalidraw-diagrams/create-dataflow/workflow.yaml`
- `create-excalidraw-diagram` — Create system architecture diagrams, ERDs, UML diagrams, or general technical diagrams in Excalidraw format — `_byan/workflow/simple/excalidraw-diagrams/create-diagram/workflow.yaml`
- `create-excalidraw-flowchart` — Create a flowchart visualization in Excalidraw format for processes, pipelines, or logic flows — `_byan/workflow/simple/excalidraw-diagrams/create-flowchart/workflow.yaml`
- `create-excalidraw-wireframe` — Create website or app wireframes in Excalidraw format — `_byan/workflow/simple/excalidraw-diagrams/create-wireframe/workflow.yaml`
- `create-prd` — PRD tri-modal workflow - Create, Validate, or Edit comprehensive PRDs — `_byan/workflow/simple/2-plan-workflows/create-prd/workflow.md`
- `create-product-brief` — Create comprehensive product briefs through collaborative step-by-step discovery as creative Business Analyst working with the user as peers. — `_byan/workflow/simple/1-analysis/create-product-brief/workflow.md`
- `create-story` — Create the next user story from epics+stories with enhanced context analysis and direct ready-for-dev marking — `_byan/workflow/simple/4-implementation/create-story/workflow.yaml`
- `create-ux-design` — Work with a peer UX Design expert to plan your applications UX patterns, look and feel. — `_byan/workflow/simple/2-plan-workflows/create-ux-design/workflow.md`
- `dev-story` — Execute a story by implementing tasks/subtasks, writing tests, validating, and updating the story file per acceptance criteria — `_byan/workflow/simple/4-implementation/dev-story/workflow.yaml`
- `document-project` — Analyzes and documents brownfield projects by scanning codebase, architecture, and patterns to create comprehensive reference documentation for AI-assisted development — `_byan/workflow/simple/document-project/workflow.yaml`
- `generate-project-context` — Creates a concise project-context.md file with critical rules and patterns that AI agents must follow when implementing code. Optimized for LLM context efficiency. — `_byan/workflow/simple/generate-project-context/workflow.md`
- `qa-automate` — Generate tests quickly for existing features using standard test patterns — `_byan/workflow/simple/qa/automate/workflow.yaml`
- `quick-dev` — Flexible development - execute tech-specs OR direct instructions with optional planning. — `_byan/workflow/simple/bmad-quick-flow/quick-dev/workflow.md`
- `quick-spec` — Conversational spec engineering - ask questions, investigate code, produce implementation-ready tech-spec. — `_byan/workflow/simple/bmad-quick-flow/quick-spec/workflow.md`
- `research` — Conduct comprehensive research across multiple domains using current web data and verified sources - Market, Technical, Domain and other research types. — `_byan/workflow/simple/1-analysis/research/workflow.md`
- `retrospective` — Run after epic completion to review overall success, extract lessons learned, and explore if new information emerged that might impact the next epic — `_byan/workflow/simple/4-implementation/retrospective/workflow.yaml`
- `sprint-planning` — Generate and manage the sprint status tracking file for Phase 4 implementation, extracting all epics and stories from epic files and tracking their status through the development lifecycle — `_byan/workflow/simple/4-implementation/sprint-planning/workflow.yaml`
- `sprint-status` — Summarize sprint-status.yaml, surface risks, and route to the right implementation workflow. — `_byan/workflow/simple/4-implementation/sprint-status/workflow.yaml`

### cis
- `design-thinking` — Guide human-centered design processes using empathy-driven methodologies. This workflow walks through the design thinking phases - Empathize, Define, Ideate, Prototype, and Test - to create solutions deeply rooted in user needs. — `_byan/workflow/simple/design-thinking/workflow.yaml`
- `innovation-strategy` — Identify disruption opportunities and architect business model innovation. This workflow guides strategic analysis of markets, competitive dynamics, and business model innovation to uncover sustainable competitive advantages and breakthrough opportunities. — `_byan/workflow/simple/innovation-strategy/workflow.yaml`
- `problem-solving` — Apply systematic problem-solving methodologies to crack complex challenges. This workflow guides through problem diagnosis, root cause analysis, creative solution generation, evaluation, and implementation planning using proven frameworks. — `_byan/workflow/simple/problem-solving/workflow.yaml`
- `storytelling` — Craft compelling narratives using proven story frameworks and techniques. This workflow guides users through structured narrative development, applying appropriate story frameworks to create emotionally resonant and engaging stories for any purpose. — `_byan/workflow/simple/storytelling/workflow.yaml`

### core
- `brainstorming` — Facilitate interactive brainstorming sessions using diverse creative techniques and ideation methods — `_byan/workflow/simple/brainstorming/workflow.md`
- `party-mode` — Orchestrates group discussions between all installed BMAD agents, enabling natural multi-agent conversations — `_byan/workflow/simple/party-mode/workflow.md`
- `project-handoff` — Export/import portable Markdown project state between Claude Code and Codex — `_byan/workflow/simple/byan/project-handoff-workflow.md`

### tea
- `teach-me-testing` — Multi-session learning companion that teaches testing progressively through 7 structured sessions with state persistence — `_byan/workflow/simple/testarch/teach-me-testing/workflow.md`
- `testarch-atdd` — Generate failing acceptance tests before implementation using TDD red-green-refactor cycle — `_byan/workflow/simple/testarch/atdd/workflow.yaml`
- `testarch-automate` — Expand test automation coverage after implementation or analyze existing codebase to generate comprehensive test suite — `_byan/workflow/simple/testarch/automate/workflow.yaml`
- `testarch-ci` — Scaffold CI/CD quality pipeline with test execution, burn-in loops, and artifact collection — `_byan/workflow/simple/testarch/ci/workflow.yaml`
- `testarch-framework` — Initialize production-ready test framework architecture (Playwright or Cypress) with fixtures, helpers, and configuration — `_byan/workflow/simple/testarch/framework/workflow.yaml`
- `testarch-nfr` — Assess non-functional requirements (performance, security, reliability, maintainability) before release with evidence-based validation — `_byan/workflow/simple/testarch/nfr-assess/workflow.yaml`
- `testarch-test-design` — Dual-mode workflow: (1) System-level testability review in Solutioning phase, or (2) Epic-level test planning in Implementation phase. Auto-detects mode based on project phase. — `_byan/workflow/simple/testarch/test-design/workflow.yaml`
- `testarch-test-review` — Review test quality using comprehensive knowledge base and best practices validation — `_byan/workflow/simple/testarch/test-review/workflow.yaml`
- `testarch-trace` — Generate requirements-to-tests traceability matrix, analyze coverage, and make quality gate decision (PASS/CONCERNS/FAIL/WAIVED) — `_byan/workflow/simple/testarch/trace/workflow.yaml`

## Commandes (7)

- `editorial-review-prose` — Clinical copy-editor that reviews text for communication issues — `_byan/command/editorial-review-prose.xml`
- `editorial-review-structure` — Structural editor that proposes cuts, reorganization,
    and simplification while preserving comprehension — `_byan/core/tasks/editorial-review-structure.xml`
- `help` — Get unstuck by showing what workflow steps come next or answering questions about what to do — `_byan/command/help.md`
- `index-docs` — Generates or updates an index.md of all documents in the specified directory — `_byan/command/index-docs.xml`
- `review-adversarial-general` — Cynically review content and produce findings — `_byan/command/review-adversarial-general.xml`
- `shard-doc` — Splits large markdown documents into smaller, organized files based on level 2 (default) sections — `_byan/command/shard-doc.xml`
- `workflow` — Execute given workflow by loading its configuration, following instructions, and producing output — `_byan/command/workflow.xml`

## Projets (0)

