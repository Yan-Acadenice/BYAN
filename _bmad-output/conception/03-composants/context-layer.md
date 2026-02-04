# Context Layer - Spécification Technique

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** Ready for Implementation  
**Composant:** Core  
**Priorité:** P0 (Jour 1-2)

---

## Vue d'ensemble

Le **Context Layer** est le système de gestion d'état hiérarchique de BYAN v2.0. Il permet de charger, résoudre et fusionner des contextes à 3 niveaux (Platform → Project → Story) avec mécanisme d'héritage où les niveaux enfants surchargent les niveaux parents.

**Problème résolu:**
- Éliminer la duplication de configuration entre projets/stories
- Fournir un système de variables avec placeholders `{variable}`
- Cache intelligent pour éviter les re-chargements répétés
- Performance < 50ms pour charger un contexte complet

**Périmètre:**
- ✅ Chargement hiérarchique 3 niveaux
- ✅ Résolution de placeholders
- ✅ Cache en mémoire (node-cache)
- ✅ Validation YAML
- ❌ Redis (Phase 2)
- ❌ Compression (Phase 2)

---

## Responsabilités

1. **Chargement hiérarchique**
   - Lire fichiers YAML depuis `_bmad/_context/`
   - Fusionner Platform → Project → Story (child override)
   - Valider structure YAML

2. **Résolution de placeholders**
   - Parser `{key}` dans texte
   - Remplacer par valeurs du contexte
   - Support nested keys `{project.name}`

3. **Cache management**
   - Cache L1 en mémoire (TTL 5 min)
   - Invalidation sur modification fichier
   - Hit rate target: 60%+

4. **Error handling**
   - FileNotFound → Graceful fallback
   - InvalidYAML → Descriptive error
   - MissingKey → Placeholder non remplacé

---

## API Publique

### Classe ContextLayer

```javascript
/**
 * Context Layer - Gestion hiérarchique du contexte BYAN
 * @class ContextLayer
 */
class ContextLayer {
  /**
   * Constructeur
   * @param {Object} options - Configuration
   * @param {string} options.contextDir - Répertoire racine des contextes
   * @param {number} options.cacheTTL - TTL du cache en secondes (défaut: 300)
   */
  constructor(options = {}) {}

  /**
   * Charge un contexte à un niveau spécifique
   * @param {string} level - Niveau: 'platform' | 'project' | 'story'
   * @param {Object} id - Identifiants (projectId, storyId si applicable)
   * @param {string} id.projectId - ID du projet
   * @param {string} id.storyId - ID de la story
   * @returns {Promise<Object>} Contexte fusionné
   * @throws {FileNotFoundError} Si fichier contexte introuvable
   * @throws {InvalidYAMLError} Si YAML invalide
   * 
   * @example
   * // Charger contexte plateforme
   * const platformCtx = await contextLayer.loadContext('platform');
   * 
   * @example
   * // Charger contexte story (fusion auto platform + project + story)
   * const storyCtx = await contextLayer.loadContext('story', {
   *   projectId: 'my-project',
   *   storyId: 'story-001'
   * });
   */
  async loadContext(level, id = null) {}

  /**
   * Récupère une variable du contexte
   * @param {string} key - Clé de la variable (support dot notation: 'project.name')
   * @param {string} level - Niveau de recherche (défaut: tous)
   * @returns {Promise<any>} Valeur de la variable
   * @throws {KeyNotFoundError} Si clé introuvable
   * 
   * @example
   * const userName = await contextLayer.getVariable('user.name');
   * const outputDir = await contextLayer.getVariable('output_folder', 'platform');
   */
  async getVariable(key, level = null) {}

  /**
   * Définit une variable dans le contexte
   * @param {string} key - Clé de la variable
   * @param {any} value - Valeur
   * @param {string} level - Niveau cible: 'platform' | 'project' | 'story'
   * @returns {Promise<void>}
   * 
   * @example
   * await contextLayer.setVariable('current_iteration', 3, 'story');
   */
  async setVariable(key, value, level) {}

  /**
   * Résout les placeholders dans un texte
   * @param {string} text - Texte contenant {placeholders}
   * @param {Object} context - Contexte de résolution
   * @returns {string} Texte avec placeholders résolus
   * 
   * @example
   * const text = "Bonjour {user_name}, projet {project.name}";
   * const resolved = contextLayer.resolvePlaceholders(text, context);
   * // => "Bonjour Yan, projet BYAN"
   */
  resolvePlaceholders(text, context) {}

  /**
   * Invalide le cache pour un niveau
   * @param {string} level - Niveau à invalider
   * @param {Object} id - Identifiants
   * @returns {void}
   */
  invalidateCache(level, id = null) {}

  /**
   * Obtient les statistiques du cache
   * @returns {Object} Stats: hits, misses, hitRate
   */
  getCacheStats() {}
}

module.exports = ContextLayer;
```

