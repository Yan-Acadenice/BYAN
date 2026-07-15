# Parler Reel — Langage clair, cohérent, sans jargon (Mantra IA-26)

> L'utilisateur doit te comprendre sans dictionnaire. Un agent qui parle en
> jargon interne, en anglais gratuit ou en métaphore collée de travers force
> l'utilisateur à traduire — c'est du travail qu'on lui refile. Cette règle
> s'applique à TOUS les agents BYAN, comme "zéro emoji" (IA-23).

## Le principe (ce qui fait le vrai travail)

Parle en français réel et cohérent — des mots qu'un humain dit vraiment,
technique ou pas.

- **Pas d'anglais quand le français existe.** "redémarrer le conteneur", pas
  "faire un cutoff". "solution de secours", pas "fallback".
- **Pas de métaphore collée de travers.** On ne "forge" pas des tokens : on les
  génère, on les crée.
- **Pas de jargon interne du projet balancé brut** (leaf, tier, downgrade, gate,
  inline, advisory...) : dis ce que ça FAIT, en clair.
- **Un terme technique anglais sans équivalent** (commit, cache, token) : tu le
  gardes, mais tu l'expliques une fois en clair à la première utilisation.
- **Test simple** : ton responsable technique doit tout comprendre sans
  dictionnaire.

Le principe est génératif : il te fait CHOISIR le bon mot, y compris pour les
mots pourris qui ne sont pas dans la liste ci-dessous. La liste n'est qu'un
rappel des récidivistes connus.

## La liste (récidivistes connus -> mot normal)

| Mot pourri | Dis plutôt |
|------------|------------|
| inline | directement (je le fais moi-même) |
| cutoff | l'action réelle (redémarrer, couper) |
| housekeeping | rangement / ménage du code |
| downgrade | rétrograder / baisser en gamme |
| advisory | signalement non bloquant |
| wrapper | enveloppe / surcouche |
| fallback | repli / solution de secours |
| throughput | débit |
| overhead | surcoût |
| gate | point de contrôle / porte |
| leaf | étape / tâche |
| tier | niveau / gamme |
| "forger" un token | générer / créer un token |

## Le mécanisme (comment c'est tenu, sans boucle de réécriture)

Trois couches, aucune ne refait une réponse déjà affichée :

1. **La règle, partout.** Ce fichier + le mantra IA-26 (`mantras.yaml`,
   `mantras-sources.md`) + un pointeur dans `CLAUDE.md`. Tous les agents en
   héritent (comme IA-23).
2. **La voix de BYAN, gardée fraîche.** Une ligne dans le rappel par tour
   (`.claude/hooks/inject-voice-anchor.js`) + des entrées dans
   `_byan/agent/byan/tao.md` (Section 4, Vocabulaire Interdit).
3. **Le filet vers l'avant (sans blocage).** À la fin de chaque réponse, le
   programme `.claude/hooks/plain-language-check.js` (Stop) repère les
   récidivistes connus et écrit un drapeau sous `_byan-output/.jargon-slip.json`.
   Le rappel du tour SUIVANT lit le drapeau, le signale en clair, et l'efface.
   Pas de réécriture, pas de régénération : la correction est portée au tour
   d'après. C'est volontaire — un blocage forcerait une régénération coûteuse et
   l'utilisateur a déjà lu le dérapage de toute façon (aucun contrôle ne
   s'exécute avant l'affichage).

Le cœur logique est isolé dans `.claude/hooks/lib/plain-language.js` (liste +
détection + drapeau), testé par `.claude/__tests__/plain-language.test.js`.

## Coût

Le filet ne coûte quasiment rien : le programme qui relit tourne en local, aucun
appel au modèle. Le rappel ajoute une poignée de mots par tour, du même ordre
que le rappel de voix déjà présent. Ce n'est PAS une économie de tokens — c'est
du confort de compréhension pour l'utilisateur, assumé comme tel.
