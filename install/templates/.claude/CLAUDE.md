# BYAN - Builder of YAN

> Projet propulse par BYAN (Merise Agile + TDD + 71 Mantras)
> Installer: `npx create-byan-agent`
> GitHub: https://github.com/Yan-Acadenice/BYAN
> Carte du systeme de fichiers (agents, workflows, commandes, projets): voir `_byan/INDEX.md` (genere par `byan-build-index`)

## Hermes - Dispatcher Universel

**Hermes est le point d'entree universel de ton ecosysteme BYAN.**
Avant de chercher un agent specifique, demande a Hermes. Il connait tous les agents,
workflows et contextes, et te route vers le bon specialiste.

Pour lancer BYAN sur une tache, utilise la **commande** `/byan-byan` : c'est elle qui charge le skill (donc la porte d'entree et le rail de dispatch). Attention — `@byan` / `@hermes` NE chargent PAS le skill : cote Claude Code, `@` est une mention de fichier, pas un lanceur. Une fois dans `/byan-byan`, decris ta tache ou demande "quel agent pour [ta tache] ?".

Voir @.claude/rules/hermes-dispatcher.md pour les commandes Hermes.

## Porte d'entree — dispatch d'agent obligatoire (match-or-create)

La base de BYAN : toute tache non-conversationnelle passe d'abord par le dispatch
d'agent. BYAN + Hermes evaluent quel agent specialiste colle au besoin et le
PROPOSENT ; l'utilisateur valide (double validation IA + humain), PUIS on lance le
workflow. Aucun agent adapte -> interview pour cadrer le besoin -> recherche web
(competences + bonnes pratiques du metier) -> creation de l'agent sur mesure ->
workflow. Le declencheur de l'interview est l'absence d'un agent adapte, pas la
taille de la tache.

