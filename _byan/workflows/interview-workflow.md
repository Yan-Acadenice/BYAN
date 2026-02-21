---
name: interview-workflow
description: "Workflow d'interview BYAN v2 - 12 questions structurées en 4 phases"
version: "2.0.0"
module: byan
phases: 4
questions_per_phase: 3
total_questions: 12
---

# BYAN v2 Interview Workflow

## Vue d'ensemble

Ce workflow orchestre l'interview structurée de BYAN v2 pour créer des agents intelligents. Il guide l'utilisateur à travers 4 phases distinctes avec 3 questions minimum par phase.

**Durée estimée:** 10-15 minutes  
**Questions totales:** 12 (3 par phase)  
**Format:** Conversationnel, adaptatif

---

## Architecture du Workflow

### Machine à États

```
INIT 
  → INTERVIEW (4 phases)
      → CONTEXT (Q1-Q3)
      → BUSINESS (Q4-Q6)
      → AGENT_NEEDS (Q7-Q9)
      → VALIDATION (Q10-Q12)
  → ANALYSIS
  → GENERATION
  → COMPLETED
```

### Workers Impliqués

- **orchestrator/interview-state.js** - Gestion des phases et questions
- **context/session-state.js** - Persistance des réponses
- **dispatcher/task-router.js** - Routage des tâches complexes
- **generation/profile-template.js** - Génération finale

---

## Phase 1: CONTEXT (Questions 1-3)

**Objectif:** Comprendre le contexte projet, domaine, utilisateurs

### Question 1: Domaine du projet
```
"What is the main purpose or domain of your project?"
```

**Attentes:**
- Description du domaine métier
- Type de projet (web, mobile, data, etc.)
- Contexte général

**Exemples de réponses:**
- "E-commerce platform for sustainable fashion"
- "Healthcare analytics dashboard"
- "DevOps automation toolkit"

### Question 2: Utilisateurs/Stakeholders
```
"Who are the primary users or stakeholders?"
```

**Attentes:**
- Rôles des utilisateurs
- Niveau d'expertise
- Besoins spécifiques

**Exemples:**
- "Developers with 2-5 years experience"
- "Non-technical marketing team"
- "Senior architects and tech leads"

### Question 3: Workflow actuel
```
"What is the current workflow or process this agent will support?"
```

**Attentes:**
- Processus existant
- Points de friction
- Outils utilisés

**Exemples:**
- "Manual code reviews taking 2-3 hours per PR"
- "Weekly sprint planning meetings"
- "Deployment pipeline validation"

---

## Phase 2: BUSINESS (Questions 4-6)

**Objectif:** Identifier problèmes métier, objectifs, critères de succès

### Question 4: Problème à résoudre
```
"What specific problem or challenge does this agent need to solve?"
```

**Attentes:**
- Description claire du problème
- Impact actuel (coût, temps, qualité)
- Urgence/priorité

**Exemples:**
- "Code reviews miss security vulnerabilities 30% of the time"
- "PRD creation takes 5 days per feature"
- "Testing coverage inconsistent across teams"

### Question 5: Objectifs clés
```
"What are the key goals or objectives for this agent?"
```

**Attentes:**
- Objectifs mesurables
- Résultats attendus
- Bénéfices principaux

**Exemples:**
- "Reduce review time from 3h to 30min"
- "Increase security issue detection to 95%"
- "Standardize documentation format"

### Question 6: Mesure du succès
```
"How will you measure the success of this agent?"
```

**Attentes:**
- KPIs quantitatifs
- Critères qualitatifs
- Seuils d'acceptation

**Exemples:**
- "Time saved per review > 70%"
- "Zero critical vulnerabilities in production"
- "Developer satisfaction score > 4/5"

---

## Phase 3: AGENT_NEEDS (Questions 7-9)

**Objectif:** Définir capacités, connaissances, comportement de l'agent

### Question 7: Capacités spécifiques
```
"What specific capabilities should this agent have?"
```

**Attentes:**
- Liste de capacités techniques
- Compétences requises
- Outils/intégrations

**Exemples:**
- "Analyze JavaScript/TypeScript code, detect SQL injection, suggest fixes"
- "Generate PRD from user stories, validate against templates"
- "Execute Playwright tests, analyze failures, create bug reports"

### Question 8: Connaissances/Expertise
```
"What knowledge or expertise should the agent possess?"
```

**Attentes:**
- Domaine d'expertise
- Standards/best practices
- Contexte spécifique

**Exemples:**
- "OWASP Top 10, React best practices, WCAG accessibility"
- "Merise Agile methodology, TDD, 64 mantras"
- "GitHub Actions, Docker, Kubernetes deployment"

### Question 9: Style d'interaction
```
"How should the agent interact with users (tone, style, format)?"
```

