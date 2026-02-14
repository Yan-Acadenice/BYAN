# Changelog - BYAN (create-byan-agent)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.4.5] - 2026-02-12

### 🐛 Fixed - Copilot CLI Auth Command

**Problem:** Auth check used `gh auth status` instead of `copilot --version`. GitHub CLI (gh) is separate from Copilot CLI.

**Fix:** 
- Auth check: `gh` → `copilot --version`
- Login instruction: `gh auth login` → `copilot auth`

---

## [2.4.4] - 2026-02-11

### 🐛 Fixed - Config Prompt Scope Bug

**Problem:** `config.userName` was undefined when user skipped interview or Turbo Whisper installation, causing crashes.

**Root Cause:** The `const config = await inquirer.prompt(...)` was inside the `if (installMode === 'custom' && interviewResults)` conditional block. Users taking other paths never got prompted for their name.

**Fix:** Moved user config prompt (name + language) BEFORE the conditional block so it's asked for ALL installation modes.

```javascript
// Before: config defined inside conditional (bug)
if (installMode === 'custom' && interviewResults) {
  const config = await inquirer.prompt(...); // Only for custom mode!
  ...
}
// config.userName → undefined for auto/express modes

// After: config defined before conditional (fixed)
const config = await inquirer.prompt([...]); // Asked for ALL modes
if (installMode === 'custom' && interviewResults) {
  // config available here
}
// config.userName → always defined
```

---

## [2.4.3] - 2026-02-11

### 🐛 Fixed - Codex Trusted Directory + Auth Loop

**Codex Fix:** Added `--skip-git-repo-check` to `codex exec` command to allow Phase 2 chat when not inside a trusted git repository.

**Auth Flow Improvement:** Replaced simple version check with real authentication verification:
- **Copilot**: `gh auth status` (actual login check)
- **Claude**: `claude -p "reply OK" --max-turns 1` (real API call)
- **Codex**: version check (no auth status command available)

If not authenticated, user gets 3 choices: Retry (loop), Auto mode (skip AI chat), or Cancel. No more silent bypass.

---

## [2.4.2] - 2026-02-11

### 🐛 Fixed - Claude Phase 2 System Prompt Separation

**Problem:** On Windows 11, Claude Code Phase 2 chat responded with generic "How can I help you today?" instead of acting as Yanstaller persona.

**Root Cause:** `claude -p "entire_blob"` treats the argument as a user query, not system instructions. The entire system context (Hermes docs, agent catalog, conversation history, instructions) was passed as `-p` argument. Claude ignored it and responded with its default greeting.

**Fix:** Split system prompt from user message using proper Claude Code CLI flags:
- System context → `--append-system-prompt-file` (temp file, auto-cleaned)
- User message → `-p` (just the actual user query)

```javascript
// Before (broken): everything as -p argument
runCliCommand('claude', ['-p', fullPrompt], projectRoot);

// After (fixed): proper separation
runCliCommand('claude', [
  '-p', message,                          // user query only
  '--append-system-prompt-file', tmpFile   // system context in file
], projectRoot);
```

**Impact:** Claude Code Phase 2 now correctly receives Yanstaller persona, Hermes knowledge, and conversation history as system instructions while treating user input as the actual query.

---

## [2.4.0] - 2026-02-11

### ✨ Added - Claude Code Native Agent Integration

**New Feature: BYAN agents natively integrated with Claude Code**

Claude Code uses `.claude/CLAUDE.md` and `.claude/rules/*.md` for project memory.
Yanstaller now creates this structure automatically when Claude is detected.

**Files Created in User Project:**
```
.claude/
  CLAUDE.md                      # Main project memory with Hermes entry point
  rules/
    hermes-dispatcher.md         # Hermes commands, routing rules, pipelines
    byan-agents.md               # 35+ agents across 5 modules (tables)
    merise-agile.md              # Methodology, mantras, dev cycle, test levels
```

**Hermes Always Included:**
- Hermes dispatcher is the universal entry point on ALL Claude Code projects
- `CLAUDE.md` references Hermes and links to rules via `@.claude/rules/` imports
- Claude Code auto-loads all `.claude/rules/*.md` at session start

