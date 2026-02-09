---
title: 'YANSTALLER - Complete Implementation (8 Phases)'
slug: 'yanstaller-complete-implementation'
created: '2026-02-03'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js ≥18.0.0 (hard requirement)'
  - 'JavaScript CommonJS (no ES6 imports, no TypeScript)'
  - 'Jest (80% coverage enforced)'
  - 'ESLint (eslint:recommended)'
  - 'Prettier (implicit via style)'
  - 'GitHub Actions CI/CD (3 OS × 3 Node versions)'
  - 'chalk@4, commander@11, inquirer@8, fs-extra@11, js-yaml@4, ora@5'
files_to_modify:
  - 'install/lib/yanstaller/detector.js (99 LOC skeleton)'
  - 'install/lib/yanstaller/recommender.js (skeleton)'
  - 'install/lib/yanstaller/installer.js (skeleton)'
  - 'install/lib/yanstaller/validator.js (skeleton)'
  - 'install/lib/yanstaller/troubleshooter.js (skeleton)'
  - 'install/lib/yanstaller/interviewer.js (skeleton)'
  - 'install/lib/yanstaller/backuper.js (skeleton)'
  - 'install/lib/yanstaller/wizard.js (skeleton)'
  - 'install/lib/yanstaller/index.js (71 LOC, rollback strategy implemented)'
  - 'install/lib/utils/os-detector.js (75 LOC skeleton)'
  - 'install/lib/utils/node-detector.js (52 LOC partial)'
  - 'install/lib/utils/git-detector.js (skeleton)'
  - 'install/lib/utils/file-utils.js (105 LOC complete)'
  - 'install/lib/utils/logger.js (65 LOC complete)'
  - 'install/lib/utils/yaml-utils.js (skeleton)'
  - 'install/lib/utils/config-loader.js (skeleton)'
  - 'install/lib/platforms/copilot-cli.js (108 LOC partial)'
  - 'install/lib/platforms/vscode.js (skeleton)'
  - 'install/lib/platforms/claude-code.js (skeleton)'
  - 'install/lib/platforms/codex.js (skeleton)'
  - 'install/lib/platforms/index.js (15 LOC complete)'
  - 'install/lib/errors.js (62 LOC complete, 6 classes)'
  - 'install/lib/exit-codes.js (55 LOC complete, 9 codes)'
code_patterns:
  - 'Dependency Injection (not Singleton)'
  - 'Strategy Pattern (lightweight platform registry)'
  - 'Custom Error Classes (6 types, YanInstallerError base)'
  - 'Simple State Object (no EventEmitter)'
  - 'JSDoc exhaustif (all modules, @typedef, @param, @returns)'
  - 'CommonJS modules (module.exports, require())'
  - 'Async/await (all I/O operations)'
  - 'fs-extra wrapped (file-utils.js abstraction)'
  - 'Chalk wrapped (logger.js: info/success/warn/error/debug)'
  - 'path.join() everywhere (multi-OS safe)'
  - 'TODO comments (intent markers in skeleton)'
  - 'YAML frontmatter (Copilot CLI stubs mandatory)'
test_patterns:
  - 'TDD strict (tests before code, RED-GREEN-REFACTOR)'
  - 'Test Pyramid: 70% unit, 20% integration, 10% E2E'
  - 'Target: 80% coverage (enforced by jest.config.js)'
  - 'Test structure: __tests__/ mirrors lib/ (yanstaller/, utils/, platforms/, integration/, e2e/)'
  - 'Naming: *.test.js convention'
  - 'Jest config: testEnvironment node, verbose, collectCoverageFrom excludes templates'
  - 'Currently empty (Phase 1 creates first tests)'
---

# Tech-Spec: YANSTALLER - Complete Implementation (8 Phases)

**Created:** 2026-02-03

## Overview

**Scope Note**: This specification provides **implementation-ready detail for Phase 1 (Detection)** with task-level algorithms and complete acceptance criteria. **Phases 2-8 are high-level stories** requiring detailed specs before implementation.

### Problem Statement

Installation de BYAN est complexe pour débutants : 29 agents à installer manuellement sur 4 plateformes différentes (GitHub Copilot CLI, VSCode Copilot Extension, Claude Code MCP, Codex), avec configurations spécifiques multi-OS (Windows, Linux, macOS). 

Les utilisateurs :
- Abandonnent face à la complexité (20+ étapes manuelles)
- Installent incorrectement (paths Windows vs Unix, YAML frontmatter manquant)
- Ne savent pas quels agents choisir (29 disponibles)
- Cassent leur environnement (overwrite sans backup)
- Ne détectent pas les erreurs (Node < 18, permissions, plateformes non détectées)

**Résultat** : Taux d'adoption faible, support lourd, frustration utilisateur.

### Solution

Agent intelligent **YANSTALLER** (CLI via `npx yanstaller`) qui automatise l'installation complète :

1. **Détection automatique** : OS, Node.js version, Git, 4 plateformes
2. **Recommandation intelligente** : Analyse projet, suggère mode installation (Full/Minimal/Custom)
3. **Installation multi-plateforme** : 3 modes (29 agents / 5 essentiels / sélection custom), 4 formats (Copilot CLI stubs, VSCode stubs, Claude MCP config, Codex prompts)
4. **Validation post-install** : 10 checks automatiques (structure, YAML frontmatter, agents détectés)
5. **Troubleshooting** : Diagnostic + auto-fix erreurs communes (permissions, paths, versions)
6. **Backup/Rollback** : Sauvegarde avant overwrite, restore si erreur
7. **Interview guidé** : 5-7 questions pour personnaliser installation
8. **Wizard post-install** : Guide utilisateur (créer agent / tester / exit)

**Architecture** : 8 modules (280h total, revised from 248h with 15% buffer for multi-OS debugging), JavaScript pur (pas TypeScript), 6 dependencies (1.6 MB), multi-OS natif.

### Scope

**In Scope:**

**Phase 1 - Detection (40h, jours 3-7)**:
- Détection OS (Windows/Linux/macOS) via `os` module
- Détection Node.js version (≥18.0.0 required, exit 1 si fail)
- Détection Git (warning only si absent, non-bloquant)
- Détection 4 plateformes :
  - GitHub Copilot CLI : Check command `github-copilot-cli` OU directory `.github/agents/`
  - VSCode Copilot : Réutilise détection Copilot CLI (même format stubs)
  - Claude Code : Check config JSON selon OS (macOS: `~/Library/Application Support/Claude/`, Windows: `~/AppData/Roaming/Claude/`, Linux: `~/.config/Claude/`)
  - Codex : Check directory `.codex/prompts/`
- Génération rapport détection complet (JSON + formatted console)
- **8 fichiers** : `detector.js`, 3 utilities (os/node/git-detector), 4 platform detectors

