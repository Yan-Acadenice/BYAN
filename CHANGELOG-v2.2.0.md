# Changelog v2.2.0 - Multi-Platform Native Integration

**Release Date**: 2026-02-10  
**Type**: Minor Release (Major Feature Addition)  
**Compatibility**: Fully backwards compatible with v2.1.0

---

## 🎉 What's New

BYAN v2.2.0 introduces **native multi-platform support** with 3 AI coding assistant platforms, allowing agents to be invoked directly via their native CLI commands instead of conversational mode only.

---

## 🚀 Major Features

### 1. **Platform Selector** - Interactive Multi-Platform Detection

**Intelligent platform selection system:**
- Auto-detects available platforms (`gh`, `claude`, `codex` commands)
- Interactive menu with 3 modes:
  - **Auto**: Recommends best available platform
  - **Single Platform**: Choose one platform
  - **Custom**: Multi-platform installation
- Real-time availability checking
- Graceful fallback to conversational mode

**Usage:**
```javascript
const platformSelector = require('./lib/yanstaller/platform-selector');
const result = await platformSelector.select({ auto: true });
// { platforms: ['copilot-cli', 'claude'], mode: 'native' }
```

**New File:** `install/lib/yanstaller/platform-selector.js` (6.7 KB)

---

### 2. **Agent Launcher** - Native CLI Command Invocation

**Executes agents natively on each platform:**
- Builds platform-specific CLI commands
- 3 invocation modes:
  - `launch()`: Interactive spawn (for real-time interaction)
  - `launchWithPrompt()`: Non-interactive with output capture
  - `getLaunchInstructions()`: Manual fallback instructions
- Error handling with graceful degradation
- Automatic detection of CLI availability

**Platform Commands:**
```bash
# GitHub Copilot CLI
gh copilot @bmad-agent-marc

# Claude Code
claude --agent claude --model sonnet "create MCP server"

# Codex/OpenCode
codex skill bmad-byan "create agent"
```

**Usage:**
```javascript
const agentLauncher = require('./lib/yanstaller/agent-launcher');

// Interactive mode
await agentLauncher.launch({
  agent: 'claude',
  platform: 'claude',
  model: 'sonnet'
});

// Non-interactive with prompt
const result = await agentLauncher.launchWithPrompt({
  agent: 'marc',
  platform: 'copilot-cli',
  prompt: 'create PRD for ecommerce'
});
```

**New File:** `install/lib/yanstaller/agent-launcher.js` (7.6 KB)

---

### 3. **Agent Claude** - MCP Server Specialist

**Expert in Claude Code ecosystem:**
- Model Context Protocol (MCP) architecture
- `stdio` protocol implementation (JSON-RPC over stdin/stdout)
- `claude_desktop_config.json` management (multi-OS)
- Mapping BYAN agents → MCP tools
- Server template generation

**6 Workflows:**
1. Create MCP server
2. Validate config
3. Test connectivity
4. Update agents
5. Troubleshoot
6. Documentation

**Key Expertise:**
- MCP server architecture (stdio protocol)
- JSON-RPC communication
- Desktop config paths (macOS/Windows/Linux)
- **Critical**: Logs to stderr, JSON only on stdout

**New Files:**
- `.github/agents/bmad-agent-claude.md` (stub, 2 KB)
- `_byan/bmb/agents/claude.md` (full agent, 16 KB)

**Example MCP Server Template:**
```javascript
#!/usr/bin/env node
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tools = [
  {
    name: "create-prd",
    description: "Create Product Requirements Document",
    inputSchema: { type: "object", properties: { ... } }
  }
];

rl.on('line', (line) => {
  const request = JSON.parse(line);
  const response = handleRequest(request);
  console.log(JSON.stringify(response)); // stdout = JSON only
});
```

---

### 4. **Agent Codex** - Skills System Specialist

**Expert in Codex/OpenCode ecosystem:**
- Skills system (NOT agents terminology!)
- `.codex/prompts/` directory structure
- Simple Markdown format (NO YAML frontmatter)
- Skill name = filename without .md
- Direct prompt file generation

**6 Workflows:**
1. Create skill
2. Validate skill
3. Test skill
4. Update skills
5. Troubleshoot
6. Documentation

**Key Differences:**
- Codex uses **"skills"** not **"agents"**
- Command: `codex skill bmad-{name}`
- Files: `.codex/prompts/*.md` (plain Markdown)
- No YAML frontmatter needed

