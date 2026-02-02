# SPÉCIFICATIONS TECHNIQUES - BYAN (Builder of YAN)

**Version:** 1.0.0  
**Date:** 2026-02-02  
**Auteur:** Yan + Carson (Brainstorming Coach)  
**Méthodologie:** Merise Agile + TDD + 64 Mantras

---

## TABLE DES MATIÈRES

1. [Vue d'Ensemble](#vue-densemble)
2. [Dictionnaire de Données](#dictionnaire-de-données)
3. [MCD - Modèle Conceptuel de Données](#mcd)
4. [MCT - Modèle Conceptuel de Traitements](#mct)
5. [Validation MCD ⇄ MCT](#validation-croisée)
6. [Règles de Gestion](#règles-de-gestion)
7. [Tests Conceptuels](#tests-conceptuels)
8. [Architecture Technique](#architecture-technique)
9. [User Stories](#user-stories)
10. [Roadmap](#roadmap)

---

## VUE D'ENSEMBLE

### Qu'est-ce que BYAN?

**BYAN (Builder of YAN)** est un agent créateur d'agents IA spécialisés.

**Objectif:** Permettre de créer rapidement des agents IA de qualité, adaptés à un contexte projet spécifique, en suivant les 64 mantras de conception et d'agents IA.

**Proposition de valeur:**
- Création d'agents en 30-45 minutes (vs plusieurs jours manuellement)
- Agents hyper-personnalisés (contexte projet intégré)
- Documentation métier générée automatiquement
- Qualité garantie (64 mantras appliqués)
- Réutilisabilité du contexte projet

### Principes Fondateurs

**Mantras appliqués prioritairement:**

1. **Mantra #37: Rasoir d'Ockham** - Simplicité d'abord, MVP incrémental
2. **Mantra #39: Évaluation des Conséquences** - Validation avant génération
3. **Mantra IA-1: Trust But Verify** - Questions clarifiantes systématiques
4. **Mantra IA-16: Challenge Before Confirm** - Devil's advocate sur specs agent
5. **Mantra IA-21: Self-Aware Agent** - BYAN connaît ses limites

### Plateformes Cibles

- GitHub Copilot CLI
- VSCode (via extensions agents)
- Claude Code (Anthropic)

---

## DICTIONNAIRE DE DONNÉES

### Entité: BYAN (Singleton)

| Code | Désignation | Type | Format | Contraintes | Règles |
|------|-------------|------|--------|-------------|--------|
| BYAN_VERSION | Version de BYAN | String | Semver (x.y.z) | NOT NULL | RG-BYAN-000 |
| MANTRAS_DB | Base des 64 mantras | JSON | Object | NOT NULL | RG-BYAN-001 |
| TEMPLATES_DB | Bibliothèque templates | JSON | Array | NOT NULL | RG-BYAN-002 |

### Entité: InterviewSession

| Code | Désignation | Type | Format | Contraintes | Règles |
|------|-------------|------|--------|-------------|--------|
| SESSION_ID | Identifiant unique | UUID | UUID v4 | PK, NOT NULL | - |
| USER_NAME | Nom de l'utilisateur | String | 1-100 chars | NOT NULL | - |
| PROJECT_NAME | Nom du projet | String | 1-200 chars | NOT NULL | - |
| START_DATE | Date début interview | DateTime | ISO 8601 | NOT NULL | - |
| END_DATE | Date fin interview | DateTime | ISO 8601 | NULL | - |
| DURATION | Durée en minutes | Integer | 0-180 | NULL | - |
| PHASE_CURRENT | Phase actuelle | Enum | contexte\|metier\|agent\|validation | NOT NULL | - |
| QUESTIONS_ASKED | Questions posées | JSON | Array | NOT NULL | - |
| ANSWERS | Réponses utilisateur | JSON | Object | NOT NULL | - |
| STATUS | Statut session | Enum | in_progress\|completed\|paused\|cancelled | NOT NULL | RG-INT-001 |

### Entité: ProjectContext

| Code | Désignation | Type | Format | Contraintes | Règles |
|------|-------------|------|--------|-------------|--------|
| CONTEXT_ID | Identifiant unique | UUID | UUID v4 | PK, NOT NULL | - |
| SESSION_ID | Session source | UUID | FK → InterviewSession | NOT NULL | - |
| PROJECT_NAME | Nom du projet | String | 1-200 chars | UNIQUE, NOT NULL | RG-PRJ-001 |
| PROJECT_DESCRIPTION | Description courte | Text | 1-1000 chars | NOT NULL | - |
| DOMAIN | Domaine métier | String | 1-100 chars | NOT NULL | - |
| SUBDOMAIN | Sous-domaine | String | 1-100 chars | NULL | - |
| STACK_TECH | Stack technique | JSON | Object | NOT NULL | - |
| TEAM_SIZE | Taille équipe | Integer | 1-1000 | NOT NULL | - |
| TEAM_SKILLS | Compétences équipe | JSON | Array | NOT NULL | - |
| MATURITY_LEVEL | Niveau maturité | Enum | idea\|mvp\|dev\|prod | NOT NULL | - |
| GLOSSAIRE | Dictionnaire métier | JSON | Object | NOT NULL | RG-PRJ-002 |
| ACTEURS | Acteurs système | JSON | Array | NOT NULL | - |
| PROCESSUS_METIER | Processus métier | JSON | Array | NOT NULL | - |
| REGLES_GESTION | Règles de gestion | JSON | Array | NOT NULL | - |
| CAS_EDGE | Cas d'edge identifiés | JSON | Array | NOT NULL | - |
| PAIN_POINTS | Points de douleur | JSON | Array | NOT NULL | - |
| CREATED_DATE | Date création | DateTime | ISO 8601 | NOT NULL | - |
| UPDATED_DATE | Date màj | DateTime | ISO 8601 | NOT NULL | - |

### Entité: AgentSpec

| Code | Désignation | Type | Format | Contraintes | Règles |
|------|-------------|------|--------|-------------|--------|
| AGENT_ID | Identifiant unique | UUID | UUID v4 | PK, NOT NULL | - |
| CONTEXT_ID | Contexte projet | UUID | FK → ProjectContext | NOT NULL | - |
| AGENT_NAME | Nom technique | String | kebab-case, 3-50 | UNIQUE, NOT NULL | RG-AGT-001 |
| AGENT_DISPLAY_NAME | Nom affichage | String | 3-100 chars | NOT NULL | - |
| AGENT_ROLE | Rôle métier | String | 10-200 chars | NOT NULL | - |
| AGENT_DESCRIPTION | Description | Text | 50-1000 chars | NOT NULL | - |
| PERSONA_NAME | Nom persona | String | 2-50 chars | NOT NULL | - |
| PERSONA_IDENTITY | Identité agent | Text | 100-500 chars | NOT NULL | - |
| PERSONA_COMMUNICATION | Style communication | Text | 100-500 chars | NOT NULL | - |
| PERSONA_PRINCIPLES | Principes | Text | 100-500 chars | NOT NULL | - |
| CAPABILITIES | Capacités | JSON | Array | NOT NULL | RG-AGT-002 |
| TOOLS | Outils disponibles | JSON | Array | NOT NULL | - |
| MANTRAS_APPLIED | Mantras appliqués | JSON | Array[mantra_id] | NOT NULL | RG-AGT-003 |
| KNOWLEDGE_METIER | Connaissances métier | JSON | Object | NOT NULL | - |
| KNOWLEDGE_TECH | Connaissances tech | JSON | Object | NOT NULL | - |
| USE_CASES | Cas d'usage | JSON | Array | NOT NULL | RG-AGT-004 |
| EXAMPLES | Exemples | JSON | Array | NOT NULL | - |
| ACTIVATION_STEPS | Étapes activation | JSON | Array | NOT NULL | - |
| VERSION | Version agent | String | Semver | NOT NULL | - |
| TEMPLATE_VERSION | Version template | String | Semver | NOT NULL | - |
| STATUS | Statut | Enum | draft\|validated\|deployed\|deprecated | NOT NULL | RG-AGT-005 |
| CREATED_BY | Créé par | String | "BYAN" | NOT NULL | - |
| CREATED_DATE | Date création | DateTime | ISO 8601 | NOT NULL | - |
| VALIDATED_DATE | Date validation | DateTime | ISO 8601 | NULL | - |
| DEPLOYED_DATE | Date déploiement | DateTime | ISO 8601 | NULL | - |

### Entité: AgentFile

| Code | Désignation | Type | Format | Contraintes | Règles |
|------|-------------|------|--------|-------------|--------|
| FILE_ID | Identifiant unique | UUID | UUID v4 | PK, NOT NULL | - |
| AGENT_ID | Agent source | UUID | FK → AgentSpec | NOT NULL | - |
| PLATFORM | Plateforme cible | Enum | copilot\|vscode\|claude | NOT NULL | - |
| FILE_PATH | Chemin fichier | String | Path relatif | NOT NULL | RG-FILE-001 |
| FILE_NAME | Nom fichier | String | *.md | NOT NULL | - |
| FILE_CONTENT | Contenu fichier | Text | Markdown BMAD | NOT NULL | RG-FILE-002 |
| FILE_SIZE | Taille en octets | Integer | >0 | NOT NULL | - |
| CHECKSUM | Hash MD5 | String | 32 chars hex | NOT NULL | - |
| GENERATED_DATE | Date génération | DateTime | ISO 8601 | NOT NULL | - |

### Glossaire Métier

| Terme | Définition | Synonymes Interdits |
|-------|------------|---------------------|
| Agent | Entité IA avec persona, capacités, connaissances spécifiques | Bot, Assistant (trop générique) |
| BYAN | Builder of YAN - Agent créateur d'agents | Agent Factory (anglais) |
| InterviewSession | Session d'échange BYAN ↔ User pour comprendre contexte | Discovery, Onboarding |
| ProjectContext | Documentation métier d'un projet | Contexte, Documentation |
| AgentSpec | Spécification complète d'un agent | Agent Config, Agent Schema |
| AgentFile | Fichier Markdown généré au format BMAD | Agent Template |
| Mantra | Principe de conception ou d'agent IA à respecter | Rule, Guideline |
| Persona | Personnalité et style d'un agent | Character, Profile |
| Capability | Capacité/Compétence d'un agent | Skill, Ability |

---

## MCD - MODÈLE CONCEPTUEL DE DONNÉES

### Diagramme MCD

```
┌──────────────┐
│     BYAN     │ (Singleton - Meta-Agent)
└──────┬───────┘
       │ (1,1) conduit
       │ (0,N)
       ▼
┌──────────────────┐
│ InterviewSession │
└──────┬───────────┘
       │ (1,1) produit
       │ (1,1)
       ▼
┌──────────────────┐
│  ProjectContext  │ (Documentation métier)
└──────┬───────────┘
       │ (1,1) décrit contexte de
       │ (1,N)
       ▼
┌──────────────────┐
│    AgentSpec     │
└──────┬───────────┘
       │ (1,1) génère
       │ (1,N) (un par plateforme)
       ▼
┌──────────────────┐
│    AgentFile     │
└──────────────────┘
```

### Cardinalités Justifiées

**BYAN --(1,1)--conduit--(0,N)-- InterviewSession**
- Justification: BYAN (singleton) conduit toutes les sessions
- Un BYAN conduit 0 à N sessions (0 au démarrage)
- Une session est conduite par exactement 1 BYAN

**InterviewSession --(1,1)--produit--(1,1)-- ProjectContext**
- Justification: Une session complétée produit TOUJOURS un contexte
- Une session produit exactement 1 contexte projet
- Un contexte est produit par exactement 1 session

**ProjectContext --(1,1)--décrit contexte de--(1,N)-- AgentSpec**
- Justification: Un projet peut avoir plusieurs agents spécialisés
- Un contexte décrit 1 à N agents (au moins 1 après première création)
- Un agent appartient à exactement 1 contexte projet

**AgentSpec --(1,1)--génère--(1,N)-- AgentFile**
- Justification: Un agent doit être généré pour au moins 1 plateforme
- Une spec génère 1 à N fichiers (un par plateforme cible)
- Un fichier est généré par exactement 1 spec

---

## MCT - MODÈLE CONCEPTUEL DE TRAITEMENTS

### T1: Initialiser BYAN

**Événement déclencheur:**
- Démarrage système / Première utilisation

**Entrées:**
- Configuration BMAD

**Opérations:**
1. Charger les 64 mantras depuis configuration
2. Charger bibliothèque de templates agents
3. Initialiser moteur de génération
4. Vérifier compatibilité plateformes
5. Prêt à recevoir demandes

**Résultats:**
- BYAN initialisé et opérationnel

**Règles:**
- RG-BYAN-000: Version BYAN doit être valide

---

### T2: Conduire Interview Projet

**Événement déclencheur:**
- User: "BYAN, crée-moi un agent [Rôle]"

**Entrées:**
- Demande initiale user
- Optionnel: Nom user, nom projet

**Opérations:**

**Phase 1: Contexte Projet (15-30 min)**
1. Créer [InterviewSession]
2. Poser Q1: Description projet
   - Reformuler réponse
   - Valider compréhension
3. Poser Q2: Utilisateurs finaux
   - Approfondir: Problèmes principaux
4. Poser Q3: Stack technique
   - Challenge: Pourquoi ces choix?
5. Poser Q4: Niveau maturité
   - Options: idea|mvp|dev|prod
6. Poser Q5: Composition équipe
   - Taille + compétences
7. Poser Q6: Top 3 pain points
   - Prioriser
   - 5 Whys sur le #1

**Phase 2: Métier & Domaine (15-20 min)**
8. Poser Q7: Domaine métier principal
9. Poser Q8: Concepts métier clés
   - Créer glossaire en temps réel
   - Valider définitions
10. Poser Q9: Acteurs du système
11. Poser Q10: Processus métier critiques
    - Story Mapping rapide
12. Poser Q11: Règles métier non-négociables
13. Poser Q12: Cas d'edge fréquents

**Phase 3: Besoins en Agents (10-15 min)**
14. Poser Q13: Premier agent souhaité
15. Poser Q14: Connaissances nécessaires (métier + tech)
16. Poser Q15: Capacités requises
17. Poser Q16: Style communication souhaité
18. Poser Q17: Mantras critiques
19. Poser Q18: 3 cas d'usage prioritaires

**Phase 4: Validation (10 min)**
20. Synthétiser toutes les informations
21. Présenter synthèse structurée
22. Demander validation user
23. Si NON: Ajuster points manquants (retour questions spécifiques)
24. Si OUI: Finaliser session

25. Créer [ProjectContext] avec toutes données
26. Update [InterviewSession] (status: completed, duration calculée)

**Résultats:**
- [InterviewSession] complétée
- [ProjectContext] créé et persisté
- Données validées par user
- Prêt pour création agent

**Règles:**
- RG-INT-001: Session doit passer par les 4 phases
- RG-PRJ-001: Nom projet unique
- RG-PRJ-002: Glossaire doit contenir au moins 5 concepts

**Tests conceptuels:**
- TEST-INT-001: Session ne peut pas passer en completed sans validation user
- TEST-INT-002: ProjectContext créé contient toutes les données obligatoires
- TEST-INT-003: Glossaire métier validé avec user avant finalisation

---

### T3: Créer Agent

**Événement déclencheur:**
- Fin T2 (Interview validée)
- Ou: User demande création agent supplémentaire (réutilise ProjectContext)

**Entrées:**
- [ProjectContext] (existant ou nouveau)
- Spécifications agent (issues de l'interview)

**Opérations:**
1. **Challenge Before Confirm (Mantra IA-16)**
   - Analyser demande agent
   - Identifier risques potentiels:
     * Agent trop générique?
     * Overlap avec agent existant?
     * Capacités contradictoires?
   - Si risques: Proposer alternatives/ajustements
   - Demander confirmation user

2. **Sélection Template**
   - Chercher template correspondant au rôle
   - Si existe: Adapter au contexte
   - Si pas existe: Générer from scratch

3. **Génération Persona**
   - Nom persona (cohérent avec rôle)
   - Identité (années expérience, spécialités)
   - Style communication (adapté au contexte projet)
   - Principes (alignés avec mantras prioritaires)

4. **Sélection Mantras**
   - Analyser rôle agent
   - Identifier mantras pertinents (conception + IA)
   - Minimum 5, maximum 20
   - Justifier chaque sélection

5. **Définition Capabilities**
   - Lister capacités métier (depuis ProjectContext)
   - Lister capacités techniques (depuis stack + besoins)
   - Vérifier cohérence avec rôle

6. **Définition Knowledge Base**
   - Connaissances métier (depuis glossaire + processus)
   - Connaissances techniques (stack + best practices)
   - Contexte projet (pain points + contraintes)

7. **Création Use Cases**
   - 3 cas d'usage prioritaires (depuis interview)
   - Format: Request → Response attendue
   - Incluant exemples concrets

8. **Génération Activation Steps**
   - Étapes pour activer agent
   - Vérifications à faire
   - Comportement initial

9. **Créer [AgentSpec]**
   - Tous attributs remplis
   - Status: draft
   - Version: 1.0.0

10. **Validation AgentSpec**
    - Format valide?
    - Cohérence interne?
    - Mantras appliqués pertinents?
    - Capabilities réalistes?

11. **Si validation OK:**
    - Update [AgentSpec] status: validated
    - Sinon: Ajuster et re-valider

**Résultats:**
- [AgentSpec] créé (status: validated)
- Prêt pour génération fichiers

**Règles:**
- RG-AGT-001: Nom agent unique (format kebab-case)
- RG-AGT-002: Au moins 3 capabilities
- RG-AGT-003: Au moins 5 mantras appliqués
- RG-AGT-004: Au moins 3 cas d'usage définis
- RG-AGT-005: Status doit suivre: draft → validated → deployed

**Tests conceptuels:**
- TEST-AGT-001: Deux agents ne peuvent avoir le même nom
- TEST-AGT-002: Agent ne peut être validated sans capabilities minimales
- TEST-AGT-003: Mantras appliqués doivent exister dans la base BYAN
- TEST-AGT-004: Use cases doivent avoir format Request/Response

---

### T4: Générer Fichiers Agent

**Événement déclencheur:**
- [AgentSpec] status: validated
- User demande génération pour plateforme(s)

**Entrées:**
- [AgentSpec] validée
- Plateformes cibles: copilot|vscode|claude (1 ou plusieurs)

**Opérations:**

**Pour chaque plateforme:**

1. **Sélection Template BMAD**
   - Charger template pour plateforme
   - Vérifier compatibilité version

2. **Génération Contenu**
   - Injecter données [AgentSpec] dans template
   - Générer section <persona>
   - Générer section <capabilities>
   - Générer section <mantras_applied>
   - Générer section <activation>
   - Générer section <examples>
   - Formatter Markdown selon conventions BMAD

3. **Validation Format**
   - Syntaxe Markdown valide?
   - Structure BMAD respectée?
   - Tous les champs obligatoires présents?

4. **Génération Métadonnées**
   - Calculer checksum (MD5)
   - Définir file_path (selon plateforme)
   - Définir file_name

5. **Créer [AgentFile]**
   - Tous attributs remplis
   - Lier à [AgentSpec]

6. **Sauvegarder Fichier**
   - Écrire dans _bmad/agents/[agent-name].md
   - Vérifier écriture réussie

**Résultats:**
- 1 à 3 [AgentFile] créés (selon plateformes demandées)
- Fichiers .md sauvegardés sur disque

**Règles:**
- RG-FILE-001: file_path doit suivre convention BMAD
- RG-FILE-002: file_content doit être Markdown BMAD valide

**Tests conceptuels:**
- TEST-FILE-001: Fichier généré doit être parsable en Markdown
- TEST-FILE-002: Structure BMAD doit être validable par schéma
- TEST-FILE-003: Checksum doit correspondre au contenu

---

### T5: Lister Agents

**Événement déclencheur:**
- User: "BYAN, liste mes agents"

**Entrées:**
- Optionnel: Critères filtrage (project, status, platform)

**Opérations:**
1. Query [AgentSpec] selon critères
2. Pour chaque agent:
   - Récupérer métadonnées
   - Récupérer [ProjectContext] associé
   - Formater info pour affichage
3. Trier par date création (DESC)
4. Présenter liste formatée

**Résultats:**
- Liste agents avec métadonnées

---

### T6: Modifier Agent

**Événement déclencheur:**
- User: "BYAN, modifie l'agent X"

**Entrées:**
- agent_id ou agent_name
- Modifications souhaitées

**Opérations:**
1. **Évaluation Conséquences (Mantra #39)**
   - Impact sur fichiers générés?
   - Agents déployés affectés?
   - Compatibilité rétro?
   - Risques pour projets utilisant l'agent?

2. **Si risques identifiés:**
   - Alerter user
   - Proposer alternatives:
     * Créer nouvelle version (v2.0.0)
     * Déprécier ancienne version
     * Migration assistée

3. **Si user confirme:**
   - Update [AgentSpec]
   - Incrémenter version (selon type modif)
   - Régénérer [AgentFile] pour toutes plateformes
   - Update date_modified

**Résultats:**
- [AgentSpec] modifiée
- [AgentFile] régénérés
- Historique versionné

**Tests conceptuels:**
- TEST-MOD-001: Modification doit incrémenter version
- TEST-MOD-002: Fichiers doivent être régénérés après modification

---

### T7: Supprimer Agent

**Événement déclencheur:**
- User: "BYAN, supprime l'agent X"

**Entrées:**
- agent_id ou agent_name

**Opérations:**
1. **Évaluation Conséquences CRITIQUE (Mantra #39)**
   - L'agent est-il utilisé actuellement?
   - Projets dépendants?
   - Références dans d'autres agents?
   - Historique d'utilisation?

2. **Si dépendances:**
   - BLOQUER suppression
   - Proposer dépréciation plutôt que suppression
   - Suggérer migration vers autre agent

3. **Si aucune dépendance:**
   - Demander confirmation EXPLICITE
   - Afficher ce qui sera perdu:
     * [AgentSpec]
     * [AgentFile] (tous)
     * Statistiques utilisation
   - Créer backup automatique

4. **Si user confirme:**
   - Backup [AgentSpec] + [AgentFile]
   - Delete [AgentFile] (cascade)
   - Delete [AgentSpec]
   - Delete fichiers .md sur disque

**Résultats:**
- Agent supprimé
- Backup créé

**Règles:**
- RG-DEL-001: Suppression nécessite confirmation explicite
- RG-DEL-002: Backup obligatoire avant suppression

**Tests conceptuels:**
- TEST-DEL-001: Suppression sans confirmation doit échouer
- TEST-DEL-002: Backup doit être créé avant suppression
- TEST-DEL-003: Fichiers disque doivent être supprimés avec [AgentFile]

---

## VALIDATION CROISÉE MCD ⇄ MCT

### Matrice: Entité → Traitements

| Entité | Créé par | Modifié par | Supprimé par | Consulté par |
|--------|----------|-------------|--------------|--------------|
| BYAN | T1: Initialiser | - | - | Tous traitements |
| InterviewSession | T2: Conduire Interview | T2 (update phases) | - | T2, T5 |
| ProjectContext | T2: Conduire Interview | T6 (indirect) | - | T2, T3, T5 |
| AgentSpec | T3: Créer Agent | T6: Modifier Agent | T7: Supprimer Agent | T3, T4, T5, T6, T7 |
| AgentFile | T4: Générer Fichiers | T6 (régénération) | T7: Supprimer Agent | T5 |

### Matrice: Traitement → Entités

| Traitement | Entités Lues | Entités Créées | Entités Modifiées | Entités Supprimées |
|------------|--------------|----------------|-------------------|-------------------|
| T1: Initialiser BYAN | Config BMAD | BYAN | - | - |
| T2: Conduire Interview | BYAN | InterviewSession, ProjectContext | InterviewSession (phases) | - |
| T3: Créer Agent | BYAN, ProjectContext | AgentSpec | - | - |
| T4: Générer Fichiers | BYAN, AgentSpec | AgentFile | - | - |
| T5: Lister Agents | BYAN, AgentSpec, ProjectContext | - | - | - |
| T6: Modifier Agent | BYAN, AgentSpec | AgentFile (nouveaux) | AgentSpec | AgentFile (anciens) |
| T7: Supprimer Agent | BYAN, AgentSpec, AgentFile | Backup | - | AgentSpec, AgentFile |

**Validation:** Toutes les entités sont utilisées, tous les traitements ont accès aux données nécessaires. ✓

---

## RÈGLES DE GESTION

### Règles BYAN (Meta)

**RG-BYAN-000: Version BYAN valide**
- Description: La version de BYAN doit suivre semver (x.y.z)
- Priorité: Critique
- Test: TEST-BYAN-000

**RG-BYAN-001: Base mantras complète**
- Description: BYAN doit avoir accès aux 64 mantras (39 conception + 25 agents IA)
- Priorité: Critique
- Test: TEST-BYAN-001

**RG-BYAN-002: Templates disponibles**
- Description: Au moins 1 template agent doit être disponible
- Priorité: Importante
- Test: TEST-BYAN-002

### Règles Interview

**RG-INT-001: Phases obligatoires**
- Description: Interview doit passer par les 4 phases (contexte, métier, agent, validation)
- Priorité: Critique
- Test: TEST-INT-001

### Règles ProjectContext

**RG-PRJ-001: Nom projet unique**
- Description: Deux projets ne peuvent avoir le même nom
- Priorité: Critique
- Contrainte: UNIQUE sur PROJECT_NAME
- Test: TEST-PRJ-001

**RG-PRJ-002: Glossaire minimum**
- Description: Le glossaire métier doit contenir au moins 5 concepts
- Priorité: Importante
- Test: TEST-PRJ-002

### Règles AgentSpec

**RG-AGT-001: Nom agent unique**
- Description: Deux agents ne peuvent avoir le même nom (kebab-case)
- Priorité: Critique
- Contrainte: UNIQUE sur AGENT_NAME
- Format: ^[a-z0-9]+(-[a-z0-9]+)*$
- Test: TEST-AGT-001

**RG-AGT-002: Capabilities minimum**
- Description: Un agent doit avoir au moins 3 capabilities
- Priorité: Critique
- Test: TEST-AGT-002

**RG-AGT-003: Mantras minimum**
- Description: Un agent doit appliquer au moins 5 mantras
- Priorité: Importante
- Test: TEST-AGT-003

**RG-AGT-004: Use cases minimum**
- Description: Un agent doit avoir au moins 3 cas d'usage définis
- Priorité: Importante
- Test: TEST-AGT-004

**RG-AGT-005: Workflow status**
- Description: Status doit suivre: draft → validated → deployed (ou → deprecated)
- Priorité: Critique
- Test: TEST-AGT-005

### Règles AgentFile

**RG-FILE-001: Chemin conforme**
- Description: file_path doit suivre convention BMAD (_bmad/agents/[name].md)
- Priorité: Critique
- Test: TEST-FILE-001

**RG-FILE-002: Format BMAD valide**
- Description: file_content doit être Markdown BMAD valide (structure XML-like)
- Priorité: Critique
- Test: TEST-FILE-002

### Règles Suppression

**RG-DEL-001: Confirmation explicite**
- Description: Suppression agent nécessite confirmation explicite user
- Priorité: Critique
- Test: TEST-DEL-001

**RG-DEL-002: Backup obligatoire**
- Description: Backup automatique avant toute suppression
- Priorité: Critique
- Test: TEST-DEL-002

---

## TESTS CONCEPTUELS

### Tests BYAN

```python
# tests/conceptual/test_byan_rules.py

class TestBYANConceptualRules:
    """Tests des règles de gestion BYAN"""
    
    def test_RG_BYAN_000_version_valid(self):
        """
        RG-BYAN-000: Version BYAN doit être semver valide
        """
        # GIVEN
        byan = BYAN()
        
        # WHEN
        version = byan.get_version()
        
        # THEN
        assert is_semver(version)  # Ex: "1.0.0"
    
    def test_RG_BYAN_001_mantras_complete(self):
        """
        RG-BYAN-001: BYAN doit avoir les 64 mantras
        """
        # GIVEN
        byan = BYAN()
        
        # WHEN
        mantras = byan.get_mantras_db()
        
        # THEN
        assert len(mantras['conception']) == 39
        assert len(mantras['agents_ia']) == 25
        assert len(mantras['conception']) + len(mantras['agents_ia']) == 64
```

### Tests InterviewSession

```python
class TestInterviewSessionRules:
    """Tests des règles d'interview"""
    
    def test_RG_INT_001_phases_obligatoires(self):
        """
        RG-INT-001: Interview doit passer par 4 phases
        """
        # GIVEN
        session = InterviewSession.create(user_name="Yan", project_name="Test")
        
        # WHEN: Tentative de compléter sans toutes les phases
        session.phase_current = "contexte"
        
        with pytest.raises(IncompletePhasesError):
            session.complete()
        
        # THEN: Erreur levée
        assert session.status == "in_progress"
        
        # WHEN: Toutes phases complétées
        session.complete_phase("contexte")
        session.complete_phase("metier")
        session.complete_phase("agent")
        session.complete_phase("validation")
        session.complete()
        
        # THEN
        assert session.status == "completed"
```

### Tests ProjectContext

```python
class TestProjectContextRules:
    """Tests des règles ProjectContext"""
    
    def test_RG_PRJ_001_nom_projet_unique(self):
        """
        RG-PRJ-001: Nom projet doit être unique
        """
        # GIVEN: Un projet existe
        context1 = ProjectContext.create(project_name="ecommerce-b2b")
        
        # WHEN: Tentative créer projet même nom
        with pytest.raises(ProjectNameAlreadyExistsError):
            context2 = ProjectContext.create(project_name="ecommerce-b2b")
    
    def test_RG_PRJ_002_glossaire_minimum(self):
        """
        RG-PRJ-002: Glossaire doit avoir au moins 5 concepts
        """
        # GIVEN
        context = ProjectContext.create(project_name="test")
        context.glossaire = {
            "concept1": "def1",
            "concept2": "def2",
            "concept3": "def3"
        }  # Seulement 3 concepts
        
        # WHEN: Tentative valider
        with pytest.raises(InsufficientGlossaryError):
            context.validate()
        
        # GIVEN: 5 concepts
        context.glossaire["concept4"] = "def4"
        context.glossaire["concept5"] = "def5"
        
        # WHEN
        result = context.validate()
        
        # THEN
        assert result.is_success()
```

### Tests AgentSpec

```python
class TestAgentSpecRules:
    """Tests des règles AgentSpec"""
    
    def test_RG_AGT_001_nom_agent_unique(self):
        """
        RG-AGT-001: Nom agent doit être unique
        """
        # GIVEN
        context = create_test_project_context()
        agent1 = AgentSpec.create(
            context_id=context.id,
            agent_name="backend-expert"
        )
        
        # WHEN: Tentative même nom
        with pytest.raises(AgentNameAlreadyExistsError):
            agent2 = AgentSpec.create(
                context_id=context.id,
                agent_name="backend-expert"
            )
    
    def test_RG_AGT_002_capabilities_minimum(self):
        """
        RG-AGT-002: Au moins 3 capabilities
        """
        # GIVEN
        agent = AgentSpec.create_draft()
        agent.capabilities = ["cap1", "cap2"]  # Seulement 2
        
        # WHEN: Tentative valider
        with pytest.raises(InsufficientCapabilitiesError):
            agent.validate()
        
        # GIVEN: 3 capabilities
        agent.capabilities.append("cap3")
        
        # WHEN
        result = agent.validate()
        
        # THEN
        assert result.is_success()
    
    def test_RG_AGT_003_mantras_minimum(self):
        """
        RG-AGT-003: Au moins 5 mantras appliqués
        """
        # GIVEN
        agent = AgentSpec.create_draft()
        agent.mantras_applied = [1, 2, 3]  # Seulement 3
        
        # WHEN
        with pytest.raises(InsufficientMantrasError):
            agent.validate()
        
        # GIVEN: 5 mantras
        agent.mantras_applied = [1, 2, 3, 37, 39]
        
        # WHEN
        result = agent.validate()
        
        # THEN
        assert result.is_success()
    
    def test_RG_AGT_005_status_workflow(self):
        """
        RG-AGT-005: Status doit suivre workflow
        """
        # GIVEN
        agent = AgentSpec.create_draft()
        assert agent.status == "draft"
        
        # WHEN: Tentative passer deployed sans validated
        with pytest.raises(InvalidStatusTransitionError):
            agent.status = "deployed"
        
        # WHEN: Workflow correct
        agent.validate()
        assert agent.status == "validated"
        
        agent.deploy()
        assert agent.status == "deployed"
```

### Tests AgentFile

```python
class TestAgentFileRules:
    """Tests des règles AgentFile"""
    
    def test_RG_FILE_001_chemin_conforme(self):
        """
        RG-FILE-001: file_path doit suivre convention BMAD
        """
        # GIVEN
        agent_spec = create_test_agent_spec()
        
        # WHEN
        agent_file = AgentFile.generate(
            agent_spec=agent_spec,
            platform="copilot"
        )
        
        # THEN
        assert agent_file.file_path.startswith("_bmad/agents/")
        assert agent_file.file_path.endswith(".md")
    
    def test_RG_FILE_002_format_bmad_valide(self):
        """
        RG-FILE-002: Contenu doit être Markdown BMAD valide
        """
        # GIVEN
        agent_spec = create_test_agent_spec()
        agent_file = AgentFile.generate(agent_spec, platform="copilot")
        
        # WHEN
        is_valid = validate_bmad_format(agent_file.file_content)
        
        # THEN
        assert is_valid
        assert "<agent" in agent_file.file_content
        assert "<persona>" in agent_file.file_content
        assert "</agent>" in agent_file.file_content
```

---

## ARCHITECTURE TECHNIQUE

### Stack Technique Proposée

**Backend/Core:**
- Python 3.11+ (ou TypeScript/Node.js selon préférence équipe)
- Framework CLI: Click (Python) ou Commander (Node.js)
- ORM: SQLAlchemy (Python) ou Prisma (Node.js)
- Database: SQLite (MVP) → PostgreSQL (production)
- Tests: pytest (Python) ou Jest (Node.js)

**Storage:**
- Base de données: Entités persistées
- Fichiers: Agents générés (.md) dans _bmad/agents/
- Config: YAML ou JSON

**Intégration:**
- GitHub Copilot CLI: Plugin/Extension
- VSCode: Extension API
- Claude Code: Compatible format Markdown

### Structure Projet

```
byan/
├── _bmad/
│   ├── agents/                    # Agents générés
│   │   ├── backend-expert.md
│   │   └── ...
│   └── config/
│       ├── mantras.yaml           # 64 mantras
│       └── templates.yaml         # Templates agents
├── src/
│   ├── core/
│   │   ├── byan.py               # Classe BYAN
│   │   ├── interviewer.py        # Logique interview
│   │   ├── generator.py          # Génération agents
│   │   └── validator.py          # Validation
│   ├── models/
│   │   ├── interview_session.py
│   │   ├── project_context.py
│   │   ├── agent_spec.py
│   │   └── agent_file.py
│   ├── services/
│   │   ├── interview_service.py
│   │   ├── agent_service.py
│   │   └── file_service.py
│   ├── templates/
│   │   ├── base_agent.md         # Template de base
│   │   └── platforms/
│   │       ├── copilot.md
│   │       ├── vscode.md
│   │       └── claude.md
│   └── cli/
│       └── commands.py            # Commandes CLI
├── tests/
│   ├── conceptual/                # Tests conceptuels (TDD)
│   │   ├── test_byan_rules.py
│   │   ├── test_interview_rules.py
│   │   ├── test_agent_rules.py
│   │   └── ...
│   ├── integration/
│   └── e2e/
├── data/
│   └── byan.db                    # SQLite (dev)
├── docs/
│   ├── specs.md                   # Ce fichier!
│   └── api.md
└── pyproject.toml / package.json
```

### Classes Principales (Pseudo-Code)

```python
# src/core/byan.py

class BYAN:
    """Meta-agent créateur d'agents"""
    
    def __init__(self):
        self.version = "1.0.0"
        self.mantras_db = load_mantras()
        self.templates_db = load_templates()
    
    def start_interview(self, user_name: str, project_name: str = None) -> InterviewSession:
        """Démarre une session d'interview"""
        session = InterviewSession.create(
            user_name=user_name,
            project_name=project_name or f"project-{uuid4()}"
        )
        return session
    
    def conduct_interview(self, session: InterviewSession) -> ProjectContext:
        """Conduit l'interview complet (4 phases)"""
        interviewer = Interviewer(session)
        
        # Phase 1: Contexte
        interviewer.phase_contexte()
        
        # Phase 2: Métier
        interviewer.phase_metier()
        
        # Phase 3: Agent
        interviewer.phase_agent()
        
        # Phase 4: Validation
        context = interviewer.phase_validation()
        
        session.complete()
        return context
    
    def create_agent(self, context: ProjectContext, specs: dict) -> AgentSpec:
        """Crée un agent selon specs"""
        # Challenge Before Confirm
        risks = self._analyze_risks(specs)
        if risks:
            self._alert_user(risks)
            if not self._get_user_confirmation():
                raise AgentCreationAborted()
        
        # Génération
        generator = AgentGenerator(context, self.mantras_db, self.templates_db)
        agent_spec = generator.generate(specs)
        
        # Validation
        agent_spec.validate()
        
        return agent_spec
    
    def generate_files(self, agent_spec: AgentSpec, platforms: list[str]) -> list[AgentFile]:
        """Génère fichiers pour plateformes"""
        files = []
        for platform in platforms:
            file = AgentFile.generate(agent_spec, platform, self.templates_db)
            file.save_to_disk()
            files.append(file)
        return files
```

```python
# src/services/interview_service.py

class Interviewer:
    """Gère la logique d'interview"""
    
    def __init__(self, session: InterviewSession):
        self.session = session
        self.responses = {}
    
    def phase_contexte(self):
        """Phase 1: Questions contexte projet"""
        self.session.phase_current = "contexte"
        
        # Q1: Description projet
        q1 = self._ask("Parle-moi de ton projet en quelques phrases.")
        self._reformulate(q1)
        self.responses['project_description'] = q1
        
        # Q2: Utilisateurs
        q2 = self._ask("Qui sont les utilisateurs finaux?")
        q2_followup = self._ask("Quel est leur plus gros problème?")
        self.responses['users'] = q2
        self.responses['main_problem'] = q2_followup
        
        # Q3-Q6: Stack, maturité, équipe, pain points
        # ...
        
        self.session.update_answers(self.responses)
    
    def phase_metier(self):
        """Phase 2: Questions métier/domaine"""
        self.session.phase_current = "metier"
        
        # Q7: Domaine
        domain = self._ask("Quel est le domaine métier principal?")
        self.responses['domain'] = domain
        
        # Q8: Glossaire (interactif!)
        glossaire = {}
        while True:
            concept = self._ask("Concept métier clé? (ou 'fin' pour terminer)")
            if concept.lower() == 'fin':
                break
            definition = self._ask(f"Définition de '{concept}' dans TON contexte?")
            glossaire[concept] = definition
        
        self.responses['glossaire'] = glossaire
        
        # Q9-Q12: Acteurs, processus, règles, edge cases
        # ...
        
        self.session.update_answers(self.responses)
    
    def phase_agent(self):
        """Phase 3: Besoins agent"""
        self.session.phase_current = "agent"
        
        # Q13-Q18: Rôle, connaissances, capacités, mantras, use cases
        # ...
        
        self.session.update_answers(self.responses)
    
    def phase_validation(self) -> ProjectContext:
        """Phase 4: Synthèse et validation"""
        self.session.phase_current = "validation"
        
        # Synthétiser
        synthesis = self._synthesize(self.responses)
        self._display_synthesis(synthesis)
        
        # Valider
        if not self._ask_confirmation("Est-ce que cette synthèse reflète bien ton besoin?"):
            # Ajustements
            adjustments = self._collect_adjustments()
            self.responses.update(adjustments)
            return self.phase_validation()  # Re-valider
        
        # Créer ProjectContext
        context = ProjectContext.create_from_responses(self.responses)
        context.save()
        
        return context
    
    def _ask(self, question: str) -> str:
        """Pose une question et attend réponse"""
        # Implémentation selon CLI/UI
        print(f"BYAN: {question}")
        return input("Vous: ")
    
    def _reformulate(self, response: str):
        """Reformule pour valider compréhension"""
        reformulation = self._generate_reformulation(response)
        print(f"BYAN: Si je comprends bien, {reformulation}. C'est ça?")
        confirmation = input("Vous (oui/non): ")
        if confirmation.lower() != 'oui':
            # Clarifier
            pass
```

---

## USER STORIES

### Epic 1: Initialisation BYAN

**US-BYAN-001: Installer BYAN**
```
En tant que développeur
Je veux installer BYAN sur mon environnement
Afin de pouvoir créer des agents

Critères:
- [ ] Installation via pip/npm
- [ ] Vérification dépendances
- [ ] Initialisation config
- [ ] Création structure _bmad/
```

**US-BYAN-002: Charger les Mantras**
```
En tant que BYAN
Je veux charger les 64 mantras au démarrage
Afin de les appliquer lors de la création d'agents

Critères:
- [ ] Lecture fichier mantras.yaml
- [ ] Validation structure
- [ ] 39 mantras conception chargés
- [ ] 25 mantras agents IA chargés
```

### Epic 2: Interview Projet

**US-INT-001: Démarrer Interview**
```
En tant que développeur
Je veux démarrer une session d'interview avec BYAN
Afin de définir le contexte de mon projet

Critères:
- [ ] Commande: byan create-agent
- [ ] BYAN se présente
- [ ] Demande nom user et projet
- [ ] Crée InterviewSession
```

**US-INT-002: Phase Contexte Projet**
```
En tant que BYAN
Je veux comprendre le contexte projet
Afin de créer des agents adaptés

Critères:
- [ ] 6 questions posées
- [ ] Reformulation systématique
- [ ] 5 Whys sur pain point #1
- [ ] Réponses sauvegardées
```

**US-INT-003: Phase Métier**
```
En tant que BYAN
Je veux comprendre le domaine métier
Afin de créer la documentation métier

Critères:
- [ ] Questions sur domaine
- [ ] Création glossaire interactif
- [ ] Identification acteurs
- [ ] Mapping processus métier
- [ ] Au moins 5 concepts dans glossaire
```

**US-INT-004: Phase Besoins Agent**
```
En tant que BYAN
Je veux comprendre les besoins en agents
Afin de générer l'agent parfait

Critères:
- [ ] Questions sur rôle agent
- [ ] Identification connaissances
- [ ] Définition capacités
- [ ] Sélection mantras prioritaires
- [ ] 3 cas d'usage définis
```

**US-INT-005: Validation Synthèse**
```
En tant que BYAN
Je veux valider la synthèse avec l'utilisateur
Afin de garantir la qualité des données

Critères:
- [ ] Affichage synthèse structurée
- [ ] Demande validation
- [ ] Si non: ajustements possibles
- [ ] Si oui: création ProjectContext
```

### Epic 3: Création Agent

**US-AGT-001: Challenge Before Confirm**
```
En tant que BYAN
Je veux challenger les specs agent avant création
Afin d'éviter problèmes potentiels

Critères:
- [ ] Analyse risques (générique, overlap, contradictions)
- [ ] Si risques: alerte user
- [ ] Proposition alternatives
- [ ] Confirmation explicite nécessaire
```

**US-AGT-002: Générer AgentSpec**
```
En tant que BYAN
Je veux générer une AgentSpec complète
Afin de définir précisément l'agent

Critères:
- [ ] Sélection template si existe
- [ ] Génération persona
- [ ] Sélection 5-20 mantras pertinents
- [ ] Définition capabilities (min 3)
- [ ] Knowledge base (métier + tech)
- [ ] 3 use cases
- [ ] Status: draft
```

**US-AGT-003: Valider AgentSpec**
```
En tant que BYAN
Je veux valider l'AgentSpec
Afin de garantir cohérence et qualité

Critères:
- [ ] Format valide
- [ ] Nom unique (kebab-case)
- [ ] Min 3 capabilities
- [ ] Min 5 mantras
- [ ] Min 3 use cases
- [ ] Cohérence interne
- [ ] Si OK: status → validated
```

### Epic 4: Génération Fichiers

**US-FILE-001: Générer Fichiers Multi-Plateformes**
```
En tant que BYAN
Je veux générer fichiers pour chaque plateforme
Afin de rendre l'agent utilisable partout

Critères:
- [ ] 1 fichier par plateforme demandée
- [ ] Format Markdown BMAD
- [ ] Structure validée
- [ ] Métadonnées complètes
- [ ] Checksum calculé
```

**US-FILE-002: Sauvegarder Fichiers**
```
En tant que BYAN
Je veux sauvegarder fichiers sur disque
Afin de les rendre accessibles

Critères:
- [ ] Chemin: _bmad/agents/[name].md
- [ ] Écriture réussie
- [ ] Permissions correctes
- [ ] Confirmation user
```

### Epic 5: Gestion Agents

**US-MGT-001: Lister Agents**
```
En tant que développeur
Je veux lister mes agents créés
Afin de voir ce qui existe

Critères:
- [ ] Commande: byan list
- [ ] Affichage métadonnées (nom, rôle, date, status)
- [ ] Filtres: projet, status, platform
- [ ] Tri par date (DESC)
```

**US-MGT-002: Modifier Agent**
```
En tant que développeur
Je veux modifier un agent existant
Afin de l'améliorer

Critères:
- [ ] Commande: byan update [agent-name]
- [ ] Évaluation conséquences
- [ ] Si risques: alertes
- [ ] Version incrémentée
- [ ] Fichiers régénérés
```

**US-MGT-003: Supprimer Agent**
```
En tant que développeur
Je veux supprimer un agent obsolète
Afin de nettoyer

Critères:
- [ ] Commande: byan delete [agent-name]
- [ ] Check dépendances
- [ ] Si dépendances: blocage + alternative
- [ ] Confirmation EXPLICITE nécessaire
- [ ] Backup automatique
- [ ] Suppression cascade (spec + files + disk)
```

---

## ROADMAP

### Phase 0: Préparation (1-2 jours)
- [ ] Setup projet (structure, dépendances)
- [ ] Configuration environnement dev
- [ ] Setup tests (pytest/jest)
- [ ] Initialisation base de données (SQLite)

### Phase 1: MVP Core (1 semaine)
- [ ] Implémenter entités (models)
- [ ] Implémenter BYAN core
- [ ] Implémenter Interviewer (4 phases)
- [ ] Implémenter générateur AgentSpec
- [ ] Tests conceptuels (TDD!)

### Phase 2: Génération Fichiers (3-4 jours)
- [ ] Templates BMAD (base)
- [ ] Générateur fichiers Markdown
- [ ] Validation format BMAD
- [ ] Sauvegarde disque

### Phase 3: CLI (2-3 jours)
- [ ] Commandes: create-agent, list, update, delete
- [ ] Interface conversationnelle
- [ ] Gestion erreurs
- [ ] Help & documentation

### Phase 4: Tests & Validation (3-4 jours)
- [ ] Tests unitaires complets
- [ ] Tests d'intégration
- [ ] Tests end-to-end
- [ ] Validation avec agents générés réels

### Phase 5: Documentation (2-3 jours)
- [ ] README complet
- [ ] Guide utilisateur
- [ ] Documentation API
- [ ] Exemples d'utilisation

### Phase 6: Intégration Plateformes (optionnel, 1-2 semaines)
- [ ] Plugin GitHub Copilot CLI
- [ ] Extension VSCode
- [ ] Compatibilité Claude Code

### Total Estimation: 2-3 semaines (MVP) + 1-2 semaines (intégration)

---

## CONCLUSION

BYAN est conçu selon la méthodologie **Merise Agile + TDD** avec application des **64 mantras**.

**Principes respectés:**
- ✅ Dictionnaire de données d'abord
- ✅ MCD ⇄ MCT validation croisée
- ✅ Règles de gestion formalisées
- ✅ Tests conceptuels avant implémentation
- ✅ Rasoir d'Ockham (simplicité)
- ✅ Évaluation des conséquences
- ✅ Challenge Before Confirm

**Prochaine étape:** Implémentation en TDD!

---

**Auteurs:** Yan + Carson  
**Date:** 2026-02-02  
**Version:** 1.0.0  
**Méthodologie:** Merise Agile + TDD + 64 Mantras 💎
