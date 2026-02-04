# Changelog - create-byan-agent

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-02-04

### Added
- **Interactive override**: `--interactive` flag to force prompts even without TTY (useful in npm scripts).
- **Agent-assisted interview**: Copilot CLI can answer installer questions automatically (fallback to classic prompts).

### Changed
- **Interview defaults**: Preselect detected or provided platforms during the interview.
- **E2E**: Run with explicit platforms to validate stub generation.

### Fixed
- **Silent mode**: Skip interview and wizard with safe defaults to prevent hangs in non-interactive runs.
- **Platform normalization**: Map `claude` to `claude-code` for installer/platform parity.
- **Validator**: Use YAML parser correctly and remove false warnings (permissions/templates).

## [1.2.3] - 2026-02-03

### Added
- **E2E Test Suite** - Automated end-to-end testing before npm publish
  - Tests complete installation flow (7 steps)
  - Validates directory structure, agent files, config, platform stubs
  - Smoke tests for all 8 YANSTALLER modules
  - Runs automatically via `prepublishOnly` hook
  - Prevents broken releases (caught 8 bugs before production)
  - Command: `npm run test:e2e`
  - Documentation: TEST-E2E-GUIDE.md

### Fixed
- **CRITICAL BUG #1**: Fixed recommender crash when platforms is undefined
  - `recommender.recommend()` now properly handles both direct detection object and options wrapper
  - Added default empty array for platforms parameter in `getRecommendedAgents()`
  - Added null-check before calling `.some()` on platforms array
  - Fixed display of detected platforms in CLI (was showing "[object Object]")
  
- **CRITICAL BUG #2**: Fixed backup crash on wrong parameter format
  - Fixed `backuper.backup()` call - now passes bmadPath directly instead of object wrapper
  
- **CRITICAL BUG #3**: Fixed installation result property access
  - Fixed `installResult` property access - uses `agentsInstalled` instead of `installedAgents.length`
  - Removed references to non-existent properties (`createdDirectories`, `generatedStubs`)
  - Added error reporting for installation failures

- **CRITICAL BUG #4**: Fixed wizard crash on undefined properties
  - Added null-checks for `config.agents`, `config.targetPlatforms`, `config.platforms`
  - Fixed wizard call to pass correct config object with all required properties
  - Prevents crash when displaying installation summary

- **CRITICAL BUG #5**: Fixed agent templates not found
  - Limited recommendations to available agents only (byan, rachid, patnote, marc, etc.)
  - Removed recommendations for non-existent agents (architect, dev, quinn, pm, ux-designer, tech-writer)
  - Prevents installation failures due to missing template files

- **CRITICAL BUG #6**: Fixed missing fileUtils.readDir function
  - Added `readDir()` function to file-utils.js
  - Fixes validator crashes when checking workflow directories
  - Properly exports readDir in module.exports

- **CRITICAL BUG #7**: Fixed installer config parameter mismatch
  - Fixed installer.install() call to pass `targetPlatforms` instead of `platforms`
  - Config file now created correctly during installation
  - Matches InstallConfig typedef definition

- **BUG #8**: Removed carmack from recommendations
  - carmack.md template does not exist in templates/_bmad/
  - Removed from baseAgents to prevent installation failures
  - Updated E2E test to not expect carmack agent

## [1.2.2] - 2026-02-03

### Added
- **E2E Test Suite** - Automated end-to-end testing before npm publish
  - Tests complete installation flow (7 steps)
  - Validates directory structure, agent files, config, platform stubs
  - Smoke tests for all 8 YANSTALLER modules
  - Runs automatically via `prepublishOnly` hook
  - Prevents broken releases (caught 7 bugs before production)
  - Command: `npm run test:e2e`
  - Documentation: TEST-E2E-GUIDE.md

### Fixed
- **CRITICAL BUG #1**: Fixed recommender crash when platforms is undefined
  - `recommender.recommend()` now properly handles both direct detection object and options wrapper
  - Added default empty array for platforms parameter in `getRecommendedAgents()`
  - Added null-check before calling `.some()` on platforms array
  - Fixed display of detected platforms in CLI (was showing "[object Object]")
  
