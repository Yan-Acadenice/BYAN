# Model Selector - Guide d'Utilisation

**Version:** 1.0.0  
**Auteur:** BYAN-TEST  
**Date:** 9 février 2026

---

## Vue d'Ensemble

Le **Model Selector** analyse automatiquement la complexité de chaque tâche et sélectionne le modèle AI optimal pour minimiser les coûts tout en garantissant la qualité requise.

**Inspiré de:** BYAN v2 workers.md (concept de workers avec spécialisation)

**Économies:** Réduction coûts de 70-90% en utilisant modèles appropriés

---

## Complexité et Modèles

| Niveau | Score | Modèle | Coût | Usage |
|--------|-------|--------|------|-------|
| **Simple** | 0-30 | gpt-5-mini | GRATUIT | Install, detect, copy |
| **Medium** | 31-60 | claude-haiku-4.5 | BAS | Analyze, refactor, test |
| **Complex** | 61-85 | claude-sonnet-4.5 | MOYEN | Create agents, architecture |
| **Expert** | 86+ | claude-opus-4.6 | ÉLEVÉ | Audits, critical review |

---

## Facteurs de Calcul

### Task Type (Poids principal)
- `detect`, `install`, `copy`: 5-10 points
- `analyze`, `refactor`, `document`: 35-45 points
- `create`, `design`: 70-75 points
- `audit`, `optimize`: 85-90 points

### Context Size
- `tiny` (< 50 lignes): 0 points
- `small` (50-100 lignes): 5 points
- `medium` (100-1000 lignes): 20 points
- `large` (1000-5000 lignes): 40 points
- `huge` (> 5000 lignes): 60 points

### Reasoning Depth
- `shallow`: 0 points (simple if/then)
- `medium`: 20 points (analyse requise)
- `deep`: 40 points (raisonnement complexe)
- `expert`: 60 points (multi-étapes + validation)

### Quality Requirement
- `fast`: 0 points (vitesse prioritaire)
- `balanced`: 10 points (équilibré)
- `high`: 20 points (qualité prioritaire)
- `critical`: 30 points (qualité maximale)

---

## Utilisation dans Workflows

### Méthode 1: Frontmatter YAML

Ajoutez section `complexity` dans le frontmatter de votre workflow:

```yaml
---
name: mon-workflow
description: Description
complexity:
  task_type: install
  context_size: small
  reasoning_depth: shallow
  quality_requirement: fast
---
```

**Score calculé:** 10 + 5 + 0 + 0 = **15** → `gpt-5-mini` (GRATUIT)

### Méthode 2: CLI

```bash
node _byan/core/model-selector.js \
  --task=create \
  --context=medium \
  --reasoning=deep \
  --quality=critical
```

**Output:**
```json
{
  "complexity": 160,
  "recommended_model": "claude-opus-4.6",
  "cost_tier": "HIGH"
}
```

### Méthode 3: Parse Workflow

```bash
node _byan/core/model-selector.js \
  --workflow=_byan/workflows/yanstaller/workflow.md
```

---

## Exemples Réels

### Yanstaller (Installation)
```yaml
complexity:
  task_type: install       # 10
  context_size: small      # 5
  reasoning_depth: shallow # 0
  quality_requirement: fast # 0
# Score: 15 → gpt-5-mini (FREE)
```

### BYAN Interview (Création Agent)
```yaml
complexity:
  task_type: create        # 70
  context_size: medium     # 20
  reasoning_depth: deep    # 40
  quality_requirement: critical # 30
# Score: 160 → claude-opus-4.6 (PREMIUM)
```

### Code Review
```yaml
complexity:
  task_type: review        # 60
  context_size: medium     # 20
  reasoning_depth: medium  # 20
  quality_requirement: balanced # 10
# Score: 110 → claude-opus-4.6 (PREMIUM)
```

### Quick Refactor
```yaml
complexity:
  task_type: refactor      # 45
  context_size: small      # 5
  reasoning_depth: medium  # 20
  quality_requirement: balanced # 10
# Score: 80 → claude-sonnet-4.5 (MOYEN)
```

---

## Overrides

### CLI Override
Forcer un modèle spécifique:
```bash
copilot --agent=bmad-agent-byan --prompt "create" --model claude-haiku-4.5
```

### Environment Variable
```bash
export BYAN_MODEL=gpt-5-mini
```

### Workflow Override
```yaml
complexity:
  task_type: create
  # ... autres facteurs
model_override: claude-sonnet-4.5  # Force ce modèle
```

---

## Logging et Métriques

Logs automatiques dans: `_byan-output/model-selector.log`

**Format:**
```json
{
  "timestamp": "2026-02-09T10:30:00Z",
  "factors": {...},
  "complexity": 15,
  "recommended_model": "gpt-5-mini",
  "cost_tier": "FREE"
}
```

**Analyse des coûts:**
```bash
# Afficher modèles utilisés
grep "recommended_model" _byan-output/model-selector.log | sort | uniq -c

# Calculer économies
cat _byan-output/model-selector.log | jq '.cost_tier' | sort | uniq -c
```

---

## Intégration NPX Wizard

Dans `create-byan-agent-v2.js`:

```javascript
const ModelSelector = require('./_byan/core/model-selector.js');

// Auto-select model pour installation
const selector = new ModelSelector();
const recommendation = selector.recommend({
  task_type: 'install',
  context_size: 'small',
  reasoning_depth: 'shallow',
  quality_requirement: 'fast'
});

console.log(`Using ${recommendation.recommended_model} (${recommendation.cost_tier})`);
```

---

## Best Practices

### 1. Trust the Selector
Laissez le selector choisir par défaut. Override seulement si nécessaire.

### 2. Calibrate Tasks
Si un workflow coûte trop cher, réévaluez les facteurs:
- Peut-on réduire context_size?
- Reasoning_depth vraiment nécessaire?

### 3. Monitor Costs
Analysez régulièrement `model-selector.log` pour identifier optimisations.

### 4. Test Overrides
Testez avec modèles moins chers si résultats acceptables:
```bash
# Test avec haiku au lieu de sonnet
--model claude-haiku-4.5
```

---

## Troubleshooting

### Score trop élevé
→ Vérifiez que tous les facteurs sont correctement évalués
→ Peut-être surestimez-vous la complexité?

### Modèle inapproprié
→ Utilisez override manuel
→ Calibrez les poids dans `model-selector.yaml`

### Logs manquants
→ Vérifiez que `logging.enabled: true` dans config
→ Créez manuellement `_byan-output/` si nécessaire

---

## Évolution Future

**v1.1 (prévu):**
- Apprentissage automatique des poids
- Historique de performance par modèle
- Suggestions d'optimisation

**v1.2 (prévu):**
- Support multi-providers (Azure, AWS Bedrock)
- Budget limits par utilisateur
- Cost alerts

---

## Références

- Configuration: `_byan/core/model-selector.yaml`
- Script: `_byan/core/model-selector.js`
- Workers BYAN v2: `_byan/workers.md`
- Mantras: #IA-21 (Self-Aware Complexity), #37 (Ockham's Razor), #39 (Consequences)
