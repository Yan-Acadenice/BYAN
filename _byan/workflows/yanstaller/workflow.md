---
name: yanstaller-workflow
description: Installation automatique BYAN multi-plateformes
model: gpt-5-mini
---

# Yanstaller Installation Workflow

**Objectif:** Installer BYAN sur toutes les plateformes détectées avec minimum de tokens

**Modèle recommandé:** `gpt-5-mini` (tasks simples) ou `claude-haiku-4.5` (fallback)

## Configuration

```yaml
workflow:
  name: yanstaller
  model: gpt-5-mini
  fallback_model: claude-haiku-4.5
  max_tokens: 10000
  
phases:
  - id: detect
    name: Détection Plateformes
    steps: [step-01-detect-platforms]
    model: gpt-5-mini
    
  - id: validate
    name: Validation Dépendances
    steps: [step-02-validate-deps]
    model: gpt-5-mini
    
  - id: install_core
    name: Installation Core BYAN
    steps: [step-03-install-core]
    model: gpt-5-mini
    
  - id: install_platforms
    name: Installation Plateformes
    steps: [step-04-install-platforms]
    model: gpt-5-mini
    
  - id: turbo_whisper
    name: Intégration Turbo Whisper
    steps: [step-05-turbo-whisper]
    model: gpt-5-mini
    optional: true
```

## Workflow Steps

### Phase 1: Détection (Step 01)
Détecte plateformes AI installées: Copilot CLI, Codex, Claude Code

### Phase 2: Validation (Step 02)
Vérifie dépendances: git, node, npm, docker (opt), python3 (opt)

### Phase 3: Installation Core (Step 03)
Crée structure _byan/ et copie agents/workflows/templates

### Phase 4: Installation Plateformes (Step 04)
Installe agents dans .github/, .codex/, .claude/ selon détection

### Phase 5: Turbo Whisper (Step 05 - Optionnel)
Intègre voice dictation avec détection GPU auto

## Usage

**Auto mode:**
```bash
copilot --agent=bmad-agent-yanstaller --prompt "auto" --model gpt-5-mini
```

**Custom mode:**
```bash
copilot --agent=bmad-agent-yanstaller --prompt "custom"
```

**Detect only:**
```bash
copilot --agent=bmad-agent-yanstaller --prompt "detect" --model gpt-5-mini
```

## Model Selection Strategy

| Task Type | Recommended Model | Reason |
|-----------|------------------|--------|
| Detection & Install | gpt-5-mini | Simple bash commands, 2-5k tokens |
| Agent Creation | claude-sonnet-4.5 | Complex reasoning, quality |
| Code Review | claude-opus-4.6 | Maximum accuracy |
| Quick Tasks | claude-haiku-4.5 | Fast, economical fallback |
