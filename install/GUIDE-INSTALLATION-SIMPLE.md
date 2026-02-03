# Guide d'Installation BYAN - Version Simplifiée

**Version:** 1.0.4  
**Date:** 2 février 2026  
**Pour:** Utilisateurs finaux

---

## 🎯 Installation en 3 Minutes

### Prérequis

- **Node.js 18+** installé
- **Projet avec Git** (recommandé)
- **GitHub Copilot CLI** activé (pour utilisation avec Copilot)

### Installation via NPX (Recommandé)

```bash
npx create-byan-agent
```

**C'est tout !** L'installeur interactif vous guide :

1. ✅ Détecte votre projet
2. ✅ Choisissez votre plateforme (Copilot CLI / VSCode / Claude / Codex / Toutes)
3. ✅ Configurez votre nom et langue
4. ✅ Installe automatiquement tous les fichiers
5. ✅ Vérifie l'installation

---

## 🚀 Utilisation Immédiate

### Avec GitHub Copilot CLI

```bash
# Lancer Copilot
copilot

# Dans le prompt, taper:
@byan

# Ou bien activer via menu:
/agent
# Puis sélectionner: byan, rachid, ou marc
```

### Avec VSCode

1. **Ouvrir Command Palette** : `Ctrl+Shift+P` (ou `Cmd+Shift+P` sur Mac)
2. **Taper** : `Activate Agent`
3. **Sélectionner** : `BYAN`, `RACHID`, ou `MARC`

### Avec Claude Code

```bash
claude chat --agent byan
# ou
claude chat --agent rachid
# ou
claude chat --agent marc
```

---

## 🏗️ Les 3 Agents BYAN

### 1. BYAN - Créateur d'Agents

**Quand l'utiliser :** Créer de nouveaux agents IA personnalisés

**Menu Principal :**
- `[INT]` Interview Intelligente (30-45 min) - Pour agents critiques
- `[QC]` Quick Create (10 min) - Pour agents simples
- `[EDIT]` Éditer un agent existant
- `[VAL]` Valider un agent
- `[DEL]` Supprimer un agent

**Exemple d'utilisation :**
```
1. Activer BYAN
2. Choisir [INT] pour interview complète
3. Répondre aux questions guidées
4. BYAN génère l'agent automatiquement
```

### 2. RACHID - Expert Déploiement NPM

**Quand l'utiliser :** Publier/déployer sur npm, gérer dépendances

**Menu Principal :**
- `[INSTALL]` Installer BYAN via NPX
- `[VALIDATE]` Valider structure _bmad
- `[FIX-DEPS]` Corriger dépendances npm
- `[UPDATE-PKG]` Mettre à jour package.json
- `[PUBLISH]` Publier sur npm
- `[TEST-NPX]` Tester installation npx
- `[AUDIT]` Audit de sécurité
- `[HELP]` Aide NPM

**Exemple d'utilisation :**
```
1. Activer RACHID
2. Choisir [VALIDATE] pour vérifier installation
3. Choisir [PUBLISH] pour publier sur npm
```

### 3. MARC - Expert GitHub Copilot CLI

**Quand l'utiliser :** Intégrer agents avec GitHub Copilot CLI

**Menu Principal :**
- `[INSTALL]` Installer agent dans .github/agents/
- `[TEST]` Tester détection agent
- `[FIX]` Corriger problèmes détection
- `[LIST]` Lister agents installés
- `[DOC]` Documentation Copilot CLI
- `[HELP]` Aide intégration

**Exemple d'utilisation :**
```
1. Activer MARC
2. Choisir [INSTALL] pour installer un agent
3. Choisir [TEST] pour vérifier détection
```

---

## 📁 Structure Installée

Après installation, votre projet contient :

```
votre-projet/
├── _bmad/                          # Dossier BMAD principal
│   ├── bmb/                        # Module BMB (BYAN)
│   │   ├── agents/                 # Agents sources
│   │   │   ├── byan.md
│   │   │   ├── rachid.md
│   │   │   └── marc.md
│   │   ├── workflows/              # Workflows BYAN
│   │   │   └── byan/
│   │   │       ├── interview-workflow.md
│   │   │       ├── quick-create-workflow.md
│   │   │       ├── edit-agent-workflow.md
│   │   │       ├── validate-agent-workflow.md
│   │   │       ├── templates/
│   │   │       └── data/
│   │   └── config.yaml             # Configuration BYAN
│   ├── _config/                    # Manifests agents/workflows
│   └── _memory/                    # Mémoire persistante agents
│
├── .github/
│   └── agents/                     # Agents pour Copilot CLI
│       ├── bmad-agent-byan.md
│       ├── bmad-agent-rachid.md
│       └── bmad-agent-marc.md
│
└── _bmad-output/                   # Agents créés par BYAN
    └── bmb-creations/
```

