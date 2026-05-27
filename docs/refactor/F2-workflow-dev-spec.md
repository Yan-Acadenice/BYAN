# F2 — Specification du workflow_dev

> FD `byan-refactor-cli-workflows`, feature F2. S'appuie sur le MCD F1
> (`docs/refactor/F1-data-dictionary.md`). Statut : v1 prod-like, a valider.
> Ancre sur les mecanismes reels : `fd-state.js` (state machine), `dispatch.js`
> (routage), `complexity-scorer.js` (scoring), `soul.js` (memoire), `config.js`
> (merge hierarchique), moteur de workflow markdown-driven (`workflow.xml` + micro-steps).

## 0. Principe et dependance

Le `workflow_dev` est le moteur atomique du developpement projet. Il transforme un
CDCF en Epics -> Stories -> Taches, puis execute chaque Tache via un Executant
(Agent ou Worker) choisi par complexite, en agregeant le savoir dans la Memoire a
chaque tour. Il reutilise le patron `fd-state.js` (etat JSON + tools MCP + gates),
pas un nouveau runtime lourd.

## 1. workflow simple vs workflow_dev

| Critere | workflow **simple** | workflow **dev** |
|---------|---------------------|------------------|
| But | Automatiser une tache non-dev | Developper un projet de maniere atomique |
| Portee | systeme | projet (scope projet) |
| Entites | steps markdown | CDCF, Epic, Story, Tache, Executant, Memoire |
| Etat | `stepsCompleted` (frontmatter) | `workflow-dev-state.json` (par projet) |
| Boucle | sequentielle simple | runtime loop avec dispatch + agregation |
| Statut | **inchange** (existant) | **nouveau** |

Le `kind` du Workflow (cf. F1 §2.3) porte cette distinction. Le simple reste tel quel ;
le CDCF (F3) est lui-meme produit par un workflow simple.

## 2. Runtime loop du workflow_dev

### 2.1 Etat persiste
Fichier `_byan/projet/<slug>/workflow-dev-state.json`, calque sur `fd-state.js` :

```json
{
  "run_id": "<timestamp-slug>",
  "projet": "<slug>",
  "cdcf": "<cdcf-id>",
  "phase": "PLAN | LOOP | AGGREGATE | DONE | ABORTED",
  "started_at": "<iso>",
  "updated_at": "<iso>",
  "phase_history": [{ "phase": "...", "entered_at": "..." }],
  "epics": ["E1", "E2"],
  "task_queue": ["E1.S1.T1", "E1.S1.T2"],
  "current_task": "E1.S1.T1",
  "completed_tasks": [],
  "blocked_tasks": [],
  "memory_ref": "_byan/projet/<slug>/memoire/"
}
```

### 2.2 Machine a etats
```
PLAN       (CDCF -> Epics -> Stories -> Taches ; remplit task_queue)
  -> LOOP
LOOP       (tant que task_queue non vide) :
   1. SELECT    next Tache (respecte les dependances : Tache.dependances toutes done)
   2. SCORE     complexite (complexity-scorer.js)
   3. DISPATCH  Agent | Worker (dispatch.js)
   4. EXECUTE   l'Executant traite la Tache (contexte injecte depuis Memoire)
   5. AGGREGATE resultat + nouvelle Connaissance -> Memoire (boucle de savoir)
   6. MARK      Tache done | blocked ; retour LOOP
  -> AGGREGATE (quand queue vide)
AGGREGATE  (consolidation finale de la Memoire projet)
  -> DONE
```
Transitions avant uniquement, sauf `LOOP->LOOP` (iteration) et un retour de reprise
`BLOCKED->LOOP` une fois le blocage leve (analogue a `REFACTOR->BUILD` de fd-state).

### 2.3 Gates (conditions de sortie)
- `PLAN -> LOOP` : `task_queue` non vide ET CDCF reference valide.
- `LOOP` : une Tache n'est SELECTable que si toutes ses `dependances` sont `done` (P3 de F1).
- `LOOP -> AGGREGATE` : `task_queue` vide (aucune Tache `pending`).
- `AGGREGATE -> DONE` : Memoire consolidee, criteres d'acceptation des Stories verifies.

### 2.4 Tools MCP proposes (calque fd-state)
`byan_wfdev_start`, `byan_wfdev_plan`, `byan_wfdev_next`, `byan_wfdev_complete_task`,
`byan_wfdev_status`, `byan_wfdev_abort`. Etat mute uniquement via ces tools (auditable).

## 3. Dispatch par complexite (reutilise l'existant)

### 3.1 Scoring (`src/byan-v2/dispatcher/complexity-scorer.js`, reel)
Score 0-100 = `token(max 30) + task_type(max 80) + context(max 20) + keyword(max 25)`,
plafonne a 100. Chaque Tache recoit `complexite_score` a l'etape SCORE.

### 3.2 Routage (`_byan/mcp/byan-mcp-server/lib/dispatch.js`, reel)
| Score | Route | Executant | Modele |
|-------|-------|-----------|--------|
| < 15 | main-thread | (inline, pas de delegation) | courant |
| 15-39 + parallelizable | agent-subagent-worktree | **Agent** | sonnet |
| 15-39 sequentiel | mcp-worker-haiku | **Worker** | haiku/mini |
| >= 40 | main-thread-opus | **Agent** | opus |