---

## Implémentation

### Pseudo-code

```javascript
// _bmad/core/context.js
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');
const NodeCache = require('node-cache');

class ContextLayer {
  constructor(options = {}) {
    this.contextDir = options.contextDir || path.join(process.cwd(), '_bmad/_context');
    this.cache = new NodeCache({ 
      stdTTL: options.cacheTTL || 300,
      checkperiod: 60 
    });
    this.stats = { hits: 0, misses: 0 };
  }

  async loadContext(level, id = null) {
    // 1. Construire clé cache
    const cacheKey = this._buildCacheKey(level, id);
    
    // 2. Vérifier cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;

    // 3. Charger depuis fichiers
    let context = {};
    
    try {
      if (level === 'platform') {
        context = await this._loadYAML('platform.yaml');
      }
      
      else if (level === 'project') {
        const platform = await this.loadContext('platform');
        const project = await this._loadYAML(
          path.join(id.projectId, 'project.yaml')
        );
        context = { ...platform, ...project };
      }
      
      else if (level === 'story') {
        const platform = await this.loadContext('platform');
        const project = await this._loadYAML(
          path.join(id.projectId, 'project.yaml')
        );
        const story = await this._loadYAML(
          path.join(id.projectId, id.storyId, 'story.yaml')
        );
        context = { ...platform, ...project, ...story };
      }
      
      // 4. Mettre en cache
      this.cache.set(cacheKey, context);
      
      return context;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(
          `Context file not found for level: ${level}, id: ${JSON.stringify(id)}`
        );
      }
      if (error.name === 'YAMLException') {
        throw new InvalidYAMLError(
          `Invalid YAML in context file: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getVariable(key, level = null) {
    const context = level 
      ? await this.loadContext(level)
      : await this.loadContext('story'); // Default: story (all merged)
    
    // Support dot notation
    const value = this._getNestedValue(context, key);
    
    if (value === undefined) {
      throw new KeyNotFoundError(`Variable not found: ${key}`);
    }
    
    return value;
  }

  async setVariable(key, value, level) {
    const filePath = this._getContextFilePath(level);
    
    // Load existing context
    const context = await this._loadYAML(filePath);
    
    // Set value (support dot notation)
    this._setNestedValue(context, key, value);
    
    // Write back
    await fs.writeFile(filePath, yaml.dump(context), 'utf8');
    
    // Invalidate cache
    this.invalidateCache(level);
  }

  resolvePlaceholders(text, context) {
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      const value = this._getNestedValue(context, key);
      return value !== undefined ? value : match;
    });
  }

  invalidateCache(level, id = null) {
    const cacheKey = this._buildCacheKey(level, id);
    this.cache.del(cacheKey);
  }

  getCacheStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0
    };
  }

  // Private methods
  _buildCacheKey(level, id) {
    return id 
      ? `${level}_${id.projectId || ''}_${id.storyId || ''}`
      : level;
  }

  async _loadYAML(relativePath) {
    const fullPath = path.join(this.contextDir, relativePath);
    const content = await fs.readFile(fullPath, 'utf8');
    return yaml.load(content);
  }

  _getNestedValue(obj, key) {
    return key.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  _setNestedValue(obj, key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    const target = parts.reduce((acc, part) => {
      if (!acc[part]) acc[part] = {};
      return acc[part];
    }, obj);
    target[last] = value;
  }

  _getContextFilePath(level) {
    // Implementation depends on current context
    // For now, simple mapping
    return path.join(this.contextDir, `${level}.yaml`);
  }
}

// Custom errors
class FileNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

class InvalidYAMLError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidYAMLError';
  }
}

class KeyNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KeyNotFoundError';
  }
}

module.exports = ContextLayer;
```

---

## Error Handling

### Types d'erreurs

| Erreur | Cas | Handling |
|--------|-----|----------|
| `FileNotFoundError` | Fichier contexte absent | Log warning + retourner contexte parent ou {} |
| `InvalidYAMLError` | YAML malformé | Log error + throw avec ligne erreur |
| `KeyNotFoundError` | Variable inexistante | Log warning + retourner placeholder non résolu |
| `CacheError` | Problème node-cache | Log error + bypass cache |

### Stratégies

```javascript
// Graceful fallback pour fichiers manquants
async loadContext(level, id) {
  try {
    // ... normal loading
  } catch (error) {
    if (error instanceof FileNotFoundError && level !== 'platform') {
      // Fallback to parent level
      logger.warn(`Context file missing for ${level}, using parent context`);
      return await this.loadContext(this._getParentLevel(level), id);
    }
    throw error;
  }
}

