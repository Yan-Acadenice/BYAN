# BYAN Desktop (app/) — contexte de reprise pour Claude Code

> Ce fichier est charge automatiquement quand tu travailles dans `app/`. Il fait
> le point sur l'app Electron : sa cible, son architecture, l'etat courant, et les
> pieges deja rencontres. But : reprendre le dev/debug sans re-decouvrir le terrain.
>
> Version courante : `app/package.json` = 1.3.0. Canal de sortie : tags `desktop-v*`.
> Branche de travail : `main`.

## 1. Ce que c'est

App Electron native pour BYAN (`app/`, produit "BYAN"), en TypeScript, trois couches :
- `main/` — processus principal (cycle de vie app, fenetre, IPC, spawns).
- `preload/` — pont securise (contextIsolation:true, nodeIntegration:false) exposant `window.byanApi` + `window.byanEvents`.
- `renderer/` — l'UI React (pages, hooks, contextes) ; aucun `fetch` direct, tout passe par `window.byanApi`.

Le contrat IPC vit dans `shared/ipc-contract.ts` (canaux + types partages main/renderer).

## 2. La cible : MODE LOCAL NATIF (le coeur)

L'app tourne en deux modes. Le mode LOCAL est la raison d'etre de tout le chantier
(`desktop-local-native`, puis moteurs multi-CLI en 1.3.0) :
- **local** : zero cloud, zero token. Toute lecture vient du DISQUE (`_byan/` du
  projet choisi) via `main/local-data.ts`. Le chat = un CLI local (`claude` OU
  `codex`, au choix dans la vue) lance dans le dossier projet. `login('local')`
  n'exige AUCUN serveur (natif, 1.3.0).
- **cloud / custom** : lecture via l'API byan_web (token requis).

### Les moteurs du chat local (main/engines/, 1.3.0)

Le pont (`ipc-handlers/local-chat.ts`) est agnostique : carte des sessions, cap,
balayage a la fermeture, diffusion. Chaque CLI vit dans un adaptateur :
- **claude** (`engines/claude-engine.ts`) : UN processus long par session,
  tours ecrits sur stdin en stream-json. MCP : claude lit le `.mcp.json` du
  dossier projet tout seul.
- **codex** (`engines/codex-engine.ts`) : UN processus PAR TOUR
  (`codex exec --json`), chaine par `codex exec resume <thread_id>` (le
  thread_id vient de l'evenement `thread.started`). Prompt via stdin
  (positionnel `-`), pas argv. MCP : `.mcp.json` projete en surcharges
  `-c mcp_servers.*` a chaque invocation (`engines/codex-config.ts`) —
  quoting TOML via JSON.stringify, `${VAR}` expanse depuis l'env.
  Sandbox `workspace-write`, `--skip-git-repo-check`.
Cote contrat, le renderer ne designe pas un binaire : `LocalChatStartOpts.cli`
est une union `'claude' | 'codex'` validee cote main (surface spawn-any-binary
fermee, cf. test "rejects an unknown engine name").

### Le point de decision unique (a bien comprendre avant de toucher au mode)

Deux fonctions doivent rendre le MEME verdict a tout instant, sinon l'UI et la
donnee divergent (bug deja vecu, cf. journal 1.2.11/1.2.12) :
- `main/ipc-handlers/byan-web.ts` -> `isLocalMode()` : ce que lit la DONNEE. Chaque
  handler route `isLocalMode() ? localXxx() : fetchXxx()`.
- `main/ipc-handlers/auth.ts` -> `getSession()` : ce que lit l'INTERFACE (via
  `renderer/context/AuthSessionContext.tsx`, qui pilote l'etiquette Local/Cloud et
  le split de la page Chat).

Regle partagee `hasCloudToken()` (dans `auth.ts`), utilisee par les deux :
- mode explicite `local` -> local ; `cloud`/`custom` -> cloud ;
- mode ABSENT + pas de token cloud -> **local par defaut** (app locale-first, pas
  d'erreur d'auth) ; mode absent + token present -> cloud.

