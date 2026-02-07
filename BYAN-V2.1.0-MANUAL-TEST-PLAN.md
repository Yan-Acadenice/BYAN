# BYAN v2.1.0 - Guide de Tests Manuels Utilisateur

**Version**: 2.1.0  
**Date**: 2026-02-07  
**Durée estimée**: 30-45 minutes

---

## 🎯 Objectif

Vérifier que BYAN v2.1.0 fonctionne correctement du point de vue utilisateur, en testant:
- ✅ Fonctionnalités core v2.0 (non-régression)
- ✅ Nouvelles fonctionnalités BMAD v2.1.0
- ✅ Qualité des sorties générées
- ✅ Expérience utilisateur fluide

---

## 📋 Prérequis

Avant de commencer les tests:

```bash
# Vérifier Node.js installé
node --version
# Doit être >= 18.0.0

# Vérifier que les tests automatiques passent
npm test
# Doit montrer 1,308/1,308 tests passing

# Vérifier la version
node -e "console.log(require('./package.json').version)"
# Doit afficher: 2.1.0
```

**Si tout est OK**, procéder aux tests manuels.

---

## 🧪 PARTIE 1: Tests de Base (v2.0 Core)

### Test 1.1: Installation et Setup

**Objectif**: Vérifier que BYAN s'installe et démarre correctement

**Étapes**:
```bash
# 1. Aller dans le répertoire
cd /home/yan/conception

# 2. Vérifier les dépendances
npm list --depth=0

# 3. Lancer le demo simple
node demo-byan-v2-simple.js
```

**Résultat attendu**:
- ✅ Aucune erreur de dépendances
- ✅ Le demo se lance sans erreur
- ✅ Un fichier agent est créé dans `.github/copilot/agents/`
- ✅ Le fichier contient du YAML frontmatter + agent XML

**Durée**: 2 minutes

---

### Test 1.2: Interview de Base (12 Questions)

**Objectif**: Vérifier le workflow d'interview standard

**Étapes**:
```bash
# Créer un script de test
cat > test-basic-interview.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testBasicInterview() {
  console.log('🧪 Test 1.2: Interview de base\n');
  
  const byan = new ByanV2({
    sessionId: 'test-basic-interview',
    maxQuestions: 12
  });
  
  // Démarrer la session
  await byan.startSession();
  console.log('✓ Session démarrée');
  
  // Réponses de test
  const responses = [
    'test-agent',
    'Un agent de test pour validation',
    'Développement',
    'Petite équipe (1-5)',
    'Oui',
    'Revue de code, suggestions',
    'Amical et constructif',
    'Analyse statique, patterns',
    'Markdown avec exemples',
    'Moyen (quelques heures)',
    'Oui',
    'Oui'
  ];
  
  // Soumettre toutes les réponses
  for (let i = 0; i < responses.length; i++) {
    const question = byan.getNextQuestion();
    console.log(`\nQ${i+1}: ${question.text}`);
    console.log(`R${i+1}: ${responses[i]}`);
    
    await byan.submitResponse(responses[i]);
  }
  
  console.log('\n✓ Toutes les réponses soumises');
  
  // Générer le profil
  const profile = await byan.generateProfile();
  console.log('\n✓ Profil généré');
  console.log(`\n📄 Fichier créé: ${profile.filePath}`);
  
  // Vérifier le contenu
  const fs = require('fs');
  const content = fs.readFileSync(profile.filePath, 'utf-8');
  
  console.log('\n🔍 Vérifications:');
  console.log(`  - Contient YAML frontmatter: ${content.includes('---') ? '✅' : '❌'}`);
  console.log(`  - Contient <agent>: ${content.includes('<agent') ? '✅' : '❌'}`);
  console.log(`  - Contient nom agent: ${content.includes('test-agent') ? '✅' : '❌'}`);
  console.log(`  - Taille > 1000 chars: ${content.length > 1000 ? '✅' : '❌'}`);
  
  console.log('\n✅ Test 1.2 TERMINÉ');
}

testBasicInterview().catch(console.error);
EOF

# Exécuter le test
node test-basic-interview.js
```

**Résultat attendu**:
- ✅ 12 questions posées séquentiellement
- ✅ Toutes les réponses acceptées
- ✅ Profil généré dans `.github/copilot/agents/test-agent.md`
- ✅ Fichier bien formaté (YAML + XML)
- ✅ Contient les informations soumises

