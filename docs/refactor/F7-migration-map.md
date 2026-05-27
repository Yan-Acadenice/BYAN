# F7 — Mapping de migration (ancien FS -> nouveau FS)

> FD `byan-refactor-cli-workflows`, feature F7. Code :
> `_byan/mcp/byan-mcp-server/lib/migration-map.js`. Tests :
> `test/migration-map.test.js` (TDD, 18 cas). Statut : livre.
> F7 = la **logique** de mapping (pure, dry-run). F8 appliquera les deplacements.

## Objet

Donner, pour chaque chemin de l'ancien `_byan/` (organise par module), sa cible dans
le nouveau `_byan/` (organise par type), avec une **action** explicite. Aucune entite
n'est deplacee ou supprimee en silence (Mantra No Silent Cut).

## API

- `mapPath(sourceRel, { disambiguate })` -> `{ target, type, scope, provenance, action }`
  (ou `targets[]` pour `split`).
- `buildMigrationPlan({ projectRoot })` -> `[{ from, to, action, type, provenance }]`
  pour tout l'arbre `_byan/` (dry-run, ne deplace rien), avec resolution des collisions.

## Actions

| action | sens |
|--------|------|
| `move` | deplacement vers `target` |
| `keep` | deja au format cible ou infra (`_config/`, `mcp/`, `INDEX.md`) -> identite (idempotent) |
| `skip` | junk / scaffolds (`workers-old-WRONG.md`, `_test/`, `*-template.md`...) -> non migre |
| `split` | `config.yaml` -> `context/config.yaml` + `regle/config-rules.yaml` (D4) |
| `review` | ambigu (configs modules, `teams/`, `workers.md` D3...) -> decision manuelle requise |

## Regles principales (couvrent F1 + F4 section 6)

| FROM | TO | action |
|------|----|--------|
| `_byan/{mod}/agents/<n>.md` | `_byan/agent/<n>/<n>.md` (+ provenance) | move |
| `_byan/{mod}/agents/<n>-soul.md` / `-tao.md` | `_byan/agent/<n>/<n>-soul.md` | move |
| `_byan/{mod}/workflows/<w>/...` | `_byan/workflow/simple/<w>/...` | move |
| `_byan/{mod}/tasks/<t>` | `_byan/command/<t>` (D1) | move |
| `_byan/knowledge/...` | `_byan/connaissance/...` | move |
| `_byan/_memory/...` | `_byan/memoire/...` | move |
| `_byan/{soul,tao,soul-memory,byan-soul,...}.md` | `_byan/agent/byan/...` | move |
| `_byan/config.yaml` | `context/` + `regle/` | split |
| `_byan/workers.md` | `_byan/worker/` | review (D3) |

## Idempotence

Un chemin deja au format cible (`_byan/agent/...`, `_byan/workflow/...`, etc.) mappe
vers lui-meme avec `action: keep`. Relancer le mapping apres migration est donc sans
effet (pre-requis du migrateur F8 idempotent).

## Collisions

Deux sources qui visent la meme cible (ex. deux agents `dev` de modules differents)
sont detectees par `buildMigrationPlan` et re-mappees avec suffixe de provenance :
`_byan/agent/dev-bmm/dev.md` et `_byan/agent/dev-cis/dev.md`.

## Dry-run sur le depot reel

`buildMigrationPlan` sur `_byan/` actuel : 871 entrees — 691 `move`, 72 `keep`,
66 `review`, 41 `skip`, 1 `split`, 8 collisions auto-resolues. Les 66 `review`
(configs modules, `teams/`, `module-help.csv`, `workers.md`...) sont a trancher en F8,
pas migrees automatiquement.

## Points ouverts pour F8

- Traiter les 66 `review` : configs modules -> merge dans `context/`+`regle/` ;
  `teams/` -> emplacement a decider ; `workers.md` -> formalisation D3.
- Appliquer le plan de maniere **idempotente** et **non destructive** (preservation
  des fichiers customises utilisateur), avec tests e2e (install ET update).
- Mettre a jour les manifestes + regenerer l'INDEX (F5) apres migration.