Si tu ajoutes une page qui lit des donnees, elle passe par un handler `byan-web`
gate sur `isLocalMode()`, avec un lecteur local dans `local-data.ts`. Evite tout
appel cloud non gate depuis le renderer.

## 3. Carte des fichiers clefs (main/)

| Fichier | Role |
|--------|------|
| `index.ts` | entree : cycle de vie app, fenetre, garde GPU, `before-quit` (stoppe serveur + sessions CLI + registre MCP) |
| `ipc-handlers/byan-web.ts` | `isLocalMode()` + tous les handlers de lecture (projets, agents, memory, knowledge, sessions, chat cloud) — create/delete/flux chat cloud gates en local |
| `ipc-handlers/auth.ts` | login / switchMode / `getSession` / logout / `hasCloudToken` ; cles `auth.mode`/`auth.token`/`auth.url` ; local = natif sans serveur ; diffuse `byan:auth:changed` |
| `ipc-handlers/store.ts` | magasin generique renderer, LISTE BLANCHE de prefixes (`chat.` `login.` `onboarding.` `ui.` `user.`) — les cles auth y sont inaccessibles |
| `local-data.ts` | lecteurs DISQUE du mode local : `localAgents/localKnowledge/localMemory/localSessions/localProjects/localProject` depuis `_byan/` |
| `ipc-handlers/local-chat.ts` | `LocalChatBridge` multi-moteur : sessions, cap, quitting re-verifie apres le trou async, diffusion |
| `engines/claude-engine.ts` | adaptateur claude : processus long, stream-json stdin/stdout |
| `engines/codex-engine.ts` | adaptateur codex : un `codex exec --json` par tour, resume chaine, stderr en reserve |
| `engines/codex-config.ts` | `.mcp.json` -> surcharges `-c mcp_servers.*` (quoting TOML, expansion `${VAR}`) |
| `engines/kill-tree.ts` / `engines/stream-lines.ts` | kill de groupe partage (TERM/grace/KILL) ; accumulateur de lignes UTF-8 |
| `installers/fs-utils.ts` | walk (node_modules elague pendant la descente) + planTree/planFile/applyPlans partages par les 3 installateurs |
| `secure-store.ts` | magasin secrets : keytar (trousseau OS) avec repli fichier `.env` (chmod 0600) au RUNTIME si keytar echoue |
| `gpu.ts` | `shouldDisableGpu()` : coupe l'acceleration (env `BYAN_DISABLE_GPU=1` ou marqueur `<config>/byan/disable-gpu`) |
| `resolve-bin.ts` | resout le chemin absolu de `claude`/`node` sous PATH tronque (app lancee en fenetre) ; cache une fois |
| `local-server.ts` | serveur webui forke (chemin legacy, vestigial en mode natif) ; healthcheck + redemarrage borne |
| `mcp-registry.ts` / `ipc-handlers/mcp.ts` | serveurs MCP demarres depuis Parametres ; `stopAll` au quit |
| `ipc-handlers/projects-local.ts` | registre local `~/.byan/projects.json` (list/record/find/reveal/install) |
| `ipc-handlers/terminal.ts` | ouvre un terminal externe lancant `claude` (multi-OS) |

