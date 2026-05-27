# Step 01 — Cadrage

## 1. Identifier le projet
Demander : nom du projet, `slug` (kebab-case, sert de dossier `_byan/projet/<slug>/`),
type (`dev` | `training`), stack technique.

## 2. Determiner la saveur
- Si le projet a deja du code source -> proposer **inventaire**.
- Sinon -> **forward**.
Demander confirmation. Inscrire la saveur dans `stepsCompleted`.

## 3. Perimetre macro (1-2 phrases)
"En une phrase, ce projet sert a quoi ?" Reformuler et faire valider (Challenge Before Confirm).

## 4. Initialiser l'output
Creer `_byan/projet/<slug>/cdcf.md` depuis `template-cdcf.md`, remplir le frontmatter
(`id`, `projet`, `titre`, `status: draft`, `date`), `stepsCompleted: [step-01]`.

## Menu
- `C` continuer -> charger `./step-02-besoins.md`
- `R` revoir le cadrage
