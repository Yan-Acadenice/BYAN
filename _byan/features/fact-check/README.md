# Feature : Fact-Check Scientifique

**Status :** P1 en cours de design
**Module :** byan-v2 / fact-check
**Version cible :** 2.5.0
**Auteur :** Yan
**Derniere mise a jour :** 2026-02-19

---

## Probleme resolu

BYAN challenge deja les solutions de l'utilisateur pour l'aiguiller et eviter les mauvaises directions. Il manque la couche de **fact-checking avec sources verifiables** — ce que BYAN dit doit etre demontrable, quantifiable et reproductible.

Sans cette couche, BYAN est un consultant qui a des opinions. Avec, c'est un partenaire scientifique.

---

## Principe fondateur — La methode scientifique appliquee a l'IA

Tout claim emis par BYAN doit satisfaire les trois criteres :

| Critere | Definition | Exemple |
|---------|-----------|---------|
| **Demontrable** | Il existe une source primaire verifiable | RFC 7234, redis.io/benchmarks |
| **Quantifiable** | Le claim est precis, pas vague | "Redis > 100k ops/sec" pas "Redis est rapide" |
| **Reproductible** | L'utilisateur peut le tester lui-meme | `redis-benchmark -n 100000` |

Un claim qui ne satisfait pas ces trois criteres n'est pas un fait. C'est une opinion ou une hypothese, et il est presente comme tel.

---

## Les 4 types d'assertions

Tout output de BYAN est prefixe par son type :

```
[REASONING]  Je deduis que X parce que Y — pas de garantie de verite
[HYPOTHESIS] X est probablement vrai dans ton contexte — a verifier
[CLAIM]      X est vrai — source : [lien verifiable par l'utilisateur]
[FACT]       X a ete verifie par toi le YYYY-MM-DD — archive session
```

**Regle absolue :** BYAN ne genere jamais d'URL. Il ne peut citer que des sources presentes dans `_byan/knowledge/` ou fournies par l'utilisateur.

---

## Les 5 niveaux de preuve

```
LEVEL-1  Spec officielle / RFC / Documentation primaire (ECMAScript, IETF, W3C)
LEVEL-2  Benchmark reproductible / Code executable / Test mesurable
LEVEL-3  Article peer-reviewed / Conference paper / Source independante
LEVEL-4  Consensus communaute (StackOverflow > 1000 votes, docs officielles)
LEVEL-5  Opinion / Experience personnelle / Analogie
```

- Claims de securite, performance, compliance → LEVEL-2 minimum requis
- Claims en dessous du seuil configure → marques automatiquement OPINION
- Seuil par defaut : LEVEL-3

---

## Architecture du module

```
src/byan-v2/fact-check/
  index.js              # FactChecker — classe principale injectable
  claim-parser.js       # Detection auto de claims dans le texte
  level-scorer.js       # Calcul du score de confiance
  fact-sheet.js         # Generation du Fact Sheet en fin de session

_byan/knowledge/
  sources.md            # Base de sources verifiees (seed initial)
  axioms.md             # Axiomes non-challengeables
  blacklisted-sources.md  # Sources a rejeter (P2)

_byan-output/fact-sheets/
  session-{date}.md     # Fact Sheet genere automatiquement
```

### Interface publique

```javascript
const checker = new FactChecker(config, contextLayer);

// Verifier un claim
checker.check(claim)
// → { level, source, score, proof, status }

// Enregistrer un fact valide par l'utilisateur
checker.verify(claim, proof)
// → Fact ajoute au Context Layer 'facts' avec USER-VERIFIED

// Generer le Fact Sheet de session
checker.generateFactSheet()
// → _byan-output/fact-sheets/session-{date}.md
```

---

## Integration config.yaml

```yaml
fact_check:
  enabled: true
  mode: offline           # offline | online (P2) | hybrid (P2)
  min_level: 3            # claims sous ce niveau -> OPINION
  strict_domains:         # level < 2 bloque dans ces domaines
    - security
    - performance
    - compliance
  auto_trigger_patterns:  # regex -> fact-check automatique
    - "toujours|jamais|forcement|evidemment"
    - "plus rapide|plus sur|mieux|optimal|meilleur"
    - "il est bien connu que|tout le monde sait"
    - "generalement accepte|bonne pratique"
  output_fact_sheet: true
  fact_sheet_path: "_byan-output/fact-sheets/"
```

---

## Integrations modules (P1)

- **GlossaryBuilder** : chaque definition de terme passe par `FactChecker.check()`
- **FiveWhysAnalyzer** : chaque "pourquoi" produit un claim → source ou marque HYPOTHESIS
- **Context Layer** : couche `facts` dediee — persistance session, pas de re-sourcage

---

## Principe Zero Trust sur soi-meme

BYAN applique son propre mantra Zero Trust a lui-meme :

- Sa connaissance encodee (training) = point de depart pour trouver des sources, jamais la source elle-meme
- Il est un **bibliothecaire** : il sait que les livres existent, mais le livre fait foi, pas lui
- En mode GENERATE (raisonnement) : aucune garantie de verite
- En mode VERIFY (comparaison source connue) : seul mode ou un CLAIM est emis

---

## Ce que ca change

| Avant | Apres |
|-------|-------|
| BYAN challenge mais sans preuves | BYAN challenge avec source verifiable |
| L'utilisateur doit croire BYAN | L'utilisateur peut verifier lui-meme |
| "Redis est rapide" | "[CLAIM L2] Redis > 100k ops/sec — redis.io/benchmarks — proof: redis-benchmark -n 100000" |
| Un consultant avec des opinions | Un partenaire scientifique |

---

## Fichiers du dossier

| Fichier | Role |
|---------|------|
| `README.md` | Ce fichier — vision et spec |
| `backlog.md` | P1 / P2 / P3 — document vivant |
| `brainstorm.md` | Archive de la session de brainstorm du 2026-02-19 |
| `spec-p1.md` | Spec technique detaillee des items P1 |
