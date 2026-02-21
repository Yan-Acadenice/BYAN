# BMAD Platform — Instructions Codex/OpenCode

Ce fichier est charge globalement par Codex/OpenCode pour toutes les interactions.

## Plateforme

**BMAD (Business Modeling & Agent Development)** — Plateforme modulaire d'agents IA specialises orchestres via des workflows structures. Methodologie Merise Agile + TDD, 64 mantras.

## Modules

- **Core** (`@bmad/core/`) : Fondation (party-mode, brainstorming)
- **BMM** (`@bmad/bmm/`) : Cycle de dev complet (Analyse → Implementation)
- **BMB** (`@bmad/bmb/`) : Meta-systeme (creation agents, modules, workflows)
- **TEA** (`@bmad/tea/`) : Architecture de tests (ATDD, CI/CD, NFR)
- **CIS** (`@bmad/cis/`) : Innovation creative (design thinking, storytelling)

## Agents

**Format** : Markdown + YAML frontmatter + XML
**Emplacement** : `@bmad/{module}/agents/{agent-name}.md`
**Manifeste** : `@bmad/_config/agent-manifest.csv`

### Soul System

Protocole d'activation centralise : `@bmad/core/activation/soul-activation.md`
- **Soul** : Personnalite, lignes rouges, rituels
- **Tao** : Registre vocal, signatures, temperature
- **Soul-Memory** : Journal vivant des sessions

## Capacites Natives (Tous les Agents)

Tous les agents BMAD sont nativement workflow-aware et delegation-capable.

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
- `{output_folder}` : `_bmad-output/`
- `{planning_artifacts}` : `_bmad-output/planning-artifacts/`
- `{implementation_artifacts}` : `_bmad-output/implementation-artifacts/`

### Orchestration Multi-Agent
- Invocation inter-agents en cours de workflow
- Workflows paralleles pour taches complexes
- Party Mode pour discussions multi-agents

### Menu Handlers
`exec`, `workflow`, `tmpl`, `data`, `action`, `validate-workflow`

## Workflows

**Emplacement** : `@bmad/{module}/workflows/{workflow-name}/workflow.{md|yaml}`
**Manifeste** : `@bmad/_config/workflow-manifest.csv`

## Phases de Dev

1. **Setup** : `@bmad-bmm-document-project` → `@bmad-bmm-generate-project-context`
2. **Analyse** : `@bmad-brainstorming` → `@bmad-bmm-create-brief`
3. **Planning** : `@bmad-bmm-create-prd` → `@bmad-bmm-validate-prd`
4. **Solution** : `@bmad-bmm-create-architecture` → `@bmad-bmm-create-epics-and-stories`
5. **Implementation** : `@bmad-bmm-sprint-planning` → `@bmad-bmm-dev-story`
6. **Quick Flow** : `@bmad-bmm-quick-spec` → `@bmad-bmm-quick-dev`

## Conventions

- Git : `<type>: <description>` — ZERO emoji (Mantra IA-23)
- Code : Self-documenting, commentaires pour le POURQUOI uniquement
- Anti-patterns : Ne jamais accepter sans questionner (IA-16), Zero Trust (IA-1), YAGNI

## References

- Agent Manifest : `@bmad/_config/agent-manifest.csv`
- Workflow Manifest : `@bmad/_config/workflow-manifest.csv`
- Soul Activation : `@bmad/core/activation/soul-activation.md`