**Durée**: 3 minutes

---

### Test 1.3: Validation de Profil

**Objectif**: Vérifier que les profils générés sont valides

**Étapes**:
```bash
# Script de validation
cat > test-profile-validation.js << 'EOF'
const AgentProfileValidator = require('./src/byan-v2/generation/agent-profile-validator');
const fs = require('fs');

async function testValidation() {
  console.log('🧪 Test 1.3: Validation de profil\n');
  
  const validator = new AgentProfileValidator();
  
  // Lire le profil créé au test précédent
  const profilePath = '.github/copilot/agents/test-agent.md';
  
  if (!fs.existsSync(profilePath)) {
    console.error('❌ Fichier test-agent.md introuvable');
    console.log('ℹ️  Exécutez d\'abord le test 1.2');
    return;
  }
  
  const content = fs.readFileSync(profilePath, 'utf-8');
  console.log(`📄 Validation de: ${profilePath}`);
  
  const result = validator.validate(content);
  
  console.log(`\n🔍 Résultat validation:`);
  console.log(`  - Valide: ${result.valid ? '✅' : '❌'}`);
  console.log(`  - Erreurs: ${result.errors.length}`);
  console.log(`  - Warnings: ${result.warnings.length}`);
  
  if (result.errors.length > 0) {
    console.log('\n❌ Erreurs détectées:');
    result.errors.forEach((err, i) => {
      console.log(`  ${i+1}. ${err}`);
    });
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warn, i) => {
      console.log(`  ${i+1}. ${warn}`);
    });
  }
  
  if (result.valid) {
    console.log('\n✅ Test 1.3 TERMINÉ - Profil valide');
  } else {
    console.log('\n❌ Test 1.3 ÉCHOUÉ - Profil invalide');
  }
}

testValidation().catch(console.error);
EOF

# Exécuter
node test-profile-validation.js
```

**Résultat attendu**:
- ✅ Validation réussie (valid: true)
- ✅ Zéro erreur
- ✅ Warnings acceptables (si présents)

**Durée**: 2 minutes

---

## 🆕 PARTIE 2: Tests BMAD (v2.1.0 Nouvelles Fonctionnalités)

### Test 2.1: Glossary Builder

**Objectif**: Vérifier que le glossaire se construit automatiquement

**Étapes**:
```bash
cat > test-glossary.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testGlossary() {
  console.log('🧪 Test 2.1: Glossary Builder\n');
  
  const byan = new ByanV2({
    sessionId: 'test-glossary',
    bmad_features: {
      glossary_builder: {
        enabled: true,
        auto_trigger_domains: ['ecommerce'],
        min_concepts: 5
      }
    }
  });
  
  console.log('✓ BYAN initialisé avec Glossary Builder');
  
  // Démarrer le glossaire pour ecommerce
  const glossary = byan.startGlossary('ecommerce', {
    minConcepts: 5,
    clarityThreshold: 0.7
  });
  
  console.log('✓ Glossaire démarré pour domaine: ecommerce\n');
  
  // Ajouter des concepts
  const concepts = [
    { term: 'Order', definition: 'A customer request to purchase products with payment and delivery information' },
    { term: 'Product', definition: 'An item available for sale in the catalog with price, description, and inventory' },
    { term: 'Cart', definition: 'A temporary collection of products selected by the customer before checkout' },
    { term: 'Payment', definition: 'The transaction process that transfers money from customer to merchant' },
    { term: 'Inventory', definition: 'The quantity of products available in stock for immediate delivery' }
  ];
  
  console.log('📝 Ajout de 5 concepts...\n');
  
  for (const concept of concepts) {
    const result = byan.addConcept(concept.term, concept.definition);
    
    console.log(`  ${concept.term}:`);
    console.log(`    - Ajouté: ${result.concept ? '✅' : '❌'}`);
    console.log(`    - Clarté: ${result.concept.clarityScore.toFixed(2)}`);
    console.log(`    - Valide: ${result.concept.clarityScore >= 0.7 ? '✅' : '❌'}\n`);
  }
  
  // Récupérer le glossaire complet
  const fullGlossary = byan.getGlossary();
  
  console.log('📚 Glossaire complet:');
  console.log(`  - Domaine: ${fullGlossary.domain}`);
  console.log(`  - Concepts: ${fullGlossary.concepts.length}`);
  console.log(`  - Termes liés suggérés: ${fullGlossary.relatedTerms ? fullGlossary.relatedTerms.length : 0}`);
  
  console.log('\n✅ Test 2.1 TERMINÉ');
}

testGlossary().catch(console.error);
EOF

node test-glossary.js
```

