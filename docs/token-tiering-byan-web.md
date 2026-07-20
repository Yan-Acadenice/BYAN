# Token tiering cote byan_web — brief pour l'agent qui bosse sur le serveur web

But : expliquer comment amener la meme economie de tokens que cote Claude Code
(mettre le bon modele sur la bonne tache) DANS byan_web. Lis d'abord "Etat actuel"
avant de coder : le concept ne s'applique pas tel quel, byan_web n'est pas un
moteur de sous-taches.

## 1. Le concept (le meme partout)

Trois modeles, du moins cher au plus cher :

| Modele | Pour quoi | Cout relatif |
|--------|-----------|--------------|
| Haiku | lire / lister / parser / recuperer (aucun jugement) | le moins cher |
| Sonnet | analyser / evaluer / noter / recommander / synthetiser (jugement, pas frontier) | moyen |
| Opus | ecrire du code, verifier la correction, raisonnement dur | le plus cher |

Regle : on descend en gamme la ou c'est sans risque, et un **garde-fou** bloque
le trop-bas la ou une erreur ferait mal (ecrire du code ou verifier une correction
NE doit PAS tourner sur un modele faible).

## 2. La reference cote Claude Code (deja fait, a porter en concept)

Cote Claude Code, la logique vit en un seul endroit :
`_byan/mcp/byan-mcp-server/lib/native-tiers.js`.

- `classifyLeaf(label)` : range une tache par son intitule en 5 classes
  (exploration / mechanical / analysis / verification / implementation).
- `tierFor(classe)` : exploration -> haiku ; analysis + mechanical -> sonnet ;
  verification + implementation -> le modele de session (fort).
- Echappatoire : un intitule prefixe `deep-` force le modele fort meme pour une
  analyse (pour une analyse vraiment dure).
- Le garde-fou est un linter (`workflows-lint.js` + `bin/byan-lint-workflows.js`)
  qui refuse un modele trop faible sur une tache protegee.

Regle de conduite : NE COPIE PAS le code tel quel (byan_web est un autre runtime).
Porte le CONCEPT (le tableau nature -> modele + le garde-fou).

## 3. Etat actuel de byan_web (verifie dans le code)

byan_web ne decoupe PAS un travail en sous-taches avec un modele par sous-tache.
C'est un chat : **un modele par conversation**, choisi par l'utilisateur.

Ou le modele est choisi aujourd'hui :

- `api/copilot-bridge.js` — la liste `MODELS` (opus/sonnet/haiku + gpt) et
  `DEFAULT_MODEL = 'claude-sonnet-4.5'`. Ligne ~54 :
  `selectedModel = model && MODELS.includes(model) ? model : DEFAULT_MODEL`.
  Donc : le modele vient de la requete (choix utilisateur), sinon Sonnet par defaut.
- `api/services/chat.js` — chaque conversation stocke sa colonne `model`
  (choix utilisateur, persiste).
- `api/webui/src/pages/Chat.jsx` — l'UI ou l'utilisateur choisit provider + modele
  par conversation.
- `api/services/llm.js` — `defaultModel` par provider.

Consequence : le probleme "tout tourne sur Opus" que l'on a corrige cote Claude
Code N'EXISTE PAS pareil cote byan_web — le defaut y est deja Sonnet, et c'est
l'utilisateur qui choisit. Il n'y a pas de sous-tache a router.

## 4. Quoi faire, selon le cas

### Cas A — byan_web reste un chat (un modele par conversation)

Il n'y a rien a "tiers" par tache : il n'y a pas de tache decoupee. Les seuls
leviers sont :

1. Garder le defaut sur Sonnet (deja le cas — `DEFAULT_MODEL`). Ne le remets pas
   sur Opus par defaut.
2. Laisser l'utilisateur monter en Opus quand il en a besoin (deja possible via
   le selecteur). Ne force rien.

Si c'est le cas, il n'y a probablement rien a construire. Ne fabrique pas un
moteur de tiering pour un besoin qui n'existe pas (Rasoir d'Ockham).

### Cas B — byan_web ajoute un moteur qui decoupe un travail en etapes

C'est la que le concept devient utile. Quand byan_web lance plusieurs etapes
automatiques (ex : un agent qui explore, analyse, puis ecrit), route CHAQUE etape
selon sa nature avec le tableau de la section 1 :

| Nature de l'etape | Modele |
|-------------------|--------|
| lire / lister / recuperer du contexte | haiku |
| analyser / noter / recommander / synthetiser | sonnet |
| ecrire du code / du contenu livrable | modele fort (opus) |
| verifier la correction / valider | modele fort (opus) |

Plus le garde-fou : bloque (ou refuse d'executer) une etape "ecrire" ou "verifier"
si on tente de la mettre sur haiku. Prevois une echappatoire explicite (equivalent
du prefixe `deep-`) pour forcer le modele fort sur une analyse vraiment dure.

Ou brancher : au point ou byan_web decide `selectedModel` avant d'appeler le LLM
(`api/copilot-bridge.js` cote bridge, ou le futur moteur d'execution de taches).
Mettre la decision dans UN seul module (comme native-tiers), pas eparpillee.

## 5. Ce qui reste a verifier par toi (agent byan_web)

Je n'ai pas l'exécution complete de byan_web en tete. Avant de coder, confirme :

1. Est-ce que byan_web execute deja des workflows multi-etapes (un modele par
   etape) quelque part, ou juste un chat + un declencheur ? Cherche un vrai moteur
   d'execution de taches (pas seulement le stockage d'une definition de workflow).
2. Si oui, ou est choisi le modele PAR ETAPE ? C'est la que la regle de la
   section 4B s'insere.
3. Si non (Cas A), ne construis rien : documente que byan_web est deja au bon
   defaut (Sonnet) et que le choix reste a l'utilisateur.

## 6. En une phrase

Cote Claude Code : les sous-taches d'analyse tournent maintenant sur Sonnet au
lieu d'Opus (garde-fou : code + verif restent sur le fort). Cote byan_web : meme
principe SI un moteur multi-etapes existe ; sinon rien a faire, le defaut est deja
Sonnet et l'utilisateur choisit.