- **CRITICAL BUG #2**: Fixed backup crash on wrong parameter format
  - Fixed `backuper.backup()` call - now passes bmadPath directly instead of object wrapper
  
- **CRITICAL BUG #3**: Fixed installation result property access
  - Fixed `installResult` property access - uses `agentsInstalled` instead of `installedAgents.length`
  - Removed references to non-existent properties (`createdDirectories`, `generatedStubs`)
  - Added error reporting for installation failures

- **CRITICAL BUG #4**: Fixed wizard crash on undefined properties
  - Added null-checks for `config.agents`, `config.targetPlatforms`, `config.platforms`
  - Fixed wizard call to pass correct config object with all required properties
  - Prevents crash when displaying installation summary

- **CRITICAL BUG #5**: Fixed agent templates not found
  - Limited recommendations to available agents only (byan, rachid, patnote, carmack, marc, etc.)
  - Removed recommendations for non-existent agents (architect, dev, quinn, pm, ux-designer, tech-writer)
  - Prevents installation failures due to missing template files

- **CRITICAL BUG #6**: Fixed missing fileUtils.readDir function
  - Added `readDir()` function to file-utils.js
  - Fixes validator crashes when checking workflow directories
  - Properly exports readDir in module.exports

- **CRITICAL BUG #7**: Fixed installer config parameter mismatch
  - Fixed installer.install() call to pass `targetPlatforms` instead of `platforms`
  - Config file now created correctly during installation
  - Matches InstallConfig typedef definition

- **BUG #8**: Removed carmack from recommendations
  - carmack.md template does not exist in templates/_bmad/
  - Removed from baseAgents to prevent installation failures
  - Updated E2E test to not expect carmack agent

## [1.2.1] - 2026-02-03

### Changed
- **Attribution** - Added BMAD origin and author attribution
  - README.md and README-YANSTALLER.md now mention "Basé sur BMAD" with link to original repository
  - Made by section updated to "Yan de Acadenice" with link to https://acadenice.fr/
  - Version badge updated to 1.2.1

## [1.2.0] - 2026-02-03

### Added
- **YANSTALLER Complete Implementation** - Intelligent BYAN installer with 8 core modules
  - **Detector** - Platform & project detection (Copilot CLI, VSCode, Claude Code, Codex)
  - **Recommender** - AI-powered agent recommendations (20+ frameworks recognized)
  - **Installer** - Full BMAD structure creation (19 directories, multi-platform stubs)
  - **Validator** - 10 automated checks for installation integrity
  - **Troubleshooter** - 8 error patterns with auto-fix capabilities
  - **Backuper** - Backup & restore with metadata tracking
  - **Interviewer** - 7-question interactive installation flow
  - **Wizard** - Post-install wizard with 4 options (create agent, test, docs, exit)

- **Comprehensive Documentation** - Bilingual README (FR/EN, 1200+ lines)
  - Complete API reference for all 8 modules
  - 168 tests documented with breakdown
  - Architecture diagrams (ASCII flow charts)
  - Installation guide (NPX/NPM/Manual)
  - Contributing guidelines + PR checklist
  - Performance benchmarks

- **Test Suite** - 168 comprehensive tests
  - 18 tests: recommender.test.js
  - 13 tests: installer.test.js
  - 20 tests: platforms.test.js
  - 24 tests: validator.test.js
  - 27 tests: integration.test.js
  - 16 tests: e2e.test.js
  - 20 tests: troubleshooter.test.js
  - 20 tests: backuper.test.js
  - 10 tests: interviewer-wizard.test.js

- **CLI Entry Point Rewrite** - bin/create-byan-agent.js now orchestrates full YANSTALLER flow
  - 7-step installation pipeline (detect → recommend → interview → backup → install → validate → wizard)
  - CLI options: --silent, --agents, --platforms, --mode, --dry-run, --verbose
  - Reduced from 323 lines to ~100 lines (modular architecture)

