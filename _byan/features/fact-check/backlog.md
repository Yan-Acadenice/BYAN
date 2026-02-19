# Backlog — Fact-Check Scientifique

**Document vivant** — mise a jour a chaque sprint
**Derniere mise a jour :** 2026-02-19

---

## P1 — MVP (ce qui rend le fact-checker operationnel)

| ID | Item | Notes |
|----|------|-------|
| A1 | Structure d'un Fact (schema de donnees) | `{ claim, level, source, proof_type, status, confidence }` |
| A2 | 4 types d'assertions `[REASONING/HYPOTHESIS/CLAIM/FACT]` | Prefixe visible dans tous les outputs |
| A3 | 5 niveaux de preuve LEVEL-1 a LEVEL-5 | Definis dans `_byan/knowledge/sources.md` |
| A4 | Regle : BYAN ne genere jamais d'URL | Encodee dans persona de tous les agents |
| A5 | Auto-trigger sur patterns de danger | Config regex dans `config.yaml` |
| B1 | Module `FactChecker` injectable (`src/byan-v2/fact-check/`) | Meme pattern que GlossaryBuilder |
| B2 | Context Layer dedie `facts` | S'appuie sur l'infra existante |
| B3 | Integration `config.yaml` | 5 cles : enabled, mode, min_level, strict_domains, auto_trigger_patterns |
| B4 | Knowledge base locale `_byan/knowledge/sources.md` | Seed initial : RFC IETF, MDN, spec ECMAScript, redis.io, nodejs.org... |
| B5 | Axiomes `_byan/knowledge/axioms.md` | 10-15 axiomes fondamentaux non-challengeables |
| C1 | Fact Sheet output `_byan-output/fact-sheets/session-{date}.md` | Auto-genere en fin de session |
| D1 | Integration GlossaryBuilder | Appelle `FactChecker.check()` sur chaque definition |
| D3 | Integration FiveWhysAnalyzer | Chaque WHY produit un claim source ou HYPOTHESIS |

---

## P2 — Renforcement (apres P1 stable)

| ID | Item | Notes |
|----|------|-------|
| C2 | Propagation d'incertitude dans les chaines | Warning si chaine > 3 etapes |
| D2 | Mantras sources (`_byan/knowledge/mantras-sources.md`) | Chaque mantra avec son origine |
| E1 | Sprint planning gate | Story bloquee si ACs contiennent claims non-sources |
| E2 | Code review : challenge les claims dans comments/PR | Quinn refuse PR avec claims non-sources |
| E3 | TEA / CI → invalide les facts | Feedback loop pipeline CI → registre |
| F3 | Knowledge graph persistant entre sessions | Via `_byan/_memory/` |
| F4 | Expiration des facts par domaine | Security: 6 mois, JS ecosystem: 1 an, algos: jamais |
| F7 | Mode online (API externe) | Perplexity / Brave Search — opt-in |
| F8 | Blacklist de sources (`_byan/knowledge/blacklisted-sources.md`) | Sources obsoletes ou biaisees |

---

## P3 — Vision long terme

| ID | Item | Notes |
|----|------|-------|
| C3 | Badge Trust Score sur les artifacts | `Documentation Trust Score: 94%` |
| D4 | Active Listener : reformulations ancrees dans glossaire source | |
| F1 | Agent Skeptic | Agent dedie a trouver les failles dans les claims |
| F2 | Peer review entre agents | Cross-validation automatique des claims critiques |
| F5 | Fact packs communautaires | Thematiques : Node.js perf, securite web, etc. |
| F6 | Gamification | Fact Score A/B/C/D par session |

---

## Archive — Items evalues et rejetes

| Item | Raison |
|------|--------|
| Voix / Turbo Whisper integration | Hors scope pour cette feature, traite separement |
| Dashboard observability integration | P3 minimum — P1 d'abord |

---

## Definition of Done (P1)

- [ ] `FactChecker` classe avec tests unitaires (100% passing)
- [ ] 4 types d'assertions visibles dans les outputs agents
- [ ] 5 niveaux de preuve definis et documentes
- [ ] `_byan/knowledge/sources.md` seede avec 20+ sources fondamentales
- [ ] `_byan/knowledge/axioms.md` avec 10-15 axiomes
- [ ] `config.yaml` mis a jour avec section `fact_check`
- [ ] Context Layer `facts` operationnel
- [ ] Fact Sheet genere en fin de session
- [ ] GlossaryBuilder appelle FactChecker
- [ ] FiveWhysAnalyzer produit des claims source
- [ ] Score MantraValidator >= 80%
- [ ] `npm test` 100% passant
