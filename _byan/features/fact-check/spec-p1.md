# Spec Technique P1 — Fact-Check Scientifique

**Status :** Draft
**Derniere mise a jour :** 2026-02-19
**Prerequis :** `backlog.md` items A1-D3

---

## Module : `src/byan-v2/fact-check/`

### Structure des fichiers

```
src/byan-v2/fact-check/
  index.js              # FactChecker — export principal
  claim-parser.js       # Detection auto claims dans le texte
  level-scorer.js       # Score de confiance par niveau
  fact-sheet.js         # Generation Fact Sheet Markdown
```

---

## A1 — Schema d'un Fact

```javascript
{
  id:         String,   // uuid
  claim:      String,   // assertion precise et falsifiable
  level:      Number,   // 1-5
  source: {
    url:      String,   // jamais genere par BYAN — toujours fourni ou knowledge base
    title:    String,
    date:     String,   // ISO 8601
    type:     String    // spec | benchmark | paper | consensus | opinion
  },
  proof: {
    type:     String,   // executable | readable | observable
    content:  String    // commande, extrait, instruction
  },
  context:    String,   // general | project-specific
  status:     String,   // VERIFIED | DISPUTED | OPINION | HYPOTHESIS | EXPIRED
  agent:      String,   // quel agent a emis le claim
  session:    String,   // session_id
  created_at: String,
  confidence: Number    // 0-100
}
```

---

## A2 — 4 types d'assertions

Prefixes utilises dans tous les outputs d'agents :

```
[REASONING]  Deduction logique sans garantie de verite
             → jamais cite comme source, jamais actionnable seul

[HYPOTHESIS] Probabilite haute dans ce contexte, a verifier
             → actionnable seulement apres verification

[CLAIM]      Assertion avec source verifiable — level indique
             Format : [CLAIM L{n}] {assertion} — {source} — proof: {comment verifier}
             → actionnable, source fournie

[FACT]       Valide par l'utilisateur avec artefact de preuve
             Format : [FACT USER-VERIFIED {date}] {assertion}
             → confiance maximale dans ce projet
```

---

## A3 — 5 niveaux de preuve

Definis dans `_byan/knowledge/sources.md` :

```
LEVEL-1  Spec officielle / RFC / Documentation primaire
         Sources : IETF RFCs, W3C specs, ECMAScript spec, MDN Web Docs
         Exemples : RFC 7234 (HTTP caching), ECMA-262

LEVEL-2  Benchmark reproductible / Code executable / Test mesurable
         Requis : methodologie publiee, contexte hardware/version/charge
         Exemples : redis.io/benchmarks, nodejs.org/en/docs/guides/dont-block-the-event-loop

LEVEL-3  Article peer-reviewed / Conference paper / Source independante
         Sources : arXiv, ACM Digital Library, USENIX
         Exemples : "Kafka vs RabbitMQ" — IEEE paper 2023

LEVEL-4  Consensus communaute documente
         Sources : StackOverflow (> 1000 votes), GitHub issues officiels, docs communautaires
         Exemples : Martin Fowler bliki, Dan Abramov blog officiel

LEVEL-5  Opinion / Experience personnelle / Analogie
         → jamais presente comme fait, toujours prefixe [REASONING] ou [HYPOTHESIS]
```

**Seuils par domaine :**

| Domaine | Niveau minimum | Comportement si inferieur |
|---------|---------------|--------------------------|
| security | LEVEL-2 | Bloque — refus d'emettre |
| performance | LEVEL-2 | Bloque — refus d'emettre |
| compliance | LEVEL-1 | Bloque — refus d'emettre |
| architecture | LEVEL-3 | Warning — marque OPINION |
| general | LEVEL-3 | Warning — marque HYPOTHESIS |

---

## A4 — Regle no-URL-generation

Encodee dans la persona de chaque agent :

```
CRITICAL: Ne jamais generer d'URL. 
Les seules sources citables sont :
1. Fichiers dans _byan/knowledge/ (knowledge base locale verifiee)
2. Sources fournies explicitement par l'utilisateur dans la session
Toute autre reference est un [REASONING] ou [HYPOTHESIS], jamais un [CLAIM].
```

---

## A5 — Auto-trigger patterns

Dans `config.yaml`, section `fact_check.auto_trigger_patterns`.
Seed initial :

