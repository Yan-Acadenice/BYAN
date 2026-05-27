---
name: cdcf
description: Workflow simple qui produit un Cahier des Charges Fonctionnel (CDCF) depuis la discussion projet. Saveurs forward (nouveau projet) et inventaire (existant).
kind: simple
author: BYAN
nextStep: ./steps/step-01-cadrage.md
output_template: ./template-cdcf.md
install_path: _byan/workflow/simple/cdcf
---

# Workflow CDCF (simple)

Produit le **Cahier des Charges Fonctionnel** d'un projet. C'est l'etape amont du
flux dev : son output alimente le `workflow_dev` (F2), qui derive le CDCF en
Epics -> Stories -> Taches. Le CDCF respecte le format F1 §2.5 / F2 §5.1.

## Deux saveurs

- **forward** : nouveau projet. On part des besoins exprimes par l'utilisateur.
- **inventaire** : projet existant. On extrait les fonctionnalites reelles du code,
  par domaine (cf. le CDCF reel `byan_web` : table Role / Endpoints / Backend / UI /
  Donnees / Note refacto par domaine).

Detection : si le projet a deja du code -> proposer `inventaire` ; sinon `forward`.
L'utilisateur tranche en step-01.

## WORKFLOW ARCHITECTURE

### Core Principles
- **Micro-file design** : chaque step est un fichier d'instructions autonome.
- **Just-in-time loading** : seul le step courant est en memoire.
- **State tracking** : progression dans le frontmatter de l'output (`stepsCompleted`).
- **Append-only** : le CDCF se construit en ajoutant des sections.

### Step Processing Rules
1. Lire le step en entier avant d'agir.
2. Suivre les sections numerotees dans l'ordre.
3. A chaque menu : s'arreter et attendre l'utilisateur.
4. Sauver `stepsCompleted` avant de charger le step suivant.
5. Charger le step suivant seulement quand indique.

### Sequence
1. `steps/step-01-cadrage.md` — projet, saveur, perimetre macro.
2. `steps/step-02-besoins.md` — besoins (forward) ou domaines/fonctions (inventaire).
3. `steps/step-03-perimetre-contraintes.md` — dans/hors scope, contraintes.
4. `steps/step-04-criteres.md` — criteres d'acceptation globaux.
5. `steps/step-05-redaction.md` — assemblage final via `template-cdcf.md`.

### Sortie
`_byan/projet/<slug>/cdcf.md` (format F2 §5.1). Le `slug` du projet est demande en step-01.

### Critical Rules
- Ne pas charger plusieurs steps a la fois.
- Ne pas inventer de besoins : challenger et reformuler (Mantra IA-16) avant d'inscrire.
- Un CDCF valide (`status: valide`) est requis avant de lancer le `workflow_dev`.