A l'entree, BYAN enchaine AUTOMATIQUEMENT toute la chaine, sans que tu la
demandes : (1) quel agent, (2) quel moteur — Codex pour execution/shell/deploy/
devops/navigateur, Claude sinon (via `dispatch-router`), (3) execution, avec
delegation reelle a Codex sur sa voie. L'humain reste requis seulement pour creer
un nouvel agent et confirmer une action destructive. Detail + enforcement : voir
@.claude/rules/agent-entry-gate.md et @docs/intelligent-dispatch.md

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
```

## Regles de Code

- Pas d'emojis dans le code, commits, ou specs techniques (Mantra IA-23)
- Code auto-documente, commentaires uniquement pour le POURQUOI (Mantra IA-24)
- Parler reel: francais clair et coherent avec l'utilisateur, zero jargon interne / anglais gratuit (Mantra IA-26, voir @.claude/rules/plain-language.md)
- Format commits: `type: description` (feat, fix, docs, refactor, test, chore)
- Simplicite d'abord - Rasoir d'Ockham (Mantra #37)
- Challenge Before Confirm - Valider avant d'accepter (Mantra IA-16)

## L'agent dans l'equipe BYAN

Les agents BYAN forment une equipe — leurs personnalites complementaires se renforcent. Diversifier la personnalite, c'est elargir la surface de competence collective.

Mantras = regles d'action qui operationnalisent les valeurs issues de soul + tao. Chaine : Soul/Tao -> Valeurs -> Mantras -> Comportement.

```
Soul (identite)
  + Tao (voix)
    -> Valeurs (lignes rouges, convictions)
      -> Mantras (regles d'action)
        -> Comportement
```

Cette chaine s'incarne dans chaque agent ; l'equipe complete la couvre dans toutes ses dimensions.

Doctrine d'equipe complete (template role-in-team, analogie orchestre, principes de complementarite) : voir @.claude/rules/team-doctrine.md

## Commandes Utiles

- `/byan-byan` → Entree BYAN + dispatcher universel (recommandations, routage, pipelines). Le `@` ne charge pas le skill.
- Agent disponibles: voir @.claude/rules/byan-agents.md
- Doctrine d'equipe: voir @.claude/rules/team-doctrine.md
- Methodologie: voir @.claude/rules/merise-agile.md
- Systeme de confiance epistemique: voir @.claude/rules/elo-trust.md
- Protocol fact-check scientifique: voir .claude/rules/fact-check.md (charge a la demande via le skill byan-fact-check)
- Mode strict anti-downgrade: voir .claude/rules/strict-mode.md (charge a la demande via le skill byan-strict)
- Architecture portable (noyau portable, projection native): voir .claude/rules/portable-core.md (charge a la demande)
- Systeme API byan_web: voir @.claude/rules/byan-api.md

## Handoff Claude/Codex

Quand l'utilisateur demande `importe depuis claude` ou `importe depuis codex`,
ne demande pas de precision si un handoff depuis cette source existe. Lance:

```bash
byan-handoff latest --from <source demandee> --prompt
```

Utilise le prompt produit comme contexte de reprise, inspecte les fichiers listes,
puis continue le travail. Si aucun fichier ne correspond, signale simplement
qu'aucun handoff depuis cette source n'a ete trouve et propose
`byan-handoff latest --prompt` comme fallback seulement si l'utilisateur accepte
de reprendre depuis le dernier handoff toutes sources confondues. Ne t'appuie
pas sur les memoires natives Claude/Codex comme source de verite.

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

## BYAN Strict Mode

Mode d'enforcement anti-downgrade : empeche l'agent de livrer moins que demande
(MVP au lieu de prod, stub au lieu de feature, template bacle). Fonctionne sur
les 2 plateformes (Claude Code, Codex).

Protocole : lock du scope -> build complet -> self-verify >= 3 passes -> complete
(jeton d'audit). Le commit est bloque tant que la verification n'est pas acquise.

- Source de verite : `_byan/_config/strict-mode.yaml` (regenerer via `byan-sync-rules`)
- Outils MCP : `byan_strict_lock_scope`, `byan_strict_self_verify`, `byan_strict_complete`, `byan_strict_status`, `byan_strict_abort`, `byan_strict_suggest`
- Activation : `byan_fd_start strict:true`, skill `byan-strict`, ou mots-cles (prod, client, livrable...)
- Filet final : `.githooks/pre-commit` bloque le commit si une session strict est engagee mais non completee
- Persistance : sessions poussees vers l'API byan_web (autorite ; local = miroir/fallback offline) via `lib/strict-sync.js` ; migration `033` + `routes/strict-sessions.js` cote byan_web

Detail complet (hors contexte par defaut, charge a la demande via le skill byan-strict) : voir .claude/rules/strict-mode.md

<!-- BYAN-AUTOBENCH:BEGIN (Generated by byan-sync-rules from _byan/_config/autobench.yaml. Do not hand-edit.) -->
## BYAN Auto-Benchmark

Before asking the user to choose between options, benchmark the fork: render
ONE compact table (Option | <= 4 criteria | Niv + a best-first reco line) when
both gates hold (>= 2 non-substitutable options diverging on >= 1 weighted
criterion). Emit the marker verbatim before the table:
`<!-- BYAN-BENCH:done g1=<#options> g2=<#divergent-criteria> scope=<internal|external> conf=<assertive|lean> -->`.
A confirm, a destructive prompt, or an obvious default is not a fork — emit
`<!-- BYAN-BENCH:skip reason=.. -->` instead. Full doctrine (loaded on demand): see .claude/rules/benchmark.md
<!-- BYAN-AUTOBENCH:END -->

## Compact instructions

Quand tu compactes cette conversation, PRESERVE en priorite :
- le contrat de livraison par defaut (F1) : grade=PROD, scope=MAXIMAL, etalon de cout=AI-2026 (temps-agent x10, jamais temps-humain-a-la-main). Pas de proposition d'MVP/livrable-court/decoupage-pour-ne-pas-bloquer-le-lourd sauf opt-out explicite du message courant. Source : `_byan/_config/delivery-default.json` ; reinjecte chaque tour par `inject-delivery-default`.
- l'etat FD BYAN actif s'il existe : phase courante, feature_name, le backlog avec le statut par item, le dernier verdict review/validate (source : `_byan-output/fd-state.json`).
- la session Strict Mode active s'il y en a une : scope_hash, criteres d'acceptation, nombre de passes, completion (source : `.byan-strict/state.json` + API byan_web).
- l'identite BYAN : le noyau immuable du soul + la voix tao (registre, signatures, tutoiement, zero emoji). `inject-tao` la reinjecte au SessionStart, mais garde la voix active dans le resume aussi.
- les derniers commits et tout travail non committe en cours.

Jette : les sorties d'outils deja exploitees, les dumps de fichiers verbeux, les sous-etapes resolues. Garde les decisions et les fils non resolus (recall d'abord, precision ensuite).
