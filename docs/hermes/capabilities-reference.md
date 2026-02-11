# Hermes - Reference des Capacites

Toutes les commandes, le systeme de routage intelligent et les pipelines.

---

## Menu principal

| # | Cmd | Aliases | Description |
|---|-----|---------|-------------|
| 1 | `LA` | agents, list | Lister tous les agents par module |
| 2 | `LW` | workflows | Lister tous les workflows |
| 3 | `LC` | contexts | Lister les contexts projet |
| 4 | `MAN` | mantras | Afficher les 64 mantras |
| 5 | `REC` | recommend, quel agent | Routing intelligent |
| 6 | `PIPE` | pipeline, chaine | Creer un pipeline d'agents |
| 7 | `?` | help, aide | Aide rapide sur un agent |
| 8 | `@` | invoke | Invoquer un agent directement |
| 9 | `EXIT` | quit, bye | Quitter Hermes |

---

## Detail de chaque commande

### LA - Lister les Agents

**Input** : `LA`, `agents`, `list`, ou `1`

**Action** :
1. Lit `_bmad/_config/agent-manifest.csv`
2. Affiche un tableau groupe par module :

```
| Module | Agent        | Description                    |
|--------|-------------|--------------------------------|
| core   | hermes       | Dispatcher Universel BMAD      |
| core   | bmad-master  | Master Executor                |
| bmb    | byan         | Agent Creator Specialist       |
| ...    | ...          | ...                            |
```

3. Termine par : "Tape le nom d'un agent pour l'invoquer, ou [?] agent-name pour l'aide."

### LW - Lister les Workflows

**Input** : `LW`, `workflows`, ou `2`

**Action** :
1. Lit `_bmad/_config/workflow-manifest.csv`
2. Affiche tableau groupe par module (44 workflows au total)
3. Termine par : "Les workflows sont executes par les agents concernes."

### LC - Lister les Contexts

**Input** : `LC`, `contexts`, ou `3`

**Action** :
1. Cherche les fichiers `_bmad/*/context/project-context.md`
2. Affiche tableau : Projet | Path
3. Si aucun trouve : "Aucun context projet. Cree-en un avec BYAN [INT]."

### MAN - Mantras

**Input** : `MAN`, `mantras`, ou `4`
**Input avance** : `MAN tdd` (filtre par mot-cle)

**Action** :
1. Lit `_bmad/bmb/workflows/byan/data/mantras.yaml`
2. Affiche les 64 mantras groupes par categorie
3. Si mot-cle fourni → filtre les mantras contenant ce mot
4. Termine par : "Tape [MAN mot-cle] pour filtrer, ou [MAN] pour tout afficher."

**Categories de mantras** :
- 39 Mantras Conception (Philosophie, Collaboration, Qualite, Agilite, Technique, Tests, Rigueur Merise, Resolution)
- 25 Mantras IA Agent (Intelligence, Validation, Communication, Autonomie, Humilite, Securite, Qualite Code)

### REC - Routing Intelligent

**Input** : `REC`, `recommend`, `quel agent`, ou `5`
**Input direct** : `rec je veux creer une API REST`

**Action** :
1. Demande : "Decris ta tache en 1-2 phrases :"
2. Analyse la description contre les routing_rules
3. Match les keywords et l'intention
4. Affiche la recommandation :

```
RECOMMANDATION:
| Priorite | Agent          | Pourquoi                    |
|----------|----------------|-----------------------------|
| 1        | Fit-Backend-DB | Keywords: API, REST, Laravel |
| 2        | Dev Amelia     | Alternative generaliste     |
```

5. Termine par : "Tape @ {agent-name} pour l'invoquer."

### PIPE - Pipeline d'agents

**Input** : `PIPE`, `pipeline`, `chaine`, ou `6`
**Input direct** : `pipe nouvelle feature de suivi hydratation`

**Action** :
1. Demande : "Decris l'objectif global de ta suite de taches :"
2. Si un pipeline predefini correspond → le propose
3. Sinon → compose un pipeline custom
4. Affiche :

```
PIPELINE PROPOSE:
| Etape | Agent        | Role                 | Livrable              |
|-------|-------------|----------------------|-----------------------|
| 1     | Fit-PM       | Definir la feature   | User stories          |
| 2     | Fit-Architect| Architecture         | Schema technique      |
| 3     | Fit-Front    | Design composants    | Maquette React        |
| 4     | Fit-Back     | API endpoints        | Routes Laravel        |
| 5     | Fit-QA       | Tests                | Suite de tests        |
```

5. Termine par : "Valide ce pipeline ? Tape @ {premier-agent} pour demarrer."

### ? - Aide rapide

**Input** : `?`, `help`, `aide`, ou `7`
**Input avance** : `?byan` ou `? fit-pm`

**Action** :
1. Lit les 30 premieres lignes du fichier agent
2. Extrait : nom, titre, role, capabilities
3. Affiche un resume sans charger l'agent complet
4. Termine par : "Tape @ {agent-name} pour l'invoquer."

### @ - Invoquer un agent

**Input** : `@agent-name` ou `8`
**Exemples** : `@byan`, `@fit-pm`, `@tea`