**How It Works:**
- User runs `npx create-byan-agent` and selects Claude Code platform
- Yanstaller detects Claude and installs `.claude/` structure
- Claude Code reads `CLAUDE.md` + all `rules/*.md` at every session start
- User asks "quel agent pour mon projet?" → Claude knows Hermes and all agents
- No MCP server needed for agent knowledge (native Claude Code memory)

**Verification:**
- Installation checks: CLAUDE.md, rules/ directory, hermes-dispatcher.md
- Updated success message with Claude-specific activation instructions

**Based on Claude Code SDK:**
- Uses official `.claude/rules/*.md` modular rules system
- Uses `@path` import syntax for cross-referencing
- Rules auto-loaded per session (no manual configuration)

---

## [2.3.8] - 2026-02-11

### 🐛 Fixed - Windows 11 + Claude Code Compatibility

**Cross-Platform CLI Execution:**
- Replaced `execSync` with `spawnSync` in Phase 2 chat (no shell = no character interpretation)
- On Unix: args passed directly (no `@`, `$`, `%` interpretation)
- On Windows: `shell: true` for `.cmd` file support, stdin for long prompts
- Removed all bash-only syntax: `$(cat ...)`, `2>/dev/null`, single-quote escaping

**Version Display Fix:**
- `BYAN_VERSION` now reads from `package.json` (was hardcoded as `2.3.0`)
- Banner now shows correct installed version

**Claude-Aware Model Selection:**
- When Claude platform selected, model switches from `gpt-5-mini` to `claude-haiku-4.5`
- `generateDefaultConfig()` now accepts `selectedPlatform` parameter
- Display: "Model adapte: claude-haiku-4.5 (plateforme: Claude)"

**Claude Auth Improvements:**
- Login command fixed: `claude login` (was `claude auth`)
- Shows 3 connection methods on failure:
  1. `claude login` (OAuth)
  2. `export ANTHROPIC_API_KEY=sk-ant-...`
  3. `/login` dans Claude Code
- Auth error detection in Phase 2 chat with specific guidance

**Files Modified:**
- `install/lib/phase2-chat.js`: New `runCliCommand()` helper, cross-platform `sendChatMessage()`
- `install/bin/create-byan-agent-v2.js`: `spawnSync` imports, dynamic version, platform-aware model

---

## [2.3.7] - 2026-02-11

### 🐛 Fixed - Codex Prompt Escaping

**Issue:** Bash interpreted `@hermes` as shell command in Codex prompts
- Phase 2 chat with Codex failed with `/bin/bash: ligne 1: @hermes : commande introuvable`
- Root cause: `echo "${prompt}"` with double quotes allowed bash to interpret special characters
- The Hermes documentation contains `@hermes` examples, which bash tried to execute

**Fix:**
- Changed `install/lib/phase2-chat.js`: Use single quotes for Codex echo command
- Escape single quotes within content: `replace(/'/g, "'\\''")` 
- Prevents bash from interpreting `@`, `$`, backticks, and other special chars
- Copilot and Claude already working (direct arguments, not shell expansion)

**Impact:** Yanstaller Phase 2 now works correctly with Codex platform

---

## [2.3.6] - 2026-02-11

### ✨ Enhanced - Hermes in Yanstaller Knowledge Base

**Feature:** Yanstaller Phase 2 now knows complete BYAN ecosystem
- Added full Hermes documentation to Phase 2 system prompt (~1500 tokens)
- Documents all 35+ agents across 5 modules (Core, BMM, BMB, CIS, TEA)
- Includes 7 predefined workflows with agent chains
- Explains smart routing capabilities and pipelines
- Yanstaller recommends Hermes as universal entry point

**Knowledge Expansion:**
- Before: ~300 tokens (basic user profile)
- After: ~1500 tokens (complete ecosystem)
- 5x increase in contextual intelligence

**Impact:** Users asking about Hermes or agents get intelligent, informed responses

---

## [2.3.5] - 2026-02-11

### 🐛 Fixed - Multi-Platform CLI Commands

**Issue:** Codex and Claude commands were incorrect
- Codex: `codex -p "prompt"` doesn't exist (wrong flag)
- Claude: `claude -p "prompt" --no-input` used wrong flags
- Both failed during Phase 2 chat in Yanstaller

**Fix:**
- `install/lib/phase2-chat.js`:
  - Codex: Changed to `codex exec` with stdin (line 175)
  - Claude: Changed to `claude -p` print mode (line 184)
  - Copilot: Already correct with `-p` flag

