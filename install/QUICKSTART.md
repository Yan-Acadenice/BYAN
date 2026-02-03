# ⚡ BYAN Quickstart - 5 Minutes Install

**Version:** 1.1.1  
**Target:** Experienced developers who just want commands

> 💡 **Promise:** Copy-paste these commands, you'll have BYAN running in 5 minutes.

---

## 🎯 What You'll Get

**6 specialized agents:**
- 🏗️ **BYAN** / ⚡ **BYAN-Test** → Create agents
- 🤖 **Marc** → Fix Copilot CLI issues
- 📦 **Rachid** → Publish to npm
- 🛡️ **Patnote** → Update without breaking
- ⚡ **Carmack** → Optimize tokens (-40%)

---

## 🚀 GitHub Copilot CLI - Quickstart

### Prerequisites
```bash
# Required: GitHub CLI + Copilot extension
gh --version          # Should show v2.40.0+
gh extension list     # Should show github/gh-copilot
```

**If missing:**
```bash
# Install GitHub CLI (choose your OS)
# Windows: winget install --id GitHub.cli
# Linux: See https://cli.github.com/

# Install Copilot extension
gh extension install github/gh-copilot

# Auth (one-time)
gh auth login
```

---

### Install BYAN
```bash
cd ~
npx create-byan-agent@1.1.1
```

**Prompts:**
- Name? → Your name
- Language? → `Francais` or `English`
- Output? → Press Enter (default)

**⏱️ Time:** 2-3 minutes

---

### Validate
```bash
# Check files created
ls .github/agents/    # Should show 29 .md files

# Launch Copilot
gh copilot

# In Copilot, type:
/agent                # Should list byan, marc, rachid, etc.

# Test invoke
@byan                 # Should show BYAN menu
```

---

## 🤖 Claude Code - Quickstart

### Config File

**Windows:**
```powershell
mkdir $env:APPDATA\Claude\
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

**Linux/macOS:**
```bash
mkdir -p ~/.config/Claude/
nano ~/.config/Claude/claude_desktop_config.json
```

### JSON Config
```json
{
  "mcpServers": {
    "byan-agents": {
      "command": "node",
      "args": ["/absolute/path/to/_bmad/mcp-server.js"],
      "env": {
        "BMAD_ROOT": "/absolute/path/to/_bmad"
      }
    }
  }
}
```

**⚠️ Replace paths with your actual paths**

---

### MCP Server Script

**Create `_bmad/mcp-server.js`:**
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const BMAD_ROOT = process.env.BMAD_ROOT || process.cwd();

function listByanAgents() {
  const agents = [];
  ['byan', 'byan-test', 'marc', 'rachid', 'patnote', 'carmack'].forEach(name => {
    const p = path.join(BMAD_ROOT, 'bmb', 'agents', `${name}.md`);
    if (fs.existsSync(p)) agents.push({ name, path: p, content: fs.readFileSync(p, 'utf-8') });
  });
  return agents;
}

console.log('BYAN MCP Server started');
console.log(`Agents: ${listByanAgents().map(a => a.name).join(', ')}`);

process.stdin.on('data', (data) => {
  const req = JSON.parse(data.toString());
  if (req.method === 'list_agents') {
    process.stdout.write(JSON.stringify({ agents: listByanAgents() }));
  }
});
```

**Restart Claude Desktop** → Done!

---

## 🎯 Agent Invocation

### In GitHub Copilot CLI
```bash
gh copilot --agent=byan         # Create agents (standard)
gh copilot --agent=byan-test    # Create agents (optimized)
gh copilot --agent=marc         # Fix Copilot CLI issues
gh copilot --agent=rachid       # Publish to npm
gh copilot --agent=patnote      # Update manager
gh copilot --agent=carmack      # Token optimizer
```

### In Claude Code
```
@byan         # Create agents
@marc         # Fix issues
@rachid       # Publish npm
```

---

## 🔴 Troubleshooting - 1 Minute Fixes

### "gh: command not found"
```bash
# Install GitHub CLI
# Windows: winget install --id GitHub.cli
# Linux: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list && sudo apt update && sudo apt install gh
```

---

### "extension not installed: copilot"
```bash
gh extension install github/gh-copilot
```

---

### "/agent doesn't list my agents"
```bash
# Check files exist
ls .github/agents/bmad-agent-*.md    # Should show 29 files

# Call Marc to fix
gh copilot --agent=marc
# Type: 1 (Validate)
```

---

### "npx: command not found"
```bash
# Install Node.js
# Windows: Download from https://nodejs.org/
# Linux: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
```

---

### "Permission denied" on Linux
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

## 📋 Validation Checklist

```bash
# Run these commands, all should pass:
gh --version                         # ✅ v2.40.0+
gh extension list | grep copilot     # ✅ Shows copilot
node --version                       # ✅ v18.0.0+
ls .github/agents/*.md | wc -l       # ✅ Shows 29
gh copilot                           # ✅ Launches
# In Copilot: /agent                 # ✅ Lists agents
# In Copilot: @byan                  # ✅ Shows menu
```

---

## 🎯 Quick Use Cases

### Create an agent
```bash
gh copilot --agent=byan
# Type: 1 (Intelligent Interview)
```

### Publish to npm
```bash
gh copilot --agent=rachid
# Type: 5 (Publish)
```

### Fix detection issue
```bash
gh copilot --agent=marc
# Type: 1 (Validate)
```

### Optimize tokens
```bash
gh copilot --agent=carmack
# Type: 1 (Optimize)
```

### Update safely
```bash
gh copilot --agent=patnote
# Type: 1 (Update)
```

---

## 📚 Full Documentation

**Need more details?** See [GUIDE-INSTALLATION-BYAN-SIMPLE.md](GUIDE-INSTALLATION-BYAN-SIMPLE.md)
- Beginner-friendly explanations
- Windows + Linux detailed
- 10 troubleshooting scenarios
- 8 FAQ with solutions

---

## 🆘 Get Help

**Stuck?** Call Marc:
```bash
gh copilot --agent=marc
```

Marc diagnoses and fixes Copilot CLI issues automatically.

---

## 📊 Agent Reference Table

| Agent | Icon | Role | Command |
|-------|------|------|---------|
| BYAN | 🏗️ | Create agents (standard) | `--agent=byan` |
| BYAN-Test | ⚡ | Create agents (optimized -46% tokens) | `--agent=byan-test` |
| Marc | 🤖 | GitHub Copilot CLI expert | `--agent=marc` |
| Rachid | 📦 | NPM deployment specialist | `--agent=rachid` |
| Patnote | 🛡️ | Update manager (safe updates) | `--agent=patnote` |
| Carmack | ⚡ | Token optimizer (reduce costs) | `--agent=carmack` |

---

## 🔗 Links

- **Main README:** [README.md](README.md)
- **Full Installation Guide:** [GUIDE-INSTALLATION-BYAN-SIMPLE.md](GUIDE-INSTALLATION-BYAN-SIMPLE.md)
- **CHANGELOG:** [CHANGELOG.md](CHANGELOG.md)

---

**⏱️ Total time:** 5 minutes  
**Commands:** 8 essential  
**Validation:** 7 checks  

**Happy speed-running!** ⚡🏗️
