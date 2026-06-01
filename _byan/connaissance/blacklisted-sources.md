# Blacklist — Sources a Rejeter

**Derniere mise a jour :** 2026-02-19
**Usage :** Quand l'utilisateur cite une de ces sources, BYAN l'avertit
avec une explication pedagogique — pas de rejet brutal.

Format : `**Source** — Raison — Alternative recommandee`

---

## Sources obsoletes

**W3Schools (w3schools.com) — Certains sujets**
Raison : Contenu souvent simplifie, parfois incorrect ou obsolete sur les sujets avances (JS, CSS, SQL).
Quand utiliser quand meme : OK pour les debutants sur le HTML de base.
Alternative : MDN Web Docs (developer.mozilla.org) — source primaire, maintenue par Mozilla.

**PHP.net documentation pre-PHP7**
Raison : PHP < 7 est en fin de vie depuis 2019. Les pratiques des anciennes docs (mysql_* functions) sont dangereuses.
Alternative : php.net/docs.php — documentation courante uniquement.

**jQuery documentation pour les projets modernes**
Raison : jQuery resolut des problemes de compatibilite navigateur qui n'existent plus. Ajouter jQuery en 2024+ est un overhead injustifie pour la plupart des use cases.
Quand utiliser quand meme : projets legacy qui l'ont deja, ou contraintes specifiques.
Alternative : MDN — API natives modernes (fetch, querySelector, etc.).

---

## Sources biaisees (vendor lock-in)

**AWS Documentation recommandant des services AWS**
Raison : AWS recommande naturellement ses propres services. La doc technique est fiable, mais les comparaisons et recommandations architecturales sont biaisees vers l'ecosysteme AWS.
Comment utiliser quand meme : La doc API AWS est LEVEL-1 pour les services AWS. Les articles "best practices" AWS sont LEVEL-4 max (opinion vendor).
Alternative pour comparaisons : benchmarks tiers independants (TechEmpower, etc.).

**Google Cloud, Azure, Vercel, Netlify — idem**
Meme principe : docs techniques = fiables, recommandations architecturales = biaisees vendor.

**MongoDB "Why NoSQL" marketing content**
Raison : Les articles marketing MongoDB presentent NoSQL comme superieur sans contextualisation du use case.
Alternative : Articles comparatifs independants avec benchmarks reproductibles.

---

## Sources a verifier avec precaution

**Medium / Dev.to / Hashnode articles**
Raison : Qualite tres variable, pas de peer-review, peut contenir des erreurs significatives.
Comment utiliser : LEVEL-4 maximum, toujours croiser avec une source primaire.
Signal d'alerte : article sans date, sans auteur credentialed, sans references.

**Stack Overflow reponses**
Raison : Fiable pour les reponses tres votees (> 500 votes) sur des sujets etablis. Peu fiable pour les sujets recents ou complexes.
Comment utiliser : LEVEL-4, verifier la date (reponse de 2012 sur Node.js peut etre obsolete).
Signal d'alerte : reponse acceptee avec peu de votes, reponse ancienne sur tech en evolution rapide.

**ChatGPT / LLM outputs comme source**
Raison : Un LLM ne peut pas etre sa propre source. BYAN ne peut pas se citer lui-meme.
Regle absolue : Tout claim base uniquement sur un output LLM est [REASONING], jamais [CLAIM].

**Reddit / Hacker News opinions**
Raison : Discussions utiles pour explorer des pistes, pas des sources citables.
Comment utiliser : [REASONING] uniquement, jamais [CLAIM].

**Articles Wikipedia sans references**
Raison : Wikipedia est une source secondaire. Les articles bien references sont LEVEL-4.
Signal d'alerte : bandeau "citations needed", article court sans section References.

---

## Domaines a forte densite de desinformation tech

Ces domaines necessitent une vigilance accrue — le seuil de fact-check est abaisse automatiquement :

- **Performance claims** : "X est plus rapide que Y" sans benchmark methodologique
- **Security "best practices"** sans reference CVE ou specification
- **"The community has moved to X"** sans donnees (npm downloads, GitHub stars dated)
- **Estimations de complexite** ("ca prendra 2 jours") sans base de reference historique
- **"Tout le monde utilise X maintenant"** sans donnees de marche datees

---

## Contribuer

Pour proposer une source a blacklister :
1. Identifier le biais ou l'obsolescence
2. Proposer une alternative
3. Soumettre avec date et contexte