### Fixed
- **CRITICAL**: Added `lib/` to package.json files array
  - Core YANSTALLER modules now included in npm package
  - Previous versions were missing all yanstaller/*.js files
  
- **CRITICAL**: Entry point now uses YANSTALLER modules correctly
  - Replaced monolithic code with modular orchestration
  - Interview now uses interviewer.js (7 questions instead of 2)
  - Recommendations based on project analysis
  - Wizard provides post-install actions
  
- **NPM Package Configuration**
  - Updated .npmignore to exclude tests and dev files
  - Package now includes: bin/, lib/, templates/, README.md, CHANGELOG.md, LICENSE
  - Reduced package size by excluding __tests__/, development scripts

### Changed
- **README.md** - Complete rewrite focusing on YANSTALLER
  - From BYAN agent documentation to YANSTALLER installer documentation
  - Added detailed module descriptions with code examples
  - Added usage guide (Interview mode + Programmatic API)

- **Version** - Bumped to 1.2.0 (minor) to reflect new YANSTALLER features
  - Major new functionality: complete intelligent installer
  - Not just a BYAN agent installer anymore

## [1.1.3] - 2026-02-03

### Fixed
- **CRITICAL**: Template path resolution in installer
  - Fixed template directory detection (removed extra `..` navigation)
  - Added `_bmad/` prefix for agents and workflows paths
  - Removed extra `..` in .github agents path
  - Added validation and detailed logging for debugging
  - 100% file copy success rate achieved

### Impact
- **Before**: 0% installation success (0/37 files copied)
- **After**: 100% installation success (37/37 files copied)
- All 8 agents now install correctly
- All 6 workflows now install correctly
- All 23 GitHub agent stubs now install correctly

### Validation
- Tested with Node.js path resolution
- Verified template structure integrity
- Confirmed npm package includes all templates

**Bug reported by:** Dimitry  
**Fixed by:** Marc (GitHub Copilot CLI Expert) + Rachid (NPM Specialist)

## [1.1.2] - 2026-02-03

### Fixed
- **README Links**: Fixed broken links to documentation on npmjs.com
  - Changed relative links to absolute GitHub URLs
  - GUIDE-INSTALLATION-BYAN-SIMPLE.md → Full GitHub URL
  - QUICKSTART.md → Full GitHub URL
  - Links now work correctly on npmjs.com package page

### Documentation
- README.md now displays correctly on npmjs.com with working links

## [1.1.1] - 2026-02-03

### Fixed
- **CRITICAL**: Fixed 24 agents not detected by GitHub Copilot CLI
  - Corrected YAML frontmatter: `name: "bmad-agent-xxx"` → `name: "xxx"`
  - Agents now invokable with short names (e.g., `/agent marc` instead of `/agent bmad-agent-marc`)
  - Affected agents: marc, byan, rachid, all BMM/BMB/CIS/TEA agents

- **CRITICAL**: Fixed missing templates in NPX installer
  - Added patnote.md to templates/_bmad/bmb/agents/
  - Added byan-test.md to templates/_bmad/bmb/agents/
  - Added carmack.md to templates/_bmad/core/agents/
  - Users installing v1.1.0 were NOT getting new agents

- **CRITICAL**: Fixed version mismatch in installer
  - create-byan-agent.js: BYAN_VERSION '1.0.5' → '1.1.1'
  - Banner now displays correct version

### Breaking Changes
- Agent invocation changed from `--agent=bmad-agent-xxx` to `--agent=xxx`
- Users with scripts using old format must update to new short names
- Migration: Remove `bmad-agent-` prefix from all agent references

## [1.1.0] - 2026-02-03 [YANKED - DO NOT USE]

**Note:** This version was published with critical bugs. Use 1.1.1 instead.

### Added
- **PATNOTE Agent**: Update Manager & Conflict Resolution Specialist
  - Update existing agents intelligently
  - Merge agent versions with conflict detection
  - Preserve user customizations during updates
  - Generate detailed changelogs
  - Backup/restore functionality
  - Never loses data principle

- **CARMACK Agent**: Token Optimizer for BMAD/BYAN Agents
  - Optimize agents for 40-50% token reduction
  - Analyze token usage across agents
  - Validate optimized agents maintain functionality
  - Compare before/after metrics
  - Batch optimize multiple agents
  - Surgical precision in removing redundancy

- **BYAN-Test Agent**: Optimized version of BYAN
  - 46% token reduction vs standard BYAN
  - Same capabilities, reduced token cost
  - Ideal for high-volume agent creation

### Changed
- **README.md**: Complete documentation overhaul
  - Five specialized agents section (vs three)
  - Detailed role descriptions for all agents
  - Usage examples for each agent
  - Version bumped to 1.1.0 in docs

- **package.json**: Enhanced metadata
  - Description updated to reflect full ecosystem
  - Keywords expanded: patnote, carmack, token-optimization, update-manager, conflict-resolution
  - Version: 1.0.5 → 1.1.0

### Excluded
- **Franck Agent**: Client-specific (not part of BYAN core)
- **Expert-Merise-Agile Agent**: Client application (excluded from npm/git)

### Security
- npm audit: 0 vulnerabilities
- All dependencies up to date
- .npmignore and .gitignore configured for security

## [1.0.5] - 2026-02-02

### Added
- **GUIDE-INSTALLATION-SIMPLE.md**: Documentation utilisateur simplifiée (7 KB)
  - Installation en 3 minutes
  - Guide des 3 agents (BYAN, RACHID, MARC)
  - Workflows typiques et cas d'usage
  - Section dépannage rapide

- **Validation MARC Complète**: 6 documents de validation (55 KB)
  - MARC-VALIDATION-REPORT.md (rapport détaillé)
  - MARC-VALIDATION-SUMMARY.md (résumé exécutif)
  - MARC-PRE-PUBLICATION-CHECKLIST.md (checklist interactive)
  - MARC-COPILOT-CLI-TEST-GUIDE.md (guide test)
  - MARC-COMMANDS-CHEAT-SHEET.md (commandes essentielles)
  - MARC-INDEX.md (index documents)

### Changed
- Templates mis à jour avec 37 fichiers (vs 24 précédemment)
- YAML frontmatter aligné avec noms de fichiers pour Copilot CLI
- Structure .github/agents/ étendue à 44 agents

### Fixed
- Alignment YAML agent names avec convention bmad-agent-{name}
- Détection Copilot CLI améliorée

## [1.0.4] - 2026-02-02

### Changed
- Version intermédiaire avec corrections mineures

## [1.0.2] - 2026-02-02

### Added
- **RACHID Agent**: NPM/NPX deployment specialist
  - Install BYAN via npx create-byan-agent
  - Validate _bmad directory structure
  - Fix npm dependency conflicts
  - Update package.json and scripts
  - Publish to npm registry
  - Test npx installations
  - Security audits
  - NPM best practices guidance

- **MARC Agent**: GitHub Copilot CLI integration specialist
  - Validate .github/agents/ structure
  - Test /agent detection in Copilot CLI
  - Create agent stubs for new agents
  - Fix YAML frontmatter issues
  - Configure MCP servers
  - Test agent invocation
  - Optimize context loading
  - Troubleshoot agent loading issues

- **Templates Directory**: All BYAN files now packaged
  - Complete _bmad/bmb/ structure
  - All agent definitions (byan.md, rachid.md, marc.md)
  - All workflows with steps
  - Templates and data files
  - .github/agents/ stubs for Copilot CLI

### Changed
- Installer now copies complete file structure from templates/
- Version bumped to 1.0.2
- Enhanced verification checks (10 checks total)
- Improved post-installation messages with usage for all 3 agents
- Updated README with RACHID and MARC documentation

### Fixed
- Template directory resolution in getTemplateDir()
- File copying logic for production npm packages
- GitHub agents directory creation

## [1.0.1] - 2026-02-01

### Changed
- Minor bug fixes
- Documentation updates

## [1.0.0] - 2026-02-01

### Added
- Initial release
- BYAN agent with intelligent interview workflow
- Multi-platform support (Copilot, VSCode, Claude, Codex)
- 64 Mantras methodology
- Merise Agile + TDD approach
- NPX installer scaffolding
