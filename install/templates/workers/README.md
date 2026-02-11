# Cost Optimizer Worker Template

Worker BYAN qui optimise automatiquement les coûts LLM en routant vers le modèle optimal.

## Installation

Ce worker est automatiquement installé par Yanstaller si vous sélectionnez "Cost Optimizer".

## Utilisation

### Dans un agent BYAN

```javascript
const CostOptimizerWorker = require('./_byan/workers/cost-optimizer');

const worker = new CostOptimizerWorker({
  workerThreshold: 30,
  agentThreshold: 60,
  verbose: true
});

// Router une tâche
const result = await worker.execute({
  input: 'Your prompt here',
  type: 'generate'
});

console.log(result.content);
console.log(`Cost: $${result.cost}`);
```

### Configuration

```javascript
const worker = new CostOptimizerWorker({
  workerThreshold: 30,     // < 30 → worker (cheap)
  agentThreshold: 60,      // ≥ 60 → agent (expensive)
  fallbackEnabled: true,   // Fallback worker → agent si échec
  maxRetries: 3,           // Tentatives max
  testMode: true,          // Mode test (sans vraie API)
  verbose: false           // Logs détaillés
});
```

### Méthodes

**execute(task)** - Route et exécute une tâche
```javascript
const result = await worker.execute({
  input: 'Fix this bug',
  type: 'simple',
  contextSize: 1000,
  steps: 2,
  outputFormat: 'text'
});
```

**getStatistics()** - Obtenir les statistiques
```javascript
const stats = worker.getStatistics();
console.log(`Économies: ${stats.savingsPercent}%`);
```

**printSummary()** - Afficher résumé formaté
```javascript
worker.printSummary();
```

**analyzeComplexity(task)** - Analyser sans exécuter
```javascript
const complexity = worker.analyzeComplexity({ input: prompt });
console.log(`Score: ${complexity.total}`);
```

**exportData(format)** - Exporter données
```javascript
const json = worker.exportData('json');
const csv = worker.exportData('csv');
```

**reset()** - Réinitialiser stats
```javascript
worker.reset();
```

**close()** - Nettoyer ressources
```javascript
await worker.close();
```

## Types de tâches

- **simple** - Corrections simples, typos (score: 0-25)
- **format** - Formatage, organisation (score: 5-30)
- **generate** - Génération de code (score: 15-45)
- **analysis** - Analyse de code (score: 30-60)
- **reasoning** - Conception, architecture (score: 30-75)
- **creation** - Création complexe (score: 30-75)

## Économies attendues

- **Workload typique:** 60% worker, 40% agent
- **Économies:** ~54% sur les coûts LLM
- **Coût worker:** $0.0003 par appel
- **Coût agent:** $0.003 par appel (10x plus cher)

## Test

```bash
cd install/templates/workers
node cost-optimizer.js
```

Output attendu:
```
🚀 Cost Optimizer Worker Demo

1️⃣  Simple task:
[CostOptimizer] Routed to: worker
Result: ✓

2️⃣  Complex task:
[CostOptimizer] Routed to: worker
Result: ✓

📊 Statistics:
Savings: 87.5%
```

## Production

Pour utiliser avec vraie API:

```javascript
const worker = new CostOptimizerWorker({
  testMode: false,  // IMPORTANT
  verbose: true
});
```

Nécessite:
- GitHub Copilot subscription
- GITHUB_TOKEN env variable

## Support

- Package: https://npmjs.com/package/byan-copilot-router
- Issues: https://github.com/byan/copilot-router/issues
