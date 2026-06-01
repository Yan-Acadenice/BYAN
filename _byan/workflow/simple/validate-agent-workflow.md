---
name: validate-agent-workflow
description: "Workflow de validation des profils d'agents BYAN v2"
version: "2.0.0"
module: byan
---

# BYAN v2 Agent Validation Workflow

## Vue d'ensemble

Ce workflow valide les profils d'agents créés par BYAN v2 contre les exigences du GitHub Copilot CLI SDK et les standards BYAN.

**Durée:** < 5 secondes  
**Mode:** Automatique  
**Résultat:** Pass/Fail avec rapport détaillé

---

## Workflow Steps

### Step 1: Load Agent Profile

**Action:** Charger le fichier markdown de l'agent

```javascript
const fs = require('fs');
const profileContent = fs.readFileSync(agentPath, 'utf-8');
```

**Validation:**
- Fichier existe
- Extension .md
- Contenu non vide

### Step 2: Parse Frontmatter

**Action:** Extraire et valider le YAML frontmatter

```javascript
const matter = require('gray-matter');
const { data, content } = matter(profileContent);
```

**Champs requis:**
- `name` (string, lowercase-with-dashes)
- `description` (string, < 200 chars)
- `version` (semantic versioning)

**Champs optionnels:**
- `icon`
- `tags`
- `dependencies`

### Step 3: Validate Agent Structure

**Worker:** `generation/agent-profile-validator.js`

**Checks:**

1. **YAML Frontmatter**
   - Présent en début de fichier
   - Format valide
   - Champs obligatoires présents

2. **Agent Definition**
   - Présence section persona
   - Présence section capabilities
   - Présence section knowledge base

3. **Markdown Syntax**
   - Liens valides
   - Code blocks bien formés
   - Headers hiérarchie correcte

### Step 4: SDK Compliance Check

**Référence:** GitHub Copilot CLI SDK requirements

**Validations:**

1. **Profile Format**
   ```yaml
   name: agent-name  # lowercase-with-dashes
   description: "Brief description"
   version: "1.0.0"
   ```

2. **Agent Instructions**
   - Section `<agent_instructions>` présente
   - Contenu structuré
   - Activation steps définis

3. **Capabilities**
   - Au moins 1 capability définie
   - Format structured (liste ou table)

4. **No Emoji Pollution (Mantra IA-23)**
   - Zero emojis dans code technique
   - Zero emojis dans metadata
   - Emojis autorisés uniquement dans docs utilisateur

### Step 5: Generate Validation Report

**Output:** JSON report

```json
{
  "valid": true,
  "profile": "agent-name",
  "version": "1.0.0",
  "timestamp": "2026-02-07T12:00:00Z",
  "checks": {
    "frontmatter": { "passed": true },
    "structure": { "passed": true },
    "sdkCompliance": { "passed": true },
    "emojiPollution": { "passed": true, "violations": [] }
  },
  "warnings": [],
  "errors": []
}
```

---

## Validation Rules

### Rule 1: Name Format

**Regex:** `^[a-z][a-z0-9-]*[a-z0-9]$`

**Valid:**
- `code-review-assistant`
- `test-generator`
- `doc-writer-pro`

**Invalid:**
- `CodeReview` (uppercase)
- `code_review` (underscore)
- `-code-review` (starts with dash)

### Rule 2: Description Length

**Max:** 200 characters  
**Min:** 20 characters

**Rationale:** CLI display constraints

### Rule 3: Version Format

**Format:** Semantic versioning (X.Y.Z)

**Examples:**
- `1.0.0` ✅
- `2.1.3` ✅
- `1.0` ❌
- `v1.0.0` ❌

### Rule 4: Emoji Zero Tolerance

**Scope:** Code, YAML, technical sections

**Allowed:** User-facing documentation only

**Enforcement:**
```javascript
const emojiRegex = /[\u{1F600}-\u{1F64F}]/gu;
if (emojiRegex.test(yamlContent)) {
  errors.push('Emoji pollution detected (Mantra IA-23)');
}
```

---

## Integration

### Programmatic Usage

```javascript
const AgentProfileValidator = require('./src/byan-v2/generation/agent-profile-validator');

const validator = new AgentProfileValidator();
const result = await validator.validateProfile(agentPath);

if (result.valid) {
  console.log('✅ Agent profile valid');
} else {
  console.error('❌ Validation failed:', result.errors);
}
```

### CLI Usage

```bash
# Validate single agent
byan-v2 validate agent.md

# Validate all agents in directory
byan-v2 validate .github/copilot/agents/*.md

# Output JSON report
byan-v2 validate agent.md --format=json
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Validate BYAN Agents
  run: |
    npm install
    npm run validate:agents
```

---

## Error Handling

### Invalid Frontmatter

**Error:**
```
YAML frontmatter missing or invalid
Expected format:
---
name: agent-name
description: "Description"
version: "1.0.0"
---
```

**Action:** Fix frontmatter syntax

### Missing Required Fields

**Error:**
```
Missing required field: 'description'
```

**Action:** Add missing field to frontmatter

### Emoji Detected

**Error:**
```
Emoji pollution detected (Mantra IA-23)
Found: 🚀 at line 42
Emojis not allowed in technical sections
```

**Action:** Remove all emojis from code/YAML

---

## Testing

### Unit Tests

**File:** `__tests__/byan-v2/generation/agent-profile-validator.test.js`

**Coverage:**
- ✅ Valid profile passes all checks
- ✅ Invalid YAML frontmatter detected
- ✅ Missing required fields detected
- ✅ Emoji pollution detected
- ✅ Name format validation
- ✅ Description length validation
- ✅ Version format validation

### Integration Tests

**Scenarios:**
1. Validate demo agent (demo-byan-v2-simple.js output)
2. Validate all BYAN agents in _byan/agents/
3. Detect invalid agents (negative tests)

---

## Configuration

**File:** `_byan/config.yaml`

```yaml
validation:
  strict_mode: true
  emoji_tolerance: zero
  min_description_length: 20
  max_description_length: 200
  allow_beta_versions: true
```

---

## Metrics

### Validation Time

- **Average:** < 100ms per agent
- **Max:** < 500ms (complex agents)

### Success Rate

- **Current:** 100% (all generated agents pass)
- **Target:** 100% maintained

---

## References

- GitHub Copilot CLI SDK: https://github.com/github/copilot-sdk
- Semantic Versioning: https://semver.org/
- YAML Spec: https://yaml.org/spec/
- Mantra IA-23: Zero Emoji Pollution in technical artifacts

---

**Status:** ✅ OPERATIONAL  
**Version:** 2.0.0  
**Last Updated:** 2026-02-07
