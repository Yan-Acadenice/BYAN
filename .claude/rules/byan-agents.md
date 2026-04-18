# Agents BYAN - Ecosysteme Complet

## Core Module (Foundation)

| Agent | Persona | Role |
|-------|---------|------|
| **hermes** | Dispatcher | Routeur universel, point d'entree |
| **bmad-master** | Orchestrateur | Execute workflows et tasks |
| **yanstaller** | Installeur | Installation intelligente BYAN |
| **expert-merise-agile** | Expert | Conception Merise Agile + MCD/MCT |

## BMB Module (Builders)

| Agent | Persona | Role |
|-------|---------|------|
| **byan** | Builder | Createur d'agents via interview (12 questions, 64 mantras) — [FC] + [ELO] intégrés |
| **fact-checker** | Scientifique | Fact-check: assertions, audits de documents, chaines de raisonnement |
| **agent-builder** | Constructeur | Expert en construction d'agents |
| **marc** | Specialiste | Integration GitHub Copilot |
| **rachid** | Specialiste | Deploiement NPM/NPX |
| **carmack** | Optimiseur | Optimisation tokens |
| **patnote** | Gestionnaire | Mises a jour et conflits |

## BMM Module (SDLC - Software Development Lifecycle)

| Agent | Persona | Role |
|-------|---------|------|
| **analyst** | Mary | Analyse business, etude de marche, brief |
| **architect** | Winston | Design systeme, tech stack, architecture |
| **dev** | Amelia | Implementation, coding, ultra-succincte |
| **pm** | John | Product management, PRD, roadmap |
| **sm** | Bob | Scrum master, sprint planning, backlog |
| **quinn** | Quinn | QA engineer, tests, couverture |
| **tech-writer** | Paige | Documentation, guides, clarity |
| **ux-designer** | Sally | UX/UI design, empathie utilisateur |
| **quick-flow-solo-dev** | Barry | Dev rapide brownfield |

## CIS Module (Creative Innovation & Strategy)

| Agent | Persona | Role |
|-------|---------|------|
| **brainstorming-coach** | Carson | Ideation, "YES AND" energy |
| **creative-problem-solver** | Dr. Quinn | Resolution de problemes |
| **design-thinking-coach** | Maya | Design thinking |
| **innovation-strategist** | Victor | Strategie innovation |
| **presentation-master** | Caravaggio | Presentations, slides |
| **storyteller** | Sophia | Storytelling, narratives |

## TEA Module (Test Engineering & Architecture)

| Agent | Persona | Role |
|-------|---------|------|
| **tea** | Murat | Master test architect (ATDD, NFR, CI/CD) |

## Workflows Cles

| Workflow | Description |
|----------|-------------|
| `create-prd` | Creer un Product Requirements Document |
| `create-architecture` | Concevoir l'architecture technique |
| `create-epics-and-stories` | Decouper en epics et user stories |
| `sprint-planning` | Planifier un sprint |
| `dev-story` | Developper une story |
| `code-review` | Revoir du code |
| `quick-spec` | Spec rapide conversationnelle |
| `quick-dev` | Dev rapide (brownfield) |
| `elo-workflow` | Consulter et gerer le score ELO (via menu [ELO] du BYAN) |

## Comment Invoquer un Agent

Dans Claude Code, demande simplement:
- "Je veux creer une architecture" → Hermes recommande `architect`
- "Analyse ce projet" → Hermes recommande `analyst`
- "Cree un nouvel agent" → Hermes recommande `byan`
