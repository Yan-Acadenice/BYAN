# Hermes - Dispatcher Universel BMAD

> **Auteur** : Adriano (contribution au projet BMAD)
> **Module** : `core` | **Fichier** : `_bmad/core/agents/hermes.md`
> **Version BMAD** : 6.0.0-Beta.5

---

## Qu'est-ce que Hermes ?

Hermes est le **dispatcher universel** du systeme BMAD. Comme le dieu grec messager, il est rapide, efficace et sait exactement ou trouver ce qu'on lui demande.

**Hermes ne fait pas le travail lui-meme** - il invoque le bon specialiste.

C'est le point d'entree unique vers :
- **32 agents** repartis en 6 modules
- **44 workflows**
- **7 tasks standalone**
- **64 mantras** Merise Agile + TDD
- Des contextes projet

### Positionnement dans BMAD

```
Utilisateur
    |
    v
  HERMES (dispatcher)  <-- point d'entree
    |
    +-- recommande --> quel agent pour ta tache ?
    +-- invoque   --> charge l'agent specialiste
    +-- pipeline  --> orchestre une chaine d'agents
    +-- liste     --> agents, workflows, contexts, mantras
```

Hermes est au module `core` aux cotes de `bmad-master`. Tandis que bmad-master **execute** les tasks et workflows, Hermes **route et dispatch**.

| Agent | Role | Analogie |
|-------|------|----------|
| **Hermes** | Routeur, dispatcher, recommandeur | Standard telephonique intelligent |
| **BMad Master** | Executeur, orchestrateur de workflows | Ouvrier polyvalent |
| **BYAN** | Createur d'agents | Usine a agents |

---

## Documentation

| Document | Contenu |
|----------|---------|
| [Architecture](./architecture.md) | Comment Hermes s'integre dans BMAD, structure XML, patterns |
| [Guide de construction](./build-guide.md) | Comment construire et modifier Hermes pas a pas |
| [Reference des capacites](./capabilities-reference.md) | Toutes les commandes, le routage intelligent, les pipelines |
