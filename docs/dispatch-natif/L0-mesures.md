# L0 — les mesures qui décident la conception

> Chantier : rendre le dispatch BYAN natif au chat de l'app de bureau (choix de
> l'agent, du moteur, du modèle et de l'effort selon la tâche).
>
> Ce document ne contient que des faits mesurés le 2026-08-07, avec la commande
> qui les produit. Il existe parce que deux décisions de conception dépendaient
> de questions que personne n'avait posées à un binaire.
>
> Versions au moment de la mesure : `claude 2.1.224`, `codex-cli 0.146.0`.

## M1 — La ligne de commande l'emporte sur la définition d'un agent

**La question.** Les 35 fichiers de `.claude/agents/` déclarent tous un modèle
(24 `sonnet`, 7 `opus`, 4 `haiku`). Si la définition l'emportait sur `--model`,
le choix de modèle du dispatch deviendrait décoratif dès qu'un agent est posé,
et le panneau d'usage afficherait un modèle qui n'a pas fait le travail.

**La mesure.** Trois lancements, l'API pointée sur un port mort pour ne
consommer aucun tour. On lit le champ `model` de la trame `init`, que le CLI
émet avant tout appel réseau.

```
ANTHROPIC_BASE_URL=http://127.0.0.1:9 ANTHROPIC_API_KEY=sk-bogus \
  claude --print --output-format stream-json --verbose <drapeaux> "dis PONG" \
  | grep -m1 '"subtype":"init"'
```

| Cas | Drapeaux | `model` dans la trame `init` |
|---|---|---|
| A (témoin) | `--model opus` | `claude-opus-5` |
| B | `--agent bmad-bmm-dev` (déclare `sonnet`) | `claude-sonnet-5` |
| C | `--agent bmad-bmm-dev --model opus` | `claude-opus-5` |

**Ce que ça établit.** `[CLAIM L2]` `--model` gagne sur la déclaration de
l'agent (cas C). Le cas A est le témoin du drapeau seul ; le cas B montre la
déclaration de l'agent à l'œuvre quand rien ne la contredit. Sans ces deux
témoins, le cas C ne trancherait rien : on ne saurait pas si le résultat vient
du drapeau ou d'un défaut.

**Conséquences pour la conception.**

1. Le choix de modèle du dispatch n'est pas décoratif. Il écrase la déclaration
   de l'agent.
2. Le cas B est un comportement actuel que l'app ne montre pas : aujourd'hui,
   poser `/byan` sans choisir de modèle applique en silence le modèle déclaré
   par l'agent. L'écran doit le dire.
3. Le roster est une TROISIÈME source de recommandation de modèle, à côté du
   routeur par complexité et du choix de l'utilisateur. Écraser un `opus`
   déclaré par un `haiku` calculé serait la rétrogradation que la doctrine
   interdit — voir M4.

## M2 — Aucun agent ne déclare d'effort

```
grep -l 'effort' .claude/agents/*.md | wc -l   ->  0   (sur 35)
```

`[CLAIM L2]` L'effort reste sous le contrôle de l'application. Aucun conflit à
arbitrer de ce côté.

## M3 — La voie MCP démarre, mais n'expose pas ce qu'on cherche

**La question.** L'app câble déjà le `.mcp.json` du projet dans les deux
moteurs. Appeler `byan_dispatch` pendant le tour ne demanderait aucun portage.
Est-ce que ça marche, et est-ce que ça répond à la demande ?

**La mesure.** Le serveur lancé avec l'environnement d'une application de
bureau : ni `BYAN_API_TOKEN`, ni `BYAN_API_URL`, ni `CLAUDE_PROJECT_DIR`, et
depuis `/tmp`. Poignée de main JSON-RPC complète puis un appel réel.

```
demarrage        : OUI (byan-mcp)
nombre d outils  : 74
byan_dispatch    : present
reponse a l appel: {"score":72,"strategy":"main-thread","nature":"implementation",
                    "tier":"deep","model":null, ...}
marque erreur    : non
```

