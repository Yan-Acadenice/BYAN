# F4 — Arborescence cible (zone SYSTEME + zone PROJET)

> FD `byan-refactor-cli-workflows`, feature F4. Derive du MCD F1
> (`F1-data-dictionary.md`) et des formats F2 (`F2-workflow-dev-spec.md`).
> Statut : v1 prod-like, a valider. Source du mapping de migration F7 et de l'index F5.

## 0. Objet

Figer la structure physique cible de `_byan/`, en deux zones (SYSTEME / PROJET),
avec dossiers explicites par **type** (au lieu des modules BMAD `bmb/bmm/tea/cis`).
Chaque entite du MCD F1 a un emplacement unique et previsible.

## 1. Etat FROM (structure actuelle, reel)

Top-level `_byan/` aujourd'hui (extrait reel) : modules `core/ bmm/ bmb/ tea/ cis/`
(chacun avec `agents/ workflows/ config.yaml`), plus `_config/ _memory/ workers/
knowledge/ data/ templates/ personas/ mcp/`, plus une **dispersion** de fichiers a la
racine : `soul.md tao.md byan-soul.md byan-tao.md soul-memory.md *-template.md
*-reference.md genealogie-des-ames.md learning-log.md COMPLETION-REPORT.md
workers.md workers-old-WRONG.md`.

Constat : l'organisation par module melange les types (un agent, un workflow, une
config cohabitent par module) et la racine accumule des fichiers non classes.
Le refactor remplace ce decoupage **par module** par un decoupage **par type**.

## 2. Arbo cible — zone SYSTEME (`_byan/`)

```
_byan/
  INDEX.md                  # F5 : carte du FS, lue par Claude/Codex/Copilot
  config.yaml               # contexte platform (point d'entree)
  _config/                  # manifestes (F6)
    agent-manifest.csv
    workflow-manifest.csv
    command-manifest.csv    # ex task-manifest (D1 : Task legacy -> Commande)
    strict-mode.yaml
    manifest.yaml
  agent/                    # tous les agents systeme (par type, plus de module/)
    <name>/
      <name>.md             # frontmatter + corps XML
      <name>-soul.md        # 0,1 (entite faible)
      <name>-tao.md         # 0,1 (entite faible)
  worker/                   # workers formalises (D3)
    <name>.md
  workflow/
    simple/<name>/          # kind=simple (inchange, taches non-dev)
      workflow.md + steps/
    dev/                    # kind=dev : le moteur workflow_dev (F2)
      workflow.md + steps/
  command/                  # ex tasks standalone (D1 : Commande)
    <name>.{md,xml}
  context/                  # Contexte niveau platform (F1 2.10)
  regle/                    # Regles : mantras, feature-toggles, seuils (F1 2.11)
  connaissance/             # Connaissance : sources.md, axioms, base de preuve (F1 2.9)
  memoire/                  # Memoire systeme (F1 2.12)
    soul-memory.md
    fact-graph.json
    elo-profile.json
    <agent>-sidecar/
  docs/                     # documentation plateforme
  mcp/                      # serveur MCP (inchange)
  projet/                   # ZONE PROJET (section 3)
```

Les fichiers soul/tao de BYAN lui-meme (createur) vont dans `agent/byan/`
(`byan.md`, `byan-soul.md`, `byan-tao.md`). Les fichiers de travail/jetables actuels
(`workers-old-WRONG.md`, `COMPLETION-REPORT.md`, `_test/`, `_output/`) sont des
candidats au nettoyage, traces dans le mapping F7 (non migres).

## 3. Arbo cible — zone PROJET (`_byan/projet/<slug>/`)

```
_byan/projet/<slug>/
  projet.yaml               # entite Projet (F1 2.4) : slug, name, type, stack, status
  cdcf.md                   # entite CDCF (F1 2.5 / format F2 5.1)
  workflow-dev-state.json   # etat runtime du workflow_dev (F2 2.1)
  epic/<id>.md              # Epic (F2 5.2)
  story/<id>.md             # Story (F2 5.3)
  tache/<id>.md             # Tache (F2 5.4)
  agent/                    # agents propres au projet (optionnel, F1 possede_agent)
  worker/                   # workers propres au projet (optionnel)
  context/                  # Contexte niveau project + story (F2 4.1)
  memoire/                  # Memoire projet (portee=projet, F1 2.12)
  connaissance/             # Connaissances specifiques au projet
```

