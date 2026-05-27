# F10 — Taille du package npm (exclusion node_modules parasites)

> FD `byan-refactor-cli-workflows`, feature F10 (P3). Statut : applique.

## Probleme

Le package publie pesait ~80 MB / 18378 fichiers, dont ~17122 fichiers `node_modules` :
`install/node_modules` (56 MB) + `update-byan-agent/node_modules` embarques dans le tarball.

## Cause

`bundleDependencies: ["byan-platform-config"]` est **necessaire** : c'est un package
**local** (`install/packages/platform-config/`, symlink `install/node_modules/byan-platform-config`),
requis par nom (`require('byan-platform-config')`) dans `install/lib/` et `update-byan-agent/lib/`.
Sans bundle, l'install casse.

Mais `bundleDependencies` desactive l'exclusion auto de `node_modules` par npm, et le
`files: ["install/", "update-byan-agent/"]` (dossiers entiers) embarquait alors **tous**
les dev-`node_modules` de ces dossiers.

## Correction

`files` enumere desormais les **sous-chemins runtime precis** au lieu des dossiers entiers :
`install/bin/`, `install/lib/`, `install/templates/`, `install/src/`,
`install/packages/platform-config/{index.js,lib/,package.json}`, les `setup-*.js`,
`install/package.json` ; `update-byan-agent/{bin,lib,package.json}`. Les `node_modules`
de dev ne sont plus listes, donc plus embarques.

`bundleDependencies` reste inchange : npm continue de bundler `byan-platform-config`
**et son arbre de deps** (fs-extra -> graceful-fs/jsonfile/universalify) dans
`node_modules/` racine du tarball, ou `require('byan-platform-config')` le resout.

## Resultat (npm pack --dry-run)

| Avant | Apres |
|-------|-------|
| ~80 MB | **6.3 MB** |
| 18378 fichiers | **1223 fichiers** |
| 17122 node_modules (parasites) | **56 node_modules (bundle intentionnel)** |

Les 56 fichiers `node_modules` restants sont **exclusivement** le bundle requis
`byan-platform-config` + son arbre de deps — pas du parasite. Verifie present :
bin `create-byan-agent-v2.js`, `templates/`, `README.md`, et le bundle platform-config.

## Note

Le critere initial « 0 node_modules » se lit « 0 node_modules **parasite** » : le
bundleDependency declare doit rester pour que le package fonctionne. Objectif atteint :
suppression des ~80 MB de dev-deps, package fonctionnel conserve.

## Suite possible (hors F10)

- Nettoyer les nombreux docs `install/BUGFIX-*.md` / checklists (non livres desormais
  car `install/` n'est plus inclus en entier — gain collateral).
