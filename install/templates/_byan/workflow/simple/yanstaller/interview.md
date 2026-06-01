# Yanstaller Interview Workflow

**Mode:** Non-interactive (JSON output)
**Model:** gpt-5-mini
**Durée:** 2-3 minutes

## Input Format

Prompt: `interview:<projet_type>:<domaine>:<equipe_size>:<experience>`

Examples:
- `interview:new:web:solo:beginner`
- `interview:existing:backend:medium:expert`

## Interview Questions

### Phase 1: Project Context
1. **Type de projet?** (new/existing/migration)
2. **Domaine?** (web/backend/data/mobile/devops/other)
3. **Taille équipe?** (solo/small/medium/large)
4. **Expérience AI?** (beginner/intermediate/expert)

### Phase 2: Environment
5. **Connectivity?** (online/offline/intermittent)
6. **GPU disponible?** (yes/no/unknown)

### Phase 3: Goals
7. **Objectifs?** (agents/workflows/tests/analysis/voice)
8. **Méthodologie?** (agile/tdd/merise-agile/hybrid)
9. **Fréquence?** (daily/weekly/occasional)
10. **Qualité?** (mvp/balanced/production/critical)

## Output Format (JSON)

```json
{
  "interview_completed": true,
  "responses": {
    "projectType": "new",
    "domain": "web",
    "teamSize": "solo",
    "experience": "expert",
    "connectivity": "online",
    "gpuAvailable": "yes",
    "objectives": ["agents", "workflows", "voice"],
    "methodology": "merise-agile",
    "frequency": "daily",
    "qualityLevel": "balanced"
  },
  "recommendations": {
    "platforms": [
      {
        "name": "copilot",
        "reason": "detected + large community",
        "priority": 1
      },
      {
        "name": "codex",
        "reason": "detected + workflow-focused",
        "priority": 2
      }
    ],
    "turboWhisper": {
      "recommended": true,
      "mode": "docker",
      "reason": "GPU available + daily usage"
    },
    "agents": {
      "essential": ["byan", "analyst", "architect"],
      "optional": ["dev", "pm", "sm"],
      "reason": "Solo expert with full-stack needs"
    },
    "methodology": {
      "name": "merise-agile",
      "modules": ["bmm", "bmb", "tea"],
      "reason": "Native BYAN approach"
    }
  },
  "complexity_score": 15,
  "recommended_model": "gpt-5-mini"
}
```

## Logic

### Platform Recommendations
- **Priority 1:** All detected platforms
- **Priority 2:** If no detection, recommend Copilot CLI (most popular)

### Turbo Whisper Recommendations
- **Yes GPU + daily:** docker mode
- **No GPU + daily:** local mode (with warning: slower)
- **Not daily:** skip (can install later)

### Agent Recommendations
- **Beginner:** 1-2 agents (byan only)
- **Intermediate:** 3-5 agents (byan + analyst + pm)
- **Expert:** All agents (full toolbox)

### Methodology Mapping
- **TDD → Tea module** priority
- **Merise Agile → BMM** full workflow
- **Agile/Hybrid → Quick-flow** prioritized

## Usage in NPX

```javascript
const result = execSync(`copilot --agent=bmad-agent-yanstaller --prompt "interview" --model gpt-5-mini`);
const json = JSON.parse(extractJSON(result));

// Apply recommendations
const platform = json.recommendations.platforms[0].name;
const turboMode = json.recommendations.turboWhisper.mode;
```
