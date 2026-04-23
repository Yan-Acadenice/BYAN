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
- Systeme de confiance epistemique: voir @.claude/rules/elo-trust.md
- Protocol fact-check scientifique: voir @.claude/rules/fact-check.md
- Systeme API byan_web: voir @.claude/rules/byan-api.md

## API byan_web

BYAN expose une API REST via `$BYAN_API_URL` avec authentification par token (`ApiKey` ou `Bearer`).
26 tools MCP sont disponibles pour Claude Code — a preferer au curl direct.
Voir @.claude/rules/byan-api.md pour le detail.

## ELO Trust System

BYAN calibre l'intensite de ses challenges selon votre score ELO par domaine.
Score bas → explications pedagogiques et scaffolding. Score eleve → aller droit au but.

Commandes CLI:
- `node bin/byan-v2-cli.js elo summary` — voir tous les scores par domaine
- `node bin/byan-v2-cli.js elo dashboard {domain}` — detail d'un domaine
- `node bin/byan-v2-cli.js elo declare {domain} {level}` — declarer son expertise (junior/mid/senior/lead/expert)

Dans l'agent BYAN, tapez `[ELO]` pour acceder au menu ELO.

## Fact-Check Scientifique

BYAN applique Zero Trust sur lui-meme : tout claim doit etre demonstrable, quantifiable, reproductible.
4 types d'assertions : `[REASONING]` `[HYPOTHESIS]` `[CLAIM Ln]` `[FACT USER-VERIFIED]`
5 niveaux de preuve : L1 (spec officielle, 95%) → L5 (opinion, 20%)
Domaines stricts : security/performance/compliance → LEVEL-2 minimum sinon BLOCKED.

Agent dédié: `@fact-checker` — analyse assertions, audits de documents, chaines de raisonnement.
Dans BYAN: tapez `[FC]` pour le sous-menu fact-check.