**Résultat attendu**:
- ✅ Glossaire initialisé pour domaine ecommerce
- ✅ 5 concepts ajoutés avec succès
- ✅ Tous les concepts ont clarityScore >= 0.7
- ✅ Termes liés suggérés automatiquement

**Durée**: 3 minutes

---

### Test 2.2: Five Whys Analyzer

**Objectif**: Vérifier l'analyse de cause racine

**Étapes**:
```bash
cat > test-five-whys.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testFiveWhys() {
  console.log('🧪 Test 2.2: Five Whys Analyzer\n');
  
  const byan = new ByanV2({
    sessionId: 'test-five-whys',
    bmad_features: {
      five_whys: {
        enabled: true,
        max_depth: 5
      }
    }
  });
  
  console.log('✓ BYAN initialisé avec Five Whys\n');
  
  // Réponse avec pain point
  const response = 'Our checkout process is very slow and customers are complaining about timeouts';
  
  console.log(`💬 Réponse utilisateur:\n   "${response}"\n`);
  
  // Détecter pain points
  const detection = byan.detectPainPoints(response);
  
  console.log('🔍 Détection pain points:');
  console.log(`  - Détectés: ${detection.needsWhys ? '✅' : '❌'}`);
  console.log(`  - Nombre: ${detection.painPoints ? detection.painPoints.length : 0}`);
  
  if (detection.painPoints) {
    detection.painPoints.forEach((p, i) => {
      console.log(`  ${i+1}. Keyword: "${p.keyword}"`);
    });
  }
  
  if (!detection.needsWhys) {
    console.log('\n❌ Aucun pain point détecté - Test échoué');
    return;
  }
  
  console.log('\n❓ Séquence des 5 WHYs:\n');
  
  // Réponses pour les 5 WHYs
  const whyAnswers = [
    'Because the payment gateway responds slowly',
    'Because we make synchronous calls to external APIs',
    'Because no caching mechanism was implemented',
    'Because it was not prioritized in the initial sprint',
    'Because we lacked infrastructure expertise'
  ];
  
  // Boucle des 5 WHYs
  for (let i = 0; i < 5; i++) {
    const question = byan.askWhy();
    
    if (!question) {
      console.log(`  ${i+1}. Arrêt prématuré (cause racine trouvée)\n`);
      break;
    }
    
    console.log(`  WHY ${question.depth}: ${question.question}`);
    console.log(`     → ${whyAnswers[i]}\n`);
    
    const result = byan.processWhyAnswer(whyAnswers[i]);
    
    if (result.rootCauseFound) {
      console.log(`  ✓ Cause racine identifiée à depth ${result.depth}!\n`);
      break;
    }
  }
  
  // Extraire la cause racine
  const rootCause = byan.getRootCause();
  
  console.log('🎯 Cause racine:');
  console.log(`  - Statement: ${rootCause.statement}`);
  console.log(`  - Catégorie: ${rootCause.category}`);
  console.log(`  - Confiance: ${(rootCause.confidence * 100).toFixed(0)}%`);
  console.log(`  - Profondeur: ${rootCause.depth}`);
  
  if (rootCause.actions && rootCause.actions.length > 0) {
    console.log('\n📋 Actions recommandées:');
    rootCause.actions.forEach((action, i) => {
      console.log(`  ${i+1}. ${action}`);
    });
  }
  
  console.log('\n✅ Test 2.2 TERMINÉ');
}

testFiveWhys().catch(console.error);
EOF

node test-five-whys.js
```

**Résultat attendu**:
- ✅ Pain points détectés (slow, complaining)
- ✅ 5 questions WHY posées
- ✅ Cause racine identifiée
- ✅ Catégorie assignée (technical/process/people/resource)
- ✅ Actions recommandées générées

**Durée**: 4 minutes

