---
name: "soul-activation"
description: "Universal Soul System Loader — Module de chargement centralise pour tous les agents BYAN"
version: "1.0.0"
---

# Soul Activation Protocol

Ce module est le point unique de chargement du Soul System pour tous les agents BYAN.
Il est reference par les stubs (`.github/agents/`, `.codex/prompts/`) et par les agents eux-memes.

**REGLE ABSOLUE** : Ce protocole s'execute en silence. Aucun output visible pour l'utilisateur.

---

## Protocole de chargement

### Etape 1 — Identifier le type d'agent

Determine le type d'agent a partir du fichier deja charge en contexte :

- **BYAN Principal** : l'agent charge est `_byan/agents/byan.md`
- **Agent de module** : l'agent charge est dans `_byan/{module}/agents/{agent_name}.md`
  - Modules possibles : `bmm`, `bmb`, `tea`, `cis`, `core`
- **Agent autonome** : l'agent charge est dans `_byan/agents/{agent_name}.md` (pas byan.md)

### Etape 2 — Charger le Soul (personnalite, lignes rouges, rituels)

**SI BYAN Principal :**
- Lire `{project-root}/_byan/soul.md` → stocker comme variable de session `{soul}`
- Le soul definit : personnalite, noyaux immuables, peurs, ennemis, lignee, processus

**SI Agent de module :**
- Lire `{project-root}/_byan/{module}/agents/{agent_name}-soul.md` si il existe → stocker comme `{soul}`

**SI Agent autonome :**
- Lire `{project-root}/_byan/agents/{agent_name}-soul.md` si il existe → stocker comme `{soul}`

**Gestion d'absence** : Si le fichier soul n'existe pas, continuer sans (non-bloquant).
Exception : si l'agent declare `soul-required: true` dans son activation, STOP et signaler l'erreur.

### Etape 3 — Charger le Soul-Memory (journal vivant)

**SI BYAN Principal :**
- Lire `{project-root}/_byan/soul-memory.md` → stocker comme `{soul_memory}`
- Contient les evolutions de sessions passees

**SI Autre agent :**
- Lire `{project-root}/_byan/{module}/agents/{agent_name}-soul-memory.md` si il existe
- Si absent : pas de memoire de session (non-bloquant)

**Revision check** (BYAN Principal uniquement) :
- Lire `last-revision` dans le header du soul-memory
- Si absent ou date > 14 jours → planifier `soul-revision.md` apres le greeting
- Si l'utilisateur dit "pas maintenant" → reporter de 7 jours

### Etape 4 — Charger le Tao (voix, registre, signatures)

**SI BYAN Principal :**
- Lire `{project-root}/_byan/tao.md` → stocker comme `{tao}`

**SI Agent de module :**
- Lire `{project-root}/_byan/{module}/agents/{agent_name}-tao.md` si il existe → stocker comme `{tao}`

**SI Agent autonome :**
- Lire `{project-root}/_byan/agents/{agent_name}-tao.md` si il existe → stocker comme `{tao}`

**Application** : Si tao charge, appliquer les directives vocales a TOUS les outputs :
- Registre et signatures verbales
- Vocabulaire interdit
- Temperature emotionnelle
- Si tao absent : continuer sans directives vocales (non-bloquant)

### Etape 5 — Charger le profil ELO (confiance calibree)

- Lire `{project-root}/_byan/_memory/elo-profile.json` si il existe → stocker comme `{elo_profile}`
- Si absent : initialiser comme vide (premiere session)
- Ce profil calibre l'intensite du challenge par domaine

---

## Resume des fichiers par type d'agent

| Type | Soul | Soul-Memory | Tao | ELO |
|------|------|-------------|-----|-----|
| **BYAN Principal** | `_byan/soul.md` | `_byan/soul-memory.md` | `_byan/tao.md` | `_byan/_memory/elo-profile.json` |
| **Agent module** | `_byan/{module}/agents/{name}-soul.md` | `_byan/{module}/agents/{name}-soul-memory.md` | `_byan/{module}/agents/{name}-tao.md` | shared |
| **Agent autonome** | `_byan/agents/{name}-soul.md` | `_byan/agents/{name}-soul-memory.md` | `_byan/agents/{name}-tao.md` | shared |

---

## Regles d'application

1. **Silence total** — Aucun output pendant le chargement
2. **Non-bloquant par defaut** — Un fichier manquant ne bloque pas l'activation
3. **Soul avant Tao** — Toujours charger le soul avant le tao (le tao derive du soul)
4. **Tao applique partout** — Si charge, les directives vocales s'appliquent a CHAQUE output
5. **ELO partage** — Le profil ELO est global, pas par agent
6. **Pas de pre-chargement** — Charger au moment de l'activation uniquement
