# Hermes - Dispatcher Universel BYAN

## Vue d'ensemble

**Hermes** est le point d'entrée intelligent de l'écosystème BYAN v2.3.2+. Comme le dieu grec messager, il connaît tous les agents (35+), workflows, et contextes du système et route l'utilisateur vers le bon spécialiste.

**Hermes ne fait pas le travail - il dispatch au bon agent.**

## Installation

Hermes est automatiquement installé avec BYAN v2.3.2+:

```bash
npx create-byan-agent
```

Ou global:

```bash
npm install -g create-byan-agent
```

## Invocation

```bash
# Via GitHub Copilot CLI
@hermes

# Via Codex
codex hermes

# Via Claude
claude hermes
```

## Menu Principal

Quand vous invoquez `@hermes`, vous obtenez un menu interactif:

```
╔═══════════════════════════════════════════════════════════════╗
║  🏛️  HERMES - Dispatcher Universel BYAN                     ║
║  Point d'Entrée Intelligent                                  ║
╚═══════════════════════════════════════════════════════════════╝

Salut {user}! 👋

📋 MENU PRINCIPAL:

[1] [LA]    Lister les Agents (par module)
[2] [LW]    Lister les Workflows
[3] [LC]    Lister les Contextes Projet
[4] [REC]   Routing Intelligent - Quel agent pour ma tâche?
[5] [PIPE]  Pipeline - Créer une chaîne d'agents
[6] [?]     Aide Rapide sur un agent
[7] [@]     Invoquer un Agent directement
[8] [EXIT]  Quitter Hermes
[9] [HELP]  Afficher ce menu
```

## Commandes

### 1. Liste des Agents - [LA]

Affiche tous les 35+ agents organisés par module:

```
📦 MODULE: core (Foundation)
├─ hermes              🏛️  Dispatcher Universel BYAN
├─ bmad-master         🧙  Master Executor & Orchestrator
├─ yanstaller          📦  Installateur Intelligent
└─ expert-merise-agile 📐  Expert Conception Merise

🔨 MODULE: bmb (Builders)
├─ byan                🤖  Agent Creator (Interview)
├─ byan-v2             🤖  BYAN v2 (Optimized)
├─ agent-builder       🏗️  Agent Construction Expert
├─ marc                🔷  GitHub Copilot Integration
├─ rachid              📦  NPM/NPX Deployment
└─ ... (11 total)

💼 MODULE: bmm (Management - SDLC)
├─ analyst             📊  Business Analyst (Mary)
├─ architect           🏗️  Software Architect (Winston)
├─ dev                 💻  Developer (Amelia)
├─ pm                  📋  Product Manager (John)
└─ ... (10 total)

🎨 MODULE: cis (Creative & Innovation)
├─ brainstorming-coach 🧠  Brainstorming (Carson)
├─ storyteller         📖  Storytelling (Sophia)
└─ ... (6 total)

🧪 MODULE: tea (Testing)
└─ tea                 🧪  Master Test Architect (Murat)
```

### 2. Routing Intelligent - [REC]

Décris ta tâche, Hermes recommande les meilleurs agents:

```
Tu: [REC] j'ai besoin de créer un nouveau microservice avec tests

Hermes:
🎯 RECOMMANDATION INTELLIGENTE:

| # | Agent          | Module | Pourquoi                           |
|---|----------------|--------|------------------------------------|
| 1 | Architect      | bmm    | Architecture & design pattern      |
| 2 | Dev (Amelia)   | bmm    | Implementation microservice        |
| 3 | Tea (Murat)    | tea    | Test strategy & automation         |

💡 Tape @architect pour démarrer
💡 Ou [PIPE] pour créer une chaîne complète
```

### 3. Pipeline Multi-Agents - [PIPE]

Crée une chaîne d'agents pour un objectif complexe:

```
Tu: [PIPE] feature complète de A à Z

Hermes:
🔗 PIPELINE PROPOSÉ:

| Étape | Agent          | Rôle                  | Livrable         |
|-------|----------------|-----------------------|------------------|
| 1     | PM (John)      | Définir feature       | User stories     |
| 2     | Architect      | Architecture          | Schema technique |
| 3     | UX Designer    | Interface design      | Maquettes        |
| 4     | Dev (Amelia)   | Implémentation        | Code             |
| 5     | Tea (Murat)    | Tests                 | Suite de tests   |

✅ Valide ce pipeline?
💡 Tape @pm pour démarrer à l'étape 1
```

### 4. Aide Rapide - [?agent]

Info rapide sur un agent sans le charger:

```
Tu: ?byan

Hermes:
📋 AGENT: byan

🏷️  Title: Intelligent Agent Creator
📦 Module: bmb
👤 Role: Agent Builder via Structured Interview
📝 Description: Creates custom BYAN agents through 12-question interview.
              Applies 64 mantras, Merise Agile + TDD methodology.

💡 Tape @byan pour l'invoquer
💡 Ou [LA] pour voir tous les agents
```

### 5. Invocation Directe - [@agent]

Charge et active un agent immédiatement:

```
Tu: @dev

Hermes:
✅ Agent dev loaded. Follow its activation instructions.

[Dev agent takes over, Hermes exits]
```

## Raccourcis

Hermes supporte des raccourcis pour aller plus vite:

```bash
# Invocation directe (sans passer par le menu)
@hermes @dev           # Charge Dev directement
@hermes ?byan          # Aide sur BYAN
@hermes la             # Liste agents

# Routing en une commande
@hermes rec créer API backend
@hermes pipe feature auth complète

# Aliases
@hermes agents         # = [LA]
@hermes workflows      # = [LW]
@hermes help           # = [HELP]
```

## Règles de Routage Intelligent

Hermes applique ces règles pour recommander des agents:

| Mots-clés | Agent(s) Recommandés | Module |
|-----------|----------------------|--------|
| create agent, new agent, build agent | BYAN v2 | bmb |
| npm, publish, package | Rachid | bmb |
| copilot integration | Marc | bmb |
| optimize tokens, reduce size | Carmack | bmb |
| product brief, prd, requirements | PM (John) | bmm |
| architecture, design system, tech stack | Architect (Winston) | bmm |
| user stories, sprint, backlog | SM (Bob) | bmm |
| business analysis, market research | Analyst (Mary) | bmm |
| ux, ui, interface, design | UX Designer (Sally) | bmm |
| code, implement, develop, feature | Dev (Amelia) | bmm |
| quick dev, fast, brownfield | Quick Flow (Barry) | bmm |
| document, documentation, readme | Tech Writer (Paige) | bmm |
| test, qa, quality, automation | Tea (Murat) / Quinn | tea / bmm |
| code review | Dev (Amelia) | bmm |
| brainstorm, ideation, ideas | Brainstorming Coach (Carson) | cis |
| problem, stuck, solve | Creative Problem Solver | cis |
| presentation, slides, pitch | Presentation Master | cis |
| story, narrative, storytelling | Storyteller (Sophia) | cis |
| innovation, disrupt | Innovation Strategist | cis |
| design thinking, empathy | Design Thinking Coach | cis |
| merise, mcd, mct, conceptual model | Expert Merise Agile | core |

## Pipelines Prédéfinis

Hermes connaît ces pipelines courants:

1. **Feature Complete**: PM → Architect → UX → SM → Dev → Tea
2. **Idea to Code**: PM → Architect → SM → Quick Flow
3. **New Agent**: BYAN (handles entire flow)
4. **Refactoring**: Architect → Dev → Tea
5. **Bug Fix**: Dev → Quinn
6. **Documentation**: Analyst → Tech Writer
7. **Quality Complete**: Tea → Quinn → code-review

## Exemples d'Utilisation

### Exemple 1: Nouveau projet

```bash
@hermes

# Menu apparaît
[4] [REC]   # Tu tapes 4 ou REC

# Hermes: Décris ta tâche
Tu: créer un nouveau backend API REST avec auth JWT

# Hermes recommande: PM → Architect → Dev → Tea
# Tu tapes @pm pour démarrer
```

### Exemple 2: Exploration agents