---

### Test 2.3: Active Listener

**Objectif**: Vérifier la reformulation et validation

**Étapes**:
```bash
cat > test-active-listener.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testActiveListener() {
  console.log('🧪 Test 2.3: Active Listener\n');
  
  const byan = new ByanV2({
    sessionId: 'test-active-listener',
    bmad_features: {
      active_listener: {
        enabled: true,
        reformulation_frequency: 3
      }
    }
  });
  
  console.log('✓ BYAN initialisé avec Active Listener\n');
  
  // Test 1: Reformulation
  console.log('📝 Test 1: Reformulation\n');
  
  const input1 = 'I want an agent that helps with code';
  console.log(`💬 Input: "${input1}"`);
  
  const reformulated = byan.reformulate(input1, 'formal');
  
  console.log(`🔄 Reformulé: "${reformulated.reformulation}"`);
  console.log(`📊 Améliorations: ${reformulated.improvements.join(', ')}\n`);
  
  // Test 2: Validation de confirmation
  console.log('📝 Test 2: Validation de confirmation\n');
  
  const confirmations = ['yes', 'no', 'maybe', 'correct', 'yep'];
  
  for (const conf of confirmations) {
    const validation = byan.validateResponse(conf);
    console.log(`  "${conf}" → ${validation.valid ? '✅ Valide' : '❌ Invalide'}`);
  }
  
  // Test 3: Listen complet
  console.log('\n📝 Test 3: Listen avec contexte\n');
  
  const input3 = 'We need better testing automation';
  const context = { phase: 'AGENT_NEEDS', questionNumber: 5 };
  
  console.log(`💬 Input: "${input3}"`);
  
  const result = byan.listen(input3, context);
  
  console.log(`\n🔍 Résultat listen:`);
  console.log(`  - Reformulation: "${result.reformulation}"`);
  console.log(`  - Validé: ${result.validation.valid ? '✅' : '❌'}`);
  console.log(`  - Issues: ${result.issues.length}`);
  console.log(`  - Corrections: ${result.corrections.length}`);
  console.log(`  - Confiance: ${(result.confidence * 100).toFixed(0)}%`);
  
  // Test 4: Résumé de session
  console.log('\n📝 Test 4: Résumé de session\n');
  
  // Simuler quelques interactions
  byan.listen('I need a code review agent', { questionNumber: 1 });
  byan.listen('It should analyze JavaScript code', { questionNumber: 2 });
  byan.listen('Focus on best practices and bugs', { questionNumber: 3 });
  
  const summary = byan.summarizeSession();
  
  console.log(`📊 Résumé session:`);
  console.log(`  - Overview: ${summary.overview}`);
  console.log(`  - Key points: ${summary.keyPoints.length}`);
  
  if (summary.keyPoints.length > 0) {
    summary.keyPoints.forEach((point, i) => {
      console.log(`    ${i+1}. ${point}`);
    });
  }
  
  console.log('\n✅ Test 2.3 TERMINÉ');
}

testActiveListener().catch(console.error);
EOF

node test-active-listener.js
```

**Résultat attendu**:
- ✅ Reformulation améliore la clarté
- ✅ Validation reconnaît yes/no/ambiguous
- ✅ Listen détecte issues et suggère corrections
- ✅ Résumé de session génère overview + key points

**Durée**: 4 minutes

---

### Test 2.4: Mantras Validator

**Objectif**: Vérifier la validation contre les 64 mantras

**Étapes**:
```bash
cat > test-mantras.js << 'EOF'
const ByanV2 = require('./src/byan-v2');
const fs = require('fs');

async function testMantras() {
  console.log('🧪 Test 2.4: Mantras Validator\n');
  
  const byan = new ByanV2({
    sessionId: 'test-mantras',
    bmad_features: {
      mantras_validator: {
        enabled: true,
        min_compliance_score: 0.8
      }
    }
  });
  
  console.log('✓ BYAN initialisé avec Mantras Validator\n');
  
  // Lire un profil agent existant (créé au test 1.2)
  const agentPath = '.github/copilot/agents/test-agent.md';
  
  if (!fs.existsSync(agentPath)) {
    console.log('⚠️  Fichier test-agent.md introuvable');
    console.log('ℹ️  Création d\'un agent de test minimal...\n');
    
    // Créer un agent simple pour tester
    const minimalAgent = `---
