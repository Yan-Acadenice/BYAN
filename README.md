# BYAN v2.6.0 — Build Your AI Network

[![npm](https://img.shields.io/npm/v/create-byan-agent.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-1444%2F1466-brightgreen.svg)](https://github.com/Yan-Acadenice/BYAN)
[![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org)

**Créateur intelligent d'agents IA** | Merise Agile + TDD + 64 Mantras

> Documentation en anglais disponible ici : [README-EN.md](./README-EN.md)

---

## Bienvenue

J'ai l'honneur de vous présenter **BYAN**, votre compagnon IA sur vos projets — que vous soyez développeur confirmé, vibe codeur ou simplement curieux.

> **Note importante :** BYAN est un MVP / note d'intention. Ce n'est pas une version finale en production. C'est un outil en évolution active, et c'est précisément là où réside son intérêt.

### Pourquoi BYAN existe

L'histoire commence simplement : je me suis retrouvé avec un gros projet sur les bras, des deadlines serrées, pas de budget, et une équipe inexpérimentée. Ce qui a suivi a été des crunchs stupides, des développeurs en dépression, et des résultats médiocres.

Pour sortir de cette situation, j'ai décidé d'utiliser les agents IA pour accélérer le développement. C'est un de mes étudiants en développement (crédité dans les contributeurs) qui m'a fait découvrir la méthode **BMAD** — un framework d'orchestration d'agents IA. Au départ sceptique, j'ai été bluffé par les résultats, même si ces agents souffraient des biais habituels des modèles IA : hallucinations, sur-confiance, dépendance au contexte de l'utilisateur.

Une idée simple est alors venue : **et si on mettait un cadre à tous ces agents pour y injecter de l'intelligence, indépendamment du projet et du modèle utilisé ?**

La réponse a été d'instiller des **mantras** — des règles absolues auxquelles chaque agent doit se conformer. Des gardes-fous épistémiques, méthodologiques et comportementaux qui transforment un LLM bavard en partenaire fiable.

La question suivante : dans un système multi-agents, comment garantir que tous les agents partagent ces bonnes pratiques ? En les intégrant à la source, c'est-à-dire **à la création des agents**. C'est là qu'intervient BYAN.

### Ce que BYAN n'est pas

BYAN n'est pas magique. Il ne résoudra pas vos problèmes comme par enchantement. Son but est de maximiser la **collaboration homme-machine** pour faire des agents IA une véritable extension de votre cerveau. BYAN va challenger votre problème, questionner vos hypothèses, et vous aider à concevoir des agents qui tiennent la route — pas des agents que vous avez besoin de constamment corriger.

---

## Installation

### Prérequis

- Node.js >= 12.0.0
- npm >= 6.0.0
- Un compte GitHub Copilot, Claude Code, ou Codex (selon la plateforme cible)

### Installation rapide (recommandée)

```bash
# Crée un nouveau projet BYAN (aucune installation préalable nécessaire)
npx create-byan-agent

# Ou installation globale
npm install -g create-byan-agent
create-byan-agent
```

L'installeur (Yanstaller) vous guide interactivement :

```
? Nom du projet : mon-projet
? Langue de communication : Francais
? Plateforme cible : GitHub Copilot CLI
? Activer le fact-check scientifique ? [Y/n]
? Activer le système ELO de confiance ? [Y/n]
? Optimiser les coûts LLM automatiquement (~54% d'économies) ? [Y/n]
```

À la fin de l'installation, votre projet contient :

```
votre-projet/
  _byan/               # Plateforme BYAN
    _config/           # Manifestes des agents et workflows
    _memory/           # Mémoire persistante (ELO, fact-graph)
    agents/            # Agents disponibles
    workflows/         # Workflows guidés
    knowledge/         # Base de connaissances sources
    config.yaml        # Configuration principale
  .github/agents/      # Wrappers GitHub Copilot CLI
  .claude/             # Intégration Claude Code (si activée)
  .codex/              # Intégration Codex/OpenCode (si activée)
  bin/byan-v2-cli.js   # CLI BYAN
```

### Utilisation via CLI

```bash
# Lancer l'interview intelligente (crée un agent en 12 questions)
node bin/byan-v2-cli.js create

# Vérifier l'état de la session
node bin/byan-v2-cli.js status

# Système ELO — score de confiance par domaine
node bin/byan-v2-cli.js elo summary
node bin/byan-v2-cli.js elo context security
node bin/byan-v2-cli.js elo record javascript VALIDATED

# Fact-check scientifique
node bin/byan-v2-cli.js fc check "Redis est toujours plus rapide que PostgreSQL"
node bin/byan-v2-cli.js fc parse "C'est évidemment la meilleure approche"
node bin/byan-v2-cli.js fc graph
```

### Utilisation programmatique

```javascript
const ByanV2 = require('create-byan-agent');

const byan = new ByanV2({ maxQuestions: 12 });
await byan.startSession();

// Interview guidée
while (!byan.isComplete()) {
  const question = byan.getNextQuestion();
  const answer = await getUserInput(question.text);
  await byan.submitResponse(answer);
}

// Générer le profil d'agent
const profile = await byan.generateProfile();
console.log('Agent créé :', profile.filePath);

// Fact-check
const result = byan.checkClaim("Redis est plus rapide");
console.log(result.assertionType, result.score + '%');

// Score ELO
const ctx = byan.getClaimContext('security');
console.log('Scaffold level :', ctx.scaffoldLevel);
```

### Activer un agent dans GitHub Copilot CLI

```bash
# Une fois installé, les agents sont disponibles via @
@byan             # Agent créateur d'agents
@hermes           # Dispatcher universel
@fact-checker     # Fact-check scientifique
@analyst          # Analyste business
@architect        # Architecte technique
# etc.
```

---

## Architecture BYAN

BYAN est organisé autour de quatre concepts fondamentaux qui interagissent ensemble :

### Agent

Un agent est un spécialiste IA avec une identité définie. Il possède :
- **Persona** : qui il est, son style de communication, ses forces
- **Menu** : les actions disponibles, chacune liée à un workflow ou une commande
- **Règles** : les contraintes absolues qu'il ne peut pas violer (les 64 mantras)
- **Capacités** : ce qu'il peut faire, ce qu'il ne fait pas

Les agents sont définis en Markdown avec des sections XML. Ils sont stockés dans `_byan/{module}/agents/` et exposés sur chaque plateforme via un wrapper léger (`.github/agents/`, `.claude/`, `.codex/prompts/`).

### Workflow

Un workflow est une séquence d'étapes guidées qu'un agent exécute pour accomplir une tâche complexe. Par exemple, le workflow `create-prd` guide l'agent PM à travers la création d'un Product Requirements Document en 6 étapes structurées.

Les workflows peuvent être :
- **Tri-modaux** : Create / Validate / Edit (ex: PRD, Architecture)
- **Séquentiels** : processus multi-phases guidés (ex: interview BYAN en 4 phases)
- **Utilitaires** : tâches ponctuelles (ex: fact-check, shard-doc)

### Context Layer

Le contexte est la couche de mémoire et d'état partagée entre tous les agents sur un projet. Il contient :
- `_byan/config.yaml` : configuration globale (langue, nom utilisateur, chemins de sortie)
- `_byan/_memory/elo-profile.json` : score de confiance ELO persistant par domaine
- `_byan/_memory/fact-graph.json` : base de connaissances vérifiées (persist entre sessions)
- `_byan-output/` : tous les artefacts générés (PRD, architecture, stories, fact sheets)
- `_byan/knowledge/` : sources vérifiées, axiomes, benchmarks ELO par domaine

### Worker

Un worker est un module utilitaire npm-installable qui fait un travail spécifique en arrière-plan. Il est indépendant du cycle agent/workflow et peut être utilisé directement dans votre code.

Workers disponibles :
- `_byan/workers/fact-check-worker.js` : vérification scientifique de claims
- `_byan/workers/cost-optimizer.js` : routage LLM intelligent (~54% d'économies)

```javascript
const FactCheckWorker = require('./_byan/workers/fact-check-worker');
const fc = new FactCheckWorker({ verbose: true });

// Vérifier un claim
fc.check("Redis est toujours plus rapide que PostgreSQL");
// → { assertionType: 'HYPOTHESIS', level: 5, score: 20, status: 'OPINION' }

// Détecter les claims implicites dans un texte
fc.parse("C'est évidemment la meilleure approche pour la sécurité");
// → [{ matched: 'évidemment', position: 5, ... }]
```

### Schéma de fonctionnement

```
┌─────────────────────────────────────────────────────────────┐
│                        UTILISATEUR                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ @agent ou commande
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   AGENT (spécialiste IA)                    │
│  Persona + Menu + Rules (64 mantras) + Capabilities         │
└────────────┬──────────────────────────────┬─────────────────┘
             │ exécute                       │ utilise
             ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────┐
│       WORKFLOW         │    │          WORKER               │
│  Steps guidés          │    │  fact-check / cost-optimizer  │
│  Artefacts générés     │    │  ELO engine                   │
└────────────┬───────────┘    └──────────────┬───────────────┘
             │ lit/écrit                      │ persiste
             ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     CONTEXT LAYER                           │
│  config.yaml · elo-profile.json · fact-graph.json           │
│  _byan-output/ · _byan/knowledge/ · session state           │
└─────────────────────────────────────────────────────────────┘
```

> Le diagramme interactif draw.io est disponible dans [byan-architecture.drawio](./byan-architecture.drawio).

---

## Système ELO — Confiance Épistémique

BYAN v2.6.0 introduit un système de calibration de la confiance par domaine technique (algorithme Glicko-2, échelle 0-1000).

| Plage ELO | Niveau | Comportement BYAN |
|-----------|--------|-------------------|
| 0–200 | Apprenti | Explications complètes, analogies, scaffold maximum |
| 201–450 | Débutant | Guide pas-à-pas, vérification fréquente |
| 450–550 | Zone morte | Challenge intense (pic de Dunning-Kruger) |
| 551–750 | Intermédiaire | Challenge modéré, hypothèses testées |
| 751–900 | Avancé | Challenge minimal, discussion pair-à-pair |
| 901–1000 | Expert | Réponses courtes, pas d'explications de base |

**Principe :** un score bas ne punit pas — il augmente la pédagogie. BYAN s'adapte à votre niveau réel, pas à celui que vous déclarez.

---

## Fact-Check Scientifique

BYAN applique Zero Trust sur lui-même : tout claim doit être **démontrable**, **quantifiable**, **reproductible**.

```
[REASONING]              Déduction logique — sans garantie de vérité
[HYPOTHESIS]             Plausible dans ce contexte — à vérifier avant action
[CLAIM L{n}]             Assertion sourcée — niveau 1 à 5
[FACT USER-VERIFIED date] Validé par l'utilisateur avec artefact de preuve
```

Domaines stricts : `security` / `performance` / `compliance` → LEVEL-2 minimum ou BLOCKED.

---

## Catalogue des Agents

### Core — Fondation de la Plateforme

| Agent | Persona | Rôle | Cas d'usage typique |
|-------|---------|------|---------------------|
| **hermes** | Dispatcher | Routeur universel — recommande le bon agent selon votre tâche | "Quel agent pour créer une API REST ?" |
| **bmad-master** | Orchestrateur | Exécute workflows et tasks BMAD directement | Lancer un workflow complet sans intermédiaire |
| **yanstaller** | Installeur | Installation intelligente et interactive de BYAN | Setup initial d'un nouveau projet |
| **expert-merise-agile** | Expert | Conception Merise Agile + MCD/MCT + cahiers des charges | Modélisation d'un schéma de données métier |

### BMB — Créateurs d'Agents et de Modules

| Agent | Persona | Rôle | Cas d'usage typique |
|-------|---------|------|---------------------|
| **byan** | Builder | Créateur d'agents via interview intelligente (12 questions, 64 mantras). Intègre [FC] fact-check et [ELO] | Créer un agent spécialisé pour votre domaine |
| **fact-checker** | Scientifique | Fact-check d'assertions, audit de documents, analyse de chaînes de raisonnement | Vérifier une spec technique avant sprint |
| **agent-builder** | Bond | Expert en construction d'agents BMAD-compliant | Construire un agent complexe manuellement |
| **module-builder** | Morgan | Architecte de modules BYAN complets | Créer un nouveau module métier |
| **workflow-builder** | Wendy | Designer de workflows guidés | Concevoir un processus multi-étapes |
| **marc** | Spécialiste | Intégration GitHub Copilot CLI | Déployer des agents sur Copilot |
| **rachid** | Spécialiste | Déploiement npm/npx | Publier un package BYAN |
| **carmack** | Optimiseur | Optimisation tokens (-46%) | Réduire le coût d'utilisation des agents |
| **patnote** | Gestionnaire | Mises à jour BYAN et résolution de conflits | Mettre à jour un projet BYAN existant |
| **claude** | Spécialiste | Intégration Claude Code + MCP | Configurer les agents sur Claude |
| **codex** | Spécialiste | Intégration OpenCode/Codex | Configurer les agents sur Codex |

### BMM — Cycle de Développement Logiciel

| Agent | Persona | Rôle | Cas d'usage typique |
|-------|---------|------|---------------------|
| **analyst** | Mary | Analyse business, étude de marché, brief produit | "J'ai une idée, aide-moi à la structurer" |
| **pm** | John | Product management, création de PRD, roadmap | Rédiger un Product Requirements Document |
| **architect** | Winston | Architecture technique, tech stack, patterns | Concevoir l'architecture d'un système |
| **ux-designer** | Sally | Design UX/UI, empathie utilisateur, parcours | Créer les maquettes et user flows |
| **dev** | Amelia | Implémentation, coding, ultra-succincte | Développer une user story |
| **sm** | Bob | Scrum master, sprint planning, backlog grooming | Préparer et planifier un sprint |
| **quinn** | Quinn | QA engineer, tests, couverture de code | Générer des tests pour une feature |
| **tech-writer** | Paige | Documentation, guides utilisateur, clarté | Rédiger la doc d'une API |
| **quick-flow-solo-dev** | Barry | Développement rapide sur code existant (brownfield) | Petites features sans cérémonie |

### CIS — Innovation et Stratégie Créative

| Agent | Persona | Rôle | Cas d'usage typique |
|-------|---------|------|---------------------|
| **brainstorming-coach** | Carson | Idéation, énergie "YES AND", 20+ techniques | "J'ai un problème compliqué, aide-moi à penser" |
| **creative-problem-solver** | Dr. Quinn | Résolution systématique (TRIZ, Theory of Constraints) | Débloquer un problème technique difficile |
| **design-thinking-coach** | Maya | Design thinking humain-centré, empathie maps | Concevoir une solution centrée utilisateur |
| **innovation-strategist** | Victor | Stratégie d'innovation, Blue Ocean, disruption | Trouver un angle différenciant pour un produit |
| **presentation-master** | Caravaggio | Présentations, slides, storytelling visuel | Créer un pitch deck ou une présentation technique |
| **storyteller** | Sophia | Storytelling, narratives, communication de marque | Rédiger un texte qui engage et convainc |

### TEA — Architecture de Tests

| Agent | Persona | Rôle | Cas d'usage typique |
|-------|---------|------|---------------------|
| **tea** | Murat | Master test architect — ATDD, NFR, CI/CD, risk-based testing | Concevoir la stratégie de test complète d'un projet |

---

## Workflows Principaux

| Workflow | Description | Agent principal |
|----------|-------------|-----------------|
| `create-prd` | Créer un Product Requirements Document | pm |
| `create-architecture` | Concevoir l'architecture technique | architect |
| `create-epics-and-stories` | Découper en epics et user stories | sm |
| `sprint-planning` | Planifier un sprint | sm |
| `dev-story` | Développer une user story | dev |
| `code-review` | Revoir du code | dev / quinn |
| `quick-spec` | Spec rapide conversationnelle | quick-flow-solo-dev |
| `quick-dev` | Dev rapide sur code existant | quick-flow-solo-dev |
| `testarch-atdd` | Générer des tests ATDD avant implémentation | tea |
| `fact-check` | Analyser une assertion ou un document | fact-checker |
| `elo-workflow` | Consulter et gérer le score de confiance ELO | byan |

---

## Plateformes Supportées

| Plateforme | Invocation | Chemin de config |
|------------|-----------|------------------|
| GitHub Copilot CLI | `@agent-name` | `.github/agents/*.md` |
| Claude Code | `@agent-name` | `.claude/rules/*.md` |
| Codex / OpenCode | `@agent-name` | `.codex/prompts/*.md` |
| CLI direct | `node bin/byan-v2-cli.js` | `_byan/config.yaml` |

---

## Contributeurs

### Créateur et Lead Developer

**[Yan-Acadenice](https://github.com/Yan-Acadenice)** — Conception, architecture, développement de BYAN

### Contributeur Principal — Hermes

**[Wazadriano](https://github.com/orgs/Centralis-V3/people/Wazadriano)** — Agent Hermes, Dispatcher Universel (v2.3.2)
- Architecture et conception du dispatcher universel Hermes
- Règles de routage intelligent et pipelines multi-agents
- Intégration complète avec l'écosystème BYAN

### Remerciements

BYAN est construit au-dessus de la méthode **[BMAD](https://github.com/bmadcode/BMAD-METHOD)**, découverte grâce à un étudiant de la formation **[Acadenice](https://acadenice.fr/)**.

---

## Licence

MIT © [Yan-Acadenice](https://github.com/Yan-Acadenice)

---

*Fait avec de la frustration, de la curiosité, et l'envie que l'IA soit vraiment utile — pas juste impressionnante.*