**Ce que ça établit.** `[CLAIM L2]` Le serveur démarre et répond dans un
environnement de bureau : la voie n'est pas bloquée techniquement.

**Mais elle ne livre pas la demande.** Sur une tâche d'implémentation à
complexité 72, `byan_dispatch` rend `model: null`. C'est sa doctrine assumée :
`lib/dispatch.js:12` interdit explicitement la montée en gamme vers opus, et la
mesure ci-dessus le confirme sur ce cas. L'échelle `haiku → sonnet → opus →
fable` vit ailleurs, dans `dispatch-router.js`, et :

```
grep -n "dispatch-router" _byan/mcp/byan-mcp-server/server.js   ->  0 occurrence
```

`[CLAIM L2]` Aucun outil MCP ne l'expose. Elle est atteignable depuis les hooks
(`.claude/hooks/codex-delegate-guard.js`) et les scripts de workflow, deux
surfaces propres à Claude Code.

**Conséquence.** La voie MCP demanderait d'abord d'écrire un nouvel outil, et
laisserait ensuite la décision à l'intérieur du tour du modèle : non
déterministe, invisible au contrat IPC, donc hors de portée d'un affichage
avant exécution et d'une reprise en main. Le portage reste le chemin.

## M4 — Le conflit de doctrine est déjà tranché ailleurs, par nature

Deux cerveaux coexistent et se contredisent sur la montée en gamme :

| Fichier | Natures | Sortie | Monte en gamme ? |
|---|---|---|---|
| `lib/dispatch.js` | exploration, mechanical, implementation, verification, analysis | `{score, strategy, tier, model}` | non (doctrine posée ligne 12) |
| `lib/dispatch-router.js` | execution, deploy, shell, browser... | `{runtime, model, effort}` | oui, jusqu'à `fable` |

`.claude/workflows/byan-auto-dispatch.js` a déjà résolu la contradiction, et sa
résolution passe par la NATURE de l'étape :

```js
// Une etape de verification herite du modele de session (opts.model omis) ;
// toute autre etape porte le modele de l echelle.
const modele = e.nature === 'verification' ? null : modeleClaudePour(e.complexite);
```

La vérification est protégée ; le reste prend l'échelle. Le portage reprend
cette règle plutôt que d'en inventer une.

## M5 — L'échelle est déjà recopiée à la main, sans verrou

Les seuils `34 / 67 / 90` existent en deux exemplaires :

| Emplacement | Statut |
|---|---|
| `_byan/mcp/byan-mcp-server/lib/dispatch-router.js:116-119` | source |
| `.claude/workflows/byan-auto-dispatch.js:99-104` | copie manuelle, commentée « miroir de » |

`[CLAIM L2]` Aucun test ne les compare : la recherche des seuils dans
`__tests__/` ne remonte aucune comparaison croisée entre les deux fichiers. Le
portage dans `app/shared/` serait la troisième copie. Le risque de dérive n'est
pas une hypothèse : il est déjà réalisé.

## Ce que L0 change dans les lots suivants

| Lot | Ce qui change |
|---|---|
| L1 | Le routeur porté rend un effort côté claude (six valeurs mesurées), pas `null`. La règle de la vérification protégée vient de M4, pas d'une invention. |
| L3 | Le modèle déclaré par l'agent devient une entrée du calcul, pas un détail : trois sources de recommandation à réconcilier sans rétrograder. |
| L5 | L'écran doit montrer le cas B : « cet agent tourne en confirmé parce qu'il le déclare ». Aujourd'hui c'est silencieux. |
| L6 | Le verrou n'est pas de la prudence : la dérive existe déjà entre deux copies. |
| — | La voie MCP est écartée, avec sa raison : elle demanderait un nouvel outil et rendrait la décision invisible au contrat IPC. |