name: test-agent
description: Agent de test
---

<agent id="test-agent">
  <activation>
    <step n="1">Load config</step>
  </activation>
  <persona>Test agent persona</persona>
  <capabilities>Basic testing</capabilities>
</agent>`;
    
    fs.writeFileSync(agentPath, minimalAgent);
  }
  
  const agentContent = fs.readFileSync(agentPath, 'utf-8');
  
  console.log(`📄 Validation de: ${agentPath}\n`);
  
  // Valider contre tous les mantras
  const validation = byan.validateAgent(agentContent);
  
  console.log('📊 Résultat validation:');
  console.log(`  - Score: ${(validation.score * 100).toFixed(0)}%`);
  console.log(`  - Conformes: ${validation.compliant.length}/64`);
  console.log(`  - Non-conformes: ${validation.nonCompliant.length}/64\n`);
  
  // Afficher quelques mantras conformes
  if (validation.compliant.length > 0) {
    console.log('✅ Exemples de mantras conformes:');
    validation.compliant.slice(0, 3).forEach(m => {
      console.log(`  - ${m.id}: ${m.name}`);
    });
    console.log();
  }
  
  // Afficher les non-conformes
  if (validation.nonCompliant.length > 0) {
    console.log('❌ Mantras non-conformes:');
    validation.nonCompliant.forEach(m => {
      console.log(`  - ${m.id}: ${m.name}`);
      if (m.violations && m.violations.length > 0) {
        m.violations.forEach(v => {
          console.log(`    → ${v}`);
        });
      }
    });
    console.log();
  }
  
  // Générer rapport de conformité
  console.log('📋 Génération du rapport...\n');
  const report = byan.generateComplianceReport();
  
  console.log(`📄 Rapport généré:`);
  console.log(`  - Score global: ${(report.score * 100).toFixed(0)}%`);
  console.log(`  - Atteint objectif (80%): ${report.score >= 0.8 ? '✅' : '❌'}`);
  console.log(`  - Catégories: ${Object.keys(report.byCategory).length}`);
  
  // Afficher score par catégorie
  console.log('\n📊 Score par catégorie:');
  Object.entries(report.byCategory).forEach(([category, data]) => {
    const score = (data.compliant / (data.compliant + data.nonCompliant) * 100).toFixed(0);
    console.log(`  - ${category}: ${score}%`);
  });
  
  console.log('\n✅ Test 2.4 TERMINÉ');
}

testMantras().catch(console.error);
EOF

node test-mantras.js
```

**Résultat attendu**:
- ✅ Validation exécutée contre 64 mantras
- ✅ Score de conformité calculé
- ✅ Liste des mantras conformes/non-conformes
- ✅ Rapport de conformité généré
- ✅ Score par catégorie affiché

**Durée**: 4 minutes

---

## 🔗 PARTIE 3: Test d'Intégration Complète

### Test 3.1: Workflow Complet avec BMAD

**Objectif**: Tester un workflow end-to-end avec toutes les fonctionnalités BMAD activées

