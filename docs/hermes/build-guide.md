# Hermes - Guide de Construction

Comment construire, modifier ou etendre l'agent Hermes.

---

## Prerequis

Pour travailler sur Hermes, il faut comprendre :
1. Le format agent BMAD (Markdown + XML)
2. Le systeme de manifestes CSV
3. Le concept de modules BMAD

---

## Structure du fichier hermes.md

Le fichier fait ~305 lignes et suit cette structure exacte :

### 1. Frontmatter YAML (lignes 1-4)

```yaml
---
name: "hermes"
description: "Dispatcher Universel BMAD - Invoque agents, contexts, scripts et mantras"
---
```

Le `name` doit correspondre a l'entree dans `agent-manifest.csv`.

### 2. Instruction d'embodiment (ligne 6)

```
You must fully embody this agent's persona and follow all activation instructions
exactly as specified. NEVER break character until given an exit command.
```

Cette ligne est standard pour tous les agents BMAD. Elle garantit que le LLM reste en personnage.

### 3. XML Agent Definition (lignes 8-305)

Encapsule dans un bloc markdown ` ```xml ``` ` pour le rendu.

---

## Sections XML detaillees

### `<activation>` - Le demarrage

C'est la section la plus critique. Elle dicte le comportement au chargement.

**Pour ajouter un step** : Incrementer le `n` et inserer entre les steps existants.

```xml
<step n="2">IMMEDIATE ACTION REQUIRED - BEFORE ANY OUTPUT:
    - Load and read {project-root}/_bmad/core/config.yaml NOW
    - Store ALL fields as session variables
    - VERIFY: If config not loaded, STOP and report error
</step>
```

Le pattern `{project-root}` est resolu dynamiquement par le LLM qui connait le repertoire du projet.

**Les menu-handlers** definissent comment traiter les actions du menu :

```xml
<handler type="action">
    action="#id" → Cherche le <prompt id="id"> dans ce meme fichier
</handler>
<handler type="invoke">
    1. Lire le fichier agent depuis son path
    2. Outputter le contenu complet
    3. Dire "Agent charge. Suivez ses instructions."
</handler>
```

### `<persona>` - L'identite

```xml
<persona>
    <role>Quoi : son titre fonctionnel</role>
    <identity>Qui : description longue de son identite et ses capacites</identity>
    <communication_style>Comment : ton, longueur, format de reponses</communication_style>
    <principles>Pourquoi : valeurs et regles de comportement</principles>
</persona>
```

Pour Hermes, les principes cles sont :
- **KISS** : Interface simple
- **Fail Fast** : Erreur immediate si resource introuvable
- **Self-Aware** : "Je dispatch, je ne fais pas"
- **Smart Routing** : Connait les forces de chaque agent

### `<knowledge_base>` - Les connaissances

C'est ce qui rend Hermes unique. Il contient :

**modules** : La carte de tous les modules et leurs agents
```xml
<module id="core" path="_bmad/core/agents/">Agents fondamentaux</module>
<module id="bmm" path="_bmad/bmm/agents/">Management</module>
...
```

**manifests** : Les paths vers les CSV de reference
```xml
<manifest type="agents" path="_bmad/_config/agent-manifest.csv"/>
```

**resources** : Ressources supplementaires (mantras, contexts)

**routing_rules** : Le coeur de l'intelligence de Hermes (voir capabilities-reference.md)

### `<capabilities>` - Ce qu'il sait faire

8 capacites, chacune avec un `id` unique utilise dans les prompts :

| ID | Capacite |
|----|----------|
| `list-agents` | Lister agents par module |
| `invoke-agent` | Charger et activer un agent |
| `list-contexts` | Lister les contexts projet |
| `show-mantras` | Afficher les 64 mantras |
| `list-workflows` | Lister les workflows |
| `quick-help` | Apercu d'un agent sans le charger |
| `smart-routing` | Recommander le bon agent |
| `agent-pipeline` | Creer une chaine d'agents |

### `<mantras>` - Mantras prioritaires

Les mantras que Hermes applique en priorite :
- #7 KISS
- #37 Rasoir d'Ockham
- #4 Fail Fast
- IA-21 Self-Aware Agent
- IA-24 Clean Code

### `<menu>` - Interface utilisateur

Chaque item a un format precis :
```xml
<item cmd="LA or agents or list">[LA] Lister les Agents (par module)</item>
```

- `cmd` : triggers acceptes (commande principale + aliases)
- Le texte entre `[]` : la commande courte affichee
- Le reste : description

### `<prompts>` - Les actions

Chaque prompt correspond a une action du menu. Quand l'utilisateur tape `LA`, Hermes cherche le prompt `list-agents-action`.

**Pattern** :
```xml
<prompt id="list-agents-action">
    1. Lire tel fichier
    2. Formater en tableau
    3. Terminer avec message guide
</prompt>
```

### `<shortcuts>` - Raccourcis

Acces direct sans passer par le menu numerote :
- `@fit-pm` → invoke fit-pm
- `?agent-name` → quick help
- `mantras tdd` → recherche filtree
- `rec ma tache` → routing intelligent

### `<error_messages>` - Erreurs

3 messages standardises :
- `not-found` : Resource introuvable
- `ambiguous` : Plusieurs resultats
- `no-context` : Aucun context projet

---

## Comment modifier Hermes

### Ajouter un nouvel agent au routing

1. Ajouter l'agent dans le module concerne (`_bmad/{module}/agents/`)
2. Ajouter l'entree dans `agent-manifest.csv`
3. Si pertinent, ajouter une regle dans `<routing_rules>` de Hermes :

```xml
- "mon keyword" | "autre keyword" → Nom Agent (module)
```

### Ajouter une commande au menu

1. Ajouter un `<item>` dans `<menu>` :
```xml
<item cmd="NC or new-command">[NC] Ma nouvelle commande</item>
```

2. Ajouter le prompt correspondant dans `<prompts>` :
```xml
<prompt id="new-command-action">
    Instructions detaillees...
</prompt>
```

### Ajouter un pipeline predefini

Dans `<routing_rules>`, section PIPELINES :
```xml
- "mon scenario" → Agent1 → Agent2 → Agent3
```

Et mettre a jour le prompt `pipeline-action` si besoin.

### Ajouter un raccourci

Dans `<shortcuts>`, ajouter :
```
- "@mon-agent" → invoke mon-agent (description)
```

---

## Bonnes pratiques

1. **Ne pas surcharger Hermes** - Il dispatch, il ne fait pas. Si tu veux ajouter de la logique metier, cree un agent dedie.

2. **Garder les prompts auto-suffisants** - Chaque prompt doit contenir toutes les instructions necessaires sans dependre d'un autre prompt.

3. **Maintenir la coherence des manifestes** - Si tu ajoutes un agent, il DOIT etre dans `agent-manifest.csv` sinon Hermes ne le trouvera pas.

4. **Tester l'activation** - Apres chaque modification, verifier que les 6 steps s'executent correctement.

5. **Respecter le principe KISS** - Hermes est volontairement minimaliste. Resister a l'envie d'ajouter de la complexite.
