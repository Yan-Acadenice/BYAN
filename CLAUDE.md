# BMAD Platform — Instructions Claude Code

Ce fichier est charge automatiquement par Claude Code pour toutes les interactions dans ce projet.

## Plateforme

**BMAD (Business Modeling & Agent Development)** — Plateforme modulaire d'agents IA specialises orchestres via des workflows structures. Methodologie Merise Agile + TDD, 71 mantras fondamentaux.

## Modules

| Module | Chemin | Role |
|--------|--------|------|
| **Core** | `_byan/core/` | Fondation : party-mode, brainstorming, taches de base |
| **BMM** | `_byan/bmm/` | Cycle de dev complet : Analyse → Planning → Solution → Implementation |
| **BMB** | `_byan/bmb/` | Meta-systeme : creation d'agents, modules, workflows |
| **TEA** | `_byan/tea/` | Architecture de tests : ATDD, automation, CI/CD, NFR |
| **CIS** | `_byan/cis/` | Innovation creative : design thinking, storytelling |

## Architecture des Agents

**Format** : Fichiers Markdown avec frontmatter YAML + definitions XML
**Emplacement** : `_byan/agent/{agent-name}.md` (layout Gen3 par type)
**Structure** : Frontmatter → Activation → Persona → Menu → Knowledge Base → Capabilities
**Manifeste** : `_byan/_config/agent-manifest.csv`

### Soul System (TAO)

Chaque agent peut avoir une ame (soul.md) et une voix (tao.md) :
- **Soul** : Personnalite, lignes rouges, rituels, phrase fondatrice
- **Tao** : Registre vocal, signatures verbales, temperature emotionnelle
- **Soul-Memory** : Journal vivant des sessions passees
- **Protocole** : `_byan/core/activation/soul-activation.md`

## Capacites Natives (Tous les Agents)

Tous les agents BMAD sont **nativement** workflow-aware et delegation-capable.

### Invoquer un Workflow
```
@bmad-{module}-{workflow}
Exemple : @bmad-bmm-create-prd, @bmad-tea-testarch-atdd
```

### Deleguer a un Agent
```
@bmad-agent-{name}
Exemple : @bmad-agent-bmm-dev, @bmad-agent-byan
```

### Variables de Contexte
- `{project-root}` : Racine du repository
- `{output_folder}` : `_byan-output/`
- `{planning_artifacts}` : `_byan-output/planning-artifacts/`
- `{implementation_artifacts}` : `_byan-output/implementation-artifacts/`
- `{user_name}`, `{communication_language}` : Depuis config.yaml

### Orchestration Multi-Agent
- Les agents peuvent **invoquer d'autres agents** en cours de workflow
- Les agents peuvent **lancer des workflows paralleles** pour des taches complexes
- **Party Mode** (`@bmad-party-mode`) pour discussions multi-agents

### Menu Handlers
Les agents executent des actions via des handlers de menu :
- `exec` : Executer un fichier/workflow
- `workflow` : Lancer un workflow multi-etapes
- `tmpl` : Generer depuis un template
- `data` : Charger des donnees contextuelles
- `action` : Action inline
- `validate-workflow` : Valider un workflow

## Workflows

**Format** : Markdown multi-etapes avec fichiers dans `steps/`
**Emplacement** : `_byan/workflow/{workflow-name}/workflow.{md|yaml}` (layout Gen3 par type)
**Manifeste** : `_byan/_config/workflow-manifest.csv`

**Types** :
- **Tri-modal** : Create / Validate / Edit (PRD, Architecture, Agents)
- **Sequentiel** : Processus guide multi-phases (Interview, Sprint Planning)
- **Tache** : Utilitaire ponctuel (Editorial Review, Shard Doc)

## Phases de Developpement

### Phase 0 : Setup
`@bmad-bmm-document-project` → `@bmad-bmm-generate-project-context`

### Phase 1 : Analyse
`@bmad-brainstorming` → `@bmad-bmm-create-brief` → `@bmad-bmm-research`

### Phase 2 : Planning
`@bmad-bmm-create-prd` → `@bmad-bmm-create-ux-design` → `@bmad-bmm-validate-prd`

### Phase 3 : Solution
`@bmad-bmm-create-architecture` → `@bmad-bmm-create-epics-and-stories` → `@bmad-bmm-check-implementation-readiness`

### Phase 4 : Implementation
`@bmad-bmm-sprint-planning` → `@bmad-bmm-create-story` → `@bmad-bmm-dev-story` → `@bmad-bmm-code-review`

### Quick Flow (Brownfield)
`@bmad-bmm-quick-spec` → `@bmad-bmm-quick-dev`

## Conventions

### Git
- Format : `<type>: <description>` (feat, fix, docs, refactor, test, chore)
- **ZERO emoji** dans les commits (Mantra IA-23)

### Code
- Self-documenting, commentaires uniquement pour le POURQUOI
- Fonctions font une seule chose, max 3 parametres
- Pas d'effets de bord dans les fonctions pures

### Anti-Patterns
- Ne jamais accepter sans questionner (IA-16 Challenge Before Confirm)
- Ne jamais assumer que l'utilisateur a raison (IA-1 Zero Trust)
- Ne jamais ajouter de features "au cas ou" (YAGNI)
- Toujours evaluer les consequences avant d'agir (#39)

## Structure du Projet

```
{project-root}/
├── _byan/                    # Code de la plateforme + Soul System (Gen3, par type)
│   ├── _config/              # Manifestes (agents, workflows, tasks)
│   ├── agent/                # Agents (ame BYAN : agent/byan/soul.md, tao.md, soul-memory.md)
│   ├── workflow/             # Workflows (par type)
│   ├── connaissance/         # Base de connaissance
│   ├── command/              # Commandes
│   ├── worker/               # Workers
│   ├── core/                 # Module fondation (activation/, model-selector)
│   ├── bmm/ bmb/ tea/ cis/   # Modules (config + data)
│   ├── mcp/                  # Serveur MCP byan
│   └── config.yaml           # Configuration
├── _bmad/                    # Legacy Gen1 (gele ; fallback back-compat, migre via _bmad -> _byan)
├── _byan-output/             # Artefacts generes
└── .codex/prompts/           # Stubs Codex
```

## References

- Agent Manifest : `_byan/_config/agent-manifest.csv`
- Workflow Manifest : `_byan/_config/workflow-manifest.csv`
- Task Manifest : `_byan/_config/task-manifest.csv`
- Soul Activation : `_byan/core/activation/soul-activation.md`
- README : `README.md`