// Validation YAML avec détails
_loadYAML(path) {
  try {
    return yaml.load(content);
  } catch (error) {
    throw new InvalidYAMLError(
      `Failed to parse YAML at ${path}:\n` +
      `  Line ${error.mark.line}: ${error.reason}`
    );
  }
}
```

---

## Performance Requirements

| Metric | Target | Mesure |
|--------|--------|--------|
| **Load Time** | < 50ms | `console.time()` autour `loadContext()` |
| **Cache Hit Rate** | 60%+ | `getCacheStats().hitRate` |
| **Memory Usage** | < 50MB | Cache size monitoring |
| **Placeholder Resolution** | < 5ms | Benchmark avec 1000 placeholders |

### Optimisations

1. **Cache L1**: node-cache avec TTL 5 min
2. **Lazy loading**: Charger seulement niveaux nécessaires
3. **Pre-compilation**: Parser placeholders regex une seule fois
4. **Batch operations**: Grouper multiple `getVariable()` calls

---

## Tests Scénarios

### Scénario 1: Load Platform Context
```javascript
test('should load platform context', async () => {
  const ctx = await contextLayer.loadContext('platform');
  
  expect(ctx).toHaveProperty('user_name');
  expect(ctx).toHaveProperty('output_folder');
  expect(ctx.user_name).toBe('Yan');
});
```

### Scénario 2: Load Story Context with Inheritance
```javascript
test('should merge platform + project + story', async () => {
  const ctx = await contextLayer.loadContext('story', {
    projectId: 'byan-v2',
    storyId: 'story-001'
  });
  
  // Platform var
  expect(ctx.user_name).toBe('Yan');
  
  // Project var
  expect(ctx.project_name).toBe('BYAN v2.0');
  
  // Story var (overrides project if exists)
  expect(ctx.iteration).toBe(1);
});
```

### Scénario 3: Child Override Parent
```javascript
test('should override parent values', async () => {
  // project.yaml has: output_folder: './custom-output'
  // platform.yaml has: output_folder: './_bmad-output'
  
  const ctx = await contextLayer.loadContext('project', {
    projectId: 'custom-project'
  });
  
  expect(ctx.output_folder).toBe('./custom-output');
});
```

### Scénario 4: Resolve Placeholders
```javascript
test('should resolve placeholders', () => {
  const text = 'Hello {user_name}, project: {project.name}';
  const context = {
    user_name: 'Yan',
    project: { name: 'BYAN' }
  };
  
  const resolved = contextLayer.resolvePlaceholders(text, context);
  
  expect(resolved).toBe('Hello Yan, project: BYAN');
});
```

### Scénario 5: Cache Hit
```javascript
test('should use cache on second call', async () => {
  await contextLayer.loadContext('platform'); // Miss
  await contextLayer.loadContext('platform'); // Hit
  
  const stats = contextLayer.getCacheStats();
  
  expect(stats.hits).toBe(1);
  expect(stats.misses).toBe(1);
  expect(stats.hitRate).toBe('50.00');
});
```

### Scénario 6: File Not Found
```javascript
test('should throw FileNotFoundError', async () => {
  await expect(
    contextLayer.loadContext('story', {
      projectId: 'non-existent',
      storyId: 'story-999'
    })
  ).rejects.toThrow(FileNotFoundError);
});
```

### Scénario 7: Invalid YAML
```javascript
test('should throw InvalidYAMLError', async () => {
  // Create invalid YAML file
  await fs.writeFile(
    path.join(contextDir, 'invalid.yaml'),
    'bad:\n  - yaml\n  missing: colon'
  );
  
  await expect(
    contextLayer._loadYAML('invalid.yaml')
  ).rejects.toThrow(InvalidYAMLError);
});
```

### Scénario 8: Get Variable with Dot Notation
```javascript
test('should get nested variable', async () => {
  const value = await contextLayer.getVariable('project.name');
  expect(value).toBe('BYAN v2.0');
});
```

### Scénario 9: Set Variable
```javascript
test('should set variable and invalidate cache', async () => {
  await contextLayer.setVariable('iteration', 2, 'story');
  
  const ctx = await contextLayer.loadContext('story', {
    projectId: 'byan-v2',
    storyId: 'story-001'
  });
  
  expect(ctx.iteration).toBe(2);
});
```

### Scénario 10: Cache Invalidation
```javascript
test('should invalidate cache on modification', async () => {
  await contextLayer.loadContext('platform'); // Cache
  
  contextLayer.invalidateCache('platform');
  
  const stats = contextLayer.getCacheStats();
  expect(stats.hits).toBe(0); // Cache cleared
});
```

### Scénarios additionnels (11-20)

11. **Performance: Load < 50ms**
12. **Concurrent loads (race conditions)**
13. **TTL expiration**
14. **Missing placeholder (no replacement)**
15. **Empty context file**
16. **Large context (10K+ keys)**
17. **Circular placeholder references**
18. **Special characters in keys**
19. **Unicode in values**
20. **Cache stats accuracy after 100 operations**

---

## Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "js-yaml": "^4.1.0",
    "fs-extra": "^11.2.0",
    "node-cache": "^5.1.2"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

### Installation

```bash
npm install js-yaml fs-extra node-cache
```

---

## Exemples Utilisation

### Exemple 1: CLI Tool

```javascript
const ContextLayer = require('./_bmad/core/context');

