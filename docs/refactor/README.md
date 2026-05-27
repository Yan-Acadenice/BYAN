# Refactor BYAN — CLI & Workflows (index)

> FD `byan-refactor-cli-workflows` (2026-05-27). Refonte du systeme de fichiers
> `_byan/` (par type au lieu des modules BMAD) + atomisation des workflows.
> Branche : `feat/byan-refactor-cli-workflows`. 10 features, chacune sous BYAN
> Strict Mode (scope-lock + TDD + 3 self-verify + jeton d'audit). 99/99 tests verts.

## Les deux morceaux

**Morceau 2 — atomisation des workflows** (le modele, fait en premier)
- [F1](F1-data-dictionary.md) — Dictionnaire de donnees + MCD (12 entites, generalisation Executant)
- [F2](F2-workflow-dev-spec.md) — Spec du `workflow_dev` (runtime loop, dispatch complexite, agregation memoire)
- [F3](F3-cdcf-workflow/workflow.md) — Workflow simple `cdcf` (produit le Cahier des Charges Fonctionnel)

**Morceau 1 — nouveau systeme de fichiers** (base sur le modele)
- [F4](F4-target-arborescence.md) — Arborescence cible (zone SYSTEME + zone PROJET)
- [F5](F5-index.md) — `_byan/INDEX.md` + generateur (carte cross-plateforme)
- [F7](F7-migration-map.md) — Mapping de migration ancien -> nouveau FS
- [F8](F8-migrator.md) — Migrateur idempotent + non-destructif

**Dette CLI / packaging**
- [F6](F6-manifest-reconcile.md) — Reconciliation des manifestes (dedup)
- [F9](F9-cli-dedup.md) — Dedup des variantes `create-byan-agent`
- [F10](F10-npm-package-size.md) — Exclusion des node_modules parasites (80MB -> 6.3MB)

## Modele cible

Voir [`target-model.drawio`](target-model.drawio) :
`Actor -> BYAN -> Hermes (dispatch) -> Epic/Story -> Agent | Worker (selon complexite)`,
la Memoire agregeant Contexte + Regle + Connaissance en boucle.

## Outils livres (dev `_byan/mcp/byan-mcp-server/`)

| Outil | bin | Role |
|-------|-----|------|
| index-generator | `byan-build-index` | Genere `_byan/INDEX.md` depuis les manifestes |
| migration-map | (lib) | Mapping ancien -> nouveau FS (dry-run plan) |
| migrate-fs | `byan-migrate-fs` | Applique la migration (idempotent, non-destructif, `--apply`) |
| manifest-reconcile | `byan-reconcile-manifests` | Dedup des manifestes CSV |

## Procedure de mise en production (cote utilisateur)

1. Pousser la branche + ouvrir la PR, merger sur `main`.
2. Commiter un point de retour, puis `byan-migrate-fs --root . --apply`.
3. Traiter les 67 items `manual` (split `config.yaml`, `teams/`, `workers.md`).
4. `byan-reconcile-manifests --apply` puis `byan-build-index` (regenere l'INDEX).
5. Lancer la suite de tests + verifier la non-regression.

## Suivis hors-FD (traces)

- **Distribution npm** : mirrorer les nouveaux outils dans `install/templates/_byan/mcp/`
  pour qu'ils arrivent aux utilisateurs (meme logique que le strict mode).
- **Bug strict scope-guard** : `matchesPrefix` ignore le glob `/**` (cf. F1 §8) — fix
  sur la branche `feat/byan-strict-mode`.
- **Index git** : 74 fichiers pre-existants (`.codex/prompts`, vieux SKILL.md) stages
  hors refactor — a nettoyer (`git reset`).