Mapping vers `complexite_niveau` (F1) : **faible** = score < 40 sequentiel -> Worker ;
**elevee** = score >= 40 ou parallelisable -> Agent. Seuils repris tels quels de
`dispatch.js` / `workers.md` (worker pool taille 2, fallback Agent si echec worker).

## 4. Agregation memoire (boucle de savoir)

### 4.1 Hierarchie de contexte (resout P2)
Chargement par merge, calque sur `config.js` (defaults -> overrides -> env) et la
`ContextLayer` (`platform | project | story`) :
```
platform  (_byan/context/ + _byan/regle/)          <- zone SYSTEME
  + project (_byan/projet/<slug>/context/)          <- zone PROJET
    + story  (contexte specifique a la Story courante)
```
Resolution : le contexte effectif d'une Tache = merge platform <- project <- story.

### 4.2 Boucle d'agregation
A chaque tour de LOOP :
- **Entree (EXECUTE)** : la Memoire fournit a l'Executant le contexte merge +
  les Regles applicables + les Connaissances pertinentes (fact-graph).
- **Sortie (AGGREGATE)** : le resultat de la Tache produit potentiellement une
  nouvelle **Connaissance** (verifiee, niveau de preuve) ecrite dans la Memoire projet,
  et une entree de journal (pattern `soul.js` append, `validated=true` requis).
- La Memoire grossit a chaque Tache : les Taches suivantes beneficient du savoir accumule
  (c'est l'**agregation de savoir** du drawio).

### 4.3 Ancrage
Reutilise `soul.js` (`readSoul` / `appendSoulMemory`, contrainte `validated=true`) pour
la memoire narrative, et le fact-graph JSON pour les Connaissances. La memoire projet
est une instance scopee (`portee: projet`, cf. F1 §2.12) sous `_byan/projet/<slug>/memoire/`.

## 5. Formats de fichiers des entites (resout P1)

Convention : Markdown + frontmatter YAML, coherent avec les attributs du MCD F1.

### 5.1 CDCF — `_byan/projet/<slug>/cdcf.md`
```yaml
---
id: cdcf-001
projet: mon-projet
titre: "Cahier des charges - Mon Projet"
status: valide        # draft | valide
date: 2026-05-27
besoins:
  - "Le systeme doit ..."
perimetre: "Dans le scope : ... ; Hors scope : ..."
contraintes: ["Node >= 18", "delai 2 semaines"]
criteres_acceptation:
  - "L'utilisateur peut ..."
---
# Corps : redaction detaillee du CDCF
```

### 5.2 Epic — `_byan/projet/<slug>/epic/<id>.md`
```yaml
---
id: E1
cdcf: cdcf-001
projet: mon-projet
titre: "..."
objectif: "..."
value_statement: "..."
size: L              # S | M | L | XL
priorite: P1         # P0 | P1 | P2 | P3
status: pending      # pending | in-progress | done
---
```

### 5.3 Story — `_byan/projet/<slug>/story/<id>.md`
```yaml
---
id: E1.S1
epic: E1
role: "developpeur"
want: "charger le contexte depuis des fichiers YAML"
benefit: "organiser le contexte hierarchiquement"
criteres_acceptation:
  - "GIVEN ... WHEN ... THEN ..."
dependances: []        # [E1.S0]
estimation: 5          # story points
status: pending
---
# notes_techniques en corps
```

### 5.4 Tache — `_byan/projet/<slug>/tache/<id>.md`
```yaml
---
id: E1.S1.T1
story: E1.S1
titre: "Implementer loadContext(level, id)"
complexite_score: 45       # rempli a l'etape SCORE
complexite_niveau: elevee  # faible | elevee (derive)
executant: winston         # Agent ou Worker assigne a l'execution
dependances: []            # [E1.S1.T0]
status: pending            # pending | in-progress | done | blocked
---
# description en corps
```

## 6. Ancrage : reutilise vs nouveau

| Brique | Reutilise (reel) | Nouveau |
|--------|------------------|---------|
| State machine | patron `fd-state.js` | etat `workflow-dev-state.json` + tools `byan_wfdev_*` |
| Scoring | `complexity-scorer.js` | (appel a l'etape SCORE) |
| Routage | `dispatch.js` | mapping score -> Executant Agent/Worker |
| Memoire | `soul.js` read/append + fact-graph | memoire projet scopee + boucle AGGREGATE |
| Contexte | `config.js` merge + ContextLayer | hierarchie platform/project/story effective |
| Moteur workflow | markdown-driven + micro-steps | workflow_dev comme `kind` de Workflow |

Pas de runtime JS lourd : le workflow_dev reste pilote par instructions + etat JSON +
tools MCP, comme le reste de BYAN.

## 7. Points ouverts pour la suite

- **F4** : arborescence physique exacte (zone SYSTEME + `_byan/projet/<slug>/...`) derivee
  de ces formats de fichiers.
- **F5** : l'index `_byan/` doit referencer les runs workflow_dev et les entites projet.
- Implementation reelle des tools `byan_wfdev_*` : hors specification (phase ulterieure).
