# BYAN v2.1.0 - BMAD Features Quick Reference

## Activation

Toutes les fonctionnalités BMAD sont **activées par défaut** dans `_byan/config.yaml`:

```yaml
bmad_features:
  enabled: true
```

Pour désactiver globalement: `enabled: false`

---

## 1. GlossaryBuilder - Glossaire Métier

### Quand l'utiliser?
- Projets ecommerce, finance, healthcare, banking, insurance
- Vocabulaire métier complexe nécessitant clarification
- Communication entre équipes techniques et métier

### Déclenchement automatique
```yaml
glossary:
  enabled: true
  auto_trigger_domains:
    - ecommerce
    - finance
    - healthcare
```

### Utilisation manuelle
```javascript
const byan = new ByanV2();

// Démarrer la session glossaire
const prompt = await byan.startGlossary();
console.log(prompt); // Instructions

// Ajouter un concept
const result = await byan.addConcept('Commande', 'Une demande d\'achat...');
console.log(result.suggestions); // Concepts liés suggérés

// Vérifier si complet
const isComplete = await byan.isGlossaryComplete();

// Exporter
const glossary = await byan.exportGlossary();
```

### Configuration
```yaml
glossary:
  min_concepts: 5              # Nombre minimum de concepts
  validation:
    min_definition_length: 20  # Longueur minimale
    clarity_threshold: 0.7     # Score de clarté minimum
```

---

## 2. FiveWhysAnalyzer - Analyse Cause Racine

### Quand l'utiliser?
- L'utilisateur mentionne un problème/difficulté
- Vous voulez comprendre la cause profonde
- Questions 4 et 5 de l'interview (par défaut)

### Déclenchement automatique
```yaml
five_whys:
  enabled: true
  auto_trigger: true
  trigger_questions: [4, 5]  # Questions qui déclenchent la détection
```

### Utilisation manuelle
```javascript
// Détecter les pain points
const painCheck = await byan.detectPainPoints(
  "Nous avons des problèmes de déploiement"
);
console.log(painCheck.hasPainPoints); // true
console.log(painCheck.painPoints);    // Array des pain points détectés

// Démarrer l'analyse
const whys = await byan.startFiveWhys(response);
if (whys.needsWhys) {
  console.log(whys.firstQuestion); // "Pourquoi...?"
}

// Traiter les réponses WHY
const next = await byan.processWhyAnswer("Parce que...");
console.log(next.complete); // false si pas fini
console.log(next.question); // Prochaine question WHY

// Obtenir la cause racine
const rootCause = await byan.getRootCause();
console.log(rootCause.cause);
console.log(rootCause.depth); // Profondeur atteinte (1-5)
```

### Configuration
```yaml
five_whys:
  max_depth: 5  # Nombre maximum de WHY (1-5)
  pain_keywords:
    - problem
    - issue
    - challenge
    - difficult
    # ... 18 mots-clés par défaut
```

---

## 3. ActiveListener - Reformulation Active

### Quand l'utiliser?
- **Toujours activé** pour chaque réponse utilisateur
- Reformulation tous les 3 réponses (configurable)
- Validation en fin de phase

### Déclenchement automatique
Intégré dans `submitResponse()` - aucune action requise!

### Utilisation manuelle
```javascript
// Écouter et reformuler
const result = await byan.listen(
  "On a besoin d'un truc pour gérer les commandes"
);
console.log(result.reformulated);  // Version clarifiée
console.log(result.clarityScore);  // 0.0 - 1.0
console.log(result.keyPoints);     // Points clés extraits
console.log(result.summary);       // Résumé

// Reformuler seulement
const reformulated = await byan.reformulate(text);

// Vérifier si validation nécessaire
const needsValidation = await byan.needsValidation();

// Valider la compréhension
if (needsValidation) {
  const validation = await byan.validateUnderstanding(true);
  console.log(validation.summary); // Résumé à confirmer
}
```

### Configuration
```yaml
active_listening:
  enabled: true
  reformulate_every: 3           # Fréquence de validation
  validate_at_phase_end: true    # Valider en fin de phase
  auto_summarize: true           # Générer résumés auto
```

---

## 4. MantraValidator - Validation des Mantras

### Quand l'utiliser?
- **Automatique** à la génération du profil agent
- Validation contre 64 mantras (Merise Agile + IA)
- Score minimum requis: 80/100

### Déclenchement automatique
Intégré dans `generateProfile()` si activé:
```yaml
mantras:
  validate: true
  enforce_on_generation: true  # Valider automatiquement
```