Renderer utile : `pages/Chat.tsx` (split local/cloud), `components/chat/LocalChatView.tsx`,
`hooks/useLocalChat.ts` (re-export du contexte), `context/LocalChatContext.tsx`
(l'etat du chat vit la, monte au-dessus du routeur -> survit a la navigation),
`context/AuthSessionContext.tsx`, `pages/Projects.tsx`, `App.tsx` (routeur manuel `activePage`).

## 4. Commandes (depuis app/)

```bash
npm run dev          # dev complet : vite + tsc watch + esbuild watch + electron (BYAN_DEV=1)
npm test             # vitest (unitaire) — le vrai portillon de qualite
npm run typecheck    # tsc --noEmit sur main/preload/renderer/e2e
npm run lint         # eslint
npm run build        # compile main (tsc) + preload (esbuild) + renderer (vite) -> dist/
npm run test:e2e     # Playwright (lance le binaire packagee ; AVISOIRE en CI, pas bloquant)
npm run build:linux  # electron-builder --linux (AppImage + deb) ; :win :mac aussi
```

Test d'integration reel contre le VRAI `claude` (opt-in, hors CI) :
```bash
BYAN_E2E_CLAUDE=1 npx vitest run main/__tests__/ipc-handlers/local-chat.integration.test.ts
```

## 5. Sortie desktop (release)

- La CI `.github/workflows/electron-build.yml` build 3 OS (ubuntu/windows/macos) sur
  un tag `desktop-v*`, puis publie une GitHub Release avec les installateurs.
- Les tags `v*` du depot portent les versions npm de create-byan-agent (2.x) — a NE PAS
  reutiliser pour l'app. C'est `desktop-v*` uniquement.
- Convention : `app/package.json` version == tag desktop (ex : 1.2.12 -> `desktop-v1.2.12`).
- Avant de taguer : `git fetch --tags origin` et prendre un numero strictement au-dessus
  du max distant (le local peut etre en retard). Le job release tourne `if: always()`
  donc une jambe rouge (Windows) laisse quand meme sortir ubuntu+mac -> verifie la
  conclusion PAR JAMBE, pas seulement "release published".
- macOS : cible zip, non signee, `continue-on-error` (dmg parque). Windows : nsis,
  signature opt-in via secrets CSC_*.

## 6. Journal des correctifs (session 2026-07-23, desktop-v1.2.5 -> 1.2.12)

Tout est livre, CI verte, dans les 3 installateurs de `desktop-v1.2.12`.

- **1.2.5** — chat local : `--verbose` obligatoire avec `claude --print --output-format stream-json`.
- **1.2.6** — chat local durci (audit) : forme stdin `{type:'user', message:{role:'user', content}}`
  (sans le wrapper `message.role` le CLI leve "Expected message role 'user'") ; `result.is_error`
  remonte en erreur ; stderr filtre ligne par ligne ; `total_cost_usd` (pas `cost_usd`) ; UTF-8
  multi-octets (StringDecoder) ; flush fin de flux.
- **1.2.7** — build Windows repare : tests `resolve-bin` rendus POSIX-only (`skipIf(win32)`).
- **1.2.8** — chat persistant a la navigation : etat remonte dans `LocalChatProvider` (App(),
  au-dessus du routeur) ; reset a la deconnexion ; hygiene de changement de session.
- **1.2.9** — trois defauts : (a) `secure-store` se replie sur `.env` au RUNTIME quand keytar
  echoue (trousseau verrouille -> "Password is required") ; (b) option GPU permanente ; (c)
  reaping des process orphelins au `before-quit` (kill de GROUPE claude + enfant MCP, via spawn
  detache ; + registre MCP de Parametres).
- **1.2.10** — build Windows repare (encore) : tests `gpuMarkerPath` POSIX-only.
- **1.2.11** — `isLocalMode()` defaute sur local quand aucun mode + pas de token (fin des
  `AUTH_REQUIRED` sur les pages en local).
- **1.2.12** — `getSession()` partage le meme defaut (`hasCloudToken`) -> l'etiquette UI et la
  source de donnees concordent.

Backlog `desktop-local-native` (N1-N5) = DONE. Etat FD : `_byan-output/fd-state.json`.

## 6bis. Journal 1.3.0 (session 2026-07-24) — moteur codex + campagne de correctifs

Revue adversariale de toute l'app (workflow natif : 7 critiques + 2 lentilles de
contre-verification par constat) -> ~30 constats uniques, corriges par lots
atomiques. 640 tests verts, typecheck + lint propres. Detail : CHANGELOG.md
section "App Desktop 1.3.0". L'essentiel :

