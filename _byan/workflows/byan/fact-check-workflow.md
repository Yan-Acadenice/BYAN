# Workflow — Fact-Check

## Objectif
Analyser une assertion, un document ou une chaine de raisonnement avec la méthode scientifique BYAN :
demonstrable, quantifiable, reproducible.

---

## ETAPE 1 — Choisir le mode

Demander a l'utilisateur :

```
Que veux-tu analyser ?

[1] Une assertion unique (ex: "Redis est plus rapide que PostgreSQL")
[2] Un document ou bloc de texte (audit complet)
[3] Une chaine de raisonnement (ex: A → B → C → conclusion)
```

Attendre le choix avant de continuer.

---

## ETAPE 2A — Assertion unique

Demander : "Quelle est l'assertion a analyser ?"

Puis produire OBLIGATOIREMENT ce bloc exact, rempli :

```
┌─ FACT-CHECK ──────────────────────────────────────────────────┐
│ Claim     : [assertion mot pour mot]                          │
│ Domain    : [security | performance | javascript | general]   │
│ Verdict   : [BLOCKED | CLAIM L1 | CLAIM L2 | CLAIM L3         │
│              | HYPOTHESIS | REASONING | UNVERIFIED]           │
│ Source    : [nom exact depuis _byan/knowledge/sources.md      │
│              ou "aucune — preuve requise: [type exact]"]      │
│ Confiance : [score % selon niveau : L1=95, L2=80, L3=65,      │
│              HYPOTHESIS=50, REASONING=variable, BLOCKED=0]    │
│ Challenge : [la question manquante — source? reproductible?   │
│              benchmarkable?]                                   │
└───────────────────────────────────────────────────────────────┘
```

Regles de verdict :
- CLAIM L1 (95%) : spec officielle, RFC, standard (ex: ECMAScript, RFC 7519, POSIX)
- CLAIM L2 (80%) : benchmark exécutable, CVE référencé, documentation officielle produit
- CLAIM L3 (65%) : étude peer-reviewed, livre technique reconnu
- HYPOTHESIS     : plausible, estimatif, non vérifié
- REASONING      : déduction logique pure ("si A alors B")
- UNVERIFIED     : claim sans aucune source identifiable
- BLOCKED        : domaine strict (security / performance / compliance) sans source L2+

Apres le bloc → commentaire libre optionnel avec recommandations.

Proposer : "Veux-tu vérifier une autre assertion ? [O/N]"

---

## ETAPE 2B — Audit de document

Demander : "Colle ou décris le document a auditer."

Pour chaque assertion trouvée dans le document, appliquer le bloc FACT-CHECK de l'étape 2A.

Puis produire le tableau de synthese :

```
| # | Assertion | Verdict | Confiance | Action requise |
|---|-----------|---------|-----------|----------------|
| 1 | ...       | CLAIM L2| 80%       | aucune         |
| 2 | ...       | BLOCKED | 0%        | source L2 requise: CVE |
| 3 | ...       | HYPOTHESIS | 50%   | a vérifier avant sprint |
```

Puis calculer et afficher le Trust Score :

```
Trust Score = (assertions CLAIM + FACT) / total × 100
Badge : [Trust: A/B/C/D/F]
  A ≥ 90% | B ≥ 75% | C ≥ 60% | D ≥ 40% | F < 40%
```

---

## ETAPE 2C — Chaine de raisonnement

Demander : "Décris ta chaine de raisonnement étape par étape."

Pour chaque étape, demander :
- Quelle est l'assertion de cette étape ?
- Quel niveau de preuve ? (L1/L2/L3/HYPOTHESIS/REASONING)

Puis calculer la propagation de confiance :

```
Confiance finale = score_etape1 × score_etape2 × ... / 100^(n-1)
```

Afficher :

```
┌─ CHAINE DE RAISONNEMENT ──────────────────────────────────────┐
│ Etape 1 : [assertion] → [CLAIM L2] → 80%                     │
│ Etape 2 : [assertion] → [HYPOTHESIS] → 50%                   │
│ Etape 3 : [assertion] → [REASONING] → 70%                    │
│                                                               │
│ Confiance finale : 80% × 50% × 70% = 28%                     │
│                                                               │
│ VERDICT : [WARN si > 3 etapes | REJECT si < 60%]             │
│ Recommandation : [trouver source directe | raccourcir chaine] │
└───────────────────────────────────────────────────────────────┘
```

Avertissements automatiques :
- Plus de 3 étapes → "Chaine longue — risque de dégradation de confiance"
- Confiance finale < 60% → "Ne pas utiliser comme base de recommandation ferme"

---

## ETAPE 3 — Fin

Demander :
```
Que veux-tu faire ?

[1] Analyser une autre assertion
[2] Exporter un Fact Sheet de cette session
[3] Retour au menu BYAN
```
