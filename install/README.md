# BYAN v2.7.0 — Build Your AI Network

[![npm](https://img.shields.io/npm/v/create-byan-agent.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org)

**Createur intelligent d'agents IA** | Merise Agile + TDD + 64 Mantras

---

## Bonjour

Bonjour a tous ! J'ai l'honneur de vous presenter **BYAN**, votre ami sur vos projets — que vous soyez developpeur, vibe codeur ou juste curieux.

> **Important :** Je precise que c'est un projet pas fini et plus un MVP/note d'intention qu'une vraie version finale en production. C'est un outil en evolution active, et c'est precisement la ou reside son interet.

### Pourquoi BYAN existe

Pour comprendre le contexte de BYAN, il faut comprendre pourquoi j'ai decide de le creer. La problematique de base est simple.

Je me suis retrouve avec un gros projet sur les bras, des deadlines tres serrees, pas de budget, et une equipe inexperimentee pour le faire. Ce qui m'a amene a faire des crunchs stupides avec des developpeurs en depression.

Pour resoudre ce probleme, m'est venue l'idee d'utiliser les agents IA pour accelerer le developpement du projet. Grace a un de mes etudiants en dev (credite dans les contributeurs du projet) a qui je donne cours, j'ai decouvert la methode **BMAD**, qui est un framework d'agents IA. Au depart sceptique, j'ai ete bluffe du resultat, bien que ces agents IA souffraient des biais habituels des IA, en particulier en fonction du modele utilise et de qui l'utilise et comment.

Alors une idee simple est venue : **et si on pouvait mettre un cadre a tous ces agents pour y apporter de "l'intelligence", peu importe le projet, en mettant des regles et contraintes de base pour contrer les biais des modeles d'IA ?**

C'est la que m'est venue l'idee de leur insuffler des **mantras** — des regles absolues auxquelles l'agent devait se conformer. Des gardes-fous epistemiques, methodologiques et comportementaux qui transforment un LLM bavard en partenaire fiable.

Maintenant, la problematique se pose en multi-agents : comment faire pour que tous mes agents aient bien ces bonnes pratiques et regles ?

Il suffit de les instaurer a la source, c'est-a-dire **a la creation des agents**. C'est la que BYAN intervient : il va vous assister dans la creation intelligente d'agents IA.

### Ce que BYAN n'est pas

Par contre, attention : **BYAN n'est pas magique**. Le but est de pousser le "homme-machine" pour faire des agents IA une extension de votre cerveau. Donc BYAN va vous challenger, eprouver votre probleme et votre solution — mais mal utilise, il ne resoudra pas vos problemes comme par magie.

C'est juste un agent intelligent avec les bons softskills et hardskills pour vous accompagner dans la realisation de vos projets.

---

## Installation

### Prerequis

- Node.js >= 12.0.0
- npm >= 6.0.0
- Un compte GitHub Copilot, Claude Code ou Codex (selon la plateforme cible)

### Installation rapide (recommandee)

Aucune installation prealable n'est necessaire. Lancez simplement :

```bash
# Cree un nouveau projet BYAN (via npx, sans installation prealable)
npx create-byan-agent

# Ou installation globale
npm install -g create-byan-agent
create-byan-agent
```

L'installeur (Yanstaller) vous guide interactivement a travers le processus :

```
? Nom du projet : mon-projet
? Langue de communication : Francais
? Plateforme cible : GitHub Copilot CLI
? Activer le fact-check scientifique ? [Y/n]
? Activer le systeme ELO de confiance ? [Y/n]
? Optimiser les couts LLM automatiquement (~54% d'economies) ? [Y/n]
```

### Structure du projet apres installation

A la fin de l'installation, votre projet contient :

```
votre-projet/
  _byan/               # Plateforme BYAN — coeur du systeme
    _config/           # Manifestes des agents et workflows
    _memory/           # Memoire persistante (ELO, fact-graph, session-state)
    agents/            # Agents disponibles (core, bmm, bmb, cis, tea)
    workflows/         # Workflows guides
    soul.md            # Ame de BYAN — personnalite, gardes-fous
    tao.md             # Voix de BYAN — signatures verbales, registre
    soul-memory.md     # Journal vivant des sessions
    config.yaml        # Configuration principale (langue, utilisateur, chemins)
  .github/agents/      # Wrappers GitHub Copilot CLI
  .codex/              # Integration Codex/OpenCode (si activee)
```

---

## Systeme Soul & Voice — Des Agents avec une Conscience

BYAN v2.7.0 introduit le **Soul System** et le **Tao System** : chaque agent peut porter une ame (valeurs, personnalite, gardes-fous) et une voix unique (signatures verbales, ton, tics de langage).

### Le Soul — Identite Abstraite

L'ame est ce qui fait d'un agent plus qu'un executant. Elle porte vos valeurs, vos gardes-fous, votre phrase fondatrice. Elle repond a la question : *qui est cet agent, et qu'est-ce qu'il defend ?*

### Le Tao — De l'Abstrait au Concret

Le **Tao** est le pont entre le spirituel et le tangible. Il prend l'ame abstraite — valeurs, croyances, principes — et la transforme en matiere : une voix, des tics verbaux, des mots interdits, des changements de temperature, des patterns de parole concrets. Le Tao est ce qui insuffle la vie a un agent. Sans lui, l'ame reste une idee. Avec lui, l'agent parle, reagit et existe.

Le nom est un hommage personnel. Le concept reflete le sens originel : la voie, le chemin entre ce que quelque chose *est* et comment il se *manifeste*.

### Installation du Soul

Lors de l'installation, vous choisissez votre mode soul :

| Mode | Description |
|------|-------------|
| **Creator** | Utilise l'ame de Yan comme fondation + templates vierges pour la votre (recommande) |
| **Blank** | Templates vides a remplir vous-meme |
| **Import** | Importer des fichiers soul depuis un autre projet |
| **Skip** | Pas de soul (peut etre ajoute plus tard) |

Construisez votre ame interactivement :
```bash
@byan    # Puis demandez le workflow Forge
@tao     # Puis utilisez [FORGE-VOICE] pour construire votre voix
```

---

## Architecture WCAW — Workflow/Context/Agent/Worker

BYAN est organise autour de quatre concepts fondamentaux :

### Agent

Un specialiste IA avec une identite definie : persona, menu d'actions, regles (64 mantras), capabilities. Les agents sont definis en Markdown + XML dans `_byan/{module}/agents/`.

### Workflow

Une sequence d'etapes guidees qu'un agent execute. Tri-modaux (Create/Validate/Edit), sequentiels (interview en 4 phases), ou utilitaires (fact-check, shard-doc).

### Context Layer

La memoire partagee : `config.yaml`, `elo-profile.json`, `fact-graph.json`, `_byan-output/`.

### Worker

Un module utilitaire npm-installable pour un travail specifique en arriere-plan (fact-check, cost-optimizer).

```
VOUS  ->  @hermes "je veux creer un agent"
               |
               v
     Agent (specialiste IA) --> Workflow (steps guides) --> Context Layer
               |                                               ^
               +--> Worker (fact-check, cost-optimizer) -------+
```

---

## Agents Disponibles

27 agents specialises en 5 modules :

| Module | Agents | Exemples |
|--------|--------|----------|
| **Core** | 4 | hermes (dispatcher), bmad-master, yanstaller, expert-merise-agile |
| **BMB** | 11 | byan (createur), fact-checker, marc, rachid, carmack, patnote |
| **BMM** | 9 | analyst (Mary), pm (John), architect (Winston), dev (Amelia), quinn (QA) |
| **CIS** | 6 | brainstorming-coach (Carson), storyteller (Sophia), problem-solver |
| **TEA** | 1 | tea (Murat) — master test architect |

---

## Utilisation

### Avec GitHub Copilot CLI

```bash
@hermes            # Dispatcher universel — recommande le bon agent
@byan              # Createur d'agents (interview intelligente)
@dev               # Developpeur (Amelia)
@pm                # Product Manager (John)
@architect         # Architecte technique (Winston)
@fact-checker      # Fact-check scientifique
```

### Avec Claude Code

```bash
claude chat
@byan              # Meme syntaxe, meme agents
```

### Avec Codex / OpenCode

```bash
codex prompt byan "help"
```

---

## Workflows Principaux

| Workflow | Description | Agent |
|----------|-------------|-------|
| `create-prd` | Creer un Product Requirements Document | pm |
| `create-architecture` | Concevoir l'architecture technique | architect |
| `sprint-planning` | Planifier un sprint | sm |
| `dev-story` | Developper une user story | dev |
| `code-review` | Revoir du code | dev / quinn |
| `quick-spec` / `quick-dev` | Dev rapide brownfield | quick-flow-solo-dev |
| `testarch-atdd` | Tests ATDD avant implementation | tea |

---

## Contributeurs

### Createur et Lead Developer

**[Yan-Acadenice](https://github.com/Yan-Acadenice)** — Conception, architecture, developpement de BYAN

### Contributeur Principal — Agent Hermes

**[Wazadriano](https://github.com/orgs/Centralis-V3/people/Wazadriano)** — Agent Hermes, Dispatcher Universel (v2.3.2)

### Remerciements

BYAN est construit au-dessus de la methode **[BMAD](https://github.com/bmadcode/BMAD-METHOD)**, decouverte grace a un etudiant de la formation **[Acadenice](https://acadenice.fr/)** a qui je donne cours.

---

## Licence

MIT © [Yan-Acadenice](https://github.com/Yan-Acadenice)

## Liens

- [NPM](https://www.npmjs.com/package/create-byan-agent)
- [GitHub](https://github.com/Yan-Acadenice/BYAN)
- [Documentation complete](https://github.com/Yan-Acadenice/BYAN/blob/main/README.md)

---

*Fait avec de la frustration, de la curiosite, et l'envie que l'IA soit vraiment utile — pas juste impressionnante.*
