# Brainstorm — Fact-Check Scientifique

**Session :** 2026-02-19
**Methode :** Carson (YES AND) — 5 rounds
**Participants :** Yan + BYAN (Copilot)

Archive brute de la session de brainstorm. Document de reference, ne pas modifier.

---

## Round 1 — Idee de base et premiers angles

- Score de confiance 0-100% par type de source
- Sources primaires / secondaires / tertiaires
- Date de fraicheur des sources
- Snippet de verification executable par l'utilisateur
- Claims "verifiable maintenant" vs "par lecture" vs "non-verifiable"
- Claims non-verifiables marques comme opinions
- Auto-trigger sur keywords ("il faut", "c'est mieux", "toujours", "jamais")
- Contestation d'un fact-check par l'utilisateur → source alternative
- Registre de claims en session → pas de re-sourcage
- Taxonomie : Performance / Security / Best Practice / Opinion
- Blacklist de patterns ("c'est generalement accepte que...")
- Bloc `[FACT]` separe du raisonnement
- Mode verbeux vs concis
- Export de tous les facts en Markdown

---

## Round 2 — Integrations et methode scientifique

- API recherche temps reel (Perplexity, Brave, arXiv)
- Mode offline (sources locales) vs online
- Knowledge base locale enrichie par l'utilisateur
- Detection "source fraiche requise"
- Agent Skeptic — cherche les failles dans les claims
- Base de contre-exemples
- Vote entre agents en desaccord
- Hypothese falsifiable associee a chaque claim
- Experience de validation proposee (test executable dans le projet)
- Peer review 3 niveaux : claim → contre-claim → synthese
- Tags THEORY / TESTED / CONSENSUS
- Knowledge graph persistant dans `_byan/_memory/`
- Facts invalides memorises comme corrections
- Knowledge graph partageable entre equipes
- Echelle de niveau de preuve adaptee du medical (LEVEL-1 a LEVEL-5)
- Refus d'emettre un claim sans LEVEL-3 minimum sur sujets critiques
- Format compact `[FACT L2] claim — source — reproductible: commande`
- `?` apres n'importe quelle reponse → fact-check a la demande
- Mode audit : re-source tous les claims de la session
- Fact Sheet en fin de session
- Domaines ou il n'existe pas de source objective → mode deliberatif
- Signal source biaisee (vendor doc AWS recommande AWS...)
- Claim de performance doit inclure le contexte (hardware, version, charge)

---

## Round 3 — Dashboard, observabilite, embedded vs cloud