## 4. Emplacement des 12 entites (MCD F1 -> chemin)

| Entite | Zone | Emplacement |
|--------|------|-------------|
| Agent | SYSTEME (+PROJET) | `_byan/agent/<name>/` (ou `projet/<slug>/agent/`) |
| Worker | SYSTEME (+PROJET) | `_byan/worker/<name>.md` |
| Workflow | SYSTEME | `_byan/workflow/simple/` ou `_byan/workflow/dev/` |
| Projet | PROJET | `_byan/projet/<slug>/projet.yaml` |
| CDCF | PROJET | `_byan/projet/<slug>/cdcf.md` |
| Epic | PROJET | `_byan/projet/<slug>/epic/<id>.md` |
| Story | PROJET | `_byan/projet/<slug>/story/<id>.md` |
| Tache | PROJET | `_byan/projet/<slug>/tache/<id>.md` |
| Connaissance | SYSTEME (+PROJET) | `_byan/connaissance/` (ou `projet/<slug>/connaissance/`) |
| Contexte | SYSTEME + PROJET | `_byan/context/` + `projet/<slug>/context/` |
| Regle | SYSTEME | `_byan/regle/` |
| Memoire | SYSTEME + PROJET | `_byan/memoire/` + `projet/<slug>/memoire/` |
| Soul / Tao | SYSTEME (faible) | a cote de l'Agent : `agent/<name>/<name>-soul.md` |

## 5. Index (F5) et manifestes (F6)

- **`_byan/INDEX.md`** (F5) : carte lisible Claude/Codex/Copilot. Liste, par type et par
  projet, ou trouver chaque chose, avec chemins. Genere/maintenu automatiquement
  (generateur type `byan-sync-rules`). Reference depuis `CLAUDE.md` / `AGENTS.md` /
  `.github/copilot-instructions.md`.
- **`_byan/_config/*-manifest.csv`** (F6) : les manifestes restent la source machine
  (colonnes existantes), **derivees** vers l'INDEX humain par le generateur F5/F6 pour
  eviter la double maintenance. `task-manifest` -> `command-manifest` (D1).

## 6. Mapping FROM -> TO (preview pour F7)

| FROM (actuel) | TO (cible) |
|---------------|-----------|
| `_byan/{core,bmm,bmb,tea,cis}/agents/<a>.md` | `_byan/agent/<a>/<a>.md` (+ `provenance` = module) |
| `_byan/agents/<a>-soul.md` / `-tao.md` | `_byan/agent/<a>/<a>-soul.md` / `-tao.md` |
| `_byan/{module}/workflows/<w>/` | `_byan/workflow/simple/<w>/` (ou `dev/`) |
| `_byan/workers.md` | `_byan/worker/` (formalisation D3) |
| `_byan/knowledge/*` | `_byan/connaissance/*` |
| `_byan/config.yaml` (bmad_features) | `_byan/context/` + `_byan/regle/` (split) |
| `_byan/_memory/*` | `_byan/memoire/*` |
| `_byan/core/tasks/*` | `_byan/command/*` (D1) |
| `_byan/_config/task-manifest.csv` | `_byan/_config/command-manifest.csv` (D1) |
| fichiers racine soul/tao de BYAN | `_byan/agent/byan/` |
| `workers-old-WRONG.md`, `_test/`, `_output/` | non migres (nettoyage, traces F7) |

L'attribut `provenance` (D4) conserve le module d'origine pour la tracabilite.

## 7. Coherence F1 / F2

- Zones SYSTEME / PROJET : conformes a F1 §0.
- Formats de fichiers (cdcf.md, epic/story/tache) : conformes a F2 §5.
- `workflow-dev-state.json` par projet : conforme a F2 §2.1.
- Hierarchie de contexte platform/project/story : `_byan/context/` + `projet/<slug>/context/`,
  conforme a F2 §4.1.
- Decisions D1 (Commande), D3 (worker/), D4 (provenance) : reflectees dans l'arbo.

## 8. Points ouverts

- **F5** : format exact de `INDEX.md` + generateur.
- **F7** : mapping FROM->TO complet et idempotent (cette table en est le squelette).
- **F8** : preservation des fichiers customises utilisateur lors de la migration.
- Collisions de noms a l'aplatissement `agent/` (deux agents homonymes de modules
  differents) : a resoudre en F7 (suffixe `provenance` si collision).