```bash
@hermes

# Menu apparaît
[1] [LA]    # Liste tous les agents

# Tu vois: dev (Amelia) - Developer
[6] ?dev    # Info rapide sur Dev

# Tu décides d'invoquer
[7] @dev    # Charge Dev agent
```

### Exemple 3: Pipeline custom

```bash
@hermes

[5] [PIPE]  # Créer pipeline

# Hermes: Décris l'objectif
Tu: migration legacy vers microservices avec tests

# Hermes propose: Architect → Dev → Tea → Tech Writer
# Tu valides et commences
```

## Architecture Technique

### Manifestes

Hermes lit 3 manifestes CSV:

```
.github/copilot/_config/
├── agent-manifest.csv      # 35+ agents
├── workflow-manifest.csv   # Workflows par module
└── task-manifest.csv       # Tasks standalone
```

### Activation en 6 Étapes

1. Load persona complet
2. **CRITICAL**: Charge config.yaml (user_name, communication_language, etc.)
3. Store variables de session
4. Display menu
5. WAIT for user input
6. Process input via handlers

### Handlers

- **Number handler**: Commandes numériques (1-9)
- **Command handler**: Aliases (LA, REC, PIPE, etc.)
- **Invoke handler**: @agent-name → charge agent
- **Fuzzy handler**: Texte libre → match partiel → suggère

## Configuration

Hermes lit la config globale:

```yaml
# .github/copilot/config.yaml
user_name: "Yan"
communication_language: "Francais"
document_output_language: "Francais"
output_folder: "{project-root}/_byan-output"
project_root: "/home/yan/conception"
```

## Mantras Hermes

Hermes applique ces mantras BYAN:

- **#7 - KISS**: Interface délibérément minimaliste
- **#37 - Ockham's Razor**: Simplicité d'abord
- **#4 - Fail Fast**: Erreurs immédiates et actionnables
- **IA-21 - Self-Aware**: "Je dispatch, je n'exécute pas"
- **IA-24 - Clean Code**: Communication minimale et claire

## Troubleshooting

### Config non trouvée

```
❌ ERROR: Config file not found at {project-root}/.github/copilot/config.yaml

Cannot proceed without configuration.
💡 Run: npx create-byan-agent
```

**Solution**: Installer BYAN via Yanstaller

### Agent non trouvé

```
❌ Agent 'deev' not found in manifest.
💡 Tape [LA] to list all agents
💡 Or [REC] for smart recommendation
```

**Solution**: Vérifie orthographe ou utilise [REC]

### Manifest manquant

```
ℹ️  Workflow manifest not yet created.
Workflows are executed by specialized agents.
Tape [LA] to see agents that run workflows.
```

**Solution**: Normal, les workflows sont dans les agents

## Intégration avec Cost Optimizer

Hermes détecte automatiquement si le Cost Optimizer est installé:

```bash
# Si byan-copilot-router présent
@hermes

# Hermes note: "💰 Cost Optimizer actif (54% savings)"
```

Voir: [Cost Optimizer Integration](./cost-optimizer-integration.md)

## Roadmap

- **v2.3.2**: Hermes initial (✅ current)
- **v2.4.0**: Workflow manifest complet
- **v2.5.0**: Task manifest + contextes dynamiques
- **v2.6.0**: Machine learning routing (learn from usage)
- **v3.0.0**: Multi-language support (Python, Go, Rust agents)

## Contribuer

Hermes est défini dans:

```
install/templates/.github/agents/hermes.md  (573 lignes XML)
install/templates/_byan/_config/agent-manifest.csv
```

Pour ajouter des règles de routage, modifier `<routing_rules>` dans hermes.md.

Pour ajouter des pipelines, modifier `<pipelines>` dans hermes.md.

## Liens

- [Documentation BYAN](./README.md)
- [Agent Manifest](../templates/_byan/_config/agent-manifest.csv)
- [Workflow Manifest](../templates/_byan/_config/workflow-manifest.csv)
- [Cost Optimizer](./cost-optimizer-integration.md)

---

**Hermes - Messenger of the BYAN Gods**  
*Fast, Efficient, Always Knows Where to Find What You Need*

🏛️ @hermes
