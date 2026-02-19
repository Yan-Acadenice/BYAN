# Axiomes — Verites non-challengeables BYAN

**Statut :** Stable
**Derniere mise a jour :** 2026-02-19

Ces axiomes sont acceptes comme vrais sans preuve supplementaire.
Ils constituent le plancher epistemologique de BYAN.
Tout le reste est challengeable.

---

## Axiomes fondamentaux

### Complexite algorithmique
- **Big O notation** est la mesure standard de la complexite algorithmique
- **O(1) < O(log n) < O(n) < O(n log n) < O(n²)** pour n suffisamment grand
- Un algorithme O(n²) sera toujours battu par O(n log n) a grande echelle

### Reseau
- **La vitesse de la lumiere** borne les latences reseau (~1ms / 200km en fibre)
- **CAP theorem** : un systeme distribue ne peut garantir simultanement Consistency, Availability, Partition tolerance
- **Fallacies of Distributed Computing** (Peter Deutsch, Sun Microsystems) : le reseau n'est pas fiable, la latence n'est pas nulle, la bande passante n'est pas infinie

### Securite
- **Kerckhoffs's principle** : la securite d'un systeme ne doit pas dependre du secret de son algorithme
- **Le chiffrement symetrique** (AES-256) est plus rapide que le chiffrement asymetrique (RSA) par definition mathematique
- **Les hachages cryptographiques** (SHA-256, bcrypt) sont a sens unique par construction

### Specifications ratifiees
- Les **RFC publiees par l'IETF** sont des specifications de reference non-challengeables
- La **spec ECMAScript (TC39)** definit le comportement du langage JavaScript
- Les **specs W3C ratifiees** definissent les standards web

### Tests
- **Un test qui ne peut pas echouer n'est pas un test**
- **Un test qui teste le mock n'est pas un test**
- **La couverture de code ne garantit pas l'absence de bugs**

### Versioning
- **Semantic Versioning (semver)** : MAJOR.MINOR.PATCH — rupture / ajout / correction

---

## Ce qui N'est PAS un axiome

Ces elements sont des **heuristiques** (utiles, pas des lois) :
- SOLID, DRY, KISS, YAGNI → principes de design, pas des verites absolues
- Clean Architecture, DDD, CQRS → patterns, pas des obligations
- "Redis est plus rapide que PostgreSQL" → depends du use case, pas un axiome
- "Microservices > Monolith" → context-dependent, pas un axiome
- N'importe quel benchmark sans contexte (hardware, version, charge)

---

## Soumettre un axiome candidat

Un axiome doit satisfaire : **non-falsifiable dans tout contexte possible**
Exemples de non-candidats rejetes :
- "TypeScript est mieux que JavaScript" → opinion
- "Les tests augmentent la qualite" → vrai en general mais falsifiable dans certains contextes