async function main() {
  const contextLayer = new ContextLayer();
  
  // Load story context
  const ctx = await contextLayer.loadContext('story', {
    projectId: 'byan-v2',
    storyId: 'story-001'
  });
  
  console.log(`User: ${ctx.user_name}`);
  console.log(`Output: ${ctx.output_folder}`);
  
  // Resolve template
  const template = 'Creating story for {user_name} in {output_folder}';
  const message = contextLayer.resolvePlaceholders(template, ctx);
  console.log(message);
}

main();
```

### Exemple 2: Workflow Integration

```javascript
// Dans WorkflowExecutor
class WorkflowExecutor {
  async execute(workflowPath) {
    // Load context based on workflow location
    const projectId = this._extractProjectId(workflowPath);
    const context = await this.contextLayer.loadContext('project', { projectId });
    
    // Resolve workflow inputs
    const workflow = yaml.load(await fs.readFile(workflowPath, 'utf8'));
    
    for (const step of workflow.steps) {
      step.input = this.contextLayer.resolvePlaceholders(step.input, context);
      // Execute step...
    }
  }
}
```

### Exemple 3: Agent Context

```javascript
// Dans Agent
class Agent {
  async execute(task) {
    // Get agent-specific context
    const agentCtx = await this.contextLayer.getVariable('agents.' + this.name);
    
    // Merge with task context
    const fullContext = { ...agentCtx, ...task.context };
    
    // Use in prompt
    const prompt = this.contextLayer.resolvePlaceholders(
      this.promptTemplate,
      fullContext
    );
    
    return await this.llm.call(prompt);
  }
}
```

---

## Structure Fichiers

```
_bmad/
├── _context/
│   ├── platform.yaml              # Niveau 1
│   ├── byan-v2/
│   │   ├── project.yaml          # Niveau 2
│   │   ├── story-001/
│   │   │   └── story.yaml        # Niveau 3
│   │   └── story-002/
│   │       └── story.yaml
│   └── autre-projet/
│       └── project.yaml
├── core/
│   └── context.js                # Implémentation
└── ...

__tests__/
└── context.test.js               # Tests unitaires
```

### Exemple platform.yaml

```yaml
user_name: Yan
communication_language: Francais
output_folder: "{project-root}/_bmad-output"
llm:
  model: claude-sonnet-4
  temperature: 0.7
```

### Exemple project.yaml

```yaml
project_name: BYAN v2.0
version: 2.0.0-HYPER-MVP
tech_stack: Node.js
# Override parent
output_folder: "./byan-output"
```

### Exemple story.yaml

```yaml
story_id: story-001
title: Context Layer Implementation
iteration: 1
assigned_to: Amelia
# Story-specific vars
test_framework: jest
code_style: standard
```

---

## Métriques Succès

| Metric | Target | Actuel | Status |
|--------|--------|--------|--------|
| Load Time (avg) | < 50ms | TBD | 🟡 |
| Cache Hit Rate | 60%+ | TBD | 🟡 |
| Test Coverage | 80%+ | TBD | 🟡 |
| Memory Usage | < 50MB | TBD | 🟡 |

**Validation:**
```bash
npm test -- context.test.js
npm run benchmark -- context
```

---

**Document créé le 2026-02-04**  
*Spécification technique - Context Layer - BYAN v2.0*  
*Prêt pour implémentation Jour 1-2*
