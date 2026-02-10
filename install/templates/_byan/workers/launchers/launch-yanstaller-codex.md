---
name: launch-yanstaller-codex
type: worker
role: yanstaller-launcher
platform: codex
version: 1.0.0
---

# Worker: Launch Yanstaller (Codex/OpenCode)

**Role:** Launch yanstaller on Codex/OpenCode platform  
**Type:** Platform Launcher Worker  
**Single Responsibility:** Execute `npx create-byan-agent` and hand off to yanstaller agent

---

## Activation

```xml
<worker id="launch-yanstaller-codex" type="launcher">
  <activation>
    <step n="1">Detect platform: Codex/OpenCode</step>
    <step n="2">Verify npx/npm available</step>
    <step n="3">Execute: npx create-byan-agent</step>
    <step n="4">Hand off to @bmad-agent-yanstaller</step>
  </activation>
</worker>
```

---

## Mission

**One task:** Launch yanstaller installer on Codex/OpenCode platform.

This worker does NOT:
- ❌ Configure BYAN installation
- ❌ Run interview questions
- ❌ Install agents/modules
- ❌ Create skill files

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
User: codex skill bmad-byan
  ↓
Codex stub: "Launching yanstaller..."
  ↓
Worker: launch-yanstaller-codex
  ↓
Command: npx create-byan-agent
  ↓
Yanstaller: @bmad-agent-yanstaller takes over
  ↓
Interview + Installation flow
  ↓
Skill files creation (if selected)
```

---

## Platform-Specific Notes

**Codex/OpenCode Integration:**
- Yanstaller will detect Codex platform
- Offers skill file creation option
- Agent Codex (specialist) handles skill setup
- Skills stored in `.codex/prompts/`

**Skill Creation Flow:**
```
Yanstaller → Agent Codex (full) → Skill files
                   ↓
            .codex/prompts/*.md created
```

**Key Difference:**
- Codex uses "skills" not "agents"
- Simple Markdown files (NO YAML)
- Skill name = filename without .md

---

## Error Handling

**If npx not available:**
```
Error: npx not found
Solution: Install Node.js >= 18.0.0
Command: https://nodejs.org/
```

**If Codex CLI not in PATH:**
```
Warning: Codex not detected
Solution: Install from https://opencode.com/
Note: Yanstaller will continue with manual instructions
```

---

## Success Criteria

1. ✅ Command `npx create-byan-agent` executed
2. ✅ Yanstaller process started
3. ✅ Control handed to @bmad-agent-yanstaller
4. ✅ Codex platform detected

---

## Integration

**Called by:** Agent Codex stub (`bmad-agent-codex`)  
**Calls:** Yanstaller (`bmad-agent-yanstaller`)  
**Platform:** Codex/OpenCode  
**Specialist:** Agent Codex (full) for skill setup

---

## Code

```javascript
// worker-launch-yanstaller-codex.js
const { spawn } = require('child_process');

async function launch() {
  console.log('📝 Launching Yanstaller on Codex...');
  
  // Set platform hint for yanstaller
  process.env.BYAN_PLATFORM_HINT = 'codex';
  
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
          platform: 'codex',
          skillsEnabled: true 
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
node _byan/workers/launchers/worker-launch-yanstaller-codex.js

# Expected output:
# 📝 Launching Yanstaller on Codex...
# [Yanstaller interview starts]
# [Platform: Codex detected]
```

---

## Metadata

- **Worker Type:** Launcher
- **Complexity:** Simple (1 command)
- **Dependencies:** npx, Node.js >= 18.0.0, codex CLI (optional)
- **Estimated Duration:** < 5 seconds
- **Idempotent:** Yes (can be run multiple times)
- **Platform-Specific:** Sets BYAN_PLATFORM_HINT=codex

---

**Status:** ✅ Ready for use  
**Last Updated:** 2026-02-10  
**Maintainer:** BYAN Core Team