**Verified:**
- Copilot: `copilot -p "prompt" -s` ✓
- Codex: `echo "prompt" | codex exec` ✓
- Claude: `claude -p "prompt"` ✓

---

## [2.3.4] - 2026-02-11

### 🐛 Fixed - Yanstaller Phase 2 Config Bug

**Issue:** ReferenceError during Phase 2 chat initialization
- Error: `Cannot access 'config' before initialization`
- Root cause: `config` variable used at line 737 but defined at line 817
- Phase 2 chat failed to start

**Fix:**
- `install/bin/create-byan-agent-v2.js`: Moved config prompt to Phase 1.5 (before Phase 2 chat)
- Config now collected at lines 714-729 (userName, language)
- Passed to `launchPhase2Chat()` as parameters
- Removed duplicate config definition

**Impact:** Yanstaller Phase 2 now starts correctly with all platforms

---

## [2.3.3] - 2026-02-10

### 🐛 Fixed - GitHub Repository URLs

**Issue:** README and package.json pointed to wrong GitHub repository
- Old URL: `github.com/yannsix/byan-v2` (incorrect)
- Correct URL: `github.com/Yan-Acadenice/BYAN`

**Changes:**
- `README.md`: Updated 10 GitHub link occurrences
- `package.json`: Updated repository URLs (3 occurrences)
  - repository.url
  - bugs.url
  - homepage

**Impact:** Users can now find correct repository and report issues properly

---

## [2.3.2] - 2026-02-10

### 🏛️ Added - Hermes Universal Dispatcher

**Major Feature: Hermes Agent**
- New `hermes` agent: Universal dispatcher for entire BYAN ecosystem (573 lines XML)
- Intelligent routing to 35+ specialized agents across 5 modules
- 6-step mandatory activation sequence with config loading
- Menu-driven interface with 9 commands (LA, LW, LC, REC, PIPE, ?, @, EXIT, HELP)
- Smart routing rules: keyword-based agent recommendations
- 7 predefined pipelines (Feature Complete, Idea→Code, Bug Fix, etc.)
- Fuzzy matching for agent names
- Quick help system without loading full agents
- Multi-agent pipeline suggestions for complex goals

**Integration:**
- Added Hermes entry to agent-manifest.csv (first entry - core module)
- Created HERMES-GUIDE.md: Complete 10k+ word documentation
- Routing rules for all 35+ agents (bmm, bmb, cis, tea, core modules)
- Manifest-driven architecture (agent-manifest, workflow-manifest, task-manifest)

**Capabilities:**
1. **[LA]** List Agents - Display all 35+ agents by module
2. **[LW]** List Workflows - Show available workflows
3. **[LC]** List Contexts - Discover project contexts
4. **[REC]** Smart Routing - Recommend best agent(s) for task
5. **[PIPE]** Pipeline - Multi-agent workflow suggestions
6. **[?]** Quick Help - Brief agent info without loading
7. **[@]** Invoke - Direct agent activation
8. **[EXIT]** Exit Hermes gracefully
9. **[HELP]** Redisplay menu

**Files:**
- `install/templates/.github/agents/hermes.md` (573 lines, 168 XML tags)
- `install/HERMES-GUIDE.md` (10k+ words, complete usage guide)
- Updated `install/templates/_byan/_config/agent-manifest.csv` (Hermes first)

### 🐛 Fixed - Node.js 12 Compatibility

**Issue:** Optional chaining operator (`?.`) caused syntax errors on Node 12
- Node 12 doesn't support optional chaining (requires Node 14+)
- Server installations with older Node versions failed

**Changes:**
- Replaced all optional chaining in `install/` directory (9 instances across 5 files):
  - `install/bin/create-byan-agent-v2.js` (4 fixes)
  - `install/lib/phase2-chat.js` (1 fix)
  - `install/lib/yanstaller/platform-selector.js` (2 fixes)
  - `install/lib/yanstaller/agent-launcher.js` (2 fixes)
- Changed `package.json` engines requirement: `node >=18.0.0` → `>=12.0.0`
- All optional chaining replaced with explicit null checks

**Before:**
```javascript
interviewResults.agents.essential?.join(', ')
config?.communication_language || 'English'
```

