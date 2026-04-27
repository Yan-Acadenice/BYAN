---
name: feature-workflow
description: "Workflow d'ajout de features BYAN - Discovery → Brainstorm → Prune → Dispatch → Build → Review → Validate → Doc (avec boucle Refactor)"
version: "2.0.0"
module: byan
phases: 8
---

# BYAN Feature Development Workflow

## Vue d'ensemble

Ce workflow encadre l'ajout de toute nouvelle feature ou amélioration à BYAN.
Il s'applique systematiquement : aucune feature n'est implementée sans passer par toutes les étapes.

**Principe fondamental:** Chaque étape requiert validation explicite de {user_name} avant de continuer.

---

## Machine à États

```
INIT
  → DISCOVERY    (Agent: BYAN — identifier le projet, MCP first puis local)
  → BRAINSTORM   (Agent: Carson — pousser les idées)
  → PRUNE        (User + BYAN — trier, prioriser, formuler)
  → DISPATCH     (Worker: EconomicDispatcher — quelle brique BYAN ?)
  → BUILD        (Agent ou Worker selon complexité)
  → REVIEW       (Agent: Quinn — pre-flight humain vs critères VALIDATE)
  → VALIDATE     (MantraValidator + tests — score ≥ 80%)
       ├─ OK   → DOC       (Agent: Paige — documenter ce qui a été livré)
       └─ KO   → REFACTOR  (boucle vers BUILD avec correctifs ciblés)
  → COMPLETED
```

---

## Étape 1 : DISCOVERY

**Qui :** Agent BYAN (lui-même)
**Rôle :** Identifier sans ambiguïté le projet sur lequel on travaille avant toute idéation. Pas de feature aveugle sur un contexte flou.

**Protocole :**
1. BYAN tente d'identifier le projet depuis le contexte courant (cwd, CLAUDE.md, _byan/config.yaml, README).
2. Si doute → demande explicite à {user_name} : "On est sur quel projet ?"
3. Récupère un résumé du projet, **MCP first** :
   - `byan_list_projects` pour lister les projets BYAN du compte
   - `byan_api_projects_get` pour obtenir le détail (nom, slug, description, type)
4. **Fallback local** si MCP indisponible ou projet hors-BYAN :
   - Lire `CLAUDE.md`, `_byan/config.yaml`, `README.md`
   - Inspecter `package.json`, structure du repo
5. Synthétiser un résumé court : nom du projet, domaine, stack, contraintes connues.
6. Présenter ce résumé à {user_name} pour validation.

**Output :** Fiche projet validée — `{ name, slug, domain, stack, summary, source: "mcp" | "local" }`

**Gate :** {user_name} confirme "ok c'est ce projet" ou corrige.

**Anti-patterns :**
- Sauter DISCOVERY parce que "c'est évident" — Zero Trust (source: Mantra IA-25)
- Inventer un résumé sans source — Fact-Check (source: Mantra IA-12)
- Utiliser MCP même si le projet est hors-BYAN — fallback local explicite

---

## Étape 2 : BRAINSTORM

**Qui :** Agent Carson (brainstorming-coach)
**Rôle :** Pousser les idées brutes. Quantité > qualité. Aucune idée éliminée.

**Protocole :**
1. BYAN demande le thème ou contexte des features souhaitées
2. BYAN joue le rôle de Carson — YES AND, énergie haute, construit sur chaque idée
3. Techniques appliquées : YES AND, inversion, analogies, "et si on poussait jusqu'où ?"
4. Durée : jusqu'à épuisement des idées ou signal stop de {user_name}

**Output :** Liste brute d'idées (non filtrée, ≥ 10 idées)

**Gate :** {user_name} dit "ok j'ai toutes mes idées" ou "stop brainstorm"

---

## Étape 3 : PRUNE

**Qui :** {user_name} + BYAN (Challenge Before Confirm)
**Rôle :** Trier, formuler, prioriser. Appliquer Ockham's Razor.

**Protocole :**
1. BYAN reprend la liste brute et challenge chaque idée :
   - "Quel problème concret ça résout ?"
   - "Est-ce que c'est vraiment nécessaire maintenant ?" (YAGNI)
   - "Quel est le MVP de cette idée ?"
