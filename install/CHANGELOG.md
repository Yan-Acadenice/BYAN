# Changelog - create-byan-agent

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