**Étapes**:
```bash
cat > test-full-workflow.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testFullWorkflow() {
  console.log('🧪 Test 3.1: Workflow Complet avec BMAD\n');
  console.log('🕐 Durée estimée: 5-7 minutes\n');
  
  // Initialiser avec toutes les features BMAD
  const byan = new ByanV2({
    sessionId: 'test-full-workflow',
    maxQuestions: 12,
    bmad_features: {
      glossary_builder: { enabled: true },
      five_whys: { enabled: true },
      active_listener: { enabled: true },
      mantras_validator: { enabled: true }
    }
  });
  
  console.log('✅ BYAN initialisé avec toutes les features BMAD\n');
  
  // Phase 1: Interview avec Active Listener
  console.log('📝 PHASE 1: Interview (12 questions)\n');
  
  await byan.startSession();
  
  const responses = [
    'ecommerce-assistant',
    'An AI agent that helps manage ecommerce operations and customer issues',
    'Ecommerce',
    'Medium team (6-20)',
    'yes',
    'Order management, customer support, inventory tracking',
    'Professional but friendly',
    'Order processing, payment handling, inventory updates',
    'Structured reports with actionable insights',
    'Complex (several days)',
    'yes',
    'The current order processing is slow and causes customer frustration'
  ];
  
  for (let i = 0; i < responses.length; i++) {
    const question = byan.getNextQuestion();
    console.log(`Q${i+1}: ${question.text}`);
    
    // Active Listener reformule chaque 3ème réponse
    if ((i + 1) % 3 === 0) {
      const reformulated = byan.reformulate(responses[i]);
      console.log(`   Reformulé: "${reformulated.reformulation}"`);
    }
    
    await byan.submitResponse(responses[i]);
    console.log(`R${i+1}: ${responses[i]}\n`);
  }
  
  console.log('✅ Interview terminée\n');
  
  // Phase 2: Glossary (auto-trigger pour ecommerce)
  console.log('📚 PHASE 2: Glossary Builder (auto-triggered)\n');
  
  const glossary = byan.startGlossary('ecommerce');
  
  const concepts = [
    { term: 'Order', definition: 'A customer purchase request containing products, payment, and shipping details' },
    { term: 'Inventory', definition: 'The stock quantity of products available for sale at any given time' },
    { term: 'Cart', definition: 'A temporary collection where customers add products before checkout' },
    { term: 'Payment', definition: 'The financial transaction that transfers funds from customer to merchant' },
    { term: 'Shipment', definition: 'The physical delivery process of orders from warehouse to customer' }
  ];
  
  concepts.forEach(c => {
    const result = byan.addConcept(c.term, c.definition);
    console.log(`  ✓ ${c.term} (clarity: ${result.concept.clarityScore.toFixed(2)})`);
  });
  
  console.log(`\n✅ Glossaire créé (${concepts.length} concepts)\n`);
  
  // Phase 3: Five Whys (détecté dans dernière réponse)
  console.log('🔍 PHASE 3: Five Whys Analysis\n');
  
  const painPointResponse = 'The current order processing is slow and causes customer frustration';
  const detection = byan.detectPainPoints(painPointResponse);
  
  if (detection.needsWhys) {
    console.log('✓ Pain points détectés, lancement 5 Whys...\n');
    
    const whyAnswers = [
      'Because database queries are not optimized',
      'Because no indexing strategy was implemented',
      'Because database design was rushed',
      'Because initial timeline was too aggressive',
      'Because business pressure prioritized features over infrastructure'
    ];
    
    for (let i = 0; i < 5; i++) {
      const question = byan.askWhy();
      if (!question) break;
      
      console.log(`  WHY ${question.depth}: ${question.question}`);
      const result = byan.processWhyAnswer(whyAnswers[i]);
      console.log(`     → ${whyAnswers[i]}`);
      
      if (result.rootCauseFound) {
        console.log(`     ✓ Cause racine trouvée!\n`);
        break;
      }
    }
    
    const rootCause = byan.getRootCause();
    console.log(`🎯 Cause racine: ${rootCause.statement}`);
    console.log(`   Catégorie: ${rootCause.category}\n`);
  }
  
  console.log('✅ Analyse 5 Whys terminée\n');
  
  // Phase 4: Génération
  console.log('🔧 PHASE 4: Génération du profil agent\n');
  
  const profile = await byan.generateProfile();
  console.log(`✓ Profil généré: ${profile.filePath}\n`);
  
  // Phase 5: Validation Mantras
  console.log('✅ PHASE 5: Validation Mantras\n');
  
  const fs = require('fs');
  const agentContent = fs.readFileSync(profile.filePath, 'utf-8');
  
  const validation = byan.validateAgent(agentContent);
  console.log(`  Score: ${(validation.score * 100).toFixed(0)}%`);
  console.log(`  Conformes: ${validation.compliant.length}/64`);
  console.log(`  Non-conformes: ${validation.nonCompliant.length}/64\n`);
  
  if (validation.score >= 0.8) {
    console.log('✅ Agent conforme (score >= 80%)\n');
  } else {
    console.log('⚠️  Agent nécessite ajustements (score < 80%)\n');
  }
  
  // Résumé final
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RÉSUMÉ WORKFLOW COMPLET\n');
  console.log(`✅ Interview: 12 questions répondues`);
  console.log(`✅ Glossary: ${concepts.length} concepts définis`);
  console.log(`✅ Five Whys: Cause racine identifiée`);
  console.log(`✅ Génération: Profil créé`);
  console.log(`✅ Validation: Score ${(validation.score * 100).toFixed(0)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🎉 Test 3.1 TERMINÉ - WORKFLOW COMPLET VALIDÉ');
}