2. {user_name} décide : garder / fusionner / éliminer
3. Les idées retenues sont formulées comme : `Feature: [nom] — [problème résolu] — [MVP]`
4. Backlog ordonné par priorité (P1 / P2 / P3)

**Output :** Backlog priorisé avec définition claire de chaque feature

**Gate :** {user_name} valide explicitement le backlog

---

## Étape 4 : DISPATCH

**Qui :** Worker — EconomicDispatcher logic
**Rôle :** Pour chaque feature du backlog, déterminer quelle brique BYAN est impliquée.

**Matrice de dispatch :**

| Score complexité | Type | Exemples |
|-----------------|------|---------|
| < 30 | Worker (existant ou nouveau) | Format, recherche, liste |
| 30–60 | Agent Sonnet (existant ou nouveau) | Implémentation, création |
| ≥ 60 | Agent Opus (existant ou nouveau) | Architecture, stratégie, analyse |

**Questions posées pour chaque feature :**
1. Un **Agent existant** peut-il gérer ça ? (lister les candidats)
2. Un **Worker existant** suffit-il ?
3. Le **Context** doit-il être enrichi ?
4. Un **Workflow existant** peut-il être adapté ?
5. Sinon → créer le composant manquant

**Output :** Tableau feature → composant BYAN (existant / à créer)

```
| Feature | Composant | Action |
|---------|-----------|--------|
| [nom]   | Agent: byan | modifier menu |
| [nom]   | Worker: nouveau | créer |
| [nom]   | Workflow: feature-workflow | déjà créé |
```

**Gate :** {user_name} valide le mapping

---

## Étape 5 : BUILD

**Qui :** Agent (Sonnet/Opus) ou Worker selon score dispatch
**Rôle :** Implémenter la feature — code, agent, workflow, ou context.

**Règles BUILD :**
- Une feature à la fois — pas de batch
- TDD : tests conceptuels définis AVANT l'implémentation
- Commits atomiques avec message clair (type: description, no emoji)
- Si nouveau Agent → suivre interview-workflow.md
- Si nouveau Worker → suivre workers.md template
- Si nouveau Workflow → suivre structure de ce fichier comme modèle

**Checklist avant commit :**
- [ ] Code self-documenting (mantra IA-24)
- [ ] Zero emoji dans code/commits (mantra IA-23)
- [ ] Tests passent
- [ ] CHANGELOG.md mis à jour

**Gate :** {user_name} review le changement et dit "ok build"

---

## Étape 6 : REVIEW

**Qui :** Agent Quinn (QA) ou reviewer dédié + {user_name}
**Rôle :** Pre-flight humain — vérifier que le BUILD est aligné avec ce que VALIDATE va mesurer. Détecter les faux-positifs avant de lancer la machine.