- **Moteur codex dans le chat local** (voir section 2, "Les moteurs").
- Course a la fermeture du pont chat corrigee (re-verification de `_quitting`
  et du cap APRES l'await de defaultCwd).
- Serveur local : minuteur de redemarrage stocke/annulable, planification
  unique (fin de la resurrection post-stop et du double fork).
- `mcp-registry.stop()` : attente de sortie reelle, escalade SIGKILL, kill de
  GROUPE (spawn detache) — la piste ouverte "reaping registre MCP" est FAITE.
- `store.get/set` : liste blanche de prefixes (le renderer pouvait lire
  `auth.token` par le magasin generique).
- `onboarding.apply` : plans recalcules cote main depuis les gabarits (le
  renderer ne choisit que les fichiers).
- `login('local')` natif (plus de prerequis serveur) + diffusion
  `byan:auth:changed` sur chaque login reussi.
- Magasin `.env` : verrou sur tout le cycle lire-modifier-ecrire, ecriture
  atomique, verrou orphelin recupere, valeurs multi-lignes encodees.
- Renderer : fuite de trames post-logout, saignement de flux au changement de
  conversation, bouton Envoyer = commandes slash, `/cli` operationnel,
  garde conversation supprimee, toasts, abonnement menu stable.
- Tests rendus falsifiables (l'assertion CSP e2e et le test d'idempotence de
  l'auto-updater ne pouvaient pas echouer), cross-env sur test:live, vitest
  couvre preload/, alias `@webui` supprime, glob `BYAN-*.zip.blockmap` ajoute
  au job release.

## 7. Pieges connus / lecons (a ne pas re-decouvrir)

- **Trousseau Linux verrouille** : keytar se CHARGE mais `set/get` peut lever "Password is
  required" a l'appel. Le repli `.env` est decide au RUNTIME (pas au chargement). Consequence :
  les valeurs jadis ecrites dans keytar deviennent illisibles apres verrouillage -> le `.env`
  demarre vide -> l'utilisateur re-choisit son dossier une fois (ca tient ensuite).
- **Tests a chemins POSIX** : la CI tourne aussi sur `windows-latest`. Un test qui assert un
  chemin `/home/...` ou separateur `:` casse sur Windows (branche APPDATA, `\`). Garder ces
  tests avec `describe.skipIf(process.platform === 'win32')`, ou construire l'attendu avec
  `path.join`. Deja tombe deux fois (resolve-bin, gpu).
- **Contrat de fil `claude` (stream-json)** : entree stdin =
  `{type:'user', message:{role:'user', content}}` ; `--verbose` requis avec `--print` +
  `--output-format stream-json` ; events sortie = `assistant` (message.content[].text),
  `result` (result + session_id + total_cost_usd) ; `claude` reste vivant multi-tour tant que
  stdin est ouvert. Prouve live ; voir `local-chat.integration.test.ts`.
- **Contrat de fil `codex` (JSONL, verifie live sur codex-cli 0.145.0)** : sortie =
  `thread.started` (porte `thread_id`), `turn.started`, `item.completed`
  (`item.type` = `agent_message`/`command_execution`/`mcp_tool_call`/...),
  `turn.completed` (usage) ; echecs = `turn.failed`/`error`. PAS de mode stdin
  multi-tour : un processus par tour, reprise par `codex exec resume <thread_id>`.
  codex LIT stdin quand il est ouvert -> passer le prompt par stdin (positionnel
  `-`) puis fermer, sinon il attend. Config MCP par `-c` : valeurs parsees en
  TOML (JSON.stringify convient pour les chaines, y compris chemins Windows).
- **Process enfants sous Linux** : un `spawn` ne meurt pas avec le parent. Tout enfant lance
  (claude, MCP) doit etre tue explicitement au quit (`stopAll`), avec kill de GROUPE
  (`process.kill(-pid)`, spawn `detached`) pour emporter les petits-enfants (le MCP node de claude).
- **Ralentissement machine** : sous certains pilotes/compositeurs Linux, Electron rend en
  logiciel (llvmpipe) et ralentit tout au repos. Coupe l'acceleration : `BYAN_DISABLE_GPU=1`
  ou `touch ~/.config/byan/disable-gpu`. Un interrupteur dans Parametres reste a faire.
- **Serveur webui forke** : vestigial en mode natif ; il prend `BYAN_PROJECT_ROOT ?? process.cwd()`
  (pas le dossier choisi) -> son log "Project root: ..." peut afficher le cwd de lancement, sans
  impact sur le chat natif.

## 8. Regles de code (heritees de BYAN)

- Zero emoji (code, commits, specs). Commentaires = le POURQUOI, pas le QUOI.
- Commits `type: description` (feat/fix/docs/refactor/test/chore), atomiques.
- TDD : test avant/avec le code. `npm test` + `typecheck` + `lint` verts avant tout tag.
- Francais clair cote humain ; noms techniques anglais gardes tels quels.

## 9. Pistes ouvertes (non commencees)

- Interrupteur GPU dans la page Parametres (aujourd'hui : env + fichier marqueur).
- `ProjectDetail` en mode local (aujourd'hui la page detail est cloud) ; action au clic
  sur un projet local (revealer le dossier / lancer une session).
- Retrait du serveur webui forke (`local-server.ts`, 14K + 12K de tests) : depuis
  1.3.0 le login local ne l'exige plus — il reste demarre au boot par legacy.
  Etape suivante : ne plus le forker en mode natif, puis retirer fichier + tests
  + asarUnpack/extraResources.
- Persistance de l'engine par session dans les enregistrements disque (list()
  etiquette encore tout en 'claude') + vraie reprise de contexte (uuid claude /
  thread_id codex persistes).

## 10. Les quatre ecrans de workflow — ce qui est monte, ce qui ne peut pas l'etre

Les quatre ecrans vivent dans `renderer/components/chat/workflow/` et sont
couverts par `renderer/__tests__/WorkflowScreens.test.tsx`. **Un seul est monte**,
et ce n'est pas un oubli : les trois autres n'ont aucune source de donnees dans
l'application telle qu'elle tourne. Les monter reviendrait a dessiner des chiffres
inventes — pire que ne rien montrer.

| Ecran | Donnee dont il a besoin | Produite ? |
|-------|-------------------------|-----------|
| **`WorkTimeline`** (la frise) | des etapes bornees dans le temps | **oui** — montee dans le chat, derriere le bouton « le detail minute par minute » |
| `ContaminationPanel` | la nature des etapes ET le graphe de ce qui s'appuie sur quoi | non — le fil ne porte que la succession dans le temps, et une succession n'est pas une dependance |
| `RewindPanel` | des points de decision nommes + un mecanisme de reprise | non — un chat local n'a aucune reprise, donc rien n'est jamais jete et il n'y a pas de prix a afficher |
| `RaisedHandPanel` | un protocole de pause et de demande | non — mesure le 2026-07-31 : ni `claude` ni `codex` n'emettent d'evenement d'autorisation sur le fil (`main/engines/`, `shared/ipc-contract.ts`) |

Chemin de donnees de la frise :

```
moteur -> LocalChatActivity            (shared/tool-activity.ts)
       -> activitySteps, par tour      (renderer/context/LocalChatContext.tsx)
       -> buildActivityTimeline        (shared/tool-activity.ts)
       -> slicesFromActivity           (components/chat/workflow/fromActivity.ts)
       -> TimelineSlice[] -> WorkTimeline
```

Deux details qui portent l'honnetete de l'ecran :

- `discarded` vaut 0 partout. C'est une MESURE, pas un remplissage : sans
  mecanisme de reprise, aucun travail n'est jete. Le jour ou une reprise
  existera, c'est cette valeur qu'il faudra brancher.
- Les etapes sont remises a zero au DEBUT d'un tour, jamais a sa fin. La frise
  repond a « ou est passe le temps ? », une question qu'on se pose une fois le
  travail fini : l'effacer a la fin la rendrait vide au seul moment ou elle sert.

Les trois ecrans non montes ne sont pas du travail perdu — ils decrivent la vue
d'un workflow multi-agents, ou ces donnees existent. Ils attendent ce producteur,
pas une correction.

## 11. Cout par tour dans le panneau d'usage (piege mesure)

`claude` publie `total_cost_usd` : le total de la SESSION, remesure a chaque tour
(mesure du 2026-07-27 sur trois tours : 0.2319 -> 0.2620 -> 0.2819, monotone).
Le pli des totaux le sait deja (`costUsd: 'latest'`), mais la liste « derniers
tours » affichait la valeur brute : trois lignes qui se lisent comme trois couts
et s'additionnent a 0.78 pour une session qui en a coute 0.28.

`components/chat/panels/turn-cost.ts` en tire le cout reel par soustraction de
deux cumuls mesures, et dit « cumul » quand il ne peut pas :
- le tour precedent du meme moteur n'est plus retenu (la liste est bornee a 50) ;
- le cumul redescend (un cout negatif n'existe pas).

Le rang du tour dans son moteur (`engineTurn`) est pose au pli, depuis un
compteur hors etat — pas depuis la longueur de la liste, qui est elaguee et
ferait repartir le rang a 1.

## 12. Les quatre ecrans, tous branches (mise a jour du 2026-07-31)

La section 10 disait qu'un seul ecran sur quatre etait monte. Ce n'est plus vrai :
les trois autres ont ete ADAPTES a un signal que l'application mesure deja,
plutot que laisses vides ou nourris de chiffres inventes.

| Ecran | Signal local reel | Source |
|-------|-------------------|--------|
| `WorkTimeline` | les etapes bornees dans le temps | `slicesFromActivity` |
| `ContaminationPanel` | une etape qui a ECHOUE (`ok: false`) et celles qui ont tourne apres, dans le meme tour | `contaminationSteps` |
| `RewindPanel` | ce que couterait de repartir (`/new`) ou de changer de moteur, chiffre sur les couts par tour reels | `rewindPoints` |
| `RaisedHandPanel` | ce qui bloque VRAIMENT : dossier non choisi, moteur absent, erreur qui a stoppe le tour | `raisedHandState` |

Tout vit dans `renderer/components/chat/workflow/fromLocal.ts`.

Trois limites assumees, ecrites dans le code la ou elles se posent :

1. **La relation de contamination est TEMPORELLE, pas une dependance prouvee.**
   Le fil ne porte que l'ordre des gestes. `consumes` dit « a tourne apres »,
   et la vue doit le formuler ainsi — pas « a consomme la sortie de ».
2. **L'application ne sait pas revenir au tour 3.** Elle sait repartir de zero
   et changer de moteur. `rewindPoints` n'offre donc que ces DEUX points :
   en proposer un par tour promettrait un geste qui n'existe pas.
3. **Aucun moteur n'emet de demande d'autorisation** (verifie le 2026-07-31,
   `main/engines/`, `shared/ipc-contract.ts`). La main levee montre donc les
   blocages reels de l'application, qui appellent le meme geste : trancher pour
   que ca reparte.

Invariant commun, teste : **quand le signal est absent, la fonction rend une
valeur vide et l'ecran ne s'affiche pas.** Un panneau de contamination sans
echec affirmerait un probleme inexistant — c'est pire qu'un panneau absent.

L'intervenant affiche est le MOTEUR (`claude` / `codex`), pas un agent du roster
BYAN : en local c'est lui qui fait le travail, et lui coller un agent serait un
mensonge de casting. Les identifiants ne sont pas dans `PEOPLE`, donc la vue
affiche `UNKNOWN_PERSON_LABEL` a cote du nom de l'outil.