---

## 🎓 Workflow Typique

### Scénario : Créer un agent de backend Node.js

1. **Activer BYAN**
   ```bash
   copilot
   @byan
   ```

2. **Lancer Interview**
   ```
   [INT] Start Intelligent Interview
   ```

3. **Répondre aux Questions**
   - Nom de l'agent : `backend-expert`
   - Rôle : Expert Node.js backend
   - Capacités : API REST, database, auth
   - Mantras principaux : KISS, YAGNI, Trust But Verify
   - etc.

4. **BYAN génère l'agent**
   - Créé dans `_bmad-output/bmb-creations/backend-expert.md`

5. **Installer avec MARC**
   ```
   @marc
   [INSTALL]
   ```

6. **Utiliser votre agent**
   ```bash
   copilot
   @backend-expert
   ```

---

## ⚙️ Configuration

Le fichier `_bmad/bmb/config.yaml` contient :

```yaml
# Dossier de sortie pour créations BYAN
bmb_creations_output_folder: "{project-root}/_bmad-output/bmb-creations"

# Votre nom (utilisé par agents)
user_name: VotreNom

# Langue de communication avec agents
communication_language: Francais  # ou English

# Langue des documents générés
document_output_language: Francais  # ou English

# Dossier de sortie général
output_folder: "{project-root}/_bmad-output"

# Plateforme cible
platform: copilot  # ou vscode, claude, codex, all
```

**Modifier la configuration :** Éditez `config.yaml` directement.

---

## 🆘 Dépannage Rapide

### Agent non détecté dans Copilot CLI

**Solution avec MARC :**
```
@marc
[TEST]  # Teste la détection
[FIX]   # Corrige automatiquement
```

### Installation incomplète

**Solution avec RACHID :**
```
@rachid
[VALIDATE]  # Vérifie structure
```

### Erreur de dépendances npm

**Solution avec RACHID :**
```
@rachid
[FIX-DEPS]  # Corrige dépendances
```

### Agent créé mais ne fonctionne pas

**Solution avec BYAN :**
```
@byan
[VAL]  # Valide l'agent
```

---

## 🔄 Mise à Jour BYAN

Pour mettre à jour vers la dernière version :

```bash
# Réinstaller via NPX
npx create-byan-agent

# L'installeur détecte installation existante et propose mise à jour
```

---

## 📚 Ressources

- **README complet** : `/install/README.md`
- **Changelog** : `/install/CHANGELOG.md`
- **Guide publication** : `/install/PUBLISH-GUIDE.md`
- **Checklist publication** : `/install/PUBLICATION-CHECKLIST.md`

---

## 💡 Conseils Pro

1. **Premier agent** : Utilisez `[INT]` interview complète (30-45 min)
2. **Agents suivants** : `[QC]` Quick Create suffit (10 min)
3. **Testez toujours** : Validez avec `[VAL]` avant utilisation
4. **Documentation** : BYAN génère automatiquement la doc de l'agent
5. **Itération** : Utilisez `[EDIT]` pour améliorer agents existants

---

## 🎯 Cas d'Usage Populaires

### Agent pour Tests Automatisés
```
@byan
[INT]
- Rôle: Expert QA automation
- Capacités: Playwright, Cypress, Jest
- Focus: Tests E2E, intégration, unitaires
```

### Agent pour Documentation
```
@byan
[INT]
- Rôle: Technical Writer
- Capacités: Markdown, API docs, guides
- Focus: Clarity, examples, structure
```

### Agent pour Architecture
```
@byan
[INT]
- Rôle: Solution Architect
- Capacités: System design, scalability, patterns
- Focus: Clean architecture, SOLID, DDD
```

---

## 🤝 Support

**Questions ?** Activez n'importe quel agent et tapez :
```
/bmad-help Votre question ici
```

**Bugs/Suggestions :** Ouvrir une issue sur le repo GitHub

---

**Bon agent building ! 🏗️**