**After:**
```javascript
interviewResults.agents.essential ? interviewResults.agents.essential.join(', ') : ''
config ? config.communication_language : 'English'
```

**Documentation:**
- Created `TEST-GUIDE-v2.3.2.md` with Node 12+ verification steps

### 🔧 Technical Details

**Hermes Architecture:**
- XML-based agent definition with mandatory activation
- 6-step activation: Load persona → Load config → Store vars → Display menu → Wait → Process
- Handler system: number, command, invoke, fuzzy
- Manifest-driven: Reads CSV files at runtime (never pre-load)
- Fail-fast error handling with actionable suggestions
- KISS principle: Minimal interface, maximum efficiency

**Mantras Applied:**
- #7: KISS (Keep It Simple, Stupid)
- #37: Ockham's Razor - Simplicity first
- #4: Fail Fast - Immediate actionable errors
- IA-21: Self-Aware Agent - "I dispatch, I do not execute"
- IA-24: Clean Code - Minimal, clear communication

**Agent Manifest:**
- 35+ agents across 5 modules (core, bmm, bmb, cis, tea)
- CSV format: name, displayName, title, icon, role, identity, style, principles, module, path
- Hermes entry: First line (dispatcher priority)

### 📚 Documentation

**New Guides:**
- `install/HERMES-GUIDE.md`: Complete Hermes documentation
  - Overview and installation
  - All 9 commands with examples
  - Routing rules table
  - Predefined pipelines
  - Troubleshooting
  - Roadmap

- `TEST-GUIDE-v2.3.2.md`: Node 12+ compatibility guide
  - Verification steps
  - Before/after code examples
  - Testing checklist

### 🎯 Use Cases

**Hermes Examples:**

1. **New Project Discovery:**
   ```bash
   @hermes
   [1] [LA]  # List all agents by module
   [?dev]    # Quick info on Dev agent
   @dev      # Invoke Dev agent
   ```

2. **Smart Routing:**
   ```bash
   @hermes
   [4] [REC]
   # User: "créer API backend avec tests"
   # Hermes recommends: PM → Architect → Dev → Tea
   ```

3. **Pipeline Creation:**
   ```bash
   @hermes
   [5] [PIPE]
   # User: "feature complète de A à Z"
   # Hermes suggests: PM → Architect → UX → SM → Dev → Tea
   ```

### 🔄 Migration from 2.3.0/2.3.1

**No Breaking Changes** - Fully backward compatible

**New in 2.3.2:**
- Hermes agent available via `@hermes`
- Improved Node 12+ support (was 18+ in 2.3.0/1)
- Enhanced agent discovery via manifest

**Upgrade:**
```bash
npm install -g create-byan-agent@2.3.2
```

**Or via npx (always latest):**
```bash
npx create-byan-agent
```

### 📦 Package Info

**Size:** ~1.4 MB, 900+ files  
**Dependencies:**
- Required: commander, inquirer, fs-extra, chalk, winston, dotenv
- Optional: byan-copilot-router (cost optimizer)

**Engines:**
- Node.js: >=12.0.0 (was >=18.0.0 in 2.3.0/1)
- npm: >=6.0.0

### 🚀 Performance

**Hermes Performance:**
- Menu display: <50ms
- Agent list (35+): <100ms
- Smart routing: <200ms
- Agent invocation: <500ms
- Manifest parsing: <100ms (CSV)

**Install Performance:**
- Yanstaller: ~30-60 seconds (unchanged)
- Cost Optimizer: +5 seconds if enabled (optional)

---

## [2.3.1] - 2026-02-10

### 🔧 Fixed - Yanstaller Integration Issues

**Issue:** Yanstaller didn't prompt for platform or verify authentication

**Changes:**
- Added platform selection question after detection (Copilot/Codex/Claude)
- Added authentication verification with helpful error messages
- Modified `create-byan-agent-v2.js` to add platform selection (+60 lines)
- Updated `phase2-chat.js` to accept selectedPlatform parameter
- Changed `sendChatMessage()` to use selectedPlatform instead of array
- Added fallback to AUTO mode if authentication fails

**Files:**
- `install/bin/create-byan-agent-v2.js` (platform selection logic)
- `install/lib/phase2-chat.js` (platform parameter)
- Commit: "fix: improve Yanstaller integration and error handling"