**Phase 2 - Recommender (24h, jours 8-10)**:
- Analyse type projet (greenfield: pas d'agents installés / brownfield: agents existants)
- Détection stack technique (package.json, requirements.txt, Gemfile, go.mod, etc.)
- Recommandation mode installation (Full si greenfield dev / Minimal si débutant / Custom si expérimenté)
- Recommandation agents selon stack (ex: Python détecté → suggest bmad-agent-python)
- Justification recommendations (console output avec rationale)

**Phase 3 - Installer (56h, jours 11-17)** ← **PLUS COMPLEXE**:
- 3 modes installation :
  - **Full** : 29 agents (core, bmm, bmb, tea, cis)
  - **Minimal** : 5 agents essentiels (bmad-master, analyst, pm, architect, dev)
  - **Custom** : Checklist interactive (inquirer) avec 29 options
- Multi-plateforme (4 formats) :
  - Copilot CLI : Stubs `.md` avec YAML frontmatter obligatoire dans `.github/agents/`
  - VSCode : Réutilise stubs Copilot CLI (même destination)
  - Claude Code : MCP config JSON avec `mcpServers` section
  - Codex : Prompts `.md` dans `.codex/prompts/`
- Gestion conflits :
  - Detect overwrite (file exists)
  - Prompt user (overwrite / skip / backup+overwrite)
  - Backup automatique si overwrite (dans `.yanstaller-backups/`)
- Progress tracking : ora spinners + pourcentage (ex: "Installing 15/29 agents...")
- Error handling : Rollback Option B (leave partial + clear message, exit 4)

**Phase 4 - Validator (32h, jours 18-21)**:
- 10 checks automatiques post-install :
  1. Agents installés (count expected vs actual)
  2. YAML frontmatter présent (Copilot CLI stubs)
  3. MCP config valide (Claude Code JSON parse)
  4. Directories créés (`.github/agents/`, `.codex/prompts/`)
  5. Permissions OK (read/write/execute)
  6. Paths résolus (no broken symlinks)
  7. Duplicate agents (même agent 2+ fois)
  8. Missing dependencies (Node, Git si besoin)
  9. OS compatibility (paths Windows-safe)
  10. Backup directory created (`.yanstaller-backups/`)
- Génération rapport validation (JSON + formatted console)
- Exit codes : 0 (success), 3 (validation failed)

**Phase 5 - Troubleshooter (55h, jours 22-26)** (revised from 40h - added multi-OS troubleshooting complexity):
- Diagnostic erreurs communes :
  - Node version < 18 → Suggest upgrade, link docs
  - Permissions denied → Suggest chmod/chown (Unix) or NTFS ACL (Windows), link docs
  - Paths invalides → Detect OS, suggest fix (Windows path length limits, symlinks)
  - Platforms non détectées → Suggest manual install
  - YAML frontmatter manquant → Auto-fix (inject frontmatter)
  - MCP config cassé → Suggest repair template
  - Windows-specific: Symlink issues (require admin <Win10), macOS Gatekeeper blocking
- Auto-fix quand possible (dry-run preview avant apply)
- Suggestions repair détaillées (step-by-step)
- Logs détaillés (`.yanstaller-logs/install-{date}.log`)
- Exit codes : 6 (platform error)

**Phase 6 - Backuper (24h, jours 27-29)**:
- Backup avant overwrite :
  - Créer directory `.yanstaller-backups/backup-{timestamp}/`
  - Copier fichiers existants (agents, configs)
  - Stocker metadata JSON (files backed up, timestamp, reason)
- Restore en cas d'erreur :
  - Detect installation failure (exit code 4)
  - Prompt user (restore / keep partial / troubleshoot)
  - Restore files from latest backup
- Cleanup backups anciens :
  - Keep last 5 backups
  - Delete older than 30 days
  - Prompt user confirmation avant delete
- Exit codes : 5 (backup failed)

**Phase 7 - Interviewer (16h, jours 30-31)**:
- Quick interview (5-7 questions, <5 min) :
  1. Niveau expérience (débutant / intermédiaire / expert)
  2. Type projet (greenfield / brownfield)
  3. Stack principale (Node/Python/Go/Ruby/Multi)
  4. Plateformes utilisées (Copilot CLI / VSCode / Claude / Codex / Plusieurs)
  5. Mode installation préféré (Full / Minimal / Custom)
  6. (Optionnel) Agents spécifiques besoins
  7. (Optionnel) Backup automatique avant overwrite (yes/no)
- Personnalisation installation selon réponses
- Sélection agents custom (si mode Custom) : Checklist 29 agents avec descriptions

**Phase 8 - Wizard (16h, jours 32-33)**:
- Post-install wizard (lancé automatiquement après validation success) :
  - Display success message + summary (X agents installés, Y plateformes)
  - Options :
    - **[C] Create new agent** → Déléguer à BYAN agent builder
    - **[T] Test installation** → Run validation checks again
    - **[D] Documentation** → Display links (README, agent guides)
    - **[E] Exit** → Clean exit
- Guide utilisateur next steps
- Display installed agents list (par module : core, bmm, bmb, tea, cis)

**Out of Scope:**

- ❌ Support plateformes autres que Copilot CLI, VSCode, Claude Code, Codex (ex: Cursor AI, Windsurf)
- ❌ Installation distante (SSH/cloud deployment)
- ❌ Désinstallation automatique (manuel only, v2 feature)
- ❌ Update automatique agents existants (v2 feature)
- ❌ Interface graphique (CLI only, Electron hors scope)
- ❌ Support Node < 18 (hard requirement, fail fast)
- ❌ Installation sans Node.js (npx requires Node)
- ❌ Auto-update YANSTALLER lui-même (npm update manual)
- ❌ Telemetry/analytics (privacy first, no tracking)
- ❌ Multi-user installation (single user only)
- ❌ Docker/container support (local install only)
- ❌ Rollback automatique (Option B : leave partial state, v2 auto-rollback)

## Context for Development

### Codebase Patterns

**Architecture existante (96/100 score)** :
- **Location** : `/home/yan/conception/_byan-output/bmb-creations/yanstaller/ARCHITECTURE.md` (27 KB)
- **Code Status** : 22 module skeletons created (1,858 LOC total), 3 config files, __tests__/ structure ready but empty
- **Design patterns** :
  - **Dependency Injection** : Config passed as parameters (not Singleton) for testability
  - **Strategy Pattern** : Lightweight for platforms (4 objects with `{detect(), install(), getPath()}` interface)
  - **Custom Error Classes** : 6 types (YanInstallerError, NodeVersionError, PlatformNotFoundError, PermissionError, ValidationError, BackupError)
  - **Simple State Object** : Passed to functions (no EventEmitter, overkill for synchronous CLI)

**Code Conventions Identified** :
- **JSDoc exhaustif** : All modules have complete JSDoc with @typedef, @param, @returns
- **CommonJS modules** : `module.exports` and `require()` (no ES6 import/export, no TypeScript)
- **Async/await pattern** : All I/O operations are async (detect(), install(), validate())
- **Error inheritance** : Custom errors extend `YanInstallerError` base class with additional properties (required, current, platform, path, failures)
- **Utility wrappers** : File ops via `file-utils.js` (fs-extra), console via `logger.js` (chalk), never direct access
- **Platform registry** : `platforms/index.js` exports object with keys `'copilot-cli'`, `'vscode'`, `'claude'`, `'codex'`
- **TODO markers** : Skeleton code has `// TODO: Implement` comments showing implementation intent
- **Multi-OS safe paths** : Always `path.join(a, b, c)`, never string concatenation `a + '/' + b`
- **YAML frontmatter mandatory** : Copilot CLI stubs require frontmatter with `name` and `description` fields

**Naming Conventions** :
- **Modules** : kebab-case files (`os-detector.js`, `copilot-cli.js`)
- **Functions** : camelCase (`detect()`, `isNodeVersionValid()`, `ensureDir()`)
- **Constants** : SCREAMING_SNAKE_CASE (`PLATFORM_NAME`, `STUB_DIR`, `NODE_VERSION_ERROR`)
- **Classes** : PascalCase (`YanInstallerError`, `NodeVersionError`)
- **Private params** : underscore prefix ignored by ESLint (`_unused`)

**ESLint Rules Applied** :
- `no-console: off` (CLI tool, console is expected)
- `no-unused-vars: error` (except `_` prefix)
- `semi: always` (semicolons required)
- `quotes: single` (single quotes enforced)
- `indent: 2 spaces` (consistent indentation)
- `comma-dangle: never` (no trailing commas)

**Mantras appliqués** (64 mantras BMAD) :
- **#37 Ockham's Razor** : Simplicité > complexité (no Factory pattern, no Singleton, no EventEmitter)
- **#4 Fail Fast** : Node version check first, exit 1 immédiatement si < 18
- **IA-1 Trust But Verify** : Validation module, 80% test coverage, CI multi-OS
- **#7 KISS** : 6 dependencies only (1.6 MB), zero over-engineering
- **IA-16 Challenge Before Confirm** : Confirmation avant overwrite, backup auto
- **#39 Conséquences** : Risk analysis, backup strategy, exit codes clairs
- **IA-23 No Emoji Pollution** : Zero emojis in code/commits (only CLI output)
- **IA-24 Clean Code** : JSDoc complet, self-documenting, minimal comments

**Multi-OS considerations** :
- Always `path.join()`, never string concatenation (Windows backslashes)
- `fs-extra` handles OS differences automatically
- Config paths differ by OS (Claude Code example : macOS `~/Library`, Windows `~/AppData`, Linux `~/.config`)
- CI/CD tests 3 OS × 3 Node versions = 9 combinations

**Rollback strategy** (Option B chosen) :
- Leave partial state + clear message (not auto-rollback)
- Rationale : Installation = mostly file copies (low risk), idempotent re-run, backup exists for manual restore
- On error : Display 3 options (re-run / restore backup / troubleshoot)
- Exit code 4 (INSTALLATION_FAILED)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `_byan-output/bmb-creations/yanstaller/ARCHITECTURE.md` | Complete technical architecture (27 KB), design patterns, modules, testing strategy |
| `_byan-output/bmb-creations/yanstaller/ARCHITECTURE-SUMMARY.md` | Executive summary (13 KB), metrics, mantras validation |
| `_byan-output/bmb-creations/yanstaller/PHASE-1-DETECTION-PROMPT.md` | Phase 1 implementation guide (12.6 KB), 8 files, TDD approach, AC |
| `_byan-output/bmb-creations/yanstaller/DEPENDENCIES.md` | 6 production deps justified (5.3 KB), alternatives, bundle size |
| `_byan-output/bmb-creations/yanstaller/RISKS.md` | 8 risks identified (8.3 KB), mitigation strategies |
| `_byan-output/bmb-creations/yanstaller/ROLLBACK-STRATEGY.md` | Option B decision (2.5 KB), justification |
| `_byan-output/bmb-creations/yanstaller/PLAN-DEVELOPPEMENT.md` | 8 phases breakdown (29 KB), 240h total |
| `install/lib/yanstaller/detector.js` | Main detection module skeleton (99 lines), JSDoc, TODOs |
| `install/lib/utils/os-detector.js` | OS detection utility (73 lines), 4 functions |
| `install/lib/utils/node-detector.js` | Node version detection (64 lines), semver comparison |
| `install/lib/utils/git-detector.js` | Git detection utility (skeleton) |
| `install/lib/platforms/copilot-cli.js` | Copilot CLI platform (88 lines), detect + install |
| `install/lib/platforms/vscode.js` | VSCode platform (reuse Copilot) |
| `install/lib/platforms/claude-code.js` | Claude Code platform (partial skeleton) |
| `install/lib/platforms/codex.js` | Codex platform (partial skeleton) |
| `install/lib/errors.js` | 6 custom error classes |
| `install/lib/exit-codes.js` | 9 exit codes (SUCCESS, NODE_VERSION_ERROR, etc.) |
| `install/jest.config.js` | Jest configuration (80% coverage target) |
| `.github/workflows/yanstaller-test.yml` | CI/CD workflow (3 OS × 3 Node versions) |

### Technical Decisions

**1. JavaScript (not TypeScript)** :
- **Rationale** : Zero build step = simplicity (Mantra #37), JSDoc for IDE hints, easier for contributors, TDD compensates missing compile-time types
- **Tradeoff** : Less type safety, but 80% test coverage mitigates risk

**2. 6 Production Dependencies (1.6 MB total)** :
- `inquirer` (1.2 MB) : CLI prompts, interactive menus
- `fs-extra` (200 KB) : File operations, cross-OS
- `chalk` (50 KB) : Colors for console output
- `ora` (30 KB) : Spinners, progress indicators
- `js-yaml` (80 KB) : YAML parsing (frontmatter extraction)
- `commander` (50 KB) : CLI args parsing
- **Alternatives considered** : TypeScript (rejected), prompts (too minimal), yargs (heavier than commander)
- **Bundle size** : 10x lighter than competitors (Yeoman 15+ MB, Create React App 50+ MB)

**3. Rollback Strategy: Option B (Leave Partial State)** :
- **Options evaluated** :
  - A : Auto-rollback (complex, overkill for file copies)
  - B : Leave partial + clear message ← **CHOSEN**
  - C : No rollback (risky)
- **Rationale** : Installation = mostly file copies (low risk), idempotent re-run possible, backup exists for manual restore, Ockham's Razor (#37)
- **Implementation** : On error, display 3 options (re-run / restore backup / troubleshoot), exit code 4

**4. Custom Error Classes (6 types)** :
- Selective catch possible (`catch (e) { if (e instanceof NodeVersionError) ... }`)
- Clear error messages per type
- Stack traces preserved
- **Classes** : YanInstallerError (base), NodeVersionError, PlatformNotFoundError, PermissionError, ValidationError, BackupError

**5. CI/CD Multi-OS Matrix** :
- **3 OS** : Ubuntu (Linux), Windows Server, macOS
- **3 Node versions** : 18.x (LTS), 20.x (LTS), 22.x (current)
- **9 combinations** : Every push tests all combos
- **Coverage upload** : Ubuntu + Node 20 only (Codecov)

**6. TDD Mandatory (Test Pyramid)** :
- **70% Unit tests** : Utilities (os-detector, node-detector, git-detector), platforms, isolated functions
- **20% Integration tests** : Detector orchestration, multi-module interactions
- **10% E2E tests** : Full install flows (greenfield, brownfield, error scenarios)
- **Target** : 80% coverage minimum (Phase 1 must hit this before Phase 2)

## Implementation Plan

### Overview

**Total Effort**: 280h across 8 phases (7 weeks, 2 devs, includes 15% buffer for multi-OS debugging)

**Phases**:
1. Detection (40h, jours 3-7) - 8 fichiers ← **PHASE 1 DETAILED BELOW**
2. Recommender (24h, jours 8-10) - 1 module
3. Installer (75h, jours 11-18) - 1 module + templates ← **MOST COMPLEX** (revised from 56h)
4. Validator (32h, jours 19-22) - 1 module + 10 checks
5. Troubleshooter (55h, jours 23-28) - 1 module + diagnostics (revised from 40h)
6. Backuper (24h, jours 29-31) - 1 module + cleanup
7. Interviewer (16h, jours 32-33) - 1 module + questions
8. Wizard (16h, jours 34-35) - 1 module + post-install flow

**Approach**: TDD strict (tests before code), incremental commits, CI/CD validation multi-OS

---

### Phase 1: Detection Module (40h)

**Goal**: Implement complete environment detection (OS, Node, Git, 4 platforms) with parallel execution and comprehensive tests.

#### Tasks (Ordered by Dependency)

**Foundation Layer (7h)**

- [ ] **Task 1.1**: Implement `os-detector.js` (2h)
  - File: `install/lib/utils/os-detector.js`
  - Action: Complete implementation of `detect()` function (already 90% done, just needs validation)
  - Notes: Skeleton exists with full JSDoc, native `os` module used, returns `{name, version, platform}`
  - Tests: Create `__tests__/utils/os-detector.test.js` with 4 tests (detect, isWindows, isMacOS, isLinux)
  - TDD: Write tests FIRST (must FAIL), then implement to pass

- [ ] **Task 1.2**: Implement `node-detector.js` (3h)
  - File: `install/lib/utils/node-detector.js`
  - Action: Complete `compareVersions()` to handle version suffixes (`-beta`, `-rc1`)
  - Current State: Basic implementation exists (lines 25-35), needs regex to strip suffixes
  - Algorithm: 
    ```javascript
    // Strip suffixes: '18.0.0-beta' → '18.0.0'
    const cleanVersion = version.replace(/-.*$/, '');
    // Then split and compare numeric parts
    ```
  - Tests: Create `__tests__/utils/node-detector.test.js` with 6 tests (detect, compareVersions equal/greater/less, meetsRequirement OK/fail, version suffixes)
  - TDD: Test suffix edge cases (`18.0.0-beta` vs `18.0.0`, `19.0.0-rc1` vs `18.0.0`)

- [ ] **Task 1.3**: Implement `git-detector.js` (2h)
  - File: `install/lib/utils/git-detector.js`
  - Action: Implement `detect()` using `execSync('git --version')` with try/catch
  - Current State: Skeleton only, JSDoc defined
  - Algorithm:
    ```javascript
    try {
      const output = execSync('git --version', {encoding: 'utf8'});
      const match = output.match(/git version ([\d.]+)/);
      return {installed: true, version: match ? match[1] : null};
    } catch {
      return {installed: false, version: null};
    }
    ```
  - Tests: Create `__tests__/utils/git-detector.test.js` with 2 tests (Git installed, Git absent)
  - TDD: Mock `execSync` with jest.mock('child_process')

**Platform Detection Layer (13h)**

- [ ] **Task 1.4**: Implement `copilot-cli.js` detect() (5h)
  - File: `install/lib/platforms/copilot-cli.js`
  - Action: Complete `detect()` function (partial implementation lines 22-31)
  - Current State: Uses `execSync('which github-copilot-cli')` OR checks `.github/agents/` directory
  - Enhancement: Add 10s timeout protection (recommended by BYAN-TEST validation)
  - Algorithm:
    ```javascript
    async function detect() {
      return Promise.race([
        checkCLI(),
        new Promise(resolve => setTimeout(() => resolve(false), 10000))
      ]);
    }
    ```
  - Tests: Create `__tests__/platforms/copilot-cli.test.js` with 4 tests (CLI installed, directory exists, neither, timeout)
  - TDD: Mock `execSync` and `fileUtils.exists()`

- [ ] **Task 1.5**: Implement `vscode.js` detect() (2h)
  - File: `install/lib/platforms/vscode.js`
  - Action: Implement `detect()` by reusing Copilot CLI detection (same format stubs)
  - Current State: Skeleton only
  - Algorithm: `return require('./copilot-cli').detect();` (VSCode extension uses same stubs)
  - Notes: VSCode Copilot Extension reads `.github/agents/*.md` stubs exactly like CLI
  - Tests: Create `__tests__/platforms/vscode.test.js` with 1 test (calls copilot-cli.detect())
  - TDD: Spy on copilot-cli module

- [ ] **Task 1.6**: Implement `claude-code.js` detect() (4h)
  - File: `install/lib/platforms/claude-code.js`
  - Action: Implement `detect()` checking MCP config JSON file (OS-specific paths)
  - Current State: Skeleton only, JSDoc defined
  - Algorithm:
    ```javascript
    async function detect() {
      const configPath = getConfigPath(); // OS-specific
      return fileUtils.exists(configPath);
    }
    
    function getConfigPath() {
      const home = os.homedir();
      switch (os.platform()) {
        case 'darwin':
          return path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json');
        case 'win32':
          return path.join(home, 'AppData/Roaming/Claude/claude_desktop_config.json');
        case 'linux':
          return path.join(home, '.config/Claude/claude_desktop_config.json');
        default:
          return null;
      }
    }
    ```
  - Tests: Create `__tests__/platforms/claude-code.test.js` with 4 tests (macOS path, Windows path, Linux path, unknown OS)
  - TDD: Mock `os.platform()` and `fileUtils.exists()` for each OS

- [ ] **Task 1.7**: Implement `codex.js` detect() (2h)
  - File: `install/lib/platforms/codex.js`
  - Action: Implement `detect()` checking `.codex/prompts/` directory
  - Current State: Skeleton only
  - Algorithm: `return fileUtils.exists('.codex/prompts/');`
  - Tests: Create `__tests__/platforms/codex.test.js` with 2 tests (directory exists, directory missing)
  - TDD: Mock `fileUtils.exists()`

**Orchestration Layer (10h)**

- [ ] **Task 1.8**: Implement `detector.js` orchestration (10h)
  - File: `install/lib/yanstaller/detector.js`
  - Action: Implement complete detection flow with parallel execution
  - Current State: Skeleton with TODOs (lines 40-41), JSDoc complete
  - Algorithm:
    ```javascript
    async function detect() {
      // Parallel detection for speed (Mantra #7 KISS)
      const [osInfo, nodeVersion, gitInfo] = await Promise.all([
        osDetector.detect(),
        Promise.resolve(nodeDetector.detect()), // Sync wrapped in Promise
        gitDetector.detect()
      ]);
      
      // Platform detection with timeout protection
      const platformNames = ['copilot-cli', 'vscode', 'claude', 'codex'];
      const platformsInfo = await Promise.all(
        platformNames.map(name => detectPlatform(name))
      );
      
      return {
        os: osInfo.name,
        osVersion: osInfo.version,
        nodeVersion,
        hasGit: gitInfo.installed,
        gitVersion: gitInfo.version,
        platforms: platformsInfo
      };
    }
    
    async function detectPlatform(platformName) {
      const platform = platforms[platformName];
      if (!platform) {
        throw new Error(`Unknown platform: ${platformName}`);
      }
      
      try {
        const detected = await platform.detect();
        return {
          name: platformName,
          detected,
          path: detected ? platform.getPath() : undefined
        };
      } catch (error) {
        // Non-blocking: platform detection failure shouldn't crash detection
        // Error UX: Log warning and include in report for user visibility
        logger.warn(`Platform ${platformName} detection failed: ${error.message}`);
        return {
          name: platformName,
          detected: false,
          error: error.message
        };
      }
    }
    
    // After collecting platformsInfo, check if ALL platforms failed
    const allFailed = platformsInfo.every(p => !p.detected);
    if (allFailed) {
      const errors = platformsInfo.map(p => `${p.name}: ${p.error || 'unknown'}`).join(', ');
      logger.warn(`0/4 platforms detected. Errors: [${errors}]`);
    }
    ```
  - Enhancement: `isNodeVersionValid()` already implemented (lines 60-71), but consider using cleaned versions
  - Tests: Create `__tests__/yanstaller/detector.test.js` with 12 tests:
    - `detect()` returns complete structure
    - `detect()` uses Promise.all (parallel execution)
    - `detect()` handles OS detection failure gracefully
    - `detect()` handles Node detection failure gracefully
    - `detect()` handles Git detection failure gracefully
    - `detectPlatform()` for each of 4 platforms
    - `detectPlatform()` handles unknown platform error
    - `detectPlatform()` handles platform detection error (non-blocking)
    - `isNodeVersionValid()` passes for valid versions
    - `isNodeVersionValid()` fails for old versions
    - `isNodeVersionValid()` handles version suffixes
    - Integration test: full detection flow end-to-end
  - TDD: Mock all detector modules, test orchestration logic

**Integration & Coverage (10h)**

- [ ] **Task 1.9**: Create integration tests (5h)
  - Files: `__tests__/integration/detection-flow.test.js`
  - Action: Test full detection flow with real OS/Node (not mocked)
  - Tests:
    - Full detection returns valid structure
    - Detection handles no platforms gracefully (0 detected)
    - Detection handles all platforms detected (4 detected)
    - Detection measures performance (should be < 5s with timeouts)
  - Notes: These tests run on real environment, not mocked

- [ ] **Task 1.10**: Achieve 80%+ coverage (3h)
  - Action: Review coverage report, add missing tests for edge cases
  - Command: `npm test -- --coverage`
  - Target: 80% branches, functions, lines, statements (enforced by jest.config.js)
  - Focus: Error paths, edge cases, multi-OS conditionals

- [ ] **Task 1.11**: CI/CD validation (2h)
  - Action: Push branch `phase-1-detection`, verify GitHub Actions pass on 3 OS
  - Files: `.github/workflows/yanstaller-test.yml` (already configured)
  - Tests: 3 OS (Ubuntu, Windows, macOS) × 3 Node versions (18, 20, 22) = 9 combinations
  - Success Criteria: All 9 jobs pass, coverage uploaded to Codecov (Ubuntu + Node 20 only)

---

### Acceptance Criteria (Phase 1)

#### AC 1: OS Detection
- [ ] **AC-YAN-DET-01**: Given the detector runs on Windows/Linux/macOS, when `detector.detect()` is called, then it returns `{os: 'windows'|'linux'|'macos', osVersion: string}` matching the actual OS

#### AC 2: Node Version Detection
- [ ] **AC-YAN-DET-02**: Given Node.js ≥18.0.0 is installed, when `detector.detect()` is called, then it returns `{nodeVersion: string}` matching `process.version` without 'v' prefix
- [ ] **AC-YAN-DET-02b**: Given Node.js version has suffix (e.g., '18.0.0-beta'), when `isNodeVersionValid()` is called, then it correctly compares versions ignoring suffixes

#### AC 3: Git Detection
- [ ] **AC-YAN-DET-03**: Given Git is installed, when `detector.detect()` is called, then it returns `{hasGit: true, gitVersion: string}` with version extracted from `git --version`
- [ ] **AC-YAN-DET-03b**: Given Git is NOT installed, when `detector.detect()` is called, then it returns `{hasGit: false, gitVersion: null}` without throwing error (warning only, non-blocking)

#### AC 4: Platform Detection
- [ ] **AC-YAN-DET-04a**: Given GitHub Copilot CLI is installed OR `.github/agents/` directory exists, when `detector.detect()` is called, then `platforms` array includes `{name: 'copilot-cli', detected: true}`
- [ ] **AC-YAN-DET-04b**: Given VSCode Copilot Extension installed (same detection as CLI), when `detector.detect()` is called, then `platforms` array includes `{name: 'vscode', detected: true}`
- [ ] **AC-YAN-DET-04c**: Given Claude Code MCP config exists (OS-specific path), when `detector.detect()` is called, then `platforms` array includes `{name: 'claude', detected: true}`
- [ ] **AC-YAN-DET-04d**: Given Codex `.codex/prompts/` directory exists, when `detector.detect()` is called, then `platforms` array includes `{name: 'codex', detected: true}`
- [ ] **AC-YAN-DET-04e**: Given NO platforms installed, when `detector.detect()` is called, then `platforms` array has 4 entries all with `detected: false` (non-blocking)

#### AC 5: Detection Report
- [ ] **AC-YAN-DET-05**: Given detection completes, when results are formatted, then report includes OS, Node version, Git status, and count of detected platforms (e.g., "2/4 platforms detected")
- [ ] **AC-YAN-DET-05b**: Given detection uses parallel execution, when `detector.detect()` is called, then total execution time is < 5 seconds (with 10s timeouts per platform)

#### AC 6: Error Handling
- [ ] **AC-YAN-DET-06a**: Given platform detection fails (exception thrown), when `detectPlatform()` is called, then error is caught and platform marked as `{detected: false, error: string}` (non-blocking)
- [ ] **AC-YAN-DET-06b**: Given unknown platform name provided, when `detectPlatform()` is called, then it throws Error with message "Unknown platform: {name}"

#### AC 7: Multi-OS Compatibility
- [ ] **AC-YAN-DET-07**: Given tests run on CI (3 OS × 3 Node versions), when all jobs complete, then all 9 combinations pass with 80%+ coverage

#### AC 8: Platform Detection Timeout
- [ ] **AC-YAN-DET-08**: Given a platform takes >10s to respond, when detection is performed, then return `{detected: false, error: 'Detection timeout after 10s'}` and continue without blocking

#### AC 9: Node Version Boundary Case
- [ ] **AC-YAN-DET-09**: Given Node version is exactly 18.0.0, when Node detection is performed, then detection succeeds with `{nodeVersion: '18.0.0'}` (boundary case validation)

#### AC 10: Multiple Platforms Detected
- [ ] **AC-YAN-DET-10**: Given GitHub Copilot CLI and VSCode are both installed, when platform detection is performed, then both platforms are detected in parallel without interference

---

### Phase 2-8: High-Level Stories

**Phase 2: Recommender (24h)**

- [ ] **Story 2.1**: Implement project type detection (greenfield vs brownfield) (8h)
  - File: `install/lib/yanstaller/recommender.js`
  - Action: Check if agents already installed, analyze existing files
  - Tests: 4 tests (greenfield, brownfield with agents, brownfield without, edge cases)

- [ ] **Story 2.2**: Implement tech stack detection (8h)
  - Action: Scan for `package.json`, `requirements.txt`, `Gemfile`, `go.mod`, etc.
  - Tests: 6 tests (Node, Python, Ruby, Go, multi-stack, no stack)

- [ ] **Story 2.3**: Implement installation mode recommendation (8h)
  - Action: Recommend Full/Minimal/Custom based on project type + stack
  - Tests: 8 tests (combinations of greenfield/brownfield × beginner/expert × stack detected/not)

**Phase 3: Installer (75h)** ← **MOST COMPLEX** (revised from 56h - added buffer for multi-platform file system edge cases)

- [ ] **Story 3.1**: Implement 3 installation modes (Full/Minimal/Custom) (18h)
  - File: `install/lib/yanstaller/installer.js`
  - Action: Full = 29 agents, Minimal = 5 essentials, Custom = checklist 29 options
  - Tests: 12 tests (each mode × success/partial/fail × overwrite/skip)

- [ ] **Story 3.2**: Implement multi-platform installation (Copilot CLI stubs) (15h)
  - Action: Generate `.github/agents/*.md` stubs with YAML frontmatter, handle permissions
  - Tests: 8 tests (generate stub, frontmatter valid, multiple agents, overwrite detection, Windows paths)

- [ ] **Story 3.3**: Implement multi-platform installation (VSCode - reuse Copilot) (4h)
  - Action: Same as Copilot CLI (VSCode extension reads same stubs)
  - Tests: 2 tests (reuse mechanism, stub generation)

- [ ] **Story 3.4**: Implement multi-platform installation (Claude Code MCP) (15h)
  - Action: Update `claude_desktop_config.json` with MCP servers section - MUST handle malformed JSON parsing, merge strategy for existing keys
  - Tests: 10 tests (OS-specific paths, JSON merge, existing config, malformed JSON handling, backup, Windows NTFS permissions)

- [ ] **Story 3.5**: Implement multi-platform installation (Codex prompts) (10h)
  - Action: Generate `.codex/prompts/*.md` files with multi-OS path validation
  - Tests: 6 tests (generate prompt, multiple prompts, directory creation, permissions, Windows path length limits)

- [ ] **Story 3.6**: Implement conflict management (overwrite/skip/backup) (8h)
  - Action: Detect existing files, prompt user, execute choice, handle rollback
  - Tests: 8 tests (overwrite, skip, backup+overwrite, cancel, dry-run, partial failure, rollback trigger)

- [ ] **Story 3.7**: Multi-OS edge case handling (5h)
  - Action: Windows symlinks (require admin <Win10), path length limits (260 chars), macOS Gatekeeper, Linux permissions (chmod vs ACL)
  - Tests: 6 tests (each OS-specific edge case, permissions, symlink creation, path validation)

**Phase 4: Validator (32h)**

- [ ] **Story 4.1**: Implement 10 automated validation checks (20h)
  - File: `install/lib/yanstaller/validator.js`
  - Action: 10 checks (agents count, YAML frontmatter, MCP config, directories, permissions, paths, duplicates, dependencies, OS compatibility, backup)
  - Tests: 15 tests (each check pass/fail, edge cases)

- [ ] **Story 4.2**: Implement validation report generation (8h)
  - Action: Format results as JSON + formatted console output
  - Tests: 6 tests (all pass, some fail, all fail, JSON structure, console format, exit codes)

- [ ] **Story 4.3**: Integration with installer (4h)
  - Action: Call validator after installation, handle failures
  - Tests: 4 tests (validation pass → wizard, validation fail → troubleshoot, exit codes, rollback trigger)

**Phase 5: Troubleshooter (55h)** (revised from 40h - added multi-OS troubleshooting complexity)

- [ ] **Story 5.1**: Implement error diagnostics (24h)
  - File: `install/lib/yanstaller/troubleshooter.js`
  - Action: Diagnose 9 error types (Node version, Unix chmod vs Windows NTFS ACLs, paths, platforms, YAML, MCP config, Windows symlinks, macOS Gatekeeper, path length limits)
  - Tests: 16 tests (each error type × diagnosis correct, suggestions helpful, multi-OS variations)

- [ ] **Story 5.2**: Implement auto-fix capabilities (16h)
  - Action: Auto-fix when possible (inject YAML frontmatter, repair MCP config, fix Unix permissions, suggest Windows ACL fixes)
  - Tests: 12 tests (each auto-fix × dry-run, apply, success, fail, multi-OS)

- [ ] **Story 5.3**: Implement detailed logging (8h)
  - Action: Write logs to `.yanstaller-logs/install-{date}.log`
  - Tests: 4 tests (log creation, log content, log rotation, log permissions)

- [ ] **Story 5.4**: Multi-OS specific troubleshooting (7h)
  - Action: Windows-specific (symlink admin requirement, MAX_PATH limit), macOS-specific (Gatekeeper unsigned binaries), Linux distro variations (Ubuntu/Fedora/Arch)
  - Tests: 6 tests (each OS-specific diagnostic, error message clarity, repair suggestions)

**Phase 6: Backuper (24h)**

- [ ] **Story 6.1**: Implement backup before overwrite (12h)
  - File: `install/lib/yanstaller/backuper.js`
  - Action: Create `.yanstaller-backups/backup-{timestamp}/`, copy files, store metadata JSON
  - Tests: 8 tests (backup creation, metadata, multiple files, nested directories, permissions, error handling)

- [ ] **Story 6.2**: Implement restore functionality (8h)
  - Action: Restore files from backup directory
  - Tests: 6 tests (restore all, restore partial, restore with conflicts, metadata validation, cleanup after restore)

- [ ] **Story 6.3**: Implement backup cleanup (4h)
  - Action: Keep last 5 backups, delete older than 30 days, prompt confirmation
  - Tests: 4 tests (cleanup logic, date calculation, user prompt, dry-run)

**Phase 7: Interviewer (16h)**

- [ ] **Story 7.1**: Implement quick interview (5-7 questions) (8h)
  - File: `install/lib/yanstaller/interviewer.js`
  - Action: Ask 7 questions using `inquirer` (experience level, project type, stack, platforms, mode, agents, backup)
  - Tests: 4 tests (full interview, skip with --yes, default answers, validation)

- [ ] **Story 7.2**: Implement custom agent selection (8h)
  - Action: Display checklist of 29 agents with descriptions, allow multi-select
  - Tests: 4 tests (select all, select none, select some, cancel)

**Phase 8: Wizard (16h)**

- [ ] **Story 8.1**: Implement post-install wizard (12h)
  - File: `install/lib/yanstaller/wizard.js`
  - Action: Display success message, show 4 options (Create agent, Test install, Docs, Exit)
  - Tests: 6 tests (each option selected, display format, agent list, integration with BYAN)

- [ ] **Story 8.2**: Implement installation summary (4h)
  - Action: Display installed agents count by module (core, bmm, bmb, tea, cis), platforms detected
  - Tests: 2 tests (summary format, summary content)

## Additional Context

### Dependencies

**Production Dependencies (6)** :
- `inquirer@^8.2.5` : Interactive CLI prompts (interview, custom selection) - caret allows 8.x minor updates
- `fs-extra@^11.2.0` : Enhanced fs with promises (file operations, copy, backup) - caret allows 11.x minor updates
- `chalk@^4.1.2` : Terminal colors (logger utility wrapper) - caret allows 4.x minor updates
- `ora@^5.4.1` : Elegant spinners (progress tracking, installation feedback) - caret allows 5.x minor updates
- `js-yaml@^4.1.0` : YAML parser (frontmatter extraction, config loading) - caret allows 4.x minor updates
- `commander@^11.1.0` : CLI framework (arg parsing, subcommands) - caret allows 11.x minor updates

**Note on Version Pinning**: Caret ranges (`^`) allow minor version updates per semver. `package-lock.json` pins exact versions in production. If breaking changes occur in minor versions (rare but possible), lock file provides rollback path. Consider tilde ranges (`~`) for patch-only updates in v2.0 if strict stability needed.

**Development Dependencies (3)** :
- `jest@^29.0.0` : Testing framework (unit, integration, E2E)
- `eslint@^8.0.0` : Linting (eslint:recommended + custom rules)
- `prettier@^3.0.0` : Code formatting (implicit via style consistency)

**Dependency Rationale** :
- **Why inquirer v8** (not v9+) : v9 is ESM-only, project uses CommonJS (mantra #37 Ockham - avoid build step)
- **Why chalk v4** (not v5+) : v5 is ESM-only, same rationale
- **Why ora v5** (not v6+) : v6 is ESM-only, same rationale
- **Total bundle size** : 1.6 MB (10x lighter than Yeoman 15+ MB, Create React App 50+ MB)

**External Dependencies** :
- Node.js ≥18.0.0 (hard requirement, fail fast if not met)
- Git (recommended but optional, warning only if missing)
- 4 platforms (at least 1 recommended, 0 is non-blocking but suggests manual install)

**Task Dependencies** :
- **Phase 1** depends on: Architecture complete (✅), skeleton code (✅), CI/CD configured (✅)
- **Phase 2** depends on: Phase 1 complete (detector module functional)
- **Phase 3** depends on: Phase 1 & 2 complete (detection + recommendation inform installation)
- **Phase 4** depends on: Phase 1-3 complete (validation checks installed agents)
- **Phase 5** depends on: Phase 1-4 complete (troubleshooting diagnoses validation failures)
- **Phase 6** depends on: None (backup is independent, can be implemented anytime)
- **Phase 7** depends on: Phase 1-2 complete (interview needs detection + recommendation)
- **Phase 8** depends on: Phase 1-7 complete (wizard is final step after full installation)

### Testing Strategy

**TDD Approach (Strict)** :
1. **RED** : Write test FIRST (must FAIL initially, proves test works)
2. **GREEN** : Implement function to pass test (minimal code, no over-engineering)
3. **REFACTOR** : Clean code if needed (maintain passing tests)
4. **COMMIT** : Commit after each passing test (small, frequent commits)
5. **REPEAT** : Next function

**Test Pyramid (70/20/10)** :

**Unit Tests (70% - ~100 tests)** :
- Utilities : `os-detector`, `node-detector`, `git-detector`, `file-utils`, `logger`, `yaml-utils`, `config-loader`
- Platform detectors : `copilot-cli`, `vscode`, `claude-code`, `codex`
- Modules : `detector`, `recommender`, `installer`, `validator`, `troubleshooter`, `backuper`, `interviewer`, `wizard`
- Isolated functions : Mock all dependencies, test logic only
- Fast execution : < 1s total for all unit tests
- Focus : Happy path + error handling + edge cases

**Integration Tests (20% - ~30 tests)** :
- Detection flow : Full detection with real OS/Node (not mocked), multiple platforms
- Installation flow : Full install with real file system (temp directories), overwrite scenarios
- Validation flow : Full validation after install, multiple failure scenarios
- Orchestration : `index.js` coordinating multiple modules
- Medium execution : 5-10s total
- Focus : Module interactions, data flow, error propagation

**E2E Tests (10% - ~10 tests)** :
- Complete install : Detection → Interview → Backup → Install → Validate → Wizard
- Error scenarios : Node version too old, no platforms, permissions denied, validation failed
- Multi-platform : Install to 2+ platforms simultaneously
- Rollback : Installation failure → partial state → user prompted
- Slow execution : 30-60s total (real file operations, network timeouts)
- Focus : User journeys, real-world scenarios, exit codes

**Coverage Target** :
- **80% minimum** (enforced by `jest.config.js` threshold)
- Branches : 80% (all if/else paths)
- Functions : 80% (all exported functions)
- Lines : 80% (executable lines)
- Statements : 80% (all statements)

**CI/CD Testing** :
- **3 OS** : Ubuntu (Linux), Windows Server, macOS
- **3 Node versions** : 18.x (LTS), 20.x (LTS), 22.x (current)
- **9 combinations** : Every push tests all, job fails if any combo fails
- **Coverage upload** : Ubuntu + Node 20 only (Codecov integration)
- **Execution time** : Target < 5 min total (parallel jobs)

**Manual Testing** :
- **Phase 1** : Run `npm test` locally after each task, verify coverage ≥80%
- **Phase 2-8** : Run full install on local machine (greenfield project), verify wizard appears
- **Multi-OS (REQUIRED before release)** : Test Windows-specific issues on Windows VM:
  - NTFS ACL permissions (different from Unix chmod)
  - Path length limits (260 char MAX_PATH legacy limit, requires long path support registry setting)
  - Symlinks (require admin privileges on Windows <10 - `mklink` vs `ln -s`)
  - Backslash vs forward slash in paths (always use `path.join()` to avoid issues)
- **Multi-OS (REQUIRED before release)** : Test macOS Gatekeeper issues with unsigned binaries (Notarization not required for CLI tools, but Gatekeeper may block execution on first run - requires user approval)
- **Multi-OS (REQUIRED before release)** : Test Linux distro variations (Ubuntu, Fedora, Arch) for different default shells, package managers, permission models
- **Platforms** : Test each platform installation (Copilot CLI, VSCode, Claude, Codex) manually

**Test File Organization** :
```
__tests__/
├── utils/
│   ├── os-detector.test.js
│   ├── node-detector.test.js
│   ├── git-detector.test.js
│   ├── file-utils.test.js
│   ├── logger.test.js
│   ├── yaml-utils.test.js
│   └── config-loader.test.js
├── platforms/
│   ├── copilot-cli.test.js
│   ├── vscode.test.js
│   ├── claude-code.test.js
│   └── codex.test.js
├── yanstaller/
│   ├── detector.test.js
│   ├── recommender.test.js
│   ├── installer.test.js
│   ├── validator.test.js
│   ├── troubleshooter.test.js
│   ├── backuper.test.js
│   ├── interviewer.test.js
│   ├── wizard.test.js
│   └── index.test.js
├── integration/
│   ├── detection-flow.test.js
│   ├── installation-flow.test.js
│   └── validation-flow.test.js
└── e2e/
    ├── complete-install.test.js
    ├── error-scenarios.test.js
    └── multi-platform.test.js
```

**Mocking Strategy** :
- **Unit tests** : Mock all dependencies (jest.mock('module'))
- **Integration tests** : Real OS/Node/filesystem, mock network/external commands
- **E2E tests** : Real everything, temp directories for isolation

**Test Data** :
- Use temp directories (`os.tmpdir()`) for file operations, cleanup after tests
- Mock `process.version`, `os.platform()`, `os.homedir()` for multi-OS scenarios
- Mock `execSync` for Git/CLI detection (control output, simulate failures)

### Notes

**High-Risk Items (Pre-Mortem Analysis)** :

**Risk 1: Timeline Optimism (60% probability, HIGH impact - REVISED)** :
- **Issue** : Original 248h estimation was optimistic (30-40% underestimated for Phases 3 & 5)
- **Revision** : Updated to 280h (Phase 3: 56→75h, Phase 5: 40→55h) with 15% buffer for multi-OS debugging
- **Mitigation** : Prioritize Phase 1-3 (core functionality), Phase 4-8 can slip to v1.1 if needed
- **Contingency** : If behind schedule after Phase 3, ship v1.0 with minimal Phases 4-8 (basic validation, no troubleshooter/wizard)

**Risk 2: Multi-OS Edge Cases (40% probability, MEDIUM impact)** :
- **Issue** : Windows path separators, permissions, shell commands behave differently
- **Mitigation** : CI tests 3 OS automatically, use `path.join()` everywhere, `fs-extra` handles OS differences
- **Contingency** : If Windows-specific bugs found late, document workarounds in README, fix in v1.1

**Risk 3: Version Suffix Handling (30% probability, LOW impact)** :
- **Issue** : Node versions with suffixes (`18.0.0-beta`, `19.0.0-rc1`) may break semver comparison
- **Mitigation** : Implement regex to strip suffixes in Task 1.2, test edge cases
- **Contingency** : If complex cases found, consider adding `semver` package (15 KB, well-tested)

**Risk 4: Platform Detection Hangs (20% probability, MEDIUM impact)** :
- **Issue** : Platform detection (especially network-based) may hang indefinitely
- **Mitigation** : Add 10s timeout per platform using `Promise.race()` in Task 1.4
- **Contingency** : If timeouts insufficient, increase to 30s or add `--timeout` CLI flag

**Risk 5: Test Coverage Not Reaching 80% (25% probability, MEDIUM impact)** :
- **Issue** : Jest coverage threshold enforced, build fails if < 80%
- **Mitigation** : TDD from Day 1, check coverage after each task, focus on error paths
- **Contingency** : If coverage stuck at 75-79%, add tests for edge cases, or temporarily lower threshold to 75% (document technical debt)

**Known Limitations** :

- **No dry-run mode** : Out of scope for v1.0, users see confirmation prompts but no preview
  - Future : v1.1 can add `--dry-run` flag showing what would be installed

- **No auto-rollback** : Rollback Strategy Option B chosen (leave partial state), user must re-run or restore manually
  - Justification : Mantra #37 Ockham's Razor, installation = file copies (low risk), idempotent re-run possible
  - Future : v2.0 can add auto-rollback if users request it

- **No uninstall command** : Out of scope for v1.0, users must delete manually (`rm -rf _byan .github/agents`)
  - Future : v1.1 can add `yanstaller uninstall` command

- **No update command** : Out of scope for v1.0, users must re-run installer (overwrites existing)
  - Future : v1.1 can add `yanstaller update` command with smart merge

- **Single user only** : Multi-user installation (system-wide) not supported
  - Justification : BYAN agents are user-specific, global install not needed

- **No telemetry** : Privacy-first approach, no usage tracking or analytics
  - Justification : Mantra #39 Conséquences, user privacy > metrics

- **Test pyramid accuracy (Adversarial Finding F4)** : Phase 1 estimated ~70 unit tests. Phases 2-8 test counts are rough estimates at 30-40% of detailed coverage - requires detailed spec before implementation to finalize accurate test strategy and counts.

- **Skeleton "90% done" claims (Adversarial Finding F5)** : Files like `os-detector.js` have structure/JSDoc but need validation logic completion. Effort estimates account for full implementation, not just structure. "90% done" refers to boilerplate, not business logic.

**Future Considerations (Out of Scope but Worth Noting)** :

- **v1.1 Features** :
  - Uninstall command
  - Update command (smart merge existing configs)
  - Dry-run mode (`--dry-run` flag)
  - Retry logic with exponential backoff (network failures)
  - Better semver handling (use `semver` package if edge cases found)

- **v2.0 Features** :
  - Auto-rollback on installation failure (Option A)
  - Docker/container support (detect Docker environment)
  - Multi-user installation (system-wide /usr/local/lib/byan)
  - GUI wizard (Electron app, not CLI)
  - Additional platforms (Cursor AI, Windsurf, etc.)
  - Telemetry (opt-in, privacy-first)

- **Long-term Vision** :
  - BYAN ecosystem marketplace (discover community agents)
  - Agent version management (pin specific versions)
  - Cloud sync (agents + configs across machines)
  - Auto-updates (check for new BYAN releases)

**Open Questions (Resolved)** :

✅ **Q1: Use `semver` package or custom regex?**  
→ **Decision** : Custom regex for v1.0 (Task 1.2), consider `semver` if complex cases found

✅ **Q2: Add 10s timeout for platform detection?**  
→ **Decision** : YES, implement in Task 1.4 using `Promise.race()`

✅ **Q3: Dry-run mode in v1.0 or v1.1?**  
→ **Decision** : v1.1 (out of scope for v1.0)

✅ **Q4: Retry logic with backoff in v1.0 or v2.0?**  
→ **Decision** : v2.0 (nice-to-have, not critical)

**Mantras Applied (64 BMAD Mantras)** :

- **#37 Ockham's Razor** : Simplicité first (no Factory, no Singleton, no EventEmitter, no TypeScript, rollback Option B)
- **#4 Fail Fast** : Node version check first, exit 1 immediately if < 18
- **IA-1 Trust But Verify** : Validation module, 80% test coverage, CI multi-OS
- **#7 KISS** : 6 deps only (1.6 MB), TDD simple, no over-engineering
- **IA-16 Challenge Before Confirm** : Confirmation before overwrite, backup auto
- **#39 Conséquences** : Risk analysis, backup strategy, exit codes, privacy-first (no telemetry)
- **IA-23 No Emoji Pollution** : Zero emojis in code/commits (only CLI output via logger)
- **IA-24 Clean Code** : JSDoc complet, self-documenting, minimal comments

**Agent Creators** :
- **BYAN-TEST** : Intelligent interview (4 phases, 50 min), validation (96/100), Phase 1 prompt generation
- **Winston** : Architecture design (27 KB), design patterns justification, module skeleton creation (22 files)
- **Barry (Quick-Flow-Solo-Dev)** : Tech-spec generation, 8 stories Phase 1, acceptance criteria, testing strategy

**Session Context** :
- Session: `aa365659-1360-4832-abb1-1c16ed06022b`
- Checkpoints: 003 (YANSTALLER architecture complete)
- Date: 2026-02-03
