# Yanstaller Launcher Workers

**Location:** `_byan/workers/launchers/`  
**Type:** Platform-specific launcher workers  
**Version:** 1.0.0

---

## Overview

Launcher workers are lightweight, single-purpose components that bridge the gap between platform-specific AI coding assistants and the main Yanstaller agent.

**Role:** Launch `npx create-byan-agent` on each platform and hand off to yanstaller.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  USER INVOKES AGENT                     │
│  gh copilot @bmad-agent-marc                            │
│  claude --agent claude                                  │
│  codex skill bmad-byan                                  │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│             STUB AGENT (Lightweight)                    │
│  - Detects platform                                     │
│  - Calls appropriate launcher worker                    │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│          LAUNCHER WORKER (Single Task)                  │
│  - Verifies prerequisites (npx, Node.js)                │
│  - Executes: npx create-byan-agent                      │
│  - Sets platform hint env variable                      │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│             YANSTALLER (Main Agent)                     │
│  @bmad-agent-yanstaller                                 │
│  - Interview (10 questions)                             │
│  - Phase 2 Chat                                         │
│  - BYAN Installation                                    │
│  - Platform-specific integration                        │
└─────────────────────────────────────────────────────────┘
```

---

## Workers

### 1. launch-yanstaller-copilot.md

**Platform:** GitHub Copilot CLI  
**Icon:** 🤖  
**Command:** `npx create-byan-agent`  
**Called by:** `@bmad-agent-marc`

**Purpose:** Launch yanstaller on Copilot CLI platform.

---

### 2. launch-yanstaller-claude.md

**Platform:** Claude Code  
**Icon:** 🎭  
**Command:** `npx create-byan-agent`  
**Called by:** `@bmad-agent-claude` (stub)  
**Platform Hint:** `BYAN_PLATFORM_HINT=claude`

**Purpose:** Launch yanstaller on Claude Code platform.

**Post-Launch:** If user selects Claude integration, yanstaller delegates to Agent Claude (full) for MCP server creation.

---

### 3. launch-yanstaller-codex.md

**Platform:** Codex/OpenCode  
**Icon:** 📝  
**Command:** `npx create-byan-agent`  
**Called by:** `@bmad-agent-codex` (stub)  
**Platform Hint:** `BYAN_PLATFORM_HINT=codex`

**Purpose:** Launch yanstaller on Codex platform.

**Post-Launch:** If user selects Codex integration, yanstaller delegates to Agent Codex (full) for skill file creation.

---

## Design Principles

### Single Responsibility
Each worker has ONE task: Launch yanstaller command.

### Lightweight
- No interview logic
- No installation logic
- No configuration logic
- Just command execution + handoff

### Platform Hints
Workers set environment variables to help yanstaller detect platform:
```bash
BYAN_PLATFORM_HINT=copilot  # For Copilot CLI
BYAN_PLATFORM_HINT=claude   # For Claude Code
BYAN_PLATFORM_HINT=codex    # For Codex
```

### Idempotent
Can be run multiple times safely.

---

## Integration Flow

### Example: User chooses Claude

1. **User runs:** `claude --agent claude`

2. **Stub agent (bmad-agent-claude)** detects invocation:
   ```markdown
   "I'll launch yanstaller for you..."
   ```

3. **Launcher worker** executes:
   ```javascript
   process.env.BYAN_PLATFORM_HINT = 'claude';
   spawn('npx', ['create-byan-agent']);
   ```

4. **Yanstaller starts:**
   - Detects platform: Claude Code
   - Runs interview
   - User selects Claude integration
   
5. **Yanstaller delegates to Agent Claude (full):**
   - Agent Claude creates MCP server
   - Updates `claude_desktop_config.json`
   - Provides activation instructions

6. **User activates:**
   ```bash
   claude --agent byan "create PRD"
   ```

---

## Worker vs Agent

| Feature | Worker | Agent |
|---------|--------|-------|
| **Size** | Small (< 5 KB) | Large (10-20 KB) |
| **Responsibility** | Single task | Multiple workflows |
| **Workflows** | 0 | 6+ |
| **Knowledge Base** | Minimal | Extensive |
| **Lifecycle** | Execute & exit | Persistent session |
| **Complexity** | Simple | Complex |

---

## Separation of Concerns

### Stub Agents (marc/claude/codex)
- Detect invocation
- Call launcher worker
- Minimal logic

### Launcher Workers
- Execute `npx create-byan-agent`
- Set platform hints
- Verify prerequisites

### Yanstaller Agent
- Interview questions
- Platform selection
- Installation orchestration

### Full Specialist Agents
- Platform-specific integration
- MCP server creation (Claude)
- Skill file creation (Codex)
- GitHub agent installation (Copilot)

---

## File Structure

```
_byan/
└── workers/
    └── launchers/
        ├── README.md (this file)
        ├── launch-yanstaller-copilot.md
        ├── launch-yanstaller-claude.md
        └── launch-yanstaller-codex.md
```

---

## Testing

### Manual Test
```bash
# Test Copilot launcher
node -e "require('./_byan/workers/launchers/worker-launch-yanstaller-copilot').launch()"

# Test Claude launcher
node -e "require('./_byan/workers/launchers/worker-launch-yanstaller-claude').launch()"

# Test Codex launcher
node -e "require('./_byan/workers/launchers/worker-launch-yanstaller-codex').launch()"
```

### Expected Output
```
🤖 Launching Yanstaller on Copilot CLI...
[Yanstaller interview UI appears]
```

---

## Error Scenarios

### NPX Not Found
```
Error: npx not found
Solution: Install Node.js >= 18.0.0 from https://nodejs.org/
```

### Network Issues
```
Error: Cannot download create-byan-agent
Solution: 
1. Check internet connection
2. Or install globally: npm install -g create-byan-agent
```

### Platform CLI Not Found
```
Warning: Claude/Codex CLI not detected
Action: Yanstaller continues with manual installation instructions
```

---

## Success Criteria

For a worker to succeed:

1. ✅ `npx create-byan-agent` command executed
2. ✅ Platform hint set correctly
3. ✅ Yanstaller process started
4. ✅ No errors during handoff

---

## Maintenance

**Update Frequency:** Rarely (workers are stable)

**What might change:**
- Command arguments (if yanstaller CLI changes)
- Platform detection logic
- Error messages

**What won't change:**
- Single responsibility principle
- Lightweight design
- Simple execution flow

---

## NPM Distribution

Launcher workers are included in the `create-byan-agent` NPM package:

```
install/
└── templates/
    └── _byan/
        └── workers/
            └── launchers/
                ├── README.md
                ├── launch-yanstaller-copilot.md
                ├── launch-yanstaller-claude.md
                └── launch-yanstaller-codex.md
```

---

## Version History

- **1.0.0** (2026-02-10): Initial release
  - Copilot launcher
  - Claude launcher
  - Codex launcher

---

**Maintainer:** BYAN Core Team  
**Last Updated:** 2026-02-10  
**Status:** ✅ Production Ready
