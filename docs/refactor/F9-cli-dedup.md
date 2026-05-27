# F9 — Dedup des variantes CLI create-byan-agent

> FD `byan-refactor-cli-workflows`, feature F9 (P3, dette CLI signalee au depart).
> Statut : applique.

## Probleme

`install/bin/` contenait 4 variantes du meme installeur, source de confusion
(difficile de savoir laquelle s'execute reellement) :

| Fichier | Taille | Date | Statut |
|---------|--------|------|--------|
| `create-byan-agent-v2.js` | 88 KB | 2026-05-18 | **canonique** |
| `create-byan-agent.js` | 13 KB | 2026-02-19 | stale |
| `create-byan-agent-backup.js` | 8 KB | 2026-02-19 | stale |
| `create-byan-agent-fixed.js` | 11 KB | 2026-02-19 | stale |

## Bin canonique

`package.json` -> `bin` pointe `create-byan-agent` ET `byan-v2` vers
`./install/bin/create-byan-agent-v2.js`. C'est le seul installeur reference.

## Verification avant retrait (#39 Consequences)

- Aucune reference **code** (`require` / `import` / `bin`) vers les 3 variantes stale.
- Les seules mentions etaient dans des **docs historiques** (`README-OLD-v1.md`,
  `install/CHANGELOG.md`, `install/BUGFIX-*.md`, checklists) — sans impact runtime.

## Action

Retrait des 3 variantes stale (`create-byan-agent.js`, `-backup.js`, `-fixed.js`)
via `git rm` (recuperables dans l'historique git si besoin). `create-byan-agent-v2.js`
et le `bin` du `package.json` restent inchanges.

## Suite

- Les mentions doc historiques peuvent etre nettoyees lors d'une passe docs dediee
  (hors scope F9, sans impact fonctionnel).
- A terme, renommer `create-byan-agent-v2.js` -> `create-byan-agent.js` (sans suffixe
  `-v2`) clarifierait davantage, mais touche le `bin` et les chemins d'install :
  a faire dans une feature dediee avec mise a jour du `package.json` + tests e2e.
