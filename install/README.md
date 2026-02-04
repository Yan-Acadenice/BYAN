# 🏗️ YANSTALLER - Intelligent BYAN Installer

[![Version](https://img.shields.io/badge/version-1.1.3-blue.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-168%20passing-success.svg)](#tests)

**YANSTALLER** est l'installateur intelligent pour l'écosystème **BYAN** (Builder of YAN). Il détecte automatiquement votre environnement de développement, recommande les agents appropriés, et les installe avec support multi-plateforme.

> 📦 **Basé sur [BMAD](https://github.com/yanb94/byan)** - Business Modeling & Agent Development Platform  
> ✍️ **Made by [Yan de Acadenice](https://acadenice.fr/)**

**Méthodologie :** Merise Agile + TDD + 64 Mantras  
**Langues :** 🇫🇷 Français | 🇬🇧 English ([See below](#english-version))

---

## 📋 Table des matières

1. [Fonctionnalités](#-fonctionnalités)
2. [Installation](#-installation-rapide)
3. [Utilisation](#-utilisation)
4. [Architecture](#-architecture)
5. [Modules](#-modules)
6. [API](#-api-reference)
7. [Tests](#-tests)
8. [Développement](#-développement)
9. [Contributing](#-contributing)
10. [License](#-license)

---

## ✨ Fonctionnalités

### 🎯 Intelligence de Détection
- ✅ **Détection automatique** des plateformes (GitHub Copilot CLI, VSCode, Claude Code, Codex)
- ✅ **Analyse du projet** via `package.json` (20+ frameworks reconnus)
- ✅ **Recommandations contextuelles** d'agents basées sur votre stack

### 🤖 Agents Disponibles (29 agents)
- **BMB (Meta):** BYAN, BYAN-Test, RACHID, MARC, PATNOTE, CARMACK, Agent-Builder, Module-Builder, Workflow-Builder
- **BMM (SDLC):** Analyst, PM, Architect, Dev, SM, Quinn, UX-Designer, Tech-Writer, Quick-Flow-Solo-Dev
- **TEA (Tests):** TEA (Test Architecture Expert)
- **CIS (Innovation):** Brainstorming-Coach, Design-Thinking-Coach, Creative-Problem-Solver, Innovation-Strategist, Presentation-Master, Storyteller
- **Core:** Party-Mode, BMAD-Master

### 🚀 Installation Intelligente
- ✅ **Structure BMAD complète** (19 répertoires créés automatiquement)
- ✅ **Configuration YAML** générée avec métadonnées
- ✅ **Stubs multi-plateformes** (Copilot CLI, VSCode, Claude Code, Codex)
- ✅ **MCP Server setup** pour Claude Code
- ✅ **Manifests CSV** pour tracking des agents

### 🔍 Validation Automatique (10 checks)
- Vérification structure `_bmad/`
- Validation fichiers agents
- Check YAML frontmatter
- Validation permissions
- Vérification dépendances npm
- Tests manifests, workflows, templates

### 🛠️ Troubleshooting Intelligent
- ✅ **8 patterns d'erreurs** reconnus automatiquement
- ✅ **Auto-fix** pour permissions, structure corrompue, dépendances
- ✅ **Diagnostics contextuels** (Node version, Git, espace disque)
- ✅ **Suggestions d'upgrade** OS-spécifiques

### 💾 Backup & Rollback
- ✅ **Sauvegarde automatique** avant installation
- ✅ **Métadonnées** (timestamp, taille, fichiers)
- ✅ **Restore sécurisé** avec pre-restore backup
- ✅ **Nettoyage automatique** des anciens backups

### 🧙 Wizard Post-Installation
- ✅ **Interview en 7 questions** (<5 min)
- ✅ **Mode conversationnel** avec inquirer
- ✅ **4 options post-install** : créer agent, tester, docs, exit
- ✅ **Guide quick-start** interactif

---

## 🚀 Installation Rapide

### Prérequis
- **Node.js** ≥ 18.0.0
- **Git** installé
- Au moins **1 plateforme** : GitHub Copilot CLI, VSCode, Claude Code, ou Codex

### Via NPX (recommandé)
```bash
# Installation interactive
npx create-byan-agent

# Suivre l'interview en 7 questions (5 min)
```

### Via NPM Global
```bash
# Installer globalement
npm install -g create-byan-agent

# Exécuter
create-byan-agent
```

### Installation Manuelle
```bash
# Cloner le dépôt
git clone https://github.com/Yan-Acadenice/BYAN.git
cd BYAN/install

# Installer les dépendances
npm install

# Lancer l'installateur
npm start
```

---

## 🎮 Utilisation

### Mode Interview (Recommandé)
```bash
npx create-byan-agent
```

**7 questions interactives :**
1. Votre nom (pour configuration personnalisée)
2. Langue de communication (Français/English)
3. Mode d'installation (Recommandé/Custom/Minimal/Full)
4. Sélection agents (si Custom)
5. Plateformes cibles (Copilot/VSCode/Claude/Codex)
6. Installation agent exemple (oui/non)
7. Créer backup (oui/non)

### Mode Programmatique

#### API JavaScript
```javascript
const yanstaller = require('create-byan-agent');

// Détection
const detection = await yanstaller.detect({
  projectRoot: process.cwd()
});
console.log(detection.platforms); // ['copilot-cli', 'vscode']

// Recommandation
const recommendations = await yanstaller.recommend({
  projectRoot: process.cwd(),
  detection
});
console.log(recommendations.agents); // ['dev', 'architect', 'quinn']

// Installation
const result = await yanstaller.install({
  projectRoot: process.cwd(),
  agents: ['byan', 'dev', 'quinn'],
  platforms: ['copilot-cli', 'vscode'],
  userName: 'Yan',
  language: 'Francais'
});

// Validation
const validation = await yanstaller.validate({
  projectRoot: process.cwd()
});
console.log(validation.errors); // []
```

#### CLI Options
```bash
# Installation silencieuse avec agents spécifiques
create-byan-agent --silent --agents=byan,dev,quinn

# Mode custom avec plateforme spécifique
create-byan-agent --mode=custom --platforms=copilot-cli

# Installation complète sans backup
create-byan-agent --mode=full --no-backup

# Dry-run (simulation)
create-byan-agent --dry-run

# Verbose logging
create-byan-agent --verbose
```

---

## 🏛️ Architecture

### Structure du Projet
```
install/
├── bin/
│   └── create-byan-agent.js      # CLI entry point
├── lib/
│   ├── yanstaller/                # Core modules
│   │   ├── detector.js            # Platform & project detection
│   │   ├── recommender.js         # Agent recommendations
│   │   ├── installer.js           # Installation orchestration
│   │   ├── validator.js           # Post-install validation
│   │   ├── troubleshooter.js      # Error diagnosis & auto-fix
│   │   ├── backuper.js            # Backup & restore
│   │   ├── interviewer.js         # Interactive interview
│   │   └── wizard.js              # Post-install wizard
│   ├── platforms/                 # Platform adapters
│   │   ├── copilot-cli.js         # GitHub Copilot CLI
│   │   ├── vscode.js              # VSCode extension
│   │   ├── claude-code.js         # Claude Code MCP
│   │   └── codex.js               # Codex platform
│   ├── utils/                     # Utilities
│   │   ├── file-utils.js          # File operations
│   │   ├── logger.js              # Logging system
│   │   └── yaml-utils.js          # YAML parsing
│   ├── errors.js                  # Error definitions
│   └── exit-codes.js              # Exit code constants
├── templates/                     # Agent templates
│   └── _bmad/
│       ├── core/agents/
│       ├── bmm/agents/
│       ├── bmb/agents/
│       ├── tea/agents/
│       └── cis/agents/
├── __tests__/                     # Test suite (168 tests)
│   ├── recommender.test.js
│   ├── installer.test.js
│   ├── validator.test.js
│   ├── troubleshooter.test.js
│   ├── backuper.test.js
│   ├── integration.test.js
│   ├── e2e.test.js
│   └── ...
└── package.json
```

### Flux d'Installation

```
┌─────────────────────────────────────────────────────────┐
│  1. DETECT - Platform & Project Analysis               │
│     • Scan for Copilot CLI, VSCode, Claude, Codex      │
│     • Analyze package.json dependencies                 │
│     • Detect project type & framework                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  2. RECOMMEND - Intelligent Agent Selection             │
│     • Match agents to project type                      │
│     • Consider detected platforms                       │
│     • Generate rationale for each recommendation        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  3. INTERVIEW - User Preferences (7 questions)          │
│     • Name, language, mode                              │
│     • Agent selection (if custom)                       │
│     • Platform targets, backup option                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  4. BACKUP - Pre-install Safety (optional)              │
│     • Create timestamped backup of _bmad/               │
│     • Save metadata (files, size, version)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  5. INSTALL - Core Installation                         │
│     • Create _bmad/ structure (19 directories)          │
│     • Copy agent templates from 5 modules               │
│     • Generate platform stubs (Copilot/VSCode/etc.)     │
│     • Create module configs (YAML with metadata)        │
│     • Update manifests (agent-manifest.csv)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  6. VALIDATE - 10 Automated Checks                      │
│     • Structure, agents, stubs, configs                 │
│     • Permissions, manifests, workflows                 │
│     • Templates, dependencies                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  7. WIZARD - Post-Install Actions                       │
│     • Summary of installed agents                       │
│     • Option: Create new agent (launch BYAN)            │
│     • Option: Test agent                                │
│     • Option: View documentation                        │
│     • Quick start guide                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Modules

### 1. Detector
**Fichier :** `lib/yanstaller/detector.js`

**Fonction :** Détecte les plateformes installées et analyse le projet.

**API :**
```javascript
const detector = require('./lib/yanstaller/detector');

// Détection complète
const detection = await detector.detect({
  projectRoot: '/path/to/project'
});

/* Retour :
{
  platforms: ['copilot-cli', 'vscode'],
  projectType: 'frontend',
  framework: 'react',
  dependencies: { react: '^18.2.0', ... },
  hasGit: true,
  hasNpm: true
}
*/
```

**Méthodes :**
- `detect(options)` - Détection complète
- `detectPlatforms()` - Scan plateformes disponibles
- `analyzeProject(projectRoot)` - Analyse `package.json`

---

### 2. Recommender
**Fichier :** `lib/yanstaller/recommender.js`

**Fonction :** Recommande des agents basés sur le contexte du projet.

**API :**
```javascript
const recommender = require('./lib/yanstaller/recommender');

const recommendations = await recommender.recommend({
  projectRoot: '/path/to/project',
  detection: { projectType: 'frontend', framework: 'react' }
});

/* Retour :
{
  agents: ['dev', 'ux-designer', 'quinn'],
  rationale: {
    dev: 'Essential for React component development',
    'ux-designer': 'UI/UX workflow for frontend projects',
    quinn: 'QA automation for testing React components'
  }
}
*/
```

**Reconnaissance :**
- **Frameworks :** React, Vue, Angular, Svelte, Next.js, Nuxt, Express, NestJS, Fastify, Koa, Django, Flask, Rails, Spring Boot, Laravel
- **Types de projet :** Frontend, Backend, Fullstack, Library
- **Outils :** Jest, Vitest, Playwright, Cypress, Webpack, Vite, Rollup

---

### 3. Installer
**Fichier :** `lib/yanstaller/installer.js`

**Fonction :** Installe les agents et configure l'environnement.

**API :**
```javascript
const installer = require('./lib/yanstaller/installer');

const result = await installer.install({
  projectRoot: '/path/to/project',
  agents: ['byan', 'dev', 'quinn'],
  platforms: ['copilot-cli', 'vscode'],
  userName: 'Yan',
  language: 'Francais'
});

/* Retour :
{
  success: true,
  installedAgents: ['byan', 'dev', 'quinn'],
  createdDirectories: 19,
  generatedStubs: 6,
  configPath: '_bmad/bmb/config.yaml'
}
*/
```

**Étapes :**
1. `createBmadStructure()` - Crée 19 répertoires
2. `copyAgentFile()` - Copie les templates
3. `generatePlatformStubs()` - Génère les stubs
4. `createModuleConfig()` - Config YAML

---

### 4. Validator
**Fichier :** `lib/yanstaller/validator.js`

**Fonction :** Valide l'installation avec 10 checks automatisés.

**API :**
```javascript
const validator = require('./lib/yanstaller/validator');

const validation = await validator.validate({
  projectRoot: '/path/to/project'
});

/* Retour :
{
  valid: true,
  errors: [],
  warnings: ['Config file missing optional field: document_output_language'],
  checks: {
    structure: 'pass',
    agents: 'pass',
    stubs: 'pass',
    configs: 'pass',
    platforms: 'pass',
    permissions: 'pass',
    manifests: 'pass',
    workflows: 'pass',
    templates: 'pass',
    dependencies: 'pass'
  }
}
*/
```

**10 Checks :**
1. `checkBmadStructure()` - 9 répertoires requis
2. `checkAgentFiles()` - Agents copiés
3. `checkStubsYamlFrontmatter()` - Format YAML/XML
4. `checkConfigFiles()` - YAML valide
5. `checkPlatformDetection()` - Plateformes actives
6. `checkFilePermissions()` - Permissions R/W
7. `checkManifests()` - CSV valides
8. `checkWorkflows()` - Workflows accessibles
9. `checkTemplates()` - Structure templates
10. `checkDependencies()` - Dépendances npm

---

### 5. Troubleshooter
**Fichier :** `lib/yanstaller/troubleshooter.js`

**Fonction :** Diagnostique et corrige automatiquement les erreurs.

**API :**
```javascript
const troubleshooter = require('./lib/yanstaller/troubleshooter');

// Diagnostic seul
const diagnosis = await troubleshooter.diagnose(error);
/* Retour :
{
  pattern: 'PERMISSION',
  message: 'Permission denied: /path/to/_bmad',
  autoFixAvailable: true,
  fixFunction: 'fixPermissions'
}
*/

// Troubleshooting complet
const result = await troubleshooter.troubleshoot({
  projectRoot: '/path/to/project'
});
/* Retour :
{
  issues: [
    { type: 'permission', path: '_bmad/core', fixed: true }
  ],
  autofixed: 1,
  manualActionRequired: 0
}
*/
```

**8 Patterns d'Erreur :**
1. `NODE_VERSION` - Node.js obsolète
2. `PERMISSION` - Permissions insuffisantes
3. `NOT_FOUND` - Fichier/répertoire manquant
4. `GIT_MISSING` - Git non installé
5. `DISK_SPACE` - Espace disque insuffisant
6. `NETWORK` - Problème réseau
7. `CORRUPTED` - Structure corrompue
8. `MISSING_DEP` - Dépendance manquante

**5 Auto-Fix :**
- `fixPermissions()` - icacls (Windows) / chmod (Unix)
- `repairStructure()` - Recrée `_bmad/`
- `resetConfig()` - Config YAML par défaut
- `reinstallDependencies()` - npm install
- `reinstallAgents()` - Re-copie templates

---

### 6. Backuper
**Fichier :** `lib/yanstaller/backuper.js`

**Fonction :** Sauvegarde et restaure le répertoire `_bmad/`.

**API :**
```javascript
const backuper = require('./lib/yanstaller/backuper');

// Backup
const backup = await backuper.backup({
  projectRoot: '/path/to/project'
});
/* Retour :
{
  backupPath: '_bmad-backup/backup-1706918400000',
  metadata: {
    timestamp: 1706918400000,
    created: '2026-02-03T10:00:00.000Z',
    source: '/path/to/project/_bmad',
    files: 42,
    size: 1048576,
    version: '1.1.3'
  }
}
*/

// Restore
const restore = await backuper.restore({
  projectRoot: '/path/to/project',
  backupPath: '_bmad-backup/backup-1706918400000'
});
/* Retour :
{
  success: true,
  restoredFiles: 42,
  preRestoreBackup: '_bmad-backup/backup-1706918500000'
}
*/

// List backups
const backups = await backuper.listBackups({
  projectRoot: '/path/to/project'
});
/* Retour : [
  {
    path: '_bmad-backup/backup-1706918400000',
    timestamp: 1706918400000,
    size: 1048576,
    files: 42
  }
]
*/
```

**Format Metadata :**
```json
{
  "timestamp": 1706918400000,
  "created": "2026-02-03T10:00:00.000Z",
  "source": "/path/to/project/_bmad",
  "files": 42,
  "size": 1048576,
  "version": "1.1.3"
}
```

---

### 7. Interviewer
**Fichier :** `lib/yanstaller/interviewer.js`

**Fonction :** Interview en 7 questions pour personnaliser l'installation.

**API :**
```javascript
const interviewer = require('./lib/yanstaller/interviewer');

const answers = await interviewer.ask();
/* Retour :
{
  userName: 'Yan',
  language: 'Francais',
  mode: 'recommended',
  agents: ['byan', 'dev', 'quinn'],
  platforms: ['copilot-cli', 'vscode'],
  installSampleAgent: true,
  createBackup: true
}
*/
```

**7 Questions :**
1. **Nom** - Personnalisation
2. **Langue** - Français ou English
3. **Mode** - Recommended/Custom/Minimal/Full
4. **Agents** - Sélection manuelle (si Custom)
5. **Plateformes** - Copilot/VSCode/Claude/Codex
6. **Agent exemple** - Installer BYAN-Test ?
7. **Backup** - Créer sauvegarde ?

---

### 8. Wizard
**Fichier :** `lib/yanstaller/wizard.js`

**Fonction :** Wizard post-installation avec 4 options.

**API :**
```javascript
const wizard = require('./lib/yanstaller/wizard');

await wizard.show({
  installedAgents: ['byan', 'dev', 'quinn'],
  platforms: ['copilot-cli', 'vscode']
});

// Options interactives :
// 1. Create new agent (launch BYAN)
// 2. Test an agent
// 3. View documentation
// 4. Exit
```

**Fonctionnalités :**
- `launchByanInterview()` - Instructions pour activer BYAN
- `testAgent()` - Guide de test d'agent
- `showDocumentation()` - Chemins de documentation
- `showExitMessage()` - Guide quick-start

---

## 🧪 Tests

### Suite de Tests (168 tests)

**Coverage :**
```bash
npm test
```

**Fichiers de test :**
```
__tests__/
├── recommender.test.js         (18 tests) - Recommandations d'agents
├── installer.test.js           (13 tests) - Installation core
├── platforms.test.js           (20 tests) - Adapters plateformes
├── validator.test.js           (24 tests) - Validation 10 checks
├── integration.test.js         (27 tests) - Tests d'intégration
├── e2e.test.js                 (16 tests) - Scénarios end-to-end
├── troubleshooter.test.js      (20 tests) - Diagnostic & auto-fix
├── backuper.test.js            (20 tests) - Backup & restore
└── interviewer-wizard.test.js  (10 tests) - Interview & wizard
```

### Tests E2E Scénarios

**Scénario 1 : Projet React Frontend**
```javascript
// Détection → Recommend → Install → Validate
const project = { dependencies: { react: '^18.2.0' } };
// Agents recommandés : dev, ux-designer, quinn
```

**Scénario 2 : API Backend Express**
```javascript
const project = { dependencies: { express: '^4.18.2' } };
// Agents recommandés : dev, architect, quinn
```

**Scénario 3 : Next.js Fullstack**
```javascript
const project = { dependencies: { next: '^14.0.0' } };
// Agents recommandés : dev, architect, ux-designer, quinn
```

### Tests d'Intégration

**Performance Benchmarks :**
- Détection complète : < 2s
- Installation 5 agents : < 10s
- Validation 10 checks : < 5s
- Backup 50 fichiers : < 3s

### Exécution des Tests

```bash
# Tous les tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Test spécifique
npm test -- recommender.test.js
```

---

## 🛠️ Développement

### Setup Local

```bash
# Cloner le dépôt
git clone https://github.com/Yan-Acadenice/BYAN.git
cd BYAN/install

# Installer les dépendances
npm install

# Lancer en mode dev
npm start

# Tests
npm test

# Linter
npm run lint
```

### Structure de Développement

**Conventions :**
- **Méthodologie :** Merise Agile + TDD + 64 Mantras
- **Commits :** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **NO EMOJIS** dans commits/code/specs (Mantra IA-23)
- **Clean Code** - Code auto-documenté (Mantra IA-24)
- **Test-Driven** - Tests avant implémentation

**Ajouter un Nouveau Module :**

1. Créer `lib/yanstaller/my-module.js`
2. Créer `__tests__/my-module.test.js`
3. Écrire les tests (TDD)
4. Implémenter le module
5. Exécuter les tests : `npm test`
6. Commit : `feat: add my-module with X functionality`

**Ajouter une Nouvelle Plateforme :**

1. Créer `lib/platforms/my-platform.js`
2. Implémenter 3 méthodes :
   - `detect()` - Détecter la plateforme
   - `install(agentName)` - Créer l'agent
   - `generateStub(agentName, config)` - Générer le stub
3. Ajouter les tests dans `__tests__/platforms.test.js`
4. Mettre à jour `lib/yanstaller/detector.js`

---

## 🤝 Contributing

Les contributions sont les bienvenues ! Merci de suivre ces guidelines :

### Processus de Contribution

1. **Fork** le dépôt
2. **Créer une branche** : `git checkout -b feature/ma-fonctionnalite`
3. **Écrire les tests** (TDD obligatoire)
4. **Implémenter** la fonctionnalité
5. **Tests verts** : `npm test`
6. **Commit** : `git commit -m "feat: add ma-fonctionnalite"`
7. **Push** : `git push origin feature/ma-fonctionnalite`
8. **Pull Request** avec description détaillée

### Standards de Code

- ✅ **TDD** - Tests avant implémentation
- ✅ **Clean Code** - Fonctions courtes, noms explicites
- ✅ **No Emojis** - Code/commits/specs techniques
- ✅ **Comments** - Uniquement pour le "pourquoi", pas le "quoi"
- ✅ **Async/Await** - Pas de callbacks
- ✅ **Error Handling** - Try/catch systématique

### Checklist PR

- [ ] Tests écrits et passants (coverage ≥ 80%)
- [ ] Documentation mise à jour
- [ ] Commit messages suivent convention
- [ ] Code lint sans erreurs
- [ ] Pas de breaking changes (ou documentées)
- [ ] PR description complète

---

## 📄 License

**MIT License**

Copyright (c) 2026 Yan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🌐 Ressources

- **Documentation BMAD :** [GitHub Wiki](https://github.com/Yan-Acadenice/BYAN/wiki)
- **BYAN Agent :** Créateur d'agents intelligent
- **RACHID Agent :** Déploiement NPM
- **MARC Agent :** Intégration GitHub Copilot CLI
- **PATNOTE Agent :** Gestion des mises à jour
- **CARMACK Agent :** Optimisation tokens (-46%)

---

## 📧 Support

- **Issues :** [GitHub Issues](https://github.com/Yan-Acadenice/BYAN/issues)
- **Discussions :** [GitHub Discussions](https://github.com/Yan-Acadenice/BYAN/discussions)
- **Email :** yan@example.com

---

# 🇬🇧 ENGLISH VERSION

---

# 🏗️ YANSTALLER - Intelligent BYAN Installer

[![Version](https://img.shields.io/badge/version-1.2.3-blue.svg)](https://www.npmjs.com/package/create-byan-agent)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-168%20passing-success.svg)](#tests)

**YANSTALLER** is the intelligent installer for the **BYAN** (Builder of YAN) ecosystem. It automatically detects your development environment, recommends appropriate agents, and installs them with multi-platform support.

> 📦 **Based on [BMAD](https://github.com/yanb94/byan)** - Business Modeling & Agent Development Platform  
> ✍️ **Made by [Yan de Acadenice](https://acadenice.fr/)**

**Methodology:** Merise Agile + TDD + 64 Mantras  
**Languages:** 🇬🇧 English | 🇫🇷 Français

---

## 📋 Table of Contents

1. [Features](#-features)
2. [Installation](#-quick-installation)
3. [Usage](#-usage)
4. [Architecture](#-architecture)
5. [Modules](#-modules)
6. [API Reference](#-api-reference)
7. [Tests](#-tests)
8. [Development](#-development)
9. [Contributing](#-contributing)
10. [License](#-license)

---

## ✨ Features

### 🎯 Intelligent Detection
- ✅ **Automatic detection** of platforms (GitHub Copilot CLI, VSCode, Claude Code, Codex)
- ✅ **Project analysis** via `package.json` (20+ recognized frameworks)
- ✅ **Contextual recommendations** of agents based on your stack

### 🤖 Available Agents (29 agents)
- **BMB (Meta):** BYAN, BYAN-Test, RACHID, MARC, PATNOTE, CARMACK, Agent-Builder, Module-Builder, Workflow-Builder
- **BMM (SDLC):** Analyst, PM, Architect, Dev, SM, Quinn, UX-Designer, Tech-Writer, Quick-Flow-Solo-Dev
- **TEA (Testing):** TEA (Test Architecture Expert)
- **CIS (Innovation):** Brainstorming-Coach, Design-Thinking-Coach, Creative-Problem-Solver, Innovation-Strategist, Presentation-Master, Storyteller
- **Core:** Party-Mode, BMAD-Master

### 🚀 Intelligent Installation
- ✅ **Complete BMAD structure** (19 directories created automatically)
- ✅ **Generated YAML configuration** with metadata
- ✅ **Multi-platform stubs** (Copilot CLI, VSCode, Claude Code, Codex)
- ✅ **MCP Server setup** for Claude Code
- ✅ **CSV manifests** for agent tracking

### 🔍 Automated Validation (10 checks)
- Verify `_bmad/` structure
- Validate agent files
- Check YAML frontmatter
- Validate permissions
- Verify npm dependencies
- Test manifests, workflows, templates

### 🛠️ Intelligent Troubleshooting
- ✅ **8 error patterns** automatically recognized
- ✅ **Auto-fix** for permissions, corrupted structure, dependencies
- ✅ **Contextual diagnostics** (Node version, Git, disk space)
- ✅ **OS-specific upgrade suggestions**

### 💾 Backup & Rollback
- ✅ **Automatic backup** before installation
- ✅ **Metadata** (timestamp, size, files)
- ✅ **Secure restore** with pre-restore backup
- ✅ **Automatic cleanup** of old backups

### 🧙 Post-Installation Wizard
- ✅ **7-question interview** (<5 min)
- ✅ **Conversational mode** with inquirer
- ✅ **4 post-install options**: create agent, test, docs, exit
- ✅ **Interactive quick-start guide**

---

## 🚀 Quick Installation

### Prerequisites
- **Node.js** ≥ 18.0.0
- **Git** installed
- At least **1 platform**: GitHub Copilot CLI, VSCode, Claude Code, or Codex

### Via NPX (recommended)
```bash
# Interactive installation
npx create-byan-agent

# Follow the 7-question interview (5 min)
```

### Via NPM Global
```bash
# Install globally
npm install -g create-byan-agent

# Run
create-byan-agent
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/Yan-Acadenice/BYAN.git
cd BYAN/install

# Install dependencies
npm install

# Launch installer
npm start
```

---

## 🎮 Usage

### Interview Mode (Recommended)
```bash
npx create-byan-agent
```

**7 interactive questions:**
1. Your name (for personalized configuration)
2. Communication language (Français/English)
3. Installation mode (Recommended/Custom/Minimal/Full)
4. Agent selection (if Custom)
5. Target platforms (Copilot/VSCode/Claude/Codex)
6. Install sample agent (yes/no)
7. Create backup (yes/no)

### Programmatic Mode

#### JavaScript API
```javascript
const yanstaller = require('create-byan-agent');

// Detection
const detection = await yanstaller.detect({
  projectRoot: process.cwd()
});
console.log(detection.platforms); // ['copilot-cli', 'vscode']

// Recommendation
const recommendations = await yanstaller.recommend({
  projectRoot: process.cwd(),
  detection
});
console.log(recommendations.agents); // ['dev', 'architect', 'quinn']

// Installation
const result = await yanstaller.install({
  projectRoot: process.cwd(),
  agents: ['byan', 'dev', 'quinn'],
  platforms: ['copilot-cli', 'vscode'],
  userName: 'Yan',
  language: 'English'
});

// Validation
const validation = await yanstaller.validate({
  projectRoot: process.cwd()
});
console.log(validation.errors); // []
```

#### CLI Options
```bash
# Silent installation with specific agents
create-byan-agent --silent --agents=byan,dev,quinn

# Force interactive prompts (useful inside npm scripts or CI shells without TTY)
create-byan-agent --interactive

# Custom mode with specific platform
create-byan-agent --mode=custom --platforms=copilot-cli

# Install on all supported platforms
create-byan-agent --platforms=all

# Full installation without backup
create-byan-agent --mode=full --no-backup

# Dry-run (simulation)
create-byan-agent --dry-run

# Verbose logging
create-byan-agent --verbose
```

---

## 🏛️ Architecture

### Project Structure
```
install/
├── bin/
│   └── create-byan-agent.js      # CLI entry point
├── lib/
│   ├── yanstaller/                # Core modules
│   │   ├── detector.js            # Platform & project detection
│   │   ├── recommender.js         # Agent recommendations
│   │   ├── installer.js           # Installation orchestration
│   │   ├── validator.js           # Post-install validation
│   │   ├── troubleshooter.js      # Error diagnosis & auto-fix
│   │   ├── backuper.js            # Backup & restore
│   │   ├── interviewer.js         # Interactive interview
│   │   └── wizard.js              # Post-install wizard
│   ├── platforms/                 # Platform adapters
│   │   ├── copilot-cli.js         # GitHub Copilot CLI
│   │   ├── vscode.js              # VSCode extension
│   │   ├── claude-code.js         # Claude Code MCP
│   │   └── codex.js               # Codex platform
│   ├── utils/                     # Utilities
│   │   ├── file-utils.js          # File operations
│   │   ├── logger.js              # Logging system
│   │   └── yaml-utils.js          # YAML parsing
│   ├── errors.js                  # Error definitions
│   └── exit-codes.js              # Exit code constants
├── templates/                     # Agent templates
│   └── _bmad/
│       ├── core/agents/
│       ├── bmm/agents/
│       ├── bmb/agents/
│       ├── tea/agents/
│       └── cis/agents/
├── __tests__/                     # Test suite (168 tests)
└── package.json
```

### Installation Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. DETECT - Platform & Project Analysis               │
│     • Scan for Copilot CLI, VSCode, Claude, Codex      │
│     • Analyze package.json dependencies                 │
│     • Detect project type & framework                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  2. RECOMMEND - Intelligent Agent Selection             │
│     • Match agents to project type                      │
│     • Consider detected platforms                       │
│     • Generate rationale for each recommendation        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  3. INTERVIEW - User Preferences (7 questions)          │
│     • Name, language, mode                              │
│     • Agent selection (if custom)                       │
│     • Platform targets, backup option                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  4. BACKUP - Pre-install Safety (optional)              │
│     • Create timestamped backup of _bmad/               │
│     • Save metadata (files, size, version)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  5. INSTALL - Core Installation                         │
│     • Create _bmad/ structure (19 directories)          │
│     • Copy agent templates from 5 modules               │
│     • Generate platform stubs (Copilot/VSCode/etc.)     │
│     • Create module configs (YAML with metadata)        │
│     • Update manifests (agent-manifest.csv)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  6. VALIDATE - 10 Automated Checks                      │
│     • Structure, agents, stubs, configs                 │
│     • Permissions, manifests, workflows                 │
│     • Templates, dependencies                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  7. WIZARD - Post-Install Actions                       │
│     • Summary of installed agents                       │
│     • Option: Create new agent (launch BYAN)            │
│     • Option: Test agent                                │
│     • Option: View documentation                        │
│     • Quick start guide                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Modules

_(Same detailed module documentation as French version, translated to English)_

### 1. Detector
**File:** `lib/yanstaller/detector.js`

**Purpose:** Detects installed platforms and analyzes the project.

**API:** _(Same as French version)_

### 2-8. _(Other modules follow same structure as French version)_

---

## 🧪 Tests

### Test Suite (168 tests)

**Coverage:**
```bash
npm test
```

**Test files:**
```
__tests__/
├── recommender.test.js         (18 tests) - Agent recommendations
├── installer.test.js           (13 tests) - Core installation
├── platforms.test.js           (20 tests) - Platform adapters
├── validator.test.js           (24 tests) - 10-check validation
├── integration.test.js         (27 tests) - Integration tests
├── e2e.test.js                 (16 tests) - End-to-end scenarios
├── troubleshooter.test.js      (20 tests) - Diagnostic & auto-fix
├── backuper.test.js            (20 tests) - Backup & restore
└── interviewer-wizard.test.js  (10 tests) - Interview & wizard
```

---

## 🛠️ Development

### Local Setup

```bash
# Clone repository
git clone https://github.com/Yan-Acadenice/BYAN.git
cd BYAN/install

# Install dependencies
npm install

# Run in dev mode
npm start

# Tests
npm test

# Linter
npm run lint
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Contribution Process

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/my-feature`
3. **Write tests** (TDD mandatory)
4. **Implement** the feature
5. **Tests pass**: `npm test`
6. **Commit**: `git commit -m "feat: add my-feature"`
7. **Push**: `git push origin feature/my-feature`
8. **Pull Request** with detailed description

---

## 📄 License

**MIT License**

Copyright (c) 2026 Yan

_(Full MIT license text as in French version)_

---

## 🌐 Resources

- **BMAD Documentation:** [GitHub Wiki](https://github.com/Yan-Acadenice/BYAN/wiki)
- **BYAN Agent:** Intelligent agent creator
- **RACHID Agent:** NPM deployment
- **MARC Agent:** GitHub Copilot CLI integration
- **PATNOTE Agent:** Update management
- **CARMACK Agent:** Token optimization (-46%)

---

## 📧 Support

- **Issues:** [GitHub Issues](https://github.com/Yan-Acadenice/BYAN/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Yan-Acadenice/BYAN/discussions)
- **Email:** yan@example.com

---

**Made with ❤️ by Yan | Merise Agile + TDD + 64 Mantras**
