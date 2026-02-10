---
name: launch-yanstaller-copilot
type: worker
role: yanstaller-launcher
platform: copilot-cli
version: 1.0.0
---

# Worker: Launch Yanstaller (Copilot CLI)

**Role:** Launch yanstaller on GitHub Copilot CLI platform  
**Type:** Platform Launcher Worker  
**Single Responsibility:** Execute `npx create-byan-agent` and hand off to yanstaller agent

---

## Activation

```xml
<worker id="launch-yanstaller-copilot" type="launcher">
  <activation>
    <step n="1">Detect platform: GitHub Copilot CLI</step>
    <step n="2">Verify npx/npm available</step>
    <step n="3">Execute: npx create-byan-agent</step>
    <step n="4">Hand off to @bmad-agent-yanstaller</step>
  </activation>
</worker>
```

---

## Mission

**One task:** Launch yanstaller installer on Copilot CLI platform.

This worker does NOT:
- ❌ Configure BYAN installation
- ❌ Run interview questions
- ❌ Install agents/modules
- ❌ Validate project structure

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
User: @bmad-agent-marc
  ↓
Marc (stub): "Launching yanstaller..."
  ↓
Worker: launch-yanstaller-copilot
  ↓
Command: npx create-byan-agent
  ↓
Yanstaller: @bmad-agent-yanstaller takes over
  ↓
Interview + Installation flow
```

---

## Error Handling

**If npx not available:**
```
Error: npx not found
Solution: Install Node.js >= 18.0.0
Command: https://nodejs.org/
```

**If network issues:**
```
Error: Cannot download create-byan-agent
Solution: Check internet connection or use offline mode
Command: npm install -g create-byan-agent
```

---

## Success Criteria

1. ✅ Command `npx create-byan-agent` executed
2. ✅ Yanstaller process started
3. ✅ Control handed to @bmad-agent-yanstaller

---

## Integration

**Called by:** Agent Marc (`bmad-agent-marc`)  
**Calls:** Yanstaller (`bmad-agent-yanstaller`)  
**Platform:** GitHub Copilot CLI

---

## Code

```javascript
// worker-launch-yanstaller-copilot.js
const { spawn } = require('child_process');

async function launch() {
  console.log('🚀 Launching Yanstaller on Copilot CLI...');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['create-byan-agent'], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('error', (error) => {
      reject(new Error(`Failed to launch: ${error.message}`));
    });
    
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true, platform: 'copilot-cli' });
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
node _byan/workers/launchers/worker-launch-yanstaller-copilot.js

# Expected output:
# 🚀 Launching Yanstaller on Copilot CLI...
# [Yanstaller interview starts]
```

---

## Metadata

- **Worker Type:** Launcher
- **Complexity:** Simple (1 command)
- **Dependencies:** npx, Node.js >= 18.0.0
- **Estimated Duration:** < 5 seconds
- **Idempotent:** Yes (can be run multiple times)

---

**Status:** ✅ Ready for use  
**Last Updated:** 2026-02-10  
**Maintainer:** BYAN Core Team
