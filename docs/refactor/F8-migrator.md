# F8 — Migrateur FS (applique le plan F7)

> FD `byan-refactor-cli-workflows`, feature F8. Code :
> `_byan/mcp/byan-mcp-server/lib/migrate-fs.js` + `bin/byan-migrate-fs.js`.
> Tests : `test/migrate-fs.test.js` (TDD, 7 cas e2e sur fixtures). Statut : outil livre.

## Objet

Appliquer le plan de migration F7 pour passer l'ancien `_byan/` (par module) au
nouveau (par type). Deux garanties non negociables (ta consigne « casse rien ») :

- **Non-destructif** : une cible existante n'est pas ecrasee. Conflit reporte,
  source conservee. Protege les fichiers customises par l'utilisateur.
- **Idempotent** : apres un apply reussi, les sources ont disparu et leurs cibles
  mappent vers `keep` ; une 2e execution ne deplace rien.

## Comportement

- **Dry-run par defaut** : `migrate({projectRoot})` calcule et reporte, ne touche rien.
- **Apply explicite** : `migrate({projectRoot, apply:true})` effectue les `move`.
- Seuls les `move` surs sont appliques. `split` (config.yaml) et `review`
  (configs modules, `teams/`, `workers.md`...) sont reportes `manual` et laisses en
  place — les auto-transformer risquerait de casser la plateforme (No Silent Cut).

Rapport retourne : `{ applied, moved[], kept[], skipped[], manual[], conflicts[] }`.

## CLI

```bash
# dry-run (defaut, ne deplace rien)
node _byan/mcp/byan-mcp-server/bin/byan-migrate-fs.js --root <repo>
# appliquer reellement
node _byan/mcp/byan-mcp-server/bin/byan-migrate-fs.js --root <repo> --apply
```

## Dry-run sur le depot reel (au moment du build)

`691 move / 75 kept / 41 skip / 67 manual / 0 conflict`. **Aucun fichier deplace**
pendant le build (l'outil a ete teste sur fixtures temporaires uniquement, pas
execute en `--apply` sur le vrai depot — securite : un apply en pleine session
casserait la plateforme en cours d'utilisation).

## Procedure d'application (cote utilisateur)

1. Commiter l'etat courant (point de retour git).
2. `byan-migrate-fs --root . --apply`.
3. Traiter les `manual` (67) : split `config.yaml` -> `context/` + `regle/`,
   decisions sur `teams/`, formalisation `workers.md` (D3).
4. Mettre a jour les manifestes puis `byan-build-index` (F5) pour regenerer l'INDEX.
5. Lancer la suite de tests + verifier la non-regression.

## Points ouverts

- **Wiring yanstaller** : appeler `migrate({apply:true})` lors de l'update d'install
  (comme l'index F5 est appele dans `claude-native-setup.js`). Integration a faire
  une fois l'outil eprouve sur un vrai apply manuel.
- **Manual (67)** : passe dediee pour les `review` + le `split` config.
- **Nettoyage** : suppression des dossiers vides post-migration + des `skip` (junk).
