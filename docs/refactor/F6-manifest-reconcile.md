# F6 — Reconciliation des manifestes

> FD `byan-refactor-cli-workflows`, feature F6. Code :
> `_byan/mcp/byan-mcp-server/lib/manifest-reconcile.js` + `bin/byan-reconcile-manifests.js`.
> Tests : `test/manifest-reconcile.test.js` (TDD, 7 cas). Statut : livre + applique.

## Objet

Les manifestes `*-manifest.csv` sont la source machine de l'index (F5). F6 les
deduplique pour que l'index reste propre.

## Regle de dedup

- **Doublon** = meme `(name, path)` -> pointe le meme fichier d'entite, meme si
  d'autres colonnes divergent (cas reel : 2 lignes `drawio` issues de 2 passes de
  generation). Le **premier** est conserve, les suivants retires.
- **Collision** = meme `name`, `path` different -> les deux sont conserves et
  reportes (decision humaine requise, cf. provenance en F7).
- Travail sur **lignes brutes** : le quoting/echappement CSV d'origine est preserve.

## Comportement

- `dedupLines(csvText)` -> `{ text, removed[], collisions[] }`.
- `reconcile({projectRoot, apply})` -> deduplique agent/workflow/command manifests.
  Dry-run par defaut ; `--apply` reecrit les fichiers.
- Idempotent : relancer sur un manifest deja dedup -> 0 retrait.

## Applique au depot reel

`agent-manifest.csv` : doublon `drawio` retire (27 -> 26 agents). `INDEX.md`
regenere : `drawio` apparait une seule fois. Aucun autre doublon, aucune collision.

## CLI

```bash
node _byan/mcp/byan-mcp-server/bin/byan-reconcile-manifests.js --root <repo>           # dry-run
node _byan/mcp/byan-mcp-server/bin/byan-reconcile-manifests.js --root <repo> --apply   # reecrit
node _byan/mcp/byan-mcp-server/bin/byan-build-index.js --root <repo>                    # regenere l'index
```

## Lien avec le reste

- Apres une migration (F8), les manifestes peuvent contenir des doublons :
  enchainer `reconcile --apply` puis `byan-build-index` remet l'index au propre.
- Les collisions reportees rejoignent la logique de provenance du mapping F7.
