# Step 05 — Redaction finale

## 1. Assembler
Le CDCF est deja construit en append au fil des steps. Verifier que toutes les
sections du `template-cdcf.md` sont remplies (frontmatter complet + corps).

## 2. Cross-check
- Chaque besoin/domaine a-t-il un perimetre clair ?
- Chaque critere est-il testable ?
- Le `slug` correspond-il au dossier `_byan/projet/<slug>/` ?

## 3. Valider
Passer `status: draft` -> `valide` apres relecture de l'utilisateur.
Inscrire `stepsCompleted: [...tous]`.

## 4. Suite
Le CDCF valide est l'entree du `workflow_dev` (F2) : `Hermes` peut maintenant le
deriver en Epics -> Stories -> Taches.

## Fin du workflow
- `valide` -> CDCF pret. Proposer de lancer `workflow_dev`.