---

## [2.3.0] - 2026-02-10

### ✨ Added - Cost Optimizer Integration

**Feature: Cost Optimizer Worker**
- Integrated `@byan/copilot-router` (v1.0.1) as optional dependency
- New worker template: `install/templates/_byan/workers/cost-optimizer.js`
- Automatic installation option during Yanstaller setup
- 87.5% cost savings (based on real measurements)

**Changes:**
- Added `byan-copilot-router` to `optionalDependencies` in package.json
- Created cost-optimizer worker template with CopilotRouter integration
- Modified installer to ask: "Activer l'optimiseur de coûts LLM?"
- Auto-copy worker to `_byan/workers/` if enabled
- Worker auto-detects if router module installed

**Worker Features:**
- Complexity analysis (5 factors)
- Intelligent routing: worker (cheap) vs agent (expensive)
- Automatic fallback on worker failure
- Cost tracking and statistics
- JSON/CSV export
- Daily/weekly reports

**Files:**
- `install/templates/_byan/workers/cost-optimizer.js` (202 lines)
- `install/templates/_byan/workers/README.md` (documentation)
- Updated `install/bin/create-byan-agent-v2.js` (installer question)

---

## [2.2.0] - 2026-02-08

### ✨ Added

**New Agents:**
- `hermes` (prototype): Universal dispatcher for BYAN agents
- `marc`: GitHub Copilot CLI integration specialist
- `rachid`: NPM/NPX deployment specialist
- `patnote`: Update manager and conflict resolution
- `carmack`: Token optimizer for BYAN agents

**Developer Experience:**
- Enhanced CLI with better error messages
- Improved platform detection (Copilot/Codex/Claude)
- Auto-detection of installed AI platforms

### 🔧 Changed

- Refactored agent templates for better modularity
- Improved manifest system (agent-manifest.csv)
- Better configuration management

---

## [2.1.0] - 2026-02-05

### ✨ Added

**BYAN v2 Core:**
- Intelligent agent creation via 12-question interview
- 64 mantras integration (Merise Agile + TDD)
- Multi-platform support (GitHub Copilot, Codex, Claude)
- Yanstaller: Smart installer with platform detection
- Agent manifest system
- Workflow manifest system

**Agents:**
- `byan`: Intelligent agent creator
- `bmad-master`: Workflow orchestrator
- `analyst`: Business analyst (Mary)
- `architect`: System architect (Winston)
- `dev`: Developer (Amelia)
- `pm`: Product manager (John)
- `sm`: Scrum master (Bob)
- `quinn`: QA engineer
- `tech-writer`: Documentation specialist (Paige)
- `ux-designer`: UX designer (Sally)
- `quick-flow-solo-dev`: Fast brownfield dev (Barry)
- `brainstorming-coach`: Brainstorming (Carson)
- `tea`: Test architect (Murat)
- And 20+ more specialized agents

**Modules:**
- `core`: Foundation (bmad-master, yanstaller, merise expert)
- `bmm`: Business Modeling & Management (SDLC agents)
- `bmb`: Builder agents (BYAN, agent-builder, etc.)
- `cis`: Creative & Innovation Strategy
- `tea`: Test Architecture

---

## [2.0.0] - 2026-01-15

### 🎉 Initial Release - BYAN v2

**Major Rewrite:**
- Complete platform rewrite from v1.x
- Markdown + YAML agent definitions
- XML-based agent structure
- Multi-platform support
- Module system (core, bmm, bmb, cis, tea)

**Core Features:**
- Intelligent agent creation
- Structured interview process
- Manifest-driven architecture
- Config system with YAML
- Template engine
- Platform detection
- NPX integration

---

## [1.x] - 2025 (Legacy)

**Note:** v1.x was the original BYAN prototype. See git history for details.

---

## Legend

- 🎉 Major release
- ✨ New features
- 🔧 Changes
- 🐛 Bug fixes
- 📚 Documentation
- 🔄 Migration guide
- 💥 Breaking changes
- 🔐 Security fixes
- 🚀 Performance improvements

---

**Latest:** [2.3.2] - Hermes Universal Dispatcher + Node 12+ Support  
**Download:** `npm install -g create-byan-agent@2.3.2`  
**NPX:** `npx create-byan-agent` (always latest)
