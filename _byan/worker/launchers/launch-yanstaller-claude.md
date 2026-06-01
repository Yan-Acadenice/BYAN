---
name: launch-yanstaller-claude
type: worker
role: yanstaller-launcher
platform: claude-code
version: 1.0.0
---

# Worker: Launch Yanstaller (Claude Code)

**Role:** Launch yanstaller on Claude Code platform  
**Type:** Platform Launcher Worker  
**Single Responsibility:** Execute `npx create-byan-agent` and hand off to yanstaller agent

---

## Activation

```xml
<worker id="launch-yanstaller-claude" type="launcher">
  <activation>
    <step n="1">Detect platform: Claude Code</step>
    <step n="2">Verify npx/npm available</step>
    <step n="3">Execute: npx create-byan-agent</step>
    <step n="4">Hand off to @bmad-agent-yanstaller</step>
  </activation>
</worker>
```

---

## Mission

**One task:** Launch yanstaller installer on Claude Code platform.

This worker does NOT:
- ❌ Configure BYAN installation
- ❌ Run interview questions
- ❌ Install agents/modules
- ❌ Create MCP servers

This worker ONLY:
- ✅ Launches `npx create-byan-agent`
- ✅ Verifies command execution
- ✅ Hands off to yanstaller agent

---

## Command

```bash
npx create-byan-agent
```

**Alternative (if already installed globally):**
```bash
create-byan-agent
```

---

## Execution Flow

```
User: claude --agent claude
  ↓
Claude (stub): "Launching yanstaller..."
  ↓
Worker: launch-yanstaller-claude
  ↓
Command: npx create-byan-agent
  ↓
Yanstaller: @bmad-agent-yanstaller takes over
  ↓
Interview + Installation flow
  ↓
MCP server creation (if selected)
```

---

## Platform-Specific Notes

**Claude Code Integration:**
- Yanstaller will detect Claude platform
- Offers MCP server creation option
- Agent Claude (specialist) handles MCP setup
- Desktop config updated automatically

**MCP Creation Flow:**
```
Yanstaller → Agent Claude (full) → MCP server
                   ↓
            claude_desktop_config.json updated
```

---

## Error Handling

**If npx not available:**
```
Error: npx not found
Solution: Install Node.js >= 18.0.0
Command: https://nodejs.org/
```

**If Claude CLI not in PATH:**
```
Warning: Claude Code not detected
Solution: Install from https://claude.ai/download
Note: Yanstaller will continue with manual instructions
```

---

## Success Criteria

1. ✅ Command `npx create-byan-agent` executed
2. ✅ Yanstaller process started
3. ✅ Control handed to @bmad-agent-yanstaller
4. ✅ Claude platform detected

---

## Integration

**Called by:** Agent Claude stub (`bmad-agent-claude`)  
**Calls:** Yanstaller (`bmad-agent-yanstaller`)  
**Platform:** Claude Code  
**Specialist:** Agent Claude (full) for MCP setup

---

## Code

```javascript
// worker-launch-yanstaller-claude.js
const { spawn } = require('child_process');

async function launch() {
  console.log('🎭 Launching Yanstaller on Claude Code...');
  
  // Set platform hint for yanstaller
  process.env.BYAN_PLATFORM_HINT = 'claude';
  
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['create-byan-agent'], {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });
    
    proc.on('error', (error) => {
      reject(new Error(`Failed to launch: ${error.message}`));
    });
    
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ 
          success: true, 
          platform: 'claude',
          mcpEnabled: true 
        });
      } else {
        reject(new Error(`Yanstaller exited with code ${code}`));
      }
    });
  });
}

module.exports = { launch };
```

---

## Testing

```bash
# Test worker execution
node _byan/worker/launchers/worker-launch-yanstaller-claude.js

# Expected output:
# 🎭 Launching Yanstaller on Claude Code...
# [Yanstaller interview starts]
# [Platform: Claude detected]
```

---

## Metadata

- **Worker Type:** Launcher
- **Complexity:** Simple (1 command)
- **Dependencies:** npx, Node.js >= 18.0.0, claude CLI (optional)
- **Estimated Duration:** < 5 seconds
- **Idempotent:** Yes (can be run multiple times)
- **Platform-Specific:** Sets BYAN_PLATFORM_HINT=claude

---

**Status:** ✅ Ready for use  
**Last Updated:** 2026-02-10  
**Maintainer:** BYAN Core Team