testFullWorkflow().catch(console.error);
EOF

node test-full-workflow.js
```

**Résultat attendu**:
- ✅ Workflow complet exécuté sans erreur
- ✅ Toutes les phases BMAD activées et fonctionnelles
- ✅ Active Listener reformule automatiquement
- ✅ Glossary auto-triggered pour ecommerce
- ✅ Five Whys détecte pain points et analyse
- ✅ Profil généré avec toutes les données
- ✅ Validation mantras >= 80%

**Durée**: 5-7 minutes

---

## 📋 PARTIE 4: Tests de Non-Régression

### Test 4.1: Compatibilité v2.0.0

**Objectif**: Vérifier que le code v2.0.0 fonctionne toujours

**Étapes**:
```bash
cat > test-backward-compat.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testBackwardCompatibility() {
  console.log('🧪 Test 4.1: Compatibilité v2.0.0\n');
  
  // Code v2.0.0 exact (sans features BMAD)
  const byan = new ByanV2({
    sessionId: 'test-compat-v2.0',
    maxQuestions: 12
  });
  
  console.log('✓ Initialisation v2.0.0 style (sans BMAD)\n');
  
  await byan.startSession();
  console.log('✓ Session démarrée\n');
  
  // Vérifier que les méthodes v2.0.0 existent toujours
  const v2Methods = [
    'startSession',
    'getNextQuestion',
    'submitResponse',
    'generateProfile',
    'isComplete'
  ];
  
  console.log('🔍 Vérification méthodes v2.0.0:');
  v2Methods.forEach(method => {
    const exists = typeof byan[method] === 'function';
    console.log(`  - ${method}: ${exists ? '✅' : '❌'}`);
  });
  
  // Soumettre quelques réponses
  console.log('\n📝 Test workflow v2.0.0:');
  
  const responses = ['test', 'description', 'domain', 'small', 'yes'];
  
  for (let i = 0; i < 5; i++) {
    const q = byan.getNextQuestion();
    await byan.submitResponse(responses[i]);
    console.log(`  Q${i+1} → R${i+1}: ✓`);
  }
  
  console.log('\n✅ Test 4.1 TERMINÉ - Compatibilité v2.0.0 OK');
}

testBackwardCompatibility().catch(console.error);
EOF

node test-backward-compat.js
```

**Résultat attendu**:
- ✅ Code v2.0.0 fonctionne sans modification
- ✅ Toutes les méthodes v2.0.0 présentes
- ✅ Workflow v2.0.0 standard fonctionne
- ✅ Aucune feature BMAD activée par défaut si non spécifié

**Durée**: 3 minutes

---

### Test 4.2: Désactivation Features BMAD

**Objectif**: Vérifier qu'on peut désactiver les features BMAD

**Étapes**:
```bash
cat > test-bmad-disable.js << 'EOF'
const ByanV2 = require('./src/byan-v2');

async function testBMADDisable() {
  console.log('🧪 Test 4.2: Désactivation Features BMAD\n');
  
  // Désactiver toutes les features BMAD
  const byan = new ByanV2({
    sessionId: 'test-bmad-disabled',
    bmad_features: {
      glossary_builder: { enabled: false },
      five_whys: { enabled: false },
      active_listener: { enabled: false },
      mantras_validator: { enabled: false }
    }
  });
  
  console.log('✓ BYAN initialisé avec BMAD désactivé\n');
  
  // Vérifier que les méthodes BMAD retournent des résultats neutres
  console.log('🔍 Test comportement avec BMAD désactivé:\n');
  
  // Glossary devrait être désactivé
  try {
    const glossary = byan.startGlossary('ecommerce');
    console.log('  - Glossary: ⚠️  Activé (ne devrait pas)');
  } catch (e) {
    console.log('  - Glossary: ✅ Désactivé');
  }
  
  // Five Whys ne devrait pas détecter de pain points
  const detection = byan.detectPainPoints('This is slow and problematic');
  console.log(`  - Five Whys: ${!detection.needsWhys ? '✅' : '⚠️'} Désactivé`);
  
  // Active Listener devrait être en mode passif
  const listened = byan.listen('test input');
  console.log(`  - Active Listener: ${!listened.reformulation ? '✅' : '⚠️'} Passif`);
  
  console.log('\n✅ Test 4.2 TERMINÉ - Désactivation fonctionne');
}

