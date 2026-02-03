# YANSTALLER

**BYAN Integration Specialist - Smart Installer for Multi-Platform AI Agent Deployment**

Version: 1.0.0  
Created: 2026-02-03  
Methodology: Merise Agile + TDD + 64 Mantras

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation Modes](#installation-modes)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**YANSTALLER** is an intelligent installation agent for the BYAN (Builder of YAN) ecosystem. It automatically detects your development environment, recommends optimal configuration, installs relevant AI agents, and validates installation across 4 platforms:

- GitHub Copilot CLI
- VSCode Copilot Extension
- Claude Code
- OpenAI Codex

### What is BYAN?

BYAN is a modular AI-agent platform following **Merise Agile + TDD** methodology with **64 core mantras**. It provides specialized agents for the complete software development lifecycle:

- **BYAN** - Agent creator specialist
- **RACHID** - npm deployment expert
- **MARC** - Copilot CLI integration specialist
- **PATNOTE** - Update manager & conflict resolution
- **CARMACK** - Token optimizer
- **+24 additional specialized agents** (Analyst, Architect, Developer, QA, PM, etc.)

YANSTALLER makes installing and configuring BYAN effortless.

---

## Features

### Intelligent Detection
- Automatic OS detection (Windows, Linux, macOS)
- Node.js version validation (>= 18.0.0)
- Git presence check
- Multi-platform scanning (Copilot CLI, VSCode, Claude, Codex)

### Smart Recommendations
- Analyzes your project type (frontend/backend/fullstack)
- Recommends relevant agents based on tech stack
- Provides rationale for each recommendation

### Flexible Installation
- **Full Mode**: All 29 agents
- **Minimal Mode**: 5 essential agents (BYAN, RACHID, MARC, PATNOTE, CARMACK)
- **Custom Mode**: Select specific agents via interactive checklist

### Automated Validation
- Post-install checks (10 validation points)
- Agent detection tests (`/agent` command)
- YAML frontmatter validation
- Rollback on failure

### Troubleshooting
- Automatic error diagnosis
- Fix suggestions (automatic or guided)
- Backup and rollback capability

### Multi-Platform Support
- GitHub Copilot CLI (`.github/agents/*.md`)
- VSCode Copilot Extension (same format)
- Claude Code (MCP server config)
- OpenAI Codex (`.codex/prompts/*.md`)

---

## Prerequisites

### Required
- **Node.js >= 18.0.0** (LTS 20.x recommended)
  ```bash
  node --version
  # Should output v18.x.x or higher
  ```

### Recommended
- **Git** (for version control)
  ```bash
  git --version
  ```

### Platform-Specific

#### GitHub Copilot CLI
```bash
gh copilot --version
# Install: https://docs.github.com/copilot/github-copilot-in-the-cli
```

#### VSCode Copilot Extension
- VSCode installed
- GitHub Copilot extension installed
- Check: Extensions → Search "GitHub Copilot"

#### Claude Code
- Claude Desktop installed
- MCP server configuration available

#### OpenAI Codex
```bash
codex --version
# Install: npm install -g @openai/codex-cli
```

---

## Quick Start

### 1. Install via npx (Recommended)

```bash
npx create-byan-agent@latest
```

This launches YANSTALLER interactively. Follow the prompts:

1. **Platform Selection**: Choose your AI platform
2. **Configuration**: Enter your name and preferred language (French/English)
3. **Installation Mode**: Select Full/Minimal/Custom
4. **Validation**: Automated tests run
5. **Post-Install**: Create your first agent or exit

### 2. Platform-Specific Installation

#### GitHub Copilot CLI
```bash
npx create-byan-agent@latest --platform=copilot
```

#### VSCode
```bash
npx create-byan-agent@latest --platform=vscode
```

#### Claude Code
```bash
npx create-byan-agent@latest --platform=claude
```

#### Codex
```bash
npx create-byan-agent@latest --platform=codex
```

#### All Platforms
```bash
npx create-byan-agent@latest --platform=all
```

---

## Installation Modes

### Full Mode (29 Agents)
Installs all available agents:
- Core: BYAN, RACHID, MARC, PATNOTE, CARMACK
- BMM Module: Analyst, PM, Architect, Developer, SM, Quinn, UX Designer, Tech Writer
- BMB Module: Agent Builder, Module Builder, Workflow Builder
- TEA Module: Test Architecture Expert
- CIS Module: Brainstorming Coach, Problem Solver, Design Thinking Coach, Innovation Strategist, Presentation Master, Storyteller

**Use case**: Full BYAN experience, all capabilities

### Minimal Mode (5 Agents)
Installs essential agents only:
- **BYAN**: Create new agents
- **RACHID**: Deploy to npm
- **MARC**: Copilot CLI integration
- **PATNOTE**: Update management
- **CARMACK**: Token optimization

**Use case**: Quick start, lightweight setup

### Custom Mode (User Selection)
Interactive checklist to select specific agents.

**Use case**: Tailored installation for specific needs

---

## Platform Support

### GitHub Copilot CLI

**Installation Path**: `.github/agents/`

**Activation**:
```bash
copilot
# Type: /agent
# Select: yanstaller (or any installed agent)
```

**Example**:
```bash
copilot
> /agent
[Select yanstaller from list]
> Detect my environment and recommend configuration
```

**Files Created**:
- `.github/agents/yanstaller.md`
- `.github/agents/byan.md`
- `.github/agents/rachid.md`
- ... (one per agent)

---

### VSCode Copilot Extension

**Installation Path**: `.github/agents/` (same as Copilot CLI)

**Activation**:
1. Open VSCode
2. Open Copilot Chat: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (macOS)
3. Type: `@yanstaller [your request]`

**Example**:
```
@yanstaller validate my BYAN installation
```

**Configuration**: 
- No additional setup required
- Uses same `.github/agents/` structure

---

### Claude Code

**Installation Path**: MCP server configuration

**Activation**:
1. Start Claude Desktop
2. Type: `Use yanstaller to install BYAN`

**Configuration**:
```json
// ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "yanstaller": {
      "command": "node",
      "args": ["{project-root}/_bmad/bmb/agents/yanstaller-mcp-server.js"],
      "env": {
        "BYAN_PROJECT_ROOT": "{project-root}"
      }
    }
  }
}
```

**Restart Required**: Yes (after config changes)

---

### OpenAI Codex

**Installation Path**: `.codex/prompts/`

**Activation**:
```bash
codex
> Use yanstaller to configure BYAN in my project
```

**Example Commands**:
- "Detect my environment"
- "Install BYAN in minimal mode"
- "Validate BYAN installation"
- "Troubleshoot installation errors"

**Files Created**:
- `.codex/prompts/yanstaller.md`
- `.codex/prompts/byan.md`
- ... (one per agent)

---

## Usage

### Command Reference

#### Detect Environment
Scans your system and reports detected platforms.

**Copilot CLI**:
```bash
copilot
> /agent yanstaller
> [DET] Detect Environment
```

**Expected Output**:
```
✅ OS: Linux (Ubuntu 22.04)
✅ Node.js: 20.11.0
✅ Git: 2.43.0
✅ GitHub Copilot CLI: 1.234.5
⚠️  Claude Code: Not detected
⚠️  Codex: Not detected
```

---

#### Recommend Configuration
Analyzes your project and suggests agents.

**Copilot CLI**:
```bash
> [REC] Recommend Config
```

**Expected Output**:
```
Project Analysis:
- Type: Backend API
- Stack: Node.js, Express, PostgreSQL

Recommended Agents:
✅ BYAN (create agents)
✅ ARCHITECT (design patterns, API structure)
✅ DEV (implementation)
✅ QUINN (testing, quality assurance)
✅ MARC (Copilot CLI integration)

Rationale:
- Backend APIs benefit from architecture guidance
- DEV agent accelerates implementation
- QUINN ensures test coverage
```

---

#### Install BYAN

**Minimal Mode** (Recommended for beginners):
```bash
> [INST-MIN] Install Minimal
```

**Full Mode**:
```bash
> [INST-FULL] Install Full
```

**Custom Mode**:
```bash
> [INST-CUST] Install Custom
[Interactive checklist appears]
☑ BYAN
☑ RACHID
☑ ARCHITECT
☐ DEV
☐ QUINN
...
```

**Installation Process**:
1. Validates Node.js version
2. Creates `_bmad/` directory structure
3. Copies selected agent files
4. Generates stubs (`.github/agents/`)
5. Creates `config.yaml`
6. Runs validation tests
7. Displays success message

---

#### Validate Installation

**Copilot CLI**:
```bash
> [VAL] Validate Installation
```

**Validation Checks** (10 total):
1. ✅ _bmad/ directory exists
2. ✅ _bmad/bmb/agents/ contains agents
3. ✅ .github/agents/ contains stubs
4. ✅ config.yaml generated
5. ✅ YAML frontmatter valid
6. ✅ Agent detection works (`/agent`)
7. ✅ File permissions correct
8. ✅ Paths resolve correctly
9. ✅ No corruption detected
10. ✅ Platform-specific config valid

**Output**:
```
Validation Report:
✅ 10/10 checks passed

Installation Status: SUCCESS
Platform: GitHub Copilot CLI
Agents Installed: 5 (Minimal)
Ready to use!

Next Steps:
- Try: /agent byan
- Create your first agent
```

---

#### Troubleshoot

**Copilot CLI**:
```bash
> [TROUBLE] Troubleshoot
```

**Common Issues Diagnosed**:
- Permission errors
- Node.js version mismatch
- Missing Git
- Path resolution problems
- YAML syntax errors
- Network timeouts
- Platform not detected

**Example**:
```
Issue Detected:
⚠️  Agents not detected via /agent

Diagnosis:
Root cause: YAML frontmatter missing 'name' field in stubs

Fix (Automatic):
Regenerating .github/agents/ stubs with correct format...
✅ Fixed! Run validation again.
```

---

### Post-Install Wizard

After successful installation, YANSTALLER presents options:

```
✅ BYAN Installation Complete!

What would you like to do next?

[1] Create your first agent (launches BYAN Intelligent Interview)
[2] Test installation (runs validation)
[3] Exit (finish setup)

Your choice: _
```

**Option 1**: Launches BYAN agent for interactive agent creation (30-45 min guided interview)

**Option 2**: Runs validation tests again

**Option 3**: Exits YANSTALLER

---

## Troubleshooting

### Common Issues

#### 1. "Node.js version too old"

**Error**:
```
❌ Node.js 16.20.0 detected
✅ Node.js >= 18.0.0 required

Installation blocked.
```

**Fix**:
```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or upgrade via package manager
# Ubuntu/Debian
sudo apt update && sudo apt install nodejs

# macOS
brew upgrade node

# Windows
# Download installer from nodejs.org
```

---

#### 2. "Agents not detected via /agent"

**Symptoms**:
- `/agent` command shows no agents
- YANSTALLER installed successfully
- Files exist in `.github/agents/`

**Diagnosis**:
YAML frontmatter incorrect or missing.

**Fix**:
```bash
# Run validation
copilot
> /agent yanstaller
> [VAL] Validate Installation

# Check specific file
cat .github/agents/byan.md
# Should start with:
# ---
# name: "byan"
# description: "Agent creator specialist"
# ---
```

**Auto-fix**:
```bash
> [TROUBLE] Troubleshoot
# YANSTALLER will detect and fix YAML issues automatically
```

---

#### 3. "Permission denied creating _bmad/"

**Error**:
```
❌ Error: EACCES: permission denied, mkdir '_bmad'
```

**Fix**:

**Option 1** (Recommended):
```bash
# Grant permissions to current directory
chmod -R u+w .
```

**Option 2**:
```bash
# Run with sudo (not recommended for projects)
sudo npx create-byan-agent@latest
```

**Option 3**:
```bash
# Change ownership
sudo chown -R $USER:$USER .
```

---

#### 4. "Network timeout downloading templates"

**Error**:
```
⚠️  Network timeout downloading from npm
Retry 1/3...
```

**Fix**:

**Wait and Retry**: YANSTALLER automatically retries 3 times

**Manual Fix**:
```bash
# Use offline mode (if available)
npx create-byan-agent@latest --offline

# Or check npm registry
npm config get registry
# Should be: https://registry.npmjs.org/

# Or use different registry
npm config set registry https://registry.npmjs.org/
```

---

#### 5. "Multiple platforms detected, which one to use?"

**Scenario**:
```
Detected Platforms:
✅ GitHub Copilot CLI
✅ VSCode Copilot Extension
⚠️  Both use .github/agents/ - install once for both!
```

**Answer**: 
Copilot CLI and VSCode share the same structure. Install once with `--platform=copilot` and it works for both.

Claude and Codex require separate installations.

---

### Logs

**Location**: 
```
~/.byan/logs/yanstaller-{timestamp}.log
```

**View logs**:
```bash
tail -f ~/.byan/logs/yanstaller-latest.log
```

---

### Getting Help

1. **Check validation**:
   ```bash
   copilot
   > /agent yanstaller
   > [VAL] Validate Installation
   ```

2. **Run troubleshooter**:
   ```bash
   > [TROUBLE] Troubleshoot
   ```

3. **Open GitHub issue**:
   - Repository: https://github.com/yan/byan
   - Include: OS, Node.js version, error message, log file

4. **Community support**:
   - Discord: [link]
   - Stack Overflow: Tag `byan`

---

## Architecture

### Directory Structure (After Installation)

```
{project-root}/
├── _bmad/                          # BYAN core files
│   ├── _config/                    # Manifests
│   │   ├── agent-manifest.csv
│   │   ├── workflow-manifest.csv
│   │   └── task-manifest.csv
│   ├── _memory/                    # Agent persistent memory
│   ├── _output/                    # Generated artifacts
│   ├── bmb/                        # BMB module (builder)
│   │   ├── agents/
│   │   │   ├── byan.md
│   │   │   ├── rachid.md
│   │   │   └── ...
│   │   ├── workflows/
│   │   └── config.yaml             # Module configuration
│   ├── bmm/                        # BMM module (SDLC)
│   ├── core/                       # Core module
│   └── tea/                        # TEA module (testing)
├── .github/
│   └── agents/                     # Copilot CLI/VSCode stubs
│       ├── yanstaller.md
│       ├── byan.md
│       └── ...
├── .codex/                         # Codex (if installed)
│   └── prompts/
│       ├── yanstaller.md
│       └── ...
└── package.json                    # npm scripts added
```

---

### Configuration File

**Location**: `_bmad/bmb/config.yaml`

**Content**:
```yaml
# BMB Module Configuration
# Generated by YANSTALLER

user_name: "YourName"
communication_language: "Francais"  # or "English"
document_output_language: "Francais"
output_folder: "{project-root}/_bmad-output"
bmb_creations_output_folder: "{project-root}/_bmad-output/bmb-creations"

# Platform installed
platform: "copilot"  # or "vscode", "claude", "codex", "all"

# Installation metadata
installed_by: "yanstaller"
installed_at: "2026-02-03T15:00:00.000Z"
version: "1.0.0"
mode: "minimal"  # or "full", "custom"
agents_installed:
  - "byan"
  - "rachid"
  - "marc"
  - "patnote"
  - "carmack"
```

**Editing**: Safe to edit manually. YANSTALLER preserves custom settings during updates.

---

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/yan/byan.git
cd byan/install

# Install dependencies
npm install

# Link for local testing
npm link

# Test installation
npx create-byan-agent@latest
```

---

### Running Tests

```bash
# Unit tests
npm test

# Integration tests (multi-OS via Docker)
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

---

### Contributing

We welcome contributions!

**Areas for contribution**:
- Platform support (new AI tools)
- OS compatibility improvements
- Documentation translations
- Bug fixes
- Feature requests

**Process**:
1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

**Commit Convention** (no emojis):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

---

## Mantras Applied

YANSTALLER follows **8 core mantras** from the 64 BMAD mantras:

1. **IA-1: Trust But Verify** - Validate every step
2. **#37: Ockham's Razor** - Simplicity first (Minimal mode default)
3. **IA-16: Challenge Before Confirm** - Ask before critical actions
4. **#39: Consequences Evaluation** - 10-dimension checklist before risky operations
5. **#4: Fail Fast, Fail Visible** - Early error detection
6. **#7: KISS** - Zero friction UX
7. **IA-3: Explain Reasoning** - Transparent decisions
8. **IA-23: No Emoji Pollution** - Code/commits emoji-free

---

## FAQ

### Q: Can I install BYAN without YANSTALLER?
**A**: Yes, manual installation possible but not recommended. YANSTALLER handles platform detection, validation, and troubleshooting automatically.

### Q: Does YANSTALLER work offline?
**A**: Partially. Initial download requires internet (npm). Once installed, agents work offline.

### Q: Can I update BYAN later?
**A**: Yes! Run:
```bash
npx create-byan-agent@latest
# YANSTALLER detects existing installation
# Options: [Update] [Overwrite] [Cancel]
```

### Q: What if I only want specific agents?
**A**: Use Custom mode during installation, or install Minimal and add agents later via BYAN.

### Q: Does YANSTALLER work in monorepos?
**A**: Yes! Install at repository root or workspace root.

### Q: Can I use multiple platforms simultaneously?
**A**: Yes! Install with `--platform=all`. Copilot CLI + VSCode share config. Claude and Codex are separate.

---

## License

MIT License - See LICENSE file for details

---

## Links

- **Repository**: https://github.com/yan/byan
- **Documentation**: https://byan.dev/docs
- **npm Package**: https://www.npmjs.com/package/create-byan-agent
- **Changelog**: https://github.com/yan/byan/blob/main/CHANGELOG.md
- **Issues**: https://github.com/yan/byan/issues
- **Discord**: [Community link]

---

## Credits

**Created by**: Yan + BYAN-TEST Agent  
**Methodology**: Merise Agile + TDD + 64 Mantras  
**Inspiration**: Building better tools for AI-assisted development

---

**Happy agent building!** 🏗️
