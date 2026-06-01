---

name: Création et Modification de Diagrammes Draw.io
description: Workflow BYAN pour créer ou modifier des diagrammes draw.io via génération XML
web_bundle: true

---

# Création et Modification de Diagrammes Draw.io

**Goal:** Permettre la création et la modification de diagrammes draw.io par génération XML structurée.

**Your Role:** En tant qu'orchestrateur BYAN, vous coordonnez la création de diagrammes techniques en collaborant avec l'utilisateur. Vous apportez la structure méthodologique et la génération XML, l'utilisateur apporte la vision du diagramme. Travaillez ensemble comme partenaires.

## WORKFLOW ARCHITECTURE

### Core Principles

- **Micro-file Design**: Chaque étape du workflow est isolée dans un fichier dédié
- **Just-In-Time Loading**: Charger uniquement l'étape en cours, jamais les suivantes
- **Sequential Enforcement**: Exécution séquentielle stricte des étapes
- **State Tracking**: Suivi de progression via frontmatter YAML
- **Append-Only Building**: Construction incrémentale du diagramme

### Step Processing Rules

1. **READ COMPLETELY**: Lire l'intégralité du fichier d'étape avant action
2. **FOLLOW SEQUENCE**: Exécuter toutes les sections dans l'ordre
3. **WAIT FOR INPUT**: Stopper et attendre la sélection utilisateur si menu
4. **CHECK CONTINUATION**: Passer à l'étape suivante uniquement sur validation
5. **SAVE STATE**: Mettre à jour `stepsCompleted` dans le frontmatter
6. **LOAD NEXT**: Charger et lire l'étape suivante uniquement sur instruction

### Critical Rules (NO EXCEPTIONS)

- 🛑 **NEVER** charger plusieurs fichiers d'étape simultanément
- 📖 **ALWAYS** lire l'intégralité du fichier d'étape avant exécution
- 🚫 **NEVER** sauter ou optimiser la séquence
- 💾 **ALWAYS** mettre à jour le frontmatter lors de l'écriture finale
- 🎯 **ALWAYS** suivre les instructions exactes du fichier d'étape
- ⏸️ **ALWAYS** stopper aux menus et attendre l'input utilisateur
- 📋 **NEVER** créer de liste mentale à partir d'étapes futures

---

## CONTEXT MANAGEMENT

### Global Context (depuis config.yaml)

Le workflow accède aux variables globales suivantes :

```yaml
user_name: {user_name}
communication_language: {communication_language}
document_output_language: {document_output_language}
output_folder: {output_folder}
```

### Workflow Context

Variables spécifiques au workflow drawio :

```yaml
diagrams_output_folder: "{output_folder}/diagrams/"
default_diagram_format: "drawio"
validation_mode: "strict"
auto_backup: true
backup_folder: "{output_folder}/diagrams/.backup/"
```

---

## AGENTS & WORKERS

### Agent: drawio-specialist

Spécialiste de la conception de diagrammes draw.io.

**Responsabilités :**
- Analyser le brief utilisateur
- Proposer une structure de diagramme cohérente
- Définir les composants nécessaires (formes, connecteurs, groupes)
- Valider la cohérence conceptuelle

**Appel dans le workflow :**
```
Agent: drawio-specialist
Input: brief utilisateur + contraintes
Output: structure conceptuelle du diagramme
```

### Worker: drawio-worker

Générateur de XML draw.io.

**Responsabilités :**
- Traduire la structure conceptuelle en XML draw.io valide
- Gérer les coordonnées et le positionnement
- Générer les identifiants uniques
- Assurer la conformité au format draw.io

**Appel dans le workflow :**
```
Worker: drawio-worker
Input: structure conceptuelle
Output: fichier .drawio (XML valide)
```

---

## WORKFLOW STEPS

Le workflow se déroule en 5 étapes séquentielles :

### STEP 1: Brief et Collecte

**Objectif :** Collecter les informations nécessaires à la création du diagramme.

**Actions :**
- Identifier le type de diagramme (architecture, concept, processus, etc.)
- Collecter le titre et la description
- Identifier les contraintes (style, taille, orientation)
- Vérifier si modification d'un diagramme existant ou création

**Outputs :**
- Brief structuré au format YAML
- Mode détecté : `create` ou `edit`

---

### STEP 2: Design Conceptuel

**Objectif :** Concevoir la structure du diagramme avec l'agent drawio-specialist.

**Actions :**
- Appel à l'agent drawio-specialist avec le brief
- Proposition de structure (composants, relations, organisation)
- Validation utilisateur
- Ajustements si nécessaire

**Outputs :**
- Structure conceptuelle validée
- Liste des composants à générer
- Organisation spatiale définie

---

### STEP 3: Génération XML

**Objectif :** Générer le XML draw.io avec le worker drawio-worker.

**Actions :**
- Appel au worker drawio-worker avec la structure conceptuelle
- Génération du XML draw.io conforme
- Validation syntaxique XML
- Vérification de la structure draw.io

**Outputs :**
- Fichier .drawio (XML valide)
- Rapport de génération

---

### STEP 4: Validation

**Objectif :** Valider la conformité et la qualité du diagramme.

**Actions :**
- Vérification de la validité XML
- Vérification de la conformité draw.io
- Vérification visuelle (si possible)
- Validation utilisateur

**Critères de validation :**
- XML bien formé
- Attributs draw.io obligatoires présents
- Identifiants uniques
- Relations valides entre éléments

**Outputs :**
- Statut de validation : `valid` ou `invalid`
- Liste des erreurs si invalide
- Diagramme prêt ou nécessite correction

---

### STEP 5: Sauvegarde et Finalisation

**Objectif :** Sauvegarder le diagramme et créer les métadonnées.

**Actions :**
- Sauvegarde dans `{output_folder}/diagrams/{nom-diagramme}.drawio`
- Backup automatique si `auto_backup: true`
- Génération de métadonnées (date, auteur, version)
- Affichage du récapitulatif

**Outputs :**
- Diagramme sauvegardé
- Backup créé (si activé)
- Fichier de métadonnées `.drawio.meta.yaml`

**Format métadonnées :**
```yaml
---
diagram_name: {nom}
created_by: {user_name}
created_at: {timestamp}
last_modified: {timestamp}
diagram_type: {type}
description: {description}
version: 1.0.0
---
```

---

## INITIALIZATION SEQUENCE

### 1. Module Configuration Loading

Charger et lire la configuration complète depuis `{project-root}/_byan/config.yaml` et résoudre :

- `user_name`, `output_folder`, `communication_language`, `document_output_language`

### 2. Workflow Context Setup

Initialiser les variables workflow :

```yaml
diagrams_output_folder: "{output_folder}/diagrams/"
backup_folder: "{output_folder}/diagrams/.backup/"
```

Créer les dossiers si nécessaire :

```bash
mkdir -p {diagrams_output_folder}
mkdir -p {backup_folder}
```

### 3. First Step EXECUTION

Charger, lire l'intégralité du fichier et exécuter `{project-root}/_byan/workflow/simple/drawio-diagram/steps/step-01-brief.md` pour démarrer le workflow.
