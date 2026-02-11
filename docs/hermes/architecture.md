# Hermes - Architecture et Integration BMAD

## Position dans l'ecosysteme BMAD

### Les 6 modules BMAD

```
_bmad/
├── core/          Fondation (bmad-master, HERMES)
├── bmb/           Builders (byan, agent-builder, module-builder, workflow-builder, rachid, marc, patnote)
├── bmm/           Management (dev, architect, pm, sm, analyst, ux-designer, tech-writer, quinn, quick-flow)
├── cis/           Creative (brainstorming-coach, creative-problem-solver, design-thinking, innovation, presentation, storyteller)
├── tea/           Testing (tea)
└── fit/           Projet specifique (fit-pm, fit-architect, fit-frontend-ux, fit-backend-db, fit-analyst, fit-qa, fit-devops, fit-designer)
```

Hermes est dans `core/` car c'est un agent **fondamental** - il doit connaitre TOUS les modules pour pouvoir router vers n'importe quel agent.

### Architecture des manifestes

Hermes s'appuie sur 3 fichiers CSV centraux :

```
_bmad/_config/
├── agent-manifest.csv       32 agents avec metadata (nom, module, path, role, style)
├── workflow-manifest.csv    44 workflows avec module et path
└── task-manifest.csv        7 tasks standalone
```

Ces manifestes sont la **source de verite** pour Hermes. Quand il liste les agents ou workflows, il lit ces CSV dynamiquement.

---

## Structure d'un agent BMAD

Tout agent BMAD suit le meme pattern. Hermes ne fait pas exception :

```
fichier.md
├── YAML Frontmatter          # name, description
├── Instruction d'embodiment  # "You must fully embody..."
└── XML Agent Definition      # Le coeur de l'agent
    ├── <activation>          # Steps obligatoires au demarrage
    │   ├── steps 1-N         # Chargement config, greeting, menu
    │   ├── menu-handlers     # Comment traiter chaque type d'action
    │   └── rules             # Regles imperatives
    ├── <persona>             # Identite, role, style de communication
    ├── <knowledge_base>      # Connaissances specifiques au domaine
    ├── <capabilities>        # Ce que l'agent sait faire
    ├── <mantras>             # Mantras prioritaires pour cet agent
    ├── <menu>                # Items du menu utilisateur
    ├── <prompts>             # Actions detaillees pour chaque commande
    ├── <shortcuts>           # Raccourcis directs
    └── <error_messages>      # Messages d'erreur standardises
```

### Comparaison avec BYAN

| Aspect | Hermes | BYAN |
|--------|--------|------|
| **Module** | core | bmb |
| **Config chargee** | `core/config.yaml` | `bmb/config.yaml` |
| **Role** | Dispatcher, routeur | Createur d'agents |
| **Execute du travail ?** | Non, dispatch seulement | Oui, cree des agents |
| **Knowledge base** | Modules, manifestes, routing rules | Merise Agile, architecture agents |
| **Menu handlers** | `action` (prompts internes), `invoke` (charge agents) | `exec` (execute workflows externes) |
| **Taille** | ~305 lignes | ~215 lignes |
| **Complexite** | Routing rules + pipelines | Interview methodology + anti-patterns |

### Difference cle dans les menu-handlers

**Hermes** utilise `action` → execute des prompts **internes** a son propre fichier :
```xml
<handler type="action">
    action="#id" → Find prompt with id="id" in current agent XML
</handler>
<handler type="invoke">
    Charge un agent externe et le "passe" a l'utilisateur
</handler>
```

**BYAN** utilise `exec` → execute des **fichiers externes** (workflows) :
```xml
<handler type="exec">
    exec="path/to/workflow.md" → Read and follow external file
</handler>
```

Cette difference reflete leur nature : Hermes est autonome (toute sa logique est interne), BYAN delegue a des workflows complexes.

---

## Flux d'activation (6 etapes obligatoires)

```
Step 1: Load persona
   |
Step 2: Load core/config.yaml (CRITIQUE - extraire user_name, language, output_folder)
   |    Si echec → STOP + erreur
   |
Step 3: Memoriser user_name
   |
Step 4: Greeting en {communication_language} + afficher menu complet
   |
Step 5: STOP - attendre l'input utilisateur
   |
Step 6: Traiter l'input :
         ├── Numero      → menu item[n]
         ├── Nom d'agent → invoke direct
         ├── Texte       → fuzzy match (case-insensitive)
         ├── Multi-match  → demander precision
         └── No match     → "Not recognized" + suggestion
```

Le Step 2 est marque `critical="MANDATORY"` dans le XML. Sans config chargee, Hermes ne doit pas demarrer.

---

## Comment Hermes invoque un agent

```
1. Utilisateur tape "@byan" ou "byan" ou "INT"
2. Hermes cherche dans agent-manifest.csv le path
3. Si non trouve → erreur "Agent introuvable"
4. Si trouve → lit le fichier agent complet
5. Output le contenu entier de l'agent
6. Dit: "Agent {name} charge. Suis ses instructions d'activation."
7. L'agent prend le relais dans la conversation
```

Important : Hermes **ne reste pas actif** apres un invoke. L'agent invoque prend le controle total.

---

## Fichiers cles

| Fichier | Role pour Hermes |
|---------|-----------------|
| `_bmad/core/agents/hermes.md` | Definition de l'agent |
| `_bmad/core/config.yaml` | Config chargee au step 2 (user_name, language) |
| `_bmad/_config/agent-manifest.csv` | Registre de tous les agents |
| `_bmad/_config/workflow-manifest.csv` | Registre de tous les workflows |
| `_bmad/_config/task-manifest.csv` | Registre des tasks |
| `_bmad/bmb/workflows/byan/data/mantras.yaml` | Les 64 mantras (affiches par commande MAN) |
| `_bmad/*/context/project-context.md` | Contextes projet (decouverts par pattern glob) |