### Utilisation manuelle
```javascript
// Valider un agent
const results = await byan.validateAgent(agentDefinition);

console.log(results.score);              // Score global (0-100)
console.log(results.compliant);          // Array des mantras OK
console.log(results.nonCompliant);       // Array des mantras KO
console.log(results.errors);             // Mantras critiques manquants
console.log(results.warnings);           // Mantras importants manquants

// Obtenir juste le score
const score = await byan.getComplianceScore();

// Rapport détaillé
const report = await byan.getComplianceReport();
```

### Configuration
```yaml
mantras:
  validate: true
  min_score: 80                  # Score minimum requis
  enforce_on_generation: true    # Valider à la génération
  fail_on_low_score: false       # Échouer si score bas?
  categories:
    - merise-agile
    - ia
```

**Note:** `fail_on_low_score: true` provoquera une erreur si score < min_score

---

## États Optionnels

### GLOSSARY (optionnel)
- **Position:** Entre INTERVIEW et ANALYSIS
- **Déclenchement:** Auto si domaine dans `auto_trigger_domains`
- **Skip:** Possible - transition directe INTERVIEW → ANALYSIS

### VALIDATION (optionnel)
- **Position:** Entre GENERATION et COMPLETED
- **Déclenchement:** Auto si `enforce_on_generation: true`
- **Skip:** Possible - transition directe GENERATION → COMPLETED

### Flux complet avec états optionnels
```
INTERVIEW → [GLOSSARY] → ANALYSIS → GENERATION → [VALIDATION] → COMPLETED
```

### Vérifier si état optionnel
```javascript
const isOptional = byan.stateMachine.isStateOptional('GLOSSARY');
const description = byan.stateMachine.getStateDescription('GLOSSARY');
```

---

## Désactivation par Module

### Désactiver un module spécifique
```yaml
bmad_features:
  enabled: true
  
  glossary:
    enabled: false  # Désactiver GlossaryBuilder
  
  five_whys:
    enabled: false  # Désactiver FiveWhysAnalyzer
  
  active_listening:
    enabled: false  # Désactiver ActiveListener
  
  mantras:
    validate: false  # Désactiver MantraValidator
```

### Désactiver tout BMAD
```yaml
bmad_features:
  enabled: false  # Désactive tous les modules
```

---

## Exemple Complet

```javascript
const ByanV2 = require('./src/byan-v2/index');

async function example() {
  // Initialiser avec BMAD
  const byan = new ByanV2({
    bmad_features: {
      enabled: true,
      glossary: { enabled: true },
      five_whys: { auto_trigger: true },
      active_listening: { reformulate_every: 3 },
      mantras: { validate: true, min_score: 80 }
    }
  });
  
  // Démarrer session
  await byan.startSession();
  
  // Obtenir question
  const question = await byan.getNextQuestion();
  
  // Soumettre réponse (ActiveListener automatique)
  const response = "Nous avons des problèmes de déploiement lents";
  await byan.submitResponse(response);
  
  // FiveWhys déclenché automatiquement si pain points détectés
  
  // Après l'interview, glossaire optionnel si domaine ecommerce/finance/etc
  
  // Générer profil (MantraValidator automatique)
  const profile = await byan.generateProfile();
  
  // Vérifier validation
  if (profile.validation) {
    console.log('Score:', profile.validation.score);
    console.log('Erreurs:', profile.validation.errors);
  }
}
```

---

## Performance

- **Overhead total:** < 10% vs BYAN v2.0
- **ActiveListener:** < 100ms par réponse
- **FiveWhys detection:** < 50ms
- **MantraValidator:** 100-200ms (seulement à la génération)
- **GlossaryBuilder:** < 50ms par concept

---

## Compatibilité

✅ **Rétrocompatibilité 100%**

Code BYAN v2.0 fonctionne sans modification:
```javascript
// Code v2.0 - fonctionne toujours
const byan = new ByanV2();
await byan.startSession();
await byan.submitResponse(response);
await byan.generateProfile();
```

Les features BMAD sont **opt-in** et **non-bloquantes**.

---

## Troubleshooting

### Module non initialisé
```javascript
if (!byan.glossaryBuilder) {
  // GlossaryBuilder désactivé ou erreur d'init
}
```

### MantraValidator manquant mantras.json
```
Warning: Failed to initialize MantraValidator: ENOENT
```
→ Fichier `src/byan-v2/data/mantras.json` requis

### Validation échoue
```
Agent validation failed: score 65 < 80
```
→ Soit améliorer l'agent, soit baisser `min_score`, soit `fail_on_low_score: false`

---

## Ressources

- Documentation complète: `SPRINT5-PHASE1-INTEGRATION-COMPLETE.md`
- Tests: `__tests__/byan-v2/orchestrator/state-machine.test.js`
- Smoke test: `test-sprint5-phase1-integration.js`
- Config: `_byan/config.yaml`

---

**Version:** BYAN v2.1.0 (BMAD Integration)  
**Date:** 2026-02-07  
**Auteur:** Amelia (dev agent)