**Attentes:**
- Ton de communication
- Format des sorties
- Niveau de détail

**Exemples:**
- "Professional consultant, challenges assumptions, Zero Trust approach"
- "Friendly teacher, explains concepts, visual diagrams"
- "Terse engineer, bullet points, file paths only"

---

## Phase 4: VALIDATION (Questions 10-12)

**Objectif:** Confirmer compréhension, identifier lacunes, clarifications

### Question 10: Confirmation synthèse
```
"Let me confirm: The agent will help with [SUMMARY]. Is this correct?"
```

**Attentes:**
- Confirmation ou corrections
- Ajustements priorités
- Validation globale

**Format:** Génération automatique du [SUMMARY] basé sur Q1-Q9

### Question 11: Exigences critiques
```
"Are there any critical requirements or edge cases we haven't covered?"
```

**Attentes:**
- Cas limites
- Contraintes non mentionnées
- Dépendances critiques

**Exemples:**
- "Must work offline"
- "GDPR compliance required"
- "Integration with legacy system X"

### Question 12: Critère d'échec
```
"What would make this agent a complete failure in your eyes?"
```

**Attentes:**
- Red flags absolus
- Comportements inacceptables
- Limites non négociables

**Exemples:**
- "False positives > 20%"
- "Slower than manual process"
- "Requires PhD to configure"

---

## Logique d'Adaptation

### Question Supplémentaire Conditionnelle

Si réponse ambiguë ou incomplète, le workflow peut poser des questions de clarification:

**Triggers:**
- Réponse < 10 caractères
- Mots-clés manquants ("don't know", "maybe", "not sure")
- Contradiction avec réponses précédentes

**Actions:**
- Question de clarification
- Reformulation
- Exemples concrets

### Transition de Phase

**Critères:**
- Minimum 3 réponses par phase
- Réponses substantielles (>20 caractères)
- Pas de contradictions majeures

**Mécanisme:**
```javascript
if (phaseResponses[currentPhase].length >= 3 && allResponsesValid) {
  transitionToNextPhase();
}
```

---

## Intégration avec Workers

### 1. Interview State (orchestrator/interview-state.js)

```javascript
// Initialize
const interviewState = new InterviewState(sessionState);

// Ask questions
const question = interviewState.askNextQuestion();

// Submit response
interviewState.submitResponse(response);

// Check completion
if (interviewState.isInterviewComplete()) {
  // → Transition to ANALYSIS
}
```

### 2. Session State (context/session-state.js)

Persist interview data:

```javascript
sessionState.addResponse({
  phase: 'CONTEXT',
  questionNumber: 1,
  question: '...',
  response: '...',
  timestamp: Date.now()
});
```

### 3. Task Router (dispatcher/task-router.js)

Pour questions complexes nécessitant sous-agents:

```javascript
if (complexityScore > THRESHOLD_MEDIUM) {
  routeToTaskTool('explore', question);
}
```

### 4. Analysis State (orchestrator/analysis-state.js)

Après interview:

```javascript
// Extract concepts
const concepts = analysisState.extractConcepts(allResponses);

// Identify gaps
const gaps = analysisState.identifyGaps(concepts);

// Generate recommendations
const recommendations = analysisState.recommend(concepts);
```

### 5. Generation State (orchestrator/generation-state.js)

Génération finale:

```javascript
const profile = await generationState.generateProfile({
  concepts,
  recommendations,
  template: 'default-agent'
});
```

---

## Fichiers de Sortie

### 1. Profil Agent (Markdown)

**Localisation:** `{project-root}/_byan-output/{agent-name}.md`

**Contenu:**
- YAML frontmatter (metadata)
- Agent persona
- Capabilities
- Knowledge base
- Interaction rules

### 2. Agent Soul (Markdown)

**Localisation:** `{project-root}/_byan/{module}/agents/{agent-name}-soul.md`

**Source:** `{project-root}/_byan/creator-soul.md`
**Template:** `{project-root}/_byan/bmb/workflows/byan/templates/soul-template.md`

**Contenu:**
- Noyau immuable (hérité du créateur, adapté au rôle)
- Personnalité, rituels, lignes rouges
- Phrase fondatrice unique à l'agent
- Couche vivante (vide au démarrage)

**Processus:**
1. BYAN lit le creator-soul.md
2. Distille les valeurs à travers le prisme du rôle de l'agent
3. Génère le soul à partir du template
4. Demande validation à l'utilisateur avant de sauvegarder

### 3. Session Log (JSON)

**Localisation:** `{project-root}/_byan/memory/{session-id}.json`

**Contenu:**
```json
{
  "sessionId": "...",
  "timestamp": "...",
  "phases": {
    "CONTEXT": [...],
    "BUSINESS": [...],
    "AGENT_NEEDS": [...],
    "VALIDATION": [...]
  },
  "analysis": {...},
  "generatedProfile": "..."
}
```

