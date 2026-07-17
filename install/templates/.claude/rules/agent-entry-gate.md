# Porte d'entree BYAN — dispatch d'agent obligatoire (match-or-create)

> La base de BYAN : mettre la personne sur des rails pour toute tache ou projet.
> Avant de faire le travail, on regarde quel agent specialiste colle au besoin.
> Un agent adapte existe -> on le propose et on lance son workflow. Aucun ne
> colle -> on interviewe pour cadrer le besoin, on cherche les competences du
> metier, et on cree l'agent sur mesure. Le dispatch d'agent n'est pas une
> option : c'est l'entree de tout.

## Le principe

Il y a DEUX dispatch, ne pas les confondre :
- **Dispatch d'agent (Hermes)** — QUI fait le travail : quel agent BYAN, ou on en
  cree un. C'est le rail decrit ici.
- **Dispatch de runtime** — une fois l'agent choisi, sur quel moteur (Codex ou
  Claude) + modele + effort. C'est la couche du dessous (voir
  `docs/intelligent-dispatch.md`).

Cette regle porte sur le premier : la porte d'entree.

## Le flux (sur toute tache non-conversationnelle)

```
demande utilisateur
  -> BYAN + Hermes evaluent quel agent specialiste colle (matcher F1)
       AGENT ADAPTE TROUVE
         -> BYAN le PROPOSE ("je pars sur @dev, tu valides ?")
         -> l'utilisateur valide (double validation IA + humain)
         -> on lance le workflow de cet agent (+ dispatch runtime)
       AUCUN AGENT ADAPTE
         -> BYAN le dit et propose une interview
         -> interview : cadrer precisement le besoin de l'agent
         -> recherche web : competences + bonnes pratiques du metier vise
         -> creation de l'agent sur mesure
         -> on lance le workflow
```

Le declencheur de l'interview, c'est **l'absence d'un agent adapte**, pas la
taille de la tache. "code un script" -> l'agent dev existe -> workflow direct,
zero ceremonie. "il me faut un agent art moderne" -> aucun agent -> interview +
recherche + creation.

## La proportion (pour que le rail ne devienne pas un mur)

Le rail impose de **verifier** la pertinence d'un agent a chaque tache — pas de
declencher une interview a chaque fois. Agent existant qui colle = on route
direct. Besoin flou ou aucun agent adapte = la ou l'interview + creation se
declenchent. La ceremonie est proportionnee au manque, pas systematique.

## La chaine complete, automatique (comprendre -> dispatch -> execution party-mode -> gate en fin)

Le dispatch d'agent n'est que la premiere marche. A l'entree, sur toute tache,
BYAN enchaine la chaine ENTIERE de lui-meme, sans que l'utilisateur ait a la
demander. Quatre moments :

1. **Comprendre la demande.** Demande claire -> on avance directement, sans
   question. Doute ou demande mal exprimee -> BYAN expose UN plan clair (quels
   agents, quels modeles, quel effort) et l'utilisateur tranche. Ce point de
   controle en amont ne se declenche que sur un vrai doute — pas en reflexe a
   chaque tache.
2. **Dispatch (Hermes, automatique).** Le bon agent (matcher
   `_byan/mcp/byan-mcp-server/lib/agent-matcher.js`), le bon modele + effort
   (`dispatch-router.js` / native-tiers) et le bon moteur : Codex pour execution /
   shell / deploiement / devops / navigateur ; Claude pour architecture / refactor
   / qualite / planif ; la verification reste sur Claude ; Fable n'est pas emis.
   Decision automatique, pas de validation utilisateur. Fit -> cet agent ;
   no-fit -> interview + recherche web + creation (seul point ou l'humain reste
   requis en amont).
3. **Execution en party-mode avec un visuel live.** L'utilisateur VOIT ce qui se
   passe, en direct : la liste de taches native (une entree par agent/etape,
   mise a jour en temps reel) plus la table de dispatch en tete. Codex-lane : quand
   la voie est ARMEE (option yanstaller + Codex linke) et la tache delegable,
   deleguer REELLEMENT via le pont (`lib/codex-bridge.js` : `codex exec` -> diff
   unifie -> Claude applique ; repli sur Claude si Codex indisponible) — le conseil
   injecte est alors une directive, pas une simple suggestion. Non armee : pas de
   delegation, on execute sur Claude. Claude-lane : executer sur Claude au modele
   choisi.
4. **Gate utilisateur en fin.** Le point de controle utilisateur arrive a la fin,
   une fois la feature/tache faite et s'il y a un livrable a valider — pas en
   amont. Dans un FD multi-feature complet, les gates par phase s'appliquent en
   plus (c'est la gouvernance plus lourde du FD ; le chemin direct ci-dessus est
   le cas courant).

Ce qui reste a l'humain : (a) creer un nouvel agent quand aucun ne colle, (b)
confirmer une action destructive, (c) trancher le plan en amont quand il y a
doute. Le reste — comprehension, match agent, routage moteur, execution — part
tout seul. Detail du routage moteur : `docs/intelligent-dispatch.md`.

## La double validation (calibree : sur doute, nouvel agent, destructif)

Le matcher (F1, `_byan/mcp/byan-mcp-server/lib/agent-matcher.js`) est un
pre-tri deterministe : il classe les candidats du roster et rend un verdict
{fit | no-fit}. Il PROPOSE, il ne tranche pas seul. Mais la confirmation humaine
n'est PAS un reflexe a chaque tache : sur une demande claire avec un agent adapte,
BYAN route et execute, et le gate est en fin. La confirmation humaine se declenche
sur les trois cas qui la meritent : un vrai doute (le plan en amont), la creation
d'un nouvel agent, une action destructive. IA propose, humain confirme — la ou ca
compte, pas partout.

## La creation d'agent enrichie (chemin no-fit)

Quand aucun agent ne colle, la creation passe par :
1. **Interview** — cadrer le besoin (ce que l'agent doit faire, ses lignes
   rouges, son perimetre). Flux INT / agent-builder existant.
2. **Recherche web** — avant de generer l'agent, chercher les competences reelles
   et les bonnes pratiques du metier vise (ex : pour un agent "art moderne",
   courants, techniques, references). C'est ce qui evite l'agent-zombie generique.
3. **Generation** — generer l'agent sur mesure a partir de l'interview + la
   recherche.
4. **Workflow** — lancer le travail avec le nouvel agent.

## L'enforcement (honnete sur son plafond)

Aucun controle ne s'execute AVANT que la reponse s'affiche (pas de hook de
pre-affichage cote Claude Code). Le rail tient donc par deux forces, pas par un
mur beton au premier tour :
1. **Doctrine** — cette regle + le skill byan-byan + `CLAUDE.md` font que BYAN
   lance la proposition d'agent d'office.
2. **Filet reactif** — `.claude/hooks/agent-gate-check.js` (Stop) repere une tache
   traitee en direct (fichiers ecrits) sans proposition d'agent et hors cycle FD,
   pose un drapeau, et le rappel du tour suivant le signale en clair. Non
   bloquant : la correction est portee au tour d'apres (meme methode que les
   autres filets BYAN). Coeur teste : `.claude/hooks/lib/agent-gate.js`.

Quand un cycle FD est deja engage, la porte est deja en jeu (la phase DISPATCH en
fait partie) : le filet ne se declenche pas.