**Action** :
1. Cherche le path dans agent-manifest.csv
2. Si non trouve → "Agent introuvable. Tape [LA] pour voir les agents."
3. Si trouve → lit et output le fichier agent complet
4. Dit : "Agent {name} charge. Suis ses instructions d'activation."

---

## Systeme de Routing Intelligent

### Regles par domaine

#### Creation / Build (→ module bmb)
| Keywords | Agent route |
|----------|-------------|
| creer un agent, nouvel agent | BYAN |
| creer un module | Module-builder Morgan |
| creer un workflow | Workflow-builder Wendy |

#### Planification (→ module bmm)
| Keywords | Agent route |
|----------|-------------|
| idee de projet, product brief | PM John |
| architecture, choix technique | Architect Winston |
| user stories, sprint, backlog | SM Bob |
| analyse business, requirements | Analyst Mary |
| UX, interface, design | UX Designer Sally |

#### Implementation (→ module bmm)
| Keywords | Agent route |
|----------|-------------|
| coder, implementer, developper | Dev Amelia |
| quick dev, vite, direct | Quick Flow Barry |
| documenter, documentation | Tech Writer Paige |

#### Qualite (→ modules tea/bmm)
| Keywords | Agent route |
|----------|-------------|
| tester, tests, QA | Tea Murat ou Quinn |
| review code, relire | Workflow code-review |

#### Creative (→ module cis)
| Keywords | Agent route |
|----------|-------------|
| brainstorm, ideation | Brainstorming Coach Carson |
| probleme complexe, resoudre | Creative Problem Solver Dr. Quinn |
| presentation, slides | Presentation Master Caravaggio |
| storytelling, narration | Storyteller Sophia |
| innovation, disruption | Innovation Strategist Victor |

#### Projet fit-adri (→ module fit)
| Keywords | Agent route |
|----------|-------------|
| product, roadmap, sprint, prioriser, story | Fit-PM |
| architecture, stack, docker compose, schema BDD | Fit-Architect |
| react, frontend, composant, UX, UI, mobile, PWA | Fit-Frontend-UX |
| laravel, API, backend, endpoint, eloquent, migration, SQL, postgres, redis | Fit-Backend-DB |
| nutrition, macros, calories, allergie, seance, exercice, phase, regles metier | Fit-Analyst |
| test, QA, PHPUnit, Vitest, couverture | Fit-QA |
| docker, traefik, deploiement, serveur, backup, infra | Fit-DevOps |
| design, palette, couleurs, animations, SVG, icones, direction artistique | Fit-Designer |

---

## Pipelines predefinis

7 pipelines prets a l'emploi :

### 1. Feature Complete
**Trigger** : "nouvelle feature complete"
```
PM John → Architect Winston → UX Sally → SM Bob → Dev Amelia → Tea Murat
```
Pour une feature de A a Z avec spec, archi, UX, stories, code et tests.

### 2. Idee vers Code
**Trigger** : "idee → code"
```
PM John → Architect Winston → SM Bob → Quick Flow Barry
```
Chemin rapide : brief, archi minimale, stories, implementation express.

### 3. Nouvel Agent
**Trigger** : "nouvel agent"
```
BYAN (interview 30-45min OU quick-create 10min)
```
BYAN gere tout seul, pas besoin de pipeline.

### 4. Refactoring
**Trigger** : "refactoring"
```
Architect Winston → Dev Amelia → Tea Murat
```
Analyse d'archi, refacto, puis tests de non-regression.

### 5. Bug Fix
**Trigger** : "bug fix"
```
Dev Amelia → Quinn
```
Fix rapide puis tests cibles.

### 6. Documentation Complete
**Trigger** : "documentation complete"
```
Analyst Mary → Tech Writer Paige
```
Analyse metier puis redaction structuree.

### 7. Qualite Complete
**Trigger** : "qualite complete"
```
Tea Murat → Quinn → code-review workflow
```
Architecture de tests, generation automatique, puis review adversariale.

---

## Raccourcis directs

### Agents fit-adri
```
@fit-pm      @fit-arch     @fit-front    @fit-back
@fit-analyst @fit-qa       @fit-devops   @fit-design
```

### Agents BMAD generiques
```
@byan   @master   @dev   @pm   @architect   @tea   @barry
```

### Commandes rapides
```
?agent-name          Apercu rapide d'un agent
mantras tdd          Filtrer les mantras par keyword
rec ma tache         Routing intelligent direct
pipe mon objectif    Pipeline direct
```

---

## Gestion des erreurs

| Situation | Message Hermes |
|-----------|---------------|
| Resource introuvable | `"{resource}" introuvable. Verifie le nom ou tape [LA] pour lister.` |
| Plusieurs resultats | `Plusieurs resultats pour "{query}": {matches}. Precise ta demande.` |
| Aucun context projet | `Aucun context projet trouve. Cree-en un avec BYAN [INT].` |

Le principe est **Fail Fast** : pas de silence, pas de tentative de deviner. Si Hermes ne trouve pas, il le dit immediatement avec une suggestion d'action.
