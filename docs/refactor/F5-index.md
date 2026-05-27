# F5 — Index `_byan/INDEX.md` + generateur

> FD `byan-refactor-cli-workflows`, feature F5. Premier tooling concret du refactor.
> Code : `_byan/mcp/byan-mcp-server/lib/index-generator.js` + `bin/byan-build-index.js`.
> Tests : `test/index-generator.test.js` (TDD, 11 cas, node:test). Statut : livre.

## Objet

`_byan/INDEX.md` est la **carte du systeme de fichiers** BYAN, lue par Claude Code,
Codex et Copilot pour savoir ou se trouve quoi sans parcourir tout le FS. Le fichier
est **genere** depuis les manifestes (source machine) — a ne pas editer a la main.

## Design

- **Manifest-driven** : l'index derive de `_byan/_config/agent-manifest.csv`,
  `workflow-manifest.csv`, et `command-manifest.csv` (fallback `task-manifest.csv`,
  cf. D1). Il reste donc correct quelle que soit l'arbo physique (ancienne ou migree).
- **Zone projet** : scan de `_byan/projet/*` pour lister les projets.
- **Deterministe** : tout est trie (modules puis noms), aucun timestamp dans le corps,
  donc la regeneration est **idempotente** (2e run sans changement = fichier identique,
  via `writeIfChanged`).

## API (ESM)

| Fonction | Role |
|----------|------|
| `parseManifestCsv(text)` | Parseur CSV (champs quotes, virgules internes, `""` echappes, entites HTML) |
| `loadManifests(root)` | -> `{ agents, workflows, commands }` depuis les 3 manifestes |
| `scanProjects(root)` | -> `[{ slug, path }]` depuis `_byan/projet/` |
| `renderIndex({agents,workflows,commands,projects})` | -> markdown trie deterministe |
| `buildIndex({projectRoot})` | ecrit `_byan/INDEX.md`, retourne `{written, path, counts}` |

## CLI

```bash
node _byan/mcp/byan-mcp-server/bin/byan-build-index.js --root <repo>
# [byan-build-index] wrote .../_byan/INDEX.md (agents 27, workflows 45, commands 7, projets 0)
```

## Reference cross-plateforme

L'index est reference depuis les 3 points d'entree :
- `.claude/CLAUDE.md` (Claude Code)
- `AGENTS.md` (Codex)
- `.github/copilot-instructions.md` (Copilot)

## Defaut detecte (pour F6)

Le manifest agent contient un doublon (`drawio` liste deux fois) : l'index le reflete
fidelement. A dedupliquer lors de la reconciliation des manifestes (F6).

## Points ouverts

- **F6** : reconciliation manifestes <-> index (dedup, coherence, `task` -> `command`).
- **F7/F8** : apres migration, regenerer l'index reflete la nouvelle arbo sans changement
  de code (manifest-driven).
- Integration optionnelle : regenerer l'index en fin de migration et a l'install (yanstaller).