**Protocole :**
1. Charger les critères VALIDATE attendus :
   - Tests prévus pour cette feature (liste TDD de l'étape BUILD)
   - Score MantraValidator cible (≥ 80%)
   - Mantras les plus à risque selon le type de changement
2. Quinn (ou reviewer) inspecte le diff :
   - Lisibilité, nommage, taille des fonctions
   - Effets de bord, duplication, anti-patterns
   - Coverage : chaque branche du diff a-t-elle un test ?
   - Comments justifiés (POURQUOI uniquement, mantra IA-24)
   - Zero emoji (mantra IA-23)
3. Cross-check rapide vs critères VALIDATE :
   - Si un test prévu manque → flag "REVIEW: test absent pour [scenario]"
   - Si un mantra est manifestement violé → flag "REVIEW: violation [mantra-id]"
4. Synthèse `{ status: "ready-for-validate" | "needs-rework", findings: [...] }`

**Output :** Rapport REVIEW remis à {user_name}

**Gate :**
- Si `ready-for-validate` → {user_name} valide, on passe en VALIDATE
- Si `needs-rework` → retour direct en REFACTOR sans passer par VALIDATE (économie de cycles)

**Anti-patterns :**
- REVIEW = simple "lgtm" sans inspection — pas un rubber stamp
- REVIEW = re-faire le travail de VALIDATE — REVIEW est qualitatif, VALIDATE est quantitatif

---

## Étape 7 : VALIDATE

**Qui :** MantraValidator + tests existants + `byan-fact-check` skill
**Rôle :** Mesurer mécaniquement. Pas de jugement humain, des chiffres.

**Protocole :**
1. Lancer `npm test` — tous les tests doivent passer (zéro régression)
2. Score MantraValidator ≥ 80%
3. Fact-check final sur tout claim absolu introduit dans la doc
4. BYAN challenge la feature une dernière fois :
   - "Est-ce que c'est la solution la plus simple ?" (mantra #37)
   - "Quelles sont les conséquences non voulues ?" (mantra #39)
5. **Décision binaire :**
   - Tests verts ET score ≥ 80% ET fact-check OK → `VALIDATE: OK` → étape DOC
   - Sinon → `VALIDATE: KO` → étape REFACTOR

**Output :** Verdict `{ status: "OK" | "KO", tests, mantra_score, blocking_issues }`

**Gate :**
- `OK` → DOC
- `KO` → REFACTOR avec liste de correctifs ciblés

---

## Étape 8a : DOC (si VALIDATE OK)

**Qui :** Agent Paige (tech-writer)
**Rôle :** Documenter ce qui vient d'être livré pour que la feature soit utilisable et découvrable.

**Protocole :**
1. Paige lit le diff final + le rapport VALIDATE.
2. Pour chaque feature livrée :
   - Mettre à jour `CHANGELOG.md` (entrée datée, type: description)
   - Mettre à jour `README.md` si la feature change la surface publique
   - Créer/mettre à jour le guide d'usage (commande, exemple, edge cases)
   - Si nouvel agent/workflow → mettre à jour les manifestes (`agent-manifest.csv`, `workflow-manifest.csv`)
3. Bump de version si nécessaire (semver) — feature mineure → minor, breaking → major
4. Pas d'emoji, pas de prose marketing — clarity first (mantra IA-24)

**Output :**
- CHANGELOG mis à jour
- Guide d'usage à jour
- Manifestes synchronisés
- Version bumpée si applicable

**Gate :** {user_name} review la doc et dit "ok doc"

→ COMPLETED

---

## Étape 8b : REFACTOR (si VALIDATE KO)

**Qui :** L'agent ou worker qui a fait le BUILD initial (continuité)
**Rôle :** Corriger précisément ce que VALIDATE a flaggé — pas de scope creep, pas de re-design.

**Protocole :**
1. Lire le rapport VALIDATE → liste exacte des `blocking_issues`.
2. Pour chaque issue :
   - Reproduire localement (test rouge, lint, mantra violation)
   - Correctif minimal (Ockham — la plus petite modification qui résout)
   - Re-run du test ou du check concerné
3. Commits ciblés : `fix: [issue précise]` — un commit par issue idéalement
4. Retour automatique à BUILD pour terminer le cycle (puis REVIEW → VALIDATE à nouveau)

**Output :** Diff correctif + log des issues résolues

**Gate :** Toutes les `blocking_issues` adressées

→ Boucle vers BUILD (continue le cycle jusqu'à `VALIDATE: OK`)

**Garde-fou :** Si 3 cycles BUILD → REVIEW → VALIDATE → REFACTOR consécutifs sans converger, BYAN propose un retour à PRUNE (la feature est peut-être mal cadrée) ou ABORTED.

---

## Règles globales du workflow

- **Aucune étape sautée** — même pour les "petites" features
- **Aucune implémentation sans validation du dispatch** (étape 4)
- **DISCOVERY est obligatoire** — pas de feature sur projet flou
- **REVIEW est qualitatif, VALIDATE est quantitatif** — les deux sont nécessaires
- **REFACTOR ne fait que corriger** — pas de nouvelle feature, pas de re-design
- **DOC est livrable**, pas un nice-to-have — feature non documentée = feature non livrée
- **Zero Trust** : BYAN challenge avant d'exécuter (source: Mantra IA-25)
- **Ockham's Razor** : si deux solutions existent, prendre la plus simple
- **Pas de YAGNI** : on ne build pas "au cas où"
