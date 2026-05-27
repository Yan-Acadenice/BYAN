# F11 — Cablage de la migration FS dans le yanstaller

> FD `byan-refactor-cli-workflows`, feature F11. Code :
> `install/lib/fs-migration-hook.js`, cable dans `update-byan-agent/bin/update-byan-agent.js`.
> Tests : `install/__tests__/fs-migration-hook.test.js` (TDD, 7 cas). Statut : livre, dormant.

## Objet

Repondre a l'exigence initiale : *importer l'ancien systeme de fichiers lors du
yanstaller, pour la retrocompatibilite*. Le hook lance la migration F7/F8 pendant
l'**update** d'install.

## Garde dormant (sur par defaut)

Le hook n'agit que si **les deux** conditions sont reunies :

1. **Activation explicite** : env `BYAN_FS_MIGRATE=1` OU marqueur
   `_byan/_config/migrate-fs.enabled`.
2. **Ancien layout present** : un des dossiers `_byan/{bmm,bmb,tea,cis}` existe.

Sinon : **no-op**. Par defaut (sans activation), aucune install existante n'est touchee.

### Pourquoi dormant — le prerequis

La plateforme BYAN elle-meme est **encore en ancien layout** (le vrai `_byan/` et le
template publie sont module-based ; seuls les OUTILS du refactor sont livres). Auto-migrer
les projets utilisateurs vers le nouveau layout pendant que le code plateforme attend
l'ancien casserait les installs. Le hook est donc **pret mais inactif** : il s'activera
quand la plateforme adoptera officiellement le nouveau layout (migration de la plateforme
elle-meme + mise a jour des chemins de code + template en nouveau layout + ship du
marqueur `migrate-fs.enabled`).

## Comportement quand actif

1. **Backup** de `_byan/` -> `_byan.bak-<timestamp>` (point de retour).
2. `byan-migrate-fs --apply` (idempotent, non-destructif, F8).
3. `byan-reconcile-manifests --apply` (F6).
4. `byan-build-index` (F5, regenere l'INDEX).

API : `shouldMigrate({projectRoot, env})` (decision pure) +
`runFsMigration({projectRoot, env, exec, backup})` (orchestrateur, exec/backup injectables).

## Cablage

`update-byan-agent/bin/update-byan-agent.js`, juste apres `setupClaudeNative` (refresh
des templates) : appel garde de `runFsMigration({projectRoot: installPath})`. En cas
d'erreur : warning non bloquant (l'update continue). Le hook est livre via le package
(`install/lib/` + `update-byan-agent/bin/` sont dans `files`).

## Activation (le jour de l'adoption)

1. Migrer la plateforme elle-meme (`byan-migrate-fs --apply` sur le repo BYAN) + mettre
   a jour les chemins de code qui referencent `bmm/bmb/tea/cis`.
2. Mirrorer le template en nouveau layout.
3. Shipper le marqueur `_byan/_config/migrate-fs.enabled` dans le template.
4. Des lors, chaque `update-byan-agent` migre les installs encore en ancien layout.
