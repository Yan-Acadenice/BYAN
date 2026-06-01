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
| `review` | non classe par aucune regle -> decision manuelle (F16 : ramene a 0 sur le depot reel) |

## Regles principales (couvrent F1 + F4 section 6)

| FROM | TO | action |
|------|----|--------|
| `_byan/{mod}/agents/<n>.md` | `_byan/agent/<n>/<n>.md` (+ provenance) | move |
| `_byan/{mod}/agents/<n>-soul.md` / `-tao.md` | `_byan/agent/<n>/<n>-soul.md` | move |
| `_byan/{mod}/workflows/<w>/...` | `_byan/workflow/simple/<w>/...` | move |
| `_byan/{mod}/tasks/<t>` | `_byan/command/<t>` (D1) | move |
| `_byan/knowledge/...` | `_byan/connaissance/...` | move |
| `_byan/{mod}/testarch/...` | `_byan/connaissance/testarch/...` (substructure preservee) | move |
| `_byan/{mod}/resources/...` | `_byan/connaissance/...` | move |
| `_byan/_memory/...` | `_byan/memoire/...` | move |
| `_byan/{soul,tao,soul-memory,byan-soul,creator-soul,...}.md` | `_byan/agent/byan/...` | move |
| `_byan/workers.md` | `_byan/worker/workers.md` | move |
| `_byan/workers/...` | `_byan/worker/...` | move |
| `_byan/config.yaml` | `context/` + `regle/` | split |
| `_byan/{mod}/config.yaml`, `module-help.csv`, `teams/`, `data/` | identite (en place) | keep |
| `_byan/core/{base,activation}/...`, `model-selector.*` | identite (en place) | keep |

Les artefacts module-scoped sans home de type (configs modules, `module-help.csv`,
`teams/`, `data/`, machinerie `core/`) sont **gardes en place** (F16, `action: keep`) :
lus par nom, certains porteurs (la version autoritaire vit dans un config module ;
`soul-activation.md` est reference depuis `CLAUDE.md`/`.claude`, hors `_byan/`). Les
plier est une decision de design separee, pas un deplacement silencieux (No Silent Cut).

## Idempotence

Un chemin deja au format cible (`_byan/agent/...`, `_byan/workflow/...`, etc.) mappe
vers lui-meme avec `action: keep`. Relancer le mapping apres migration est donc sans
effet (pre-requis du migrateur F8 idempotent).

## Collisions

Deux sources qui visent la meme cible (ex. deux agents `dev` de modules differents)
sont detectees par `buildMigrationPlan` et re-mappees avec suffixe de provenance :
`_byan/agent/dev-bmm/dev.md` et `_byan/agent/dev-cis/dev.md`.

## Dry-run sur le depot reel

`buildMigrationPlan` sur `_byan/` actuel (apres F16) : 878 entrees — 736 `move`,
100 `keep`, 41 `skip`, 1 `split`, 0 `review`. Conservation verifiee (total inchange).
Le seul item non automatisable reste `config.yaml` (`split` : le contenu doit etre
reparti entre `context/` et `regle/`, traite a l'application Phase B).

## Rewriter de references intra-fichier (F16 / Stage B)

Le migrateur (F8) deplace les fichiers mais ne touche pas les **references de chemin
dans le contenu** (corps d'agents, steps de workflow, docs). Apres un move, un corps
qui dit `{project-root}/_byan/tea/testarch/knowledge/x.md` pointe dans le vide.
`lib/rewrite-refs.js` (bin `byan-rewrite-refs`) ferme ce trou : il reecrit chaque
reference `_byan/...` vers sa cible post-migration via la **meme autorite** que le
migrateur (`mapPath`). Une reference n'est reecrite que si `mapPath` la classe `move`
(fichier ou dossier via probe sentinelle) ; `split` et `keep` restent inchangees, donc
la reecriture est sure et **idempotente** (2e passe = no-op). Dry-run par defaut,
`--apply` pour ecrire. Sur le depot reel : 772 fichiers scannes, 307 changes, 983
refs reecrites. Exclut `_byan/mcp/` (code) et `_byan/_config/` (manifestes, geres par
F6 `manifest-reconcile`).

## Points ouverts pour F8

- `config.yaml` (`split`) : repartir le contenu entre `context/config.yaml` et
  `regle/config-rules.yaml` a l'application (le migrateur le laisse en place).
- Appliquer le plan de maniere **idempotente** et **non destructive** (preservation
  des fichiers customises utilisateur), avec tests e2e (install ET update).
- Mettre a jour les manifestes + regenerer l'INDEX (F5) + reecrire les refs de corps
  (`byan-rewrite-refs --apply`) dans le meme pas atomique que le move.
