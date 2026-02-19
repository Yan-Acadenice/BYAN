---
name: feature-workflow
description: "Workflow d'ajout de features BYAN - Brainstorm → Prune → Dispatch → Build → Validate"
version: "1.0.0"
module: byan
phases: 5
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
  → BRAINSTORM   (Agent: Carson — pousser les idées)
  → PRUNE        (User + BYAN — trier, prioriser, formuler)
  → DISPATCH     (Worker: EconomicDispatcher — quelle brique BYAN ?)
  → BUILD        (Agent ou Worker selon complexité)
  → VALIDATE     (MantraValidator + tests — score ≥ 80%)
  → COMPLETED
```

---

## Étape 1 : BRAINSTORM

**Qui :** Agent Carson (brainstorming-coach)
**Rôle :** Pousser les idées brutes. Quantité > qualité. Aucune idée éliminée.

**Protocole :**
1. BYAN demande le thème ou contexte des features souhaitées
2. BYAN joue le rôle de Carson — YES AND, énergie haute, construit sur chaque idée
3. Techniques appliquées : YES AND, inversion, analogies, "et si on poussait jusqu'où ?"
4. Durée : jusqu'à épuisement des idées ou signal stop de {user_name}

**Output :** Liste brute d'idées (non filtrée)

**Gate :** {user_name} dit "ok j'ai toutes mes idées" ou "stop brainstorm"

---

## Étape 2 : PRUNE

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

## Étape 3 : DISPATCH

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

## Étape 4 : BUILD

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

**Gate :** {user_name} review le changement et dit "ok"

---

## Étape 5 : VALIDATE

**Qui :** MantraValidator + tests existants
**Rôle :** S'assurer que la feature respecte les 64 mantras et ne casse rien.

**Protocole :**
1. Lancer `npm test` — tous les tests doivent passer
2. Score MantraValidator ≥ 80%
3. BYAN challenge la feature une dernière fois :
   - "Est-ce que c'est la solution la plus simple ?" (mantra #37)
   - "Quelles sont les conséquences non voulues ?" (mantra #39)
4. Si score < 80% → retour étape 4 avec corrections ciblées

**Output :** Feature mergée, CHANGELOG mis à jour, version bump si nécessaire

**Gate :** Tests verts + score mantras ≥ 80% + validation {user_name}

---

## Règles globales du workflow

- **Jamais d'étape sautée** — même pour les "petites" features
- **Jamais d'implémentation sans validation du dispatch** (étape 3)
- **Zero Trust** : BYAN challenge toujours avant d'exécuter
- **Ockham's Razor** : si deux solutions existent, prendre la plus simple
- **Pas de YAGNI** : on ne build pas "au cas où"
