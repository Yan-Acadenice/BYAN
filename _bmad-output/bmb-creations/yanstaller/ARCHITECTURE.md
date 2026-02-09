# YANSTALLER - Architecture Technique v1.0

**Architecte**: Winston  
**Date**: 2026-02-03  
**Version**: 1.0.0  
**Status**: VALIDATED

---

## Table des Matières

- [Vue d'Ensemble](#vue-densemble)
- [Principes d'Architecture](#principes-darchitecture)
- [Diagramme Modules](#diagramme-modules)
- [Design Patterns](#design-patterns)
- [Structure Fichiers](#structure-fichiers)
- [Flux de Données](#flux-de-données)
- [Gestion des Erreurs](#gestion-des-erreurs)
- [Testing Strategy](#testing-strategy)
- [Décisions Techniques](#décisions-techniques)

---

## Vue d'Ensemble

YANSTALLER est un CLI Node.js intelligent qui automatise l'installation et la configuration du système d'agents BYAN sur 4 plateformes différentes avec support multi-OS.

### Objectifs Architecturaux

1. **Simplicité** (#37 Ockham's Razor): Code lisible > clever code
2. **Testabilité**: 80%+ coverage, tests isolés
3. **Maintenabilité**: Zero magic, dependencies injection
4. **Robustesse**: Fail fast, rollback automatique
5. **Portabilité**: Multi-OS sans code spécifique OS dispersé

### Stack Technique

```yaml
Runtime: Node.js >= 18.0.0 (LTS)
Language: JavaScript ES6+ (pas de TypeScript)
Package: npm/npx distribution
CLI Framework: commander + inquirer
File Ops: fs-extra (promisified fs)
UI: chalk (colors) + ora (spinners)
Config: js-yaml (YAML parsing)
Tests: Jest
Linting: ESLint + Prettier
CI/CD: GitHub Actions (matrix 3 OS)
```

---

## Principes d'Architecture

### 1. Modularity over Monolith
Chaque capability = module séparé avec interface claire.

### 2. Dependency Injection over Singletons
Config et state passés en paramètres, pas de globals.

### 3. Fail Fast over Silent Errors
Node version check dès le début, exit code 1 si erreur critique.

### 4. Composition over Inheritance
Pas de hiérarchie de classes. Fonctions pures composées.

### 5. Convention over Configuration
Chemins par défaut sensibles (.github/agents/, _byan/, etc.)

---

## Diagramme Modules

```
┌─────────────────────────────────────────────────────────┐
│                      bin/yanstaller.js                   │
│                  (CLI Entry Point)                       │
│                  - Parse arguments                       │
│                  - Load config                           │
│                  - Orchestrate flow                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│               lib/yanstaller/index.js                    │
│                  (Main Orchestrator)                     │
│                  - Coordinate modules                    │
│                  - Handle errors                         │
│                  - Manage state                          │
└──┬────────┬────────┬────────┬────────┬────────┬────────┬┘
   │        │        │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼        ▼        ▼
┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
│DETECT││RECOM ││INSTAL││VALID ││TROUBL││BACKUP││WIZARD│
│ (40h)││(24h) ││(56h) ││(32h) ││(40h) ││(24h) ││(16h) │
└──┬───┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘
   │       │       │       │       │       │       │
   ▼       ▼       ▼       ▼       ▼       ▼       ▼
┌─────────────────────────────────────────────────────────┐
│                    lib/utils/                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│  │os-detector│  │file-utils │  │logger     │           │
│  └───────────┘  └───────────┘  └───────────┘           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│  │node-det   │  │yaml-utils │  │config-ldr │           │
│  └───────────┘  └───────────┘  └───────────┘           │
│  ┌───────────┐                                           │
│  │git-detect │                                           │
│  └───────────┘                                           │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   lib/platforms/                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│  │copilot-cli│  │vscode     │  │claude-code│           │
│  └───────────┘  └───────────┘  └───────────┘           │
│  ┌───────────┐                                           │
│  │codex      │                                           │
│  └───────────┘                                           │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   lib/templates/                         │
│              agents/ (29 agent stubs)                    │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
User runs: npx create-byan-agent
         │
         ▼
┌──────────────────┐
│ 1. DETECT        │ → OS, Node, Git, Platforms detected
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 2. VALIDATE DEPS │ → Node >= 18? → Yes: continue | No: EXIT 1
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 3. RECOMMEND     │ → Analyze project → Suggest mode (Full/Minimal/Custom)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 4. INTERVIEW     │ → Ask 5-7 questions → Build config
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 5. BACKUP        │ → If _byan/ exists → Backup to _byan.backup-{timestamp}/
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 6. INSTALL       │ → Copy agents → Generate stubs → Write configs
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 7. VALIDATE      │ → Run 10 checks → Report pass/fail
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 8. WIZARD        │ → Post-install menu → Create agent / Test / Exit
└──────────────────┘
```

---

## Design Patterns

### 1. Strategy Pattern (Léger) - Platforms

**Problème**: 4 plateformes avec logiques detect/install différentes.

**Solution**: Chaque plateforme = module avec interface commune.

```javascript
// lib/platforms/copilot-cli.js
module.exports = {
  name: 'GitHub Copilot CLI',
  
  /**
   * Detect if Copilot CLI is installed
   * @returns {Promise<boolean>}
   */
  async detect() {
    // Check .github/agents/ or copilot CLI command
  },
  
  /**
   * Install agents for this platform
   * @param {Object} config - Installation config
   * @param {string[]} agents - List of agent names
   * @returns {Promise<InstallResult>}
   */
  async install(config, agents) {
    // Copy to .github/agents/
    // Generate YAML frontmatter
  }
};
```

**Pas de Factory** - Simple require() suffit:

```javascript
// lib/yanstaller/installer.js
const platforms = {
  copilot: require('../platforms/copilot-cli'),
  vscode: require('../platforms/vscode'),
  claude: require('../platforms/claude-code'),
  codex: require('../platforms/codex')
};
```

### 2. Dependency Injection - Config

**Problème**: Éviter Singleton pour testabilité.

**Solution**: Config passé en paramètre.

```javascript
// ❌ BAD: Singleton
class ConfigManager {
  static getInstance() { ... }
}

// ✅ GOOD: DI
async function installAgents(config, agents) {
  // config = { outputFolder, userName, platforms: [] }
}
```

### 3. Error Handling - Custom Errors

**Classes d'erreur custom pour catch sélectif**:

```javascript
// lib/errors.js
class YanInstallerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'YanInstallerError';
  }
}

class NodeVersionError extends YanInstallerError {
  constructor(required, current) {
    super(`Node.js ${required}+ required, got ${current}`);
    this.name = 'NodeVersionError';
    this.required = required;
    this.current = current;
  }
}

class PlatformNotFoundError extends YanInstallerError { ... }
class PermissionError extends YanInstallerError { ... }
class ValidationError extends YanInstallerError { ... }
class BackupError extends YanInstallerError { ... }
```

**Usage**:

```javascript
try {
  await detector.checkNodeVersion();
} catch (err) {
  if (err instanceof NodeVersionError) {
    logger.error(`Node version too old: ${err.current}`);
    logger.info(`Please upgrade to Node ${err.required}+`);
    process.exit(1);
  }
  throw err;
}
```

### 4. State Management - Simple Object

**Pas d'EventEmitter, pas d'Observable. Juste un objet.**

```javascript
const installState = {
  phase: 'detection', // detection, validation, installation, etc.
  progress: 0, // 0-100
  detectedPlatforms: [],
  selectedAgents: [],
  errors: [],
  backupPath: null
};

// Passé aux fonctions qui le modifient
await installer.install(config, agents, installState);
```

**Progress UI via ora**:

```javascript
const ora = require('ora');
const spinner = ora('Detecting environment...').start();

// Update spinner
spinner.text = 'Installing agents...';
spinner.succeed('Installation complete!');
```

---

## Structure Fichiers

```
install/
├── package.json
├── README.md
├── LICENSE
│
├── bin/
│   └── yanstaller.js                 # CLI entry point (#!/usr/bin/env node)
│
├── lib/
│   ├── yanstaller/
│   │   ├── index.js                  # Main orchestrator
│   │   ├── detector.js               # DETECT-ENVIRONMENT (40h)
│   │   ├── recommender.js            # RECOMMEND-CONFIG (24h)
│   │   ├── installer.js              # INSTALL-AGENTS (56h)
│   │   ├── validator.js              # VALIDATE-INSTALLATION (32h)
│   │   ├── troubleshooter.js         # TROUBLESHOOT-ISSUES (40h)
│   │   ├── interviewer.js            # GUIDE-QUICK-INTERVIEW (16h)
│   │   ├── backuper.js               # BACKUP-RESTORE (24h)
│   │   └── wizard.js                 # POST-INSTALL-WIZARD (16h)
│   │
│   ├── platforms/
│   │   ├── copilot-cli.js            # GitHub Copilot CLI support
│   │   ├── vscode.js                 # VSCode extension support
│   │   ├── claude-code.js            # Claude Code MCP support
│   │   └── codex.js                  # Codex support
│   │
│   ├── utils/
│   │   ├── os-detector.js            # OS detection (Win/Linux/Mac)
│   │   ├── node-detector.js          # Node.js version check
│   │   ├── git-detector.js           # Git presence check
│   │   ├── file-utils.js             # fs-extra wrapper
│   │   ├── yaml-utils.js             # js-yaml wrapper
│   │   ├── logger.js                 # chalk + console wrapper
│   │   └── config-loader.js          # Config file loading
│   │
│   ├── templates/
│   │   └── agents/                   # 29 pre-built agent stubs
│   │       ├── byan.md
│   │       ├── architect.md
│   │       ├── dev.md
│   │       └── ...
│   │
│   └── errors.js                     # Custom error classes
│
├── __tests__/
│   ├── yanstaller/
│   │   ├── detector.test.js
│   │   ├── recommender.test.js
│   │   ├── installer.test.js
│   │   ├── validator.test.js
│   │   ├── troubleshooter.test.js
│   │   ├── interviewer.test.js
│   │   ├── backuper.test.js
│   │   └── wizard.test.js
│   │
│   ├── platforms/
│   │   ├── copilot-cli.test.js
│   │   ├── vscode.test.js
│   │   ├── claude-code.test.js
│   │   └── codex.test.js
│   │
│   ├── utils/
│   │   ├── os-detector.test.js
│   │   ├── node-detector.test.js
│   │   ├── git-detector.test.js
│   │   ├── file-utils.test.js
│   │   └── yaml-utils.test.js
│   │
│   ├── integration/
│   │   ├── full-install.test.js
│   │   ├── minimal-install.test.js
│   │   └── custom-install.test.js
│   │
│   └── e2e/
│       ├── windows.test.js
│       ├── linux.test.js
│       └── macos.test.js
│
├── .github/
│   └── workflows/
│       └── test.yml                  # CI/CD multi-OS
│
├── .eslintrc.js
├── .prettierrc
├── jest.config.js
└── .gitignore
```

---

## Flux de Données

### Module Interfaces

```javascript
/**
 * @typedef {Object} DetectionResult
 * @property {string} os - 'windows' | 'linux' | 'macos'
 * @property {string} nodeVersion - e.g., '18.19.0'
 * @property {boolean} hasGit
 * @property {PlatformInfo[]} platforms
 */

/**
 * @typedef {Object} PlatformInfo
 * @property {string} name - 'copilot-cli' | 'vscode' | 'claude' | 'codex'
 * @property {boolean} detected
 * @property {string} [path] - Installation path if detected
 */

/**
 * @typedef {Object} InstallConfig
 * @property {string} mode - 'full' | 'minimal' | 'custom'
 * @property {string[]} agents - Agent names to install
 * @property {string} userName
 * @property {string} language - 'Francais' | 'English'
 * @property {string[]} targetPlatforms - Platforms to install on
 * @property {string} outputFolder - e.g., '{project-root}/_byan-output'
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} success
 * @property {CheckResult[]} checks - 10 validation checks
 * @property {string[]} errors
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} name - Check name
 * @property {boolean} passed
 * @property {string} [message] - Error message if failed
 */
```

### Flow Sequence

```javascript
// bin/yanstaller.js (main entry)
async function main() {
  // 1. Parse CLI args
  const args = parseArgs();
  
  // 2. Detect environment
  const detection = await detector.detect();
  
  // 3. Validate Node version (FAIL FAST)
  if (!detector.isNodeVersionValid(detection.nodeVersion, '18.0.0')) {
    logger.error('Node.js 18+ required');
    process.exit(1);
  }
  
  // 4. Recommend configuration
  const recommendation = await recommender.recommend(detection);
  
  // 5. Run interview (if not --yes flag)
  const config = args.yes 
    ? recommendation.defaultConfig
    : await interviewer.ask(recommendation);
  
  // 6. Backup if needed
  if (await fileUtils.exists('_byan')) {
    await backuper.backup('_byan');
  }
  
  // 7. Install
  const installResult = await installer.install(config, detection);
  
  // 8. Validate
  const validation = await validator.validate(config);
  
  if (!validation.success) {
    logger.error('Validation failed');
    // Rollback?
    process.exit(1);
  }
  
  // 9. Post-install wizard
  await wizard.show(config);
}
```

---

## Gestion des Erreurs

### Error Hierarchy

```
Error (native)
└── YanInstallerError (base)
    ├── NodeVersionError (critical, exit 1)
    ├── PlatformNotFoundError (warning)
    ├── PermissionError (critical if no sudo)
    ├── ValidationError (post-install fail)
    ├── BackupError (critical)
    └── NetworkError (template download)
```

### Error Handling Strategy

```javascript
// Global error handler in bin/yanstaller.js
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled error:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});

// Module-level error handling
async function detector.detect() {
  try {
    const os = await osDetector.detect();
    const node = await nodeDetector.detect();
    return { os, node };
  } catch (err) {
    throw new DetectionError('Failed to detect environment', { cause: err });
  }
}
```

### Exit Codes

```javascript
// lib/exit-codes.js
module.exports = {
  SUCCESS: 0,
  NODE_VERSION_ERROR: 1,
  PERMISSION_ERROR: 2,
  VALIDATION_FAILED: 3,
  INSTALLATION_FAILED: 4,
  BACKUP_FAILED: 5,
  UNKNOWN_ERROR: 99
};
```

---

## Testing Strategy

### Test Pyramid

```
      ┌────────┐
      │   E2E  │  10 tests (multi-OS full flows)
      │  (10%) │
      └────────┘
     ┌──────────┐
     │Integration│ 30 tests (module combinations)
     │   (20%)   │
     └──────────┘
    ┌────────────┐
    │    Unit    │  100+ tests (pure functions)
    │   (70%)    │
    └────────────┘
```

### Unit Tests

**Chaque module = fichier test avec même nom**

```javascript
// __tests__/yanstaller/detector.test.js
describe('detector', () => {
  describe('detect()', () => {
    it('should detect OS correctly on Linux', async () => {
      const result = await detector.detect();
      expect(result.os).toBe('linux');
    });
    
    it('should detect Node version', async () => {
      const result = await detector.detect();
      expect(result.nodeVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
    
    it('should detect Git if installed', async () => {
      const result = await detector.detect();
      expect(result.hasGit).toBe(true); // Assume Git installed on dev machine
    });
  });
  
  describe('isNodeVersionValid()', () => {
    it('should return true for valid version', () => {
      expect(detector.isNodeVersionValid('18.19.0', '18.0.0')).toBe(true);
    });
    
    it('should return false for old version', () => {
      expect(detector.isNodeVersionValid('16.20.0', '18.0.0')).toBe(false);
    });
  });
});
```

### Integration Tests

**Test combinaisons de modules**

```javascript
// __tests__/integration/full-install.test.js
describe('Full Installation Flow', () => {
  it('should install all 29 agents successfully', async () => {
    const config = {
      mode: 'full',
      agents: ALL_AGENTS,
      userName: 'TestUser',
      language: 'English'
    };
    
    const result = await installer.install(config);
    expect(result.success).toBe(true);
    
    const validation = await validator.validate(config);
    expect(validation.success).toBe(true);
    expect(validation.checks).toHaveLength(10);
    expect(validation.checks.every(c => c.passed)).toBe(true);
  });
});
```

### E2E Tests

**Tests multi-OS via GitHub Actions matrix**

```javascript
// __tests__/e2e/windows.test.js
describe('E2E Windows', () => {
  it('should complete full installation on Windows', async () => {
    // Simulate full CLI run
    const { exitCode, stdout } = await runCLI(['--yes', '--mode=minimal']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Installation complete');
  });
});
```

### Coverage Target

- **Overall**: 80%+
- **Critical paths** (detector, installer, validator): 90%+
- **Utils**: 85%+
- **Platforms**: 70%+ (harder to mock)

---

## Décisions Techniques

### 1. JavaScript vs TypeScript

**Décision**: JavaScript ES6+ avec JSDoc

**Justification**:
- ✅ Zero build step = plus simple pour contributeurs
- ✅ JSDoc donne hints IDE (VSCode IntelliSense)
- ✅ Pas de configuration tsconfig.json
- ❌ Pas de type checking compile-time (mitigé par JSDoc + ESLint)

**Alternative considérée**: TypeScript
- Rejeté car overhead pour un CLI simple
- TDD + tests compensent manque de types compile-time

### 2. Commander vs Yargs

**Décision**: Commander

**Justification**:
- ✅ Plus simple que Yargs
- ✅ 15MB/semaine vs 10MB pour Yargs (plus populaire)
- ✅ API intuitive
- ✅ Subcommands faciles

**Alternative considérée**: Yargs
- Rejeté car API plus complexe

### 3. Inquirer vs Prompts

**Décision**: Inquirer

**Justification**:
- ✅ Feature-rich (checkbox, confirm, list, input)
- ✅ Widely used (19M/week)
- ✅ Excellente docs
- ❌ Taille: 1.2MB

**Alternative considérée**: Prompts (léger, 200KB)
- Rejeté car moins de features

### 4. fs-extra vs native fs/promises

**Décision**: fs-extra

**Justification**:
- ✅ copy(), ensureDir(), emptyDir() = game changers
- ✅ Promisified nativement
- ✅ Cross-platform path handling
- ❌ Taille: 200KB

**Alternative considérée**: Native fs/promises
- Rejeté car trop de boilerplate pour copy/ensure

### 5. Monorepo vs Single Package

**Décision**: Single package (install/)

**Justification**:
- ✅ Simplicité (#37 Ockham)
- ✅ 1 seul npm publish
- ✅ Pas de Lerna/Nx complexity
- ❌ Tout dans un package (mais c'est OK pour scope limité)

**Alternative considérée**: Monorepo (yanstaller, yanstaller-platforms, etc.)
- Rejeté car overkill pour 8 modules

### 6. Template Storage: npm vs GitHub

**Décision**: Inclus dans npm package (lib/templates/)

**Justification**:
- ✅ Offline-first: Pas de réseau requis
- ✅ Versionné avec le code
- ✅ Rapide (pas de download)
- ❌ Taille package augmente (+ 500KB)

**Alternative considérée**: Télécharger depuis GitHub
- Rejeté car nécessite connexion réseau

### 7. Config Format: JSON vs YAML

**Décision**: YAML (pour cohérence BYAN)

**Justification**:
- ✅ BYAN utilise YAML partout
- ✅ Plus lisible que JSON (commentaires possibles)
- ✅ js-yaml = 80KB seulement

**Alternative considérée**: JSON
- Rejeté car BYAN standard = YAML

---

## Performance

### Targets

- **Installation time**: < 10 secondes (mode Minimal)
- **Installation time**: < 30 secondes (mode Full, 29 agents)
- **Detection time**: < 2 secondes
- **Validation time**: < 3 secondes

### Optimizations

1. **Parallel operations**: Detect platforms en parallèle
2. **Lazy loading**: Require modules only when needed
3. **Caching**: Cache detection results in session
4. **Minimal dependencies**: 6 deps seulement

---

## Multi-OS Considerations

### Path Handling

```javascript
// ✅ GOOD: path.join()
const agentPath = path.join(projectRoot, '_byan', 'agents', 'byan.md');

// ❌ BAD: String concatenation
const agentPath = projectRoot + '/_byan/agents/byan.md'; // Fail sur Windows
```

### Permissions

```javascript
// Windows: Check ACL
// Linux/Mac: Check chmod

async function hasWritePermission(dirPath) {
  try {
    await fs.access(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
```

### Shell Commands

```javascript
// Cross-platform command execution
const { execSync } = require('child_process');

function runCommand(cmd) {
  // Windows: Use cmd.exe
  // Linux/Mac: Use bash
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
  return execSync(cmd, { shell });
}
```

---

## Sécurité

### 1. Path Traversal Prevention

```javascript
// Validate user input paths
function sanitizePath(userPath) {
  const resolved = path.resolve(userPath);
  const projectRoot = process.cwd();
  
  if (!resolved.startsWith(projectRoot)) {
    throw new SecurityError('Path traversal attempt detected');
  }
  
  return resolved;
}
```

### 2. No Arbitrary Code Execution

- ❌ Pas de `eval()`
- ❌ Pas de `new Function()`
- ✅ YAML parsing safe (js-yaml en mode safe)

### 3. Dependency Security

- `npm audit` dans CI/CD
- Snyk intégration recommandée
- Dependabot alerts enabled

---

## Extensibilité Future

### Plugin System (v2)

Architecture prête pour plugins:

```javascript
// Future: lib/plugins/
// Each plugin = { detect, install, validate }

const plugins = [
  require('./plugins/cursor'),
  require('./plugins/windsurf'),
  require('./plugins/custom-platform')
];
```

### Agent Templates Customization (v2)

```javascript
// Future: User-provided templates
const config = {
  templatePath: '~/my-custom-agents/' // Override default
};
```

---

## Mantras Appliqués

| Mantra | Application dans Architecture |
|--------|-------------------------------|
| **#37 - Ockham's Razor** | Pas de Factory, pas de Singleton, pas d'EventEmitter. Simple > Clever. |
| **IA-1 - Trust But Verify** | Validation à chaque étape (detection, install, post-install). |
| **#4 - Fail Fast** | Node version check immédiat, exit 1 si fail. |
| **#7 - KISS** | DI simple, pas d'abstraction inutile. |
| **IA-16 - Challenge Before Confirm** | Confirmation avant overwrite, backup auto. |
| **#39 - Conséquences** | Custom errors, rollback capability, exit codes clairs. |
| **IA-23 - No Emoji Pollution** | Emojis seulement dans output CLI utilisateur, jamais code/commits. |
| **IA-24 - Clean Code** | JSDoc complet, fonctions courtes, nommage clair. |

---

## Next Steps

1. ✅ Architecture validée
2. ⏭️ Créer module skeleton avec JSDoc
3. ⏭️ Setup Jest + ESLint + Prettier
4. ⏭️ Configure CI/CD GitHub Actions
5. ⏭️ Commencer Phase 1: Detection

---

**Fin du document d'architecture** - Ready for implementation! 🚀