- Section "Fact Health" dans le dashboard : claims emis / sources / disputes / non-sources
- Truth Score de session (ratio claims sources / total)
- Tracking drift de confiance dans le temps
- Metrics dans MetricsCollector existant
- Alerte si Truth Score < 60%
- Log structure dans StructuredLogger existant
- Audit complet export JSON/Markdown
- Rejouer un audit a posteriori
- Mode offline (zero appel reseau, privacy-first)
- Mode online (fraicheur prime)
- Mode hybrid (local d'abord, externe si manque)
- `fact_check.mode` dans config.yaml
- Signal date de derniere MAJ knowledge base
- Fact Sheet avec sections : verifie / dispute / opinions / a-verifier
- Sauvegarde dans `_byan-output/fact-sheets/`
- Diff entre deux Fact Sheets de sessions differentes
- Claim "de contexte" (general) vs "de projet" (ce contexte precis)
- Claims de projet → preuve locale requise
- BYAN analyse `_byan-output/` avant d'emettre un claim de projet
- Context Layer dedie `facts` avec persistance via `_byan/_memory/`
- Facts valides auto-approuves avec date de peremption configurable
- Partage de Context Layer entre agents → pas de re-sourcage

---

## Round 4 — Active Listener, GlossaryBuilder, liant BMAD

- Reformulation sourcee (Active Listener + fact-check)
- Reformulation incorrecte → claim invalide memorise
- Mode "reformulation sourcee" via termes du glossaire
- Modele de comprehension verifiable
- Reformulation sans source possible → confirmation manuelle
- Glossaire : source obligatoire par terme
- Glossaire = couche zero du fact-check
- Conflits de definition entre agents → source la plus authoritative
- Pas de circularite non-sourcee dans les definitions
- Niveaux de stabilite des termes : STABLE / EVOLVING / DISPUTED
- Claim utilisant un terme DISPUTED → marque DISPUTED automatiquement
- Fact-check comme liant de toute la chaine BMAD
- Trust Report sur un artifact complet (47 claims, 43 sources, 4 a risque)
- Trust Report bloque le passage de phase si > 20% non-sources
- Propagation mathematique de l'incertitude : 80% × 80% × 80% = 51%
- Arbre de dependance entre claims avec scores
- Claim de base < 50% colore toute la chaine en rouge
- Remplacement d'un claim faible → recalcul en temps reel
- Parser de claims : extrait claims implicites de n'importe quel texte
- Detection de claims deguises en hypotheses ("en supposant que...")
- Regex de danger : "toujours", "jamais", "forcement", "evidemment", "il est bien connu que"
- Parser sur messages utilisateur aussi → challenge ses propres claims
- Gamification : Fact Score A/B/C/D
- Capabilities debloquees par score eleve
- Renforcement positif des bonnes sources
- Mode Socratique force si l'utilisateur repete des claims sans source
- Blacklist de sources avec pedagogie (pas de rejet brutal)
- Liste noire communautaire et versionnee

---

## Round 5 — LLM, hallucination, epistemologie

- Regle zero : BYAN ne genere jamais d'URL
- Mode GENERATE vs mode VERIFY strictement separes
- Affichage permanent du mode courant
- Sources uniquement depuis knowledge base locale
- Validation humaine requise avant entree dans le registre
- Workflow "source intake" : URL → extraction claims → hash → stockage
- Re-verification periodique du hash (source modifiee ?)
- Carte des zones de confiance (Node.js haute, nouvelles frameworks basse)
- Baisse automatique du seuil dans les domaines a faible confiance
- Trust No Output : BYAN se mefie de lui-meme
- Bouton "challenge this" sur n'importe quelle reponse
- Log d'auto-corrections : zones fragiles identifiees
- Separation structurelle [REASONING] / [HYPOTHESIS] / [CLAIM] / [FACT]
- Humain = source de verite de dernier recours (USER-VERIFIED)
- USER-VERIFIED avec artefact de preuve obligatoire (log, screenshot, output)
- Template de capture de preuve
- Detection de chaines d'hallucination (> 3 maillons suspects)
- Calcul confiance en chaine : multiplication des scores
- Refus de recommandation ferme si score chaine < 60%
- "Raccourcir la chaine" : chercher source directe plutot que deduction longue
- Connaissance encodee = point de depart, jamais la source
- Metaphore bibliothecaire : "je sais que les livres existent, le livre fait foi"
- Langage : "je crois savoir que..." vs "il est etabli que..."
- Axiomes non-challengeables : RFC IETF, specs ECMAScript, benchmarks methodologie publiee
- `_byan/knowledge/axioms.md` transparent et extensible
- Argument d'autorite ne compte pas ("Google fait comme ca" sans lien)
- "Tout le monde sait que..." → reponse : "non, donne-moi la source"
- HIPPO detecte ("mon CTO dit que...") → autorite non sourcee
- Biais de confirmation detecte (5 questions qui presupposent toutes la meme reponse)
- Position falsificationniste stricte (Popper) : claim falsifiable ou AXIOM
- Distinction fait du monde reel / modele mental (DDD, SOLID = heuristiques)
- Ratio facts / modeles mentaux dans les decisions architecturales
- Sprint planning : story bloquee si ACs avec claims non-sources
- Code review : challenge claims dans commentaires et PR descriptions
- TODO dans le code soumis au fact-check
- Documentation : badge Trust Score
- Tests TEA : chaque test prouve un claim precis
- CI invalide les facts en cas d'echec de test
- Rapport CI exporte les claims valides/invalides
- "Agreed Assumption" : hypothese acceptee consciemment, listee explicitement
- Dette de connaissance (analogie dette technique)
- Mesure du progres : reduction des hypotheses non-prouvees par sprint
- Demi-vies des facts : Security 6 mois, JS 1 an, algos jamais
- Meta-fact-check : les mantras ont-ils des sources ?
- Challenger un mantra → BYAN le defend ou le declasse en AXIOM
- Fact-check comme declaration epistemologique de BYAN
- Nouveau standard de communication IA : claim precis + comment le falsifier + source
