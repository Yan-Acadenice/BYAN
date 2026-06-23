# Copilot SDK Integration - Worker/Agent Routing Module

**Project:** @byan/copilot-router  
**Type:** Module Standalone MVP  
**Goal:** Routing automatique worker/agent basé sur complexité  
**Date:** 2026-02-10  
**Status:** 🟡 PLAN

---

## 📋 Vue d'ensemble

Module TypeScript qui intègre les concepts BYAN v2 (workers cheap, agents expensive) avec le SDK GitHub Copilot CLI officiel.

**Architecture:**
```
User Application
     ↓
@byan/copilot-router
  - ComplexityAnalyzer (score 0-100)
  - Router (worker vs agent)
  - CostTracker (metrics)
     ↓ JSON-RPC
GitHub Copilot CLI SDK
  - gpt-4o-mini (worker, cheap)
  - gpt-4o (agent, expensive)
```

---

## 🎯 Objectifs MVP

- [x] Analyze task complexity (algorithme scoring)
- [x] Route vers worker (< 30) ou agent (≥ 60)
- [x] Cost tracking par requête
- [x] Retry logic basique
- [x] TypeScript strict + tests Jest

---

## 📦 Structure du Module

```
copilot-router/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main export
│   ├── analyzer.ts           # Complexity scoring
│   ├── router.ts             # Routing logic
│   ├── cost-tracker.ts       # Cost calculation
│   ├── copilot-client.ts     # SDK wrapper
│   └── types.ts              # TypeScript types
├── test/
│   ├── analyzer.test.ts      # 10+ tests
│   ├── router.test.ts        # 15+ tests
│   └── integration.test.ts   # 5+ tests
├── examples/
│   ├── basic-usage.ts
│   ├── with-config.ts
│   └── cost-tracking.ts
└── README.md
```

---

## 🏗️ Composants Clés

### 1. Complexity Analyzer

**Algorithme de scoring:**
```typescript
function calculateComplexity(task: Task): number {
  let score = 0;
  
  // Input length
  if (task.input.length > 1000) score += 20;
  else if (task.input.length > 500) score += 10;
  
  // Task type
  const complexTypes = ['analysis', 'reasoning', 'creation'];
  if (complexTypes.includes(task.type)) score += 30;
  
  // Context size
  if (task.contextSize && task.contextSize > 5000) score += 20;
  
  // Multi-step
  if (task.steps && task.steps > 3) score += 15;
  
  // Output format
  if (task.outputFormat === 'complex') score += 15;
  
  return Math.min(score, 100);
}
```

**Exemples:**
- Simple format task: score = 5 → Worker
- Complex reasoning: score = 75 → Agent

---

### 2. Router

**Logic de routing:**
```typescript
class CopilotRouter {
  async route(task: Task): Promise<RouteResult> {
    const score = calculateComplexity(task);
    
    if (score < 30) {
      // Worker direct (cheap)
      return this.executeWithWorker(task);
    } else if (score < 60) {
      // Worker avec fallback agent
      try {
        return await this.executeWithWorker(task);
      } catch (error) {
        return this.executeWithAgent(task);
      }
    } else {
      // Agent direct (expensive)
      return this.executeWithAgent(task);
    }
  }
}
```

---

### 3. Copilot SDK Client Wrapper

**Intégration SDK:**
```typescript
import { createCopilotClient } from '@github/copilot-sdk';

class CopilotClient {
  private client: any;
  
  constructor() {
    this.client = createCopilotClient({
      auth: 'github',
      allowAll: true
    });
  }
  
  async execute(options: {
    prompt: string;
    model: string;
  }): Promise<ExecutionResult> {
    const response = await this.client.chat({
      messages: [{ role: 'user', content: options.prompt }],
      model: options.model
    });
    
    return {
      content: response.choices[0].message.content,
      tokens: response.usage.total_tokens,
      model: options.model
    };
  }
}
```

---

### 4. Cost Tracker

**Pricing:**
```typescript
const MODEL_COSTS = {
  'gpt-4o-mini': {
    input: 0.150 / 1_000_000,
    output: 0.600 / 1_000_000
  },
  'gpt-4o': {
    input: 2.50 / 1_000_000,
    output: 10.00 / 1_000_000
  }
};
```

**Tracking:**
```typescript
class CostTracker {
  record(entry: {
    type: 'worker' | 'agent';
    model: string;
    score: number;
    cost: number;
  });
  
  getStats() {
    return {
      total: this.records.length,
      worker: { count, totalCost },
      agent: { count, totalCost },
      totalCost,
      avgCostPerCall
    };
  }
}
```

---

## 💻 Usage