```yaml
auto_trigger_patterns:
  - "toujours|jamais|forcement|evidemment|clairement"
  - "plus rapide|plus sur|mieux|optimal|meilleur|superieur"
  - "il est bien connu que|tout le monde sait|generalement accepte"
  - "bonne pratique|best practice|standard de facto"
  - "prouve que|demontre que|il est clair que"
```

Comportement : detection dans l'output BYAN ET dans les messages utilisateur.
Sur detection → BYAN interpelle : "[pattern detecte] — c'est un claim. Source ?"

---

## B1 — Classe FactChecker

```javascript
class FactChecker {
  constructor(config, contextLayer) {
    this.config = config;           // section fact_check de config.yaml
    this.ctx = contextLayer;        // Context Layer existant
    this.knowledgeBase = this._loadKnowledgeBase();
    this.axioms = this._loadAxioms();
  }

  // Verifier un claim contre la knowledge base
  check(claim) {
    // → { level, source, score, proof, status }
  }

  // Enregistrer un fact valide par l'utilisateur
  verify(claim, proof) {
    // → Fact USER-VERIFIED dans ctx.getLayer('facts')
  }

  // Detecter les claims dans un texte libre
  parse(text) {
    // → Array<{ claim, pattern_matched, position }>
  }

  // Generer le Fact Sheet de session
  generateFactSheet(sessionId) {
    // → path du fichier genere
  }

  _loadKnowledgeBase() {
    // Lit _byan/knowledge/sources.md — jamais pre-charge, charge a la demande
  }

  _loadAxioms() {
    // Lit _byan/knowledge/axioms.md
  }
}
```

---

## B2 — Context Layer `facts`

Structure de la couche :

```javascript
ctx.addLayer('facts', {
  verified:  [],   // FACT — valides par l'utilisateur
  claims:    [],   // CLAIM — sources et niveles
  disputed:  [],   // DISPUTED — sources contradictoires
  opinions:  [],   // OPINION / HYPOTHESIS — non-sources
  session_id: String
});
```

---

## B4 — Seed knowledge base

Fichier `_byan/knowledge/sources.md` — seed initial minimum :

```
## Specifications (LEVEL-1)
- ECMAScript spec : https://tc39.es/ecma262/
- RFC 7234 HTTP Caching : https://www.rfc-editor.org/rfc/rfc7234
- RFC 7235 HTTP Auth : https://www.rfc-editor.org/rfc/rfc7235
- MDN Web Docs : https://developer.mozilla.org
- Node.js docs : https://nodejs.org/api/

## Benchmarks (LEVEL-2)
- Redis benchmark : https://redis.io/docs/management/optimization/benchmarks/
- Node.js event loop guide : https://nodejs.org/en/docs/guides/dont-block-the-event-loop
- TechEmpower Framework Benchmarks : https://www.techempower.com/benchmarks/

## References (LEVEL-3/4)
- Martin Fowler bliki : https://martinfowler.com/bliki/
- OWASP Top 10 : https://owasp.org/Top10/
- 12 Factor App : https://12factor.net/
```

---

## C1 — Format Fact Sheet

```markdown
# Fact Sheet — Session {session_id}
**Date :** {date}
**Agent principal :** {agent}
**Truth Score :** {score}% ({n_verified}/{n_total} claims sources)

## Claims verifies (LEVEL-1 a LEVEL-3)
- [L2] Redis ops/sec > 100k — redis.io/benchmarks — proof: redis-benchmark -n 100000

## Claims en attente de verification
- [HYPOTHESIS] Cette architecture supporte 10k users concurrents

## Disputes (sources contradictoires)
- [DISPUTED] PostgreSQL lent pour < 1000 users — 2 sources L3 contradictoires

## Opinions declarees
- [OPINION] Cette approche est plus maintenable (aucune source disponible)

## A verifier (claims acceptes sans source)
- Estimation 2 semaines pour la feature X — non sourcee
```

---

## Tests requis (Definition of Done P1)

```
__tests__/fact-check/
  fact-checker.test.js     # check(), verify(), parse(), generateFactSheet()
  claim-parser.test.js     # detection patterns, false positives
  level-scorer.test.js     # scoring par niveau et domaine
  fact-sheet.test.js       # generation Markdown correcte
```

Couverture cible : 80% minimum (standard projet)
