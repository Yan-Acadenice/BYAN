# Step 01: Détection Plateformes

**Modèle:** gpt-5-mini

## Détection Commands

### GitHub Copilot CLI
```bash
which copilot || test -d ~/.config/copilot
```

### OpenAI Codex
```bash
test -d .codex || test -f .codex/config.json
```

### Claude Code
```bash
which claude || test -d ~/.config/claude
```

## Output
```
Plateformes détectées:
✓ GitHub Copilot CLI
✗ OpenAI Codex  
✓ Claude Code
```
