# Changelog - create-byan-agent

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
