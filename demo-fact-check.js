#!/usr/bin/env node
/**
 * DEMO — Fact-Check Manuel
 * Lance avec : node demo-fact-check.js
 *
 * Teste les 6 capacités du FactChecker dans l'ordre logique.
 */

const FactChecker = require('./src/byan-v2/fact-check/index');
const FactSheet   = require('./src/byan-v2/fact-check/fact-sheet');
const KnowledgeGraph = require('./src/byan-v2/fact-check/knowledge-graph');

const LINE = '─'.repeat(60);
const H = (t) => `\n${LINE}\n  ${t}\n${LINE}`;

// ────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────
const checker = new FactChecker({
  output_fact_sheet: false,   // pas d'écriture disque pour la démo
  min_level: 3
});

// ────────────────────────────────────────────────────────────
// 1. CLAIM : assertion sourcée niveau 2
// ────────────────────────────────────────────────────────────
console.log(H('1. CLAIM sourcée (LEVEL-2)'));

const r1 = checker.check(
  'Node.js utilise libuv pour les opérations I/O asynchrones',
  { level: 2, source: 'nodejs.org — About Node.js', proof: 'Voir nodejs.org/en/about/', domain: 'javascript' }
);
console.log('Status    :', r1.status);
console.log('Score     :', r1.score + '%');
console.log('Assertion :', r1.assertionType);
console.log('Message   :', r1.message);

// ────────────────────────────────────────────────────────────
// 2. HYPOTHESIS : assertion sans source suffisante
// ────────────────────────────────────────────────────────────
console.log(H('2. HYPOTHESIS (niveau trop faible)'));

const r2 = checker.check(
  'Redis est toujours plus rapide que PostgreSQL',
  { level: 5, domain: 'performance' }
);
console.log('Status    :', r2.status);
console.log('Assertion :', r2.assertionType);
console.log('Message   :', r2.message);

// ────────────────────────────────────────────────────────────
// 3. BLOCKED : domaine strict sans source L2
// ────────────────────────────────────────────────────────────
console.log(H('3. BLOCKED (domaine strict security, LEVEL-4)'));

const r3 = checker.check(
  'MD5 est sécurisé pour les mots de passe',
  { level: 4, domain: 'security' }
);
console.log('Status    :', r3.status);
console.log('Message   :', r3.message);

// ────────────────────────────────────────────────────────────
// 4. USER-VERIFIED : l'utilisateur fournit une preuve
// ────────────────────────────────────────────────────────────
console.log(H('4. FACT USER-VERIFIED (preuve fournie)'));

const r4 = checker.verify(
  'npm test passe à 100% sur Node.js 20',
  { type: 'command-output', content: '14 tests passed, 0 failed — npm run test' }
);
console.log('Status    :', r4.status);
console.log('Message   :', r4.message);

// ────────────────────────────────────────────────────────────
// 5. AUTO-TRIGGER : parser détecte les claims dangereux
// ────────────────────────────────────────────────────────────
console.log(H('5. AUTO-TRIGGER sur patterns dangereux'));

const texte = `
  Cette approche est toujours plus performante.
  Notre solution est 10x plus rapide.
  C'est la meilleure pratique du secteur.
  Il n'y a aucun risque de sécurité.
`;

const detected = checker.parse(texte);
console.log('Claims détectés :', detected.length);
detected.forEach((d, i) => {
  console.log(`  [${i+1}] Pattern: "${d.matched}" → "${d.excerpt.trim()}"`);
});

// ────────────────────────────────────────────────────────────
// 6. CHAIN : propagation de confiance
// ────────────────────────────────────────────────────────────
console.log(H('6. CHAIN — propagation multiplicative'));

const chain3 = checker.chain([80, 75, 70]);
console.log('Chaine 3 étapes [80,75,70]');
console.log('  Score final :', chain3.finalScore + '%');
console.log('  Warning     :', chain3.warning || 'aucun');

const chain4 = checker.chain([90, 85, 80, 75]);
console.log('\nChaine 4 étapes [90,85,80,75] (trop longue)');
console.log('  Score final :', chain4.finalScore + '%');
console.log('  Warning     :', chain4.warning);

// ────────────────────────────────────────────────────────────
// 7. EXPIRATION
// ────────────────────────────────────────────────────────────
console.log(H('7. EXPIRATION par domaine'));

const ancienFact = { claim: 'JWT HS256 est sécurisé', domain: 'security', created_at: '2024-06-01' };
const nouveauFact = { claim: 'ECMAScript 2025 est la spec courante', domain: 'javascript', created_at: '2026-01-01' };
const algFact    = { claim: 'Quicksort est O(n log n) en moyenne', domain: 'algorithms', created_at: '2010-01-01' };

console.log('Ancien fait sécurité (2024-06-01):', checker.checkExpiration(ancienFact).warning);
console.log('Nouveau fait JS (2026-01-01):',      checker.checkExpiration(nouveauFact).warning || 'OK, expire le ' + checker.expiresAt('javascript', '2026-01-01'));
console.log('Algorithme (jamais expire):',         checker.checkExpiration(algFact).expired, '— daysLeft:', checker.checkExpiration(algFact).daysLeft);

// ────────────────────────────────────────────────────────────
// 8. TRUST BADGE
// ────────────────────────────────────────────────────────────
console.log(H('8. TRUST BADGE'));

[100, 90, 75, 60, 40, 20].forEach(s => {
  console.log(`  ${String(s).padStart(3)}% → ${FactSheet.trustBadge(s)}`);
});

// ────────────────────────────────────────────────────────────
// 9. FACT SHEET complète
// ────────────────────────────────────────────────────────────
console.log(H('9. FACT SHEET générée en mémoire'));

const fakeFacts = {
  verified: [{ claim: 'npm test 100% passant', proof: 'command output' }],
  claims:   [
    { claim: 'Node.js — libuv I/O', level: 2, source: 'nodejs.org' },
    { claim: 'Redis in-memory store', level: 1, source: 'redis.io' }
  ],
  disputed: [{ claim: 'MongoDB est ACID', }],
  opinions: [{ claim: 'TypeScript est mieux que JavaScript', status: 'HYPOTHESIS' }]
};

const sheet = new FactSheet();
const content = sheet.generate('demo-session', fakeFacts);
console.log(content);

// ────────────────────────────────────────────────────────────
// 10. KNOWLEDGE GRAPH
// ────────────────────────────────────────────────────────────
console.log(H('10. KNOWLEDGE GRAPH (persistance /tmp)'));

const graph = new KnowledgeGraph('/tmp/demo-fact-graph.json');
graph.add({ claim: 'Node.js libuv', domain: 'javascript', status: 'CLAIM', confidence: 80, created_at: '2026-01-01' });
graph.add({ claim: 'MD5 deprecated', domain: 'security',   status: 'CLAIM', confidence: 95, created_at: '2024-01-01' });
graph.add({ claim: 'npm test OK',    domain: 'verified',   status: 'VERIFIED', confidence: 100, expires_at: null, created_at: '2026-02-19' });

const stats = graph.stats();
console.log('Total facts stockés :', stats.total);
console.log('Par domaine         :', JSON.stringify(stats.byDomain));

const auditResult = graph.audit(checker);
console.log('Expirés             :', auditResult.expired.length);
console.log('Bientôt expirés     :', auditResult.expiringSoon.length);
console.log('Sains               :', auditResult.healthy.length);
if (auditResult.expired[0]) {
  console.log('  → Fait expiré:', auditResult.expired[0].claim, '|', auditResult.expired[0]._check.warning);
}

console.log(H('DEMO TERMINEE — tout fonctionne'));