testBMADDisable().catch(console.error);
EOF

node test-bmad-disable.js
```

**Résultat attendu**:
- ✅ Features BMAD peuvent être désactivées
- ✅ Comportement revient à v2.0.0 quand désactivé
- ✅ Aucune erreur si features désactivées

**Durée**: 2 minutes

---

## 📊 Récapitulatif des Tests

### Checklist Finale

```
PARTIE 1: Tests de Base (v2.0 Core)
  ☐ Test 1.1: Installation et Setup (2 min)
  ☐ Test 1.2: Interview de base (3 min)
  ☐ Test 1.3: Validation de profil (2 min)

PARTIE 2: Tests BMAD (v2.1.0)
  ☐ Test 2.1: Glossary Builder (3 min)
  ☐ Test 2.2: Five Whys Analyzer (4 min)
  ☐ Test 2.3: Active Listener (4 min)
  ☐ Test 2.4: Mantras Validator (4 min)

PARTIE 3: Test d'Intégration
  ☐ Test 3.1: Workflow complet avec BMAD (5-7 min)

PARTIE 4: Tests de Non-Régression
  ☐ Test 4.1: Compatibilité v2.0.0 (3 min)
  ☐ Test 4.2: Désactivation BMAD (2 min)

DURÉE TOTALE: ~35-40 minutes
```

### Critères de Succès

**v2.1.0 est validé si:**

✅ **Tous les tests PARTIE 1** passent → Core v2.0 fonctionne
✅ **Tous les tests PARTIE 2** passent → Features BMAD fonctionnent
✅ **Test PARTIE 3** passe → Intégration end-to-end fonctionne
✅ **Tests PARTIE 4** passent → Pas de régression, désactivation OK

**Échec si:**
❌ N'importe quel test échoue avec erreur critique
❌ Régression détectée (v2.0.0 ne fonctionne plus)
❌ Features BMAD ne peuvent pas être désactivées

---

## 🚨 Troubleshooting

### Problèmes Communs

**Erreur: "Cannot find module"**
```bash
# Solution: Réinstaller dépendances
npm install
```

**Erreur: "Tests ne passent pas"**
```bash
# Solution: Vérifier que les tests auto passent d'abord
npm test
```

**Fichiers agents non créés**
```bash
# Solution: Vérifier les permissions
ls -la .github/copilot/agents/
# Créer le dossier si nécessaire
mkdir -p .github/copilot/agents/
```

**Performance lente**
```bash
# Normal pour les premiers runs (cache JIT)
# Re-run le test pour temps réel
```

---

## 📝 Rapport de Test

Après avoir complété tous les tests, remplir ce rapport:

```
BYAN v2.1.0 - RAPPORT DE TEST MANUEL
Date: ___________
Testeur: ___________

RÉSULTATS:
  Partie 1 (Base): ___/3 tests passés
  Partie 2 (BMAD): ___/4 tests passés
  Partie 3 (Intégration): ___/1 test passé
  Partie 4 (Non-régression): ___/2 tests passés
  
  TOTAL: ___/10 tests passés

VERDICT: 
  ☐ VALIDÉ (10/10 ou 9/10)
  ☐ MINEUR (8/10 - quelques warnings)
  ☐ BLOQUANT (< 8/10 - corrections requises)

NOTES:
_____________________________________________
_____________________________________________
_____________________________________________

RECOMMANDATION:
  ☐ Ship v2.1.0 (10/10 ou 9/10)
  ☐ Fix mineur puis ship (8/10)
  ☐ Fix bloquant avant ship (< 8/10)
```

---

## ✅ Conclusion

Ce guide de test couvre:
- ✅ Toutes les fonctionnalités v2.0 (non-régression)
- ✅ Toutes les nouvelles features BMAD v2.1.0
- ✅ Workflow end-to-end complet
- ✅ Compatibilité et désactivation

**Durée totale**: 35-40 minutes

**Prêt à tester!** 🚀