### Basic
```typescript
import { CopilotRouter } from '@byan/copilot-router';

const router = new CopilotRouter();

// Simple task → Worker
await router.route({
  input: "Format this JSON",
  type: 'simple'
});
// Uses: gpt-4o-mini

// Complex task → Agent  
await router.route({
  input: "Analyze architecture",
  type: 'analysis',
  contextSize: 8000
});
// Uses: gpt-4o
```

### With Config
```typescript
const router = new CopilotRouter({
  workerThreshold: 25,
  agentThreshold: 70,
  workerModel: 'gpt-4o-mini',
  agentModel: 'claude-sonnet-4',
  fallbackEnabled: true
});
```

### Cost Tracking
```typescript
const stats = router.getCostStats();
// {
//   total: 100,
//   worker: { count: 60, totalCost: 0.018 },
//   agent: { count: 40, totalCost: 0.120 },
//   totalCost: 0.138
// }
```

---

## 📊 Économie

**Scénario: 100 tâches/semaine**

```
100% Agent (gpt-4o):
  100 × 0.003$ = 0.30$

60% Worker + 40% Agent:
  (60 × 0.0003$) + (40 × 0.003$) = 0.138$

Économie: 54% réduction
```

---

## 🧪 Testing

### Unit Tests (30+ tests)
```typescript
// analyzer.test.ts
describe('ComplexityAnalyzer', () => {
  it('should score simple tasks low', () => {
    expect(calculateComplexity({
      input: "Hello",
      type: 'simple'
    })).toBeLessThan(30);
  });
});

// router.test.ts
describe('CopilotRouter', () => {
  it('should route simple tasks to worker', async () => {
    const router = new CopilotRouter();
    const result = await router.route({
      input: "Format JSON",
      type: 'simple'
    });
    expect(result.model).toBe('gpt-4o-mini');
  });
});
```

### Integration Tests (5+ tests)
```typescript
describe('Integration with Copilot SDK', () => {
  it('should execute real request', async () => {
    const router = new CopilotRouter();
    const result = await router.route({
      input: "Say hello",
      type: 'simple'
    });
    expect(result.content).toBeTruthy();
  });
});
```

---

## 📅 Plan d'Implémentation

**7 jours:**

1. **Jour 1:** Setup projet + TypeScript + Jest
2. **Jour 2:** Complexity Analyzer + tests
3. **Jour 3:** Router logic + tests
4. **Jour 4:** SDK integration + tests
5. **Jour 5:** Cost tracker + tests
6. **Jour 6:** Documentation + examples
7. **Jour 7:** Polish + NPM publish

---

## 📈 Success Metrics

**Performance:**
- Routing overhead: < 10ms
- API response: < 2s (worker), < 5s (agent)
- Routing accuracy: 90%+

**Cost:**
- Baseline: $0.30/100 calls
- Target: $0.138/100 calls
- Savings: 54%+

**Quality:**
- Test coverage: > 85%
- Type safety: 100% (strict mode)
- Zero runtime errors

---

## 🔒 Configuration

**`copilot-router.config.json`:**
```json
{
  "routing": {
    "workerThreshold": 30,
    "agentThreshold": 60,
    "fallbackEnabled": true
  },
  "models": {
    "worker": "gpt-4o-mini",
    "agent": "gpt-4o"
  },
  "cost": {
    "trackingEnabled": true,
    "exportInterval": 3600000
  },
  "auth": {
    "method": "github"
  }
}
```

---

## 📚 Dependencies

```json
{
  "dependencies": {
    "@github/copilot-sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

---

## 🚀 Deployment

```bash
# NPM
npm install @byan/copilot-router

# GitHub Package Registry
npm install @byan/copilot-router --registry=https://npm.pkg.github.com

# Local development
git clone https://github.com/byan/copilot-router
npm install
npm run build
npm link
```

---

## 🎯 Next Steps (Post-MVP)

1. **Worker Pool:** Queue management, 2 concurrent workers
2. **Context Management:** Session state, history
3. **Workflows:** Multi-step orchestration
4. **Dashboard:** Web UI for metrics
5. **Multiple Providers:** Anthropic, OpenAI direct
6. **Cache:** Redis for common queries
7. **Streaming:** Real-time responses

---

## 🤝 Integration BYAN v2

```typescript
// Future integration
import { CopilotRouter } from '@byan/copilot-router';

class ByanV2 {
  private router: CopilotRouter;
  
  async executeTask(task: Task) {
    return this.router.route(task);
  }
}
```

---

**Status:** 🟡 PLAN READY  
**Estimated:** 7 jours (1 dev)  
**Risk:** Low (SDK stable)

**Ready to start?** ✅