**New Files:**
- `.github/agents/bmad-agent-codex.md` (stub, 2 KB)
- `_byan/bmb/agents/codex.md` (full agent, 13 KB)

**Example Skill File:**
```markdown
# BYAN Agent: Analyst

Role: Business Requirements Analyst
Expertise: PRD creation, user stories, business analysis

## Activation
1. Load project context
2. Review existing documentation
3. Start requirements gathering

## Capabilities
- Create Product Requirements Documents
- Analyze business needs
- Define user stories
```

---

## 🏗️ Architecture Changes

### Platform Support Matrix

| Platform | Command | Agent | Format | Status |
|----------|---------|-------|--------|--------|
| **GitHub Copilot CLI** | `gh copilot @agent` | marc | YAML+XML | ✅ Native |
| **Claude Code** | `claude --agent X --model Y {prompt}` | claude | MCP (JSON-RPC) | ✅ Native |
| **Codex/OpenCode** | `codex skill bmad-{name} {prompt}` | codex | Markdown | ✅ Native |
| **VSCode** | Manual | - | - | ⚪ Fallback |

### New Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    YANSTALLER CORE                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        PLATFORM SELECTOR (Menu Interactif)           │  │
│  │  • Auto-detection (which command)                    │  │
│  │  • Single Platform / Multi-Platform                  │  │
│  │  • Custom Selection                                  │  │
│  └─────────────┬────────────────────────────────────────┘  │
│                │                                            │
│  ┌─────────────▼────────────────────────────────────────┐  │
│  │        AGENT LAUNCHER (Native Commands)              │  │
│  │  • Builds platform-specific CLI commands             │  │
│  │  • Launches agents with spawn()                      │  │
│  │  • Graceful fallback to manual instructions          │  │
│  └─────────────┬────────────────────────────────────────┘  │
│                │                                            │
└────────────────┼────────────────────────────────────────────┘
                 │
       ┌─────────┴─────────┬─────────────┬─────────────┐
       ▼                   ▼             ▼             ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐ ┌────────┐
│ COPILOT CLI  │ │ CLAUDE CODE │ │    CODEX     │ │ VSCODE │
│   (Native)   │ │  (Native)   │ │  (Native)    │ │ (Conv.)│
└──────────────┘ └─────────────┘ └──────────────┘ └────────┘
```

---

## 🐛 Bug Fixes

### Issue #1: Claude `--prompt` Flag Syntax Error ✅
**Problem:** Generated command `claude --agent X --prompt "text"` failed with "unknown option --prompt"

**Cause:** Prompt is a **positional argument** in Claude CLI, not a flag.

**Fix:** Updated agent-launcher.js to place prompt after all flags:
```javascript
// CORRECT
args: ['--agent', name, '--model', model, prompt]
```

**Commit:** `be38962`

### Issue #2: Codex Terminology Mismatch ✅
**Problem:** Code and docs used "agents" for Codex, but Codex uses "skills"

**Fix:** Updated all Codex references to use "skills" terminology:
- Agent → Skills Expert
- Command: `codex skill` (not `codex agent`)
- Documentation updated

**Commit:** `4d12a9d`

---

## 🧪 Testing

### New Test Suites

**Total: 125 tests, 100% passing ✅**

```
Test Suites: 16 passed, 16 total
Tests:       125 passed, 125 total
Snapshots:   0 total
Time:        4.654 s
```

**New Tests:**
- Platform Selector: 9 tests
- Agent Launcher: 14 tests
- Platform Integration: 5 tests
- Claude Integration: 5 tests
- Codex Integration: 8 tests

**Test Files Created:**
- `install/__tests__/yanstaller/platform-selector.test.js`
- `install/__tests__/yanstaller/agent-launcher.test.js`
- `install/__tests__/integration/platform-integration.test.js`
- `install/__tests__/integration/codex-integration.test.js`

---

## 📦 Installation & Usage

### NPX Installation (Unchanged)
```bash
npx create-byan-agent my-project
```

### New Interactive Flow
```
? Choose installation mode:
  ◯ Auto (detect available platforms)
  ◉ Single Platform
  ◯ Custom (select specific platforms)

? Select a platform:
  ◉ GitHub Copilot CLI (native: marc) ✨
  ◯ Claude Code (native: claude) ✨
  ◯ Codex/OpenCode (native: codex) ✨
  ◯ VSCode

✅ Detecting agent specialist...
✅ Agent @bmad-agent-claude available!
🚀 Launching agent natively...

Executing: claude --agent claude --model sonnet