### 3. Métriques (JSON)

**Localisation:** `{project-root}/_byan/memory/metrics.json`

**Contenu:**
```json
{
  "totalSessions": 42,
  "avgQuestionsPerSession": 12.3,
  "avgDurationMinutes": 13.5,
  "successRate": 0.95,
  "phaseDistribution": {
    "CONTEXT": 3.1,
    "BUSINESS": 3.0,
    "AGENT_NEEDS": 3.2,
    "VALIDATION": 3.0
  }
}
```

---

## Gestion des Erreurs

### Réponse vide ou invalide

```javascript
if (!response || response.trim().length === 0) {
  throw new Error('Response cannot be empty');
}
```

**Action:** Demander re-saisie

### Session expirée

```javascript
if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
  throw new Error('Session expired. Please start a new interview.');
}
```

**Action:** Suggérer nouvelle session

### Worker failure

```javascript
try {
  const result = await worker.execute(task);
} catch (error) {
  logger.error('Worker failed', error);
  // Fallback to local execution
  const result = await localExecutor.execute(task);
}
```

**Action:** Fallback gracieux

---

## Tests & Validation

### Tests Unitaires

**Fichier:** `__tests__/byan-v2/orchestrator/interview-state.test.js`

**Couverture:**
- ✅ askNextQuestion() returns correct question for each phase
- ✅ submitResponse() stores response and advances
- ✅ Phase transitions after 3 responses
- ✅ isInterviewComplete() detects completion
- ✅ Error handling for empty responses

### Tests d'Intégration

**Fichier:** `__tests__/byan-v2/integration/full-interview-flow.test.js`

**Scénarios:**
- Complete interview (12 questions)
- Adaptive interview (clarification questions)
- Complex delegation (task routing)
- Profile generation end-to-end

### Validation Manuelle

**Plan:** `BYAN-V2-MANUAL-TEST-PLAN.md`

1. Run demo-byan-v2-simple.js
2. Verify 12 questions asked
3. Check profile generated
4. Validate against GitHub Copilot CLI requirements

---

## Métriques de Performance

### Temps d'Interview

- **Objectif:** < 15 minutes pour interview complète
- **Actuel:** ~12 minutes (moyenne)
- **Métrique:** `metrics.avgDurationMinutes`

### Taux de Complétion

- **Objectif:** > 90% des sessions complétées
- **Actuel:** 95%
- **Métrique:** `metrics.successRate`

### Qualité des Profils

- **Objectif:** 100% des profils valides selon SDK
- **Actuel:** 100% (881/881 tests passing)
- **Métrique:** `validator.validateProfile()`

---

## Configuration

### Variables (_byan/config.yaml)

```yaml
interview:
  max_questions: 12
  min_responses_per_phase: 3
  session_timeout_minutes: 30
  adaptive_clarification: true
  complexity_threshold: 0.6
  enable_task_delegation: true
```

### Personnalisation

**Questions personnalisées:**

```javascript
// Override default questions
byan.setCustomQuestions('CONTEXT', [
  'Custom question 1',
  'Custom question 2',
  'Custom question 3'
]);
```

**Templates personnalisés:**

```javascript
// Use custom template
byan.setTemplate('my-custom-template');
```

---

## Références

### Code Source
- `src/byan-v2/orchestrator/interview-state.js` - Logique interview
- `src/byan-v2/orchestrator/state-machine.js` - Machine à états
- `src/byan-v2/index.js` - Point d'entrée principal

### Documentation
- `README-BYAN-V2.md` - Vue d'ensemble BYAN v2
- `API-BYAN-V2.md` - API complète
- `QUICK-START-BYAN-V2.md` - Guide démarrage rapide

### Tests
- `__tests__/byan-v2/orchestrator/` - Tests unitaires
- `__tests__/byan-v2/integration/` - Tests intégration
- `demo-byan-v2-simple.js` - Démo complète

---

## Changelog

### v2.0.0 (Current)
- ✅ 4 phases structurées (CONTEXT, BUSINESS, AGENT_NEEDS, VALIDATION)
- ✅ 12 questions par défaut (3 par phase)
- ✅ Adaptation dynamique (clarification conditionnelle)
- ✅ Intégration workers (dispatcher, analysis, generation)
- ✅ Persistance session + métriques
- ✅ 881/881 tests passing

### Roadmap v2.1
- [ ] Multi-language support (FR/EN auto-detection)
- [ ] Voice input option
- [ ] Collaborative interviews (multi-user)
- [ ] Import from existing agents (reverse engineering)

---

**Status:** ✅ OPERATIONAL  
**Version:** 2.0.0  
**Last Updated:** 2026-02-07  
**Maintainer:** BYAN v2 Team
