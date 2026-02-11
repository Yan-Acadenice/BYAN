# BYAN - Builder of YAN

> Projet propulse par BYAN (Merise Agile + TDD + 64 Mantras)
> Installer: `npx create-byan-agent`
> GitHub: https://github.com/Yan-Acadenice/BYAN

## Hermes - Dispatcher Universel

**Hermes est le point d'entree universel de ton ecosysteme BYAN.**
Avant de chercher un agent specifique, demande a Hermes. Il connait tous les agents,
workflows et contextes, et te route vers le bon specialiste.

Pour invoquer Hermes, tape: `@hermes` ou demande simplement "quel agent pour [ta tache]?"

Voir @.claude/rules/hermes-dispatcher.md pour les commandes Hermes.

## Architecture BYAN

```
{project-root}/
  _byan/              # Plateforme BYAN
    _config/           # Manifestes (agents, workflows, tasks)
    bmb/               # Module Builder (BYAN, agents, workflows)
    _memory/           # Memoire persistante des agents
    _output/           # Artefacts generes
  .claude/             # Integration Claude Code
    CLAUDE.md          # Ce fichier (instructions projet)
    rules/             # Regles modulaires par domaine
  .github/agents/      # Agents Copilot CLI (si installe)
```

## Regles de Code

- Pas d'emojis dans le code, commits, ou specs techniques (Mantra IA-23)
- Code auto-documente, commentaires uniquement pour le POURQUOI (Mantra IA-24)
- Format commits: `type: description` (feat, fix, docs, refactor, test, chore)
- Simplicite d'abord - Rasoir d'Ockham (Mantra #37)
- Challenge Before Confirm - Valider avant d'accepter (Mantra IA-16)

## Commandes Utiles

- `@hermes` → Dispatcher universel (recommandations, routage, pipelines)
- Agent disponibles: voir @.claude/rules/byan-agents.md
- Methodologie: voir @.claude/rules/merise-agile.md