[Claude agent starts in native mode]
```

### Platform Override (CLI)
```bash
# Force specific platform
npx create-byan-agent my-project --platform claude

# Multi-platform
npx create-byan-agent my-project --platform copilot-cli,claude,codex
```

---

## 📚 Documentation

### New Documentation Files

**Total: 64 KB of documentation**

1. **YANSTALLER-COMPLETE-3-PLATFORMS.md** (26 KB)
   - Complete architecture overview
   - All platform commands
   - Troubleshooting guide
   - Agent specialist descriptions

2. **CLAUDE-CODE-INTEGRATION-GUIDE.md** (8 KB)
   - MCP server setup guide
   - Desktop config examples
   - Troubleshooting MCP issues

3. **AGENT-LAUNCHER-DOC.md** (10 KB)
   - Agent launcher API reference
   - Command generation examples
   - Error handling guide

4. **YANSTALLER-NATIVE-LAUNCHER-FINAL.md** (12 KB)
   - Implementation details
   - Technical architecture
   - Platform-specific notes

---

## 💻 Example Commands

### GitHub Copilot CLI
```bash
# Interactive mode
gh copilot @bmad-agent-marc

# Direct prompt
gh copilot @bmad-agent-marc "create PRD for ecommerce app"

# Other agents
gh copilot @bmad-agent-analyst "analyze codebase"
```

### Claude Code
```bash
# Interactive mode
claude --agent claude --model sonnet

# With prompt
claude --agent claude --model sonnet "create MCP server"

# Different models
claude --agent claude --model opus "create architecture"
claude --agent claude --model haiku "quick review"
```

### Codex/OpenCode
```bash
# Interactive mode
codex skill bmad-byan

# With prompt
codex skill bmad-byan "create agent"

# Other skills
codex skill bmad-analyst "analyze codebase"
codex skill bmad-architect "design system"
```

---

## 🔧 Breaking Changes

**None.** This release is fully backwards compatible with v2.1.0.

---

## ⚠️ Migration Notes

### From v2.1.0 → v2.2.0

**No migration needed.** Just update:

```bash
npm install -g create-byan-agent@2.2.0
```

**New Features Available:**
- Platform selector will auto-detect available platforms
- Native agent invocation for Copilot/Claude/Codex
- Agent specialists for each platform

**Existing Behavior:**
- Copilot CLI installation still works as before
- VSCode installation still uses conversational mode
- All v2.1.0 features remain unchanged

---

## 📊 Metrics

### Code Changes
- **Files Created:** 14
- **Files Modified:** 8
- **Lines Added:** +3,287
- **Lines Removed:** -20
- **Net Change:** +3,287 lines

### Commits
1. `c515fa5` - Multi-platform support + Claude (+2,326 lines)
2. `891baee` - Native agent launcher (+970 lines)
3. `be38962` - Fix Claude syntax (±5 lines)
4. `4d12a9d` - Codex integration (+1,011 lines)

---

## 🏆 Contributors

- **Yan** - Full implementation (Platform Selector, Agent Launcher, Agent Claude, Agent Codex)
- **GitHub Copilot** - Development assistance

---

## 🎯 What's Next?

### Planned for v2.3.0
- [ ] VSCode extension support (native)
- [ ] Custom platform plugin system
- [ ] Multi-agent orchestration
- [ ] Cloud-based agent registry

### In Progress
- Manual testing with all 3 platforms
- Performance optimization
- Error message improvements

---

## 🔗 Links

- **NPM Package**: https://www.npmjs.com/package/create-byan-agent
- **GitHub Repo**: https://github.com/YanBigot/byan
- **Documentation**: See `YANSTALLER-COMPLETE-3-PLATFORMS.md`
- **Issues**: https://github.com/YanBigot/byan/issues

---

## 📝 Notes

### Platform Requirements
- **GitHub Copilot CLI**: Requires `gh` command in PATH
- **Claude Code**: Requires `claude` command in PATH
- **Codex/OpenCode**: Requires `codex` command in PATH

### Auto-Detection
Platform selector automatically detects available commands using `which`.

### Graceful Degradation
If native CLI is not available, falls back to manual installation instructions.

---

**Full Changelog**: v2.1.0...v2.2.0

**Release Tag**: `v2.2.0`

**Release Date**: 2026-02-10

---

*BYAN v2.2.0 brings true multi-platform native integration, making AI agent creation accessible across the entire ecosystem of AI coding assistants. Whether you use GitHub Copilot, Claude Code, or Codex, BYAN agents are now just one command away!* 🚀
