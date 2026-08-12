# Droits de l'installateur BYAN — utilisateur cible, propriete, groupe partage

> Ce que l'installateur `create-byan-agent` pose sur le disque, sous quelle
> identite, et ce qu'un administrateur doit regler lui-meme sur un serveur
> partage. Le document couvre les trois systemes vises (Linux, macOS, Windows)
> et les cas ou la pose de droits n'a pas d'effet.

Fichiers concernes : `install/lib/target-user.js` (qui lance),
`install/lib/resolve-binary.js` (ou sont les binaires),
`install/lib/ownership.js` (quels droits), branches a la fin de
`install/lib/install-engine.js`.

## 1. Le probleme mesure

Releve du 2026-08-11 sur un serveur reel, installation lancee avec `sudo` depuis
le dossier de travail de l'utilisateur.

**Premier symptome — l'arborescence devient inaccessible a son proprietaire.**
Le dossier parent du projet est en `yan:docker`. Le dossier `_byan/` cree par
l'installateur sous elevation ressort en `root:root`, ainsi que tout ce qu'il
contient. L'utilisateur qui a lance la commande ne peut plus modifier ce que
l'installateur vient d'ecrire pour lui : ni editer un agent, ni relancer une
installation, ni supprimer le dossier sans repasser par une elevation.

La cause est mecanique : sous POSIX, le proprietaire et le groupe sont portes
par l'inode du fichier, et un fichier cree prend l'identite effective du
processus createur. Il n'y a pas d'heritage du proprietaire depuis le dossier
parent. Un processus qui tourne en root ecrit du root, quel que soit le
proprietaire du dossier ou il ecrit.

**Second symptome — une etape sautee annoncee comme une reussite.**
Sous elevation, `os.homedir()` rend `/root`. L'installateur cherche `~/.claude`
au mauvais endroit, le PATH de root ne contient pas `~/.local/bin` ou vit le
lien vers le binaire `claude`, la detection conclut a l'absence de Claude Code,
l'etape Claude est sautee. Le rapport final annonce quand meme une reussite : le
calcul du verdict porte sur les etapes executees, donc une etape absente du plan
est absente du denominateur.

Les deux symptomes ont la meme racine : le processus qui ecrit n'est pas
l'utilisateur pour qui il ecrit.

## 2. La chaine de resolution de l'utilisateur cible

`install/lib/target-user.js` repond a une seule question : pour qui cette
installation est-elle faite ? Six echelons, essayes dans cet ordre, le premier
qui repond gagne. La fonction est pure sur `{ env, platform, fs, userInfo }`
injectes, ce qui la rend testable sans toucher a la machine hote.

| # | Echelon | Ce qu'il lit | Pourquoi il existe |
|---|---------|--------------|--------------------|
| 1 | `sudo` | `SUDO_UID`, `SUDO_GID`, `SUDO_USER` | sudo pose l'identite numerique complete : c'est la source la plus sure, aucune resolution de nom n'est requise. `SUDO_USER` sert a retrouver le home dans la base des comptes. |
| 2 | `doas` | `DOAS_USER` | doas (OpenBSD, disponible sur les BSD et sur Linux) pose seulement le nom du compte appelant, pas d'identifiant numerique. Il faut donc resoudre nom -> uid/gid/home avant de s'en servir. |
| 3 | `pkexec` | `PKEXEC_UID` | polkit, le chemin d'elevation des sessions de bureau et des lanceurs graphiques. Il pose l'uid numerique seul, sans nom et sans gid : le gid primaire et le home se resolvent depuis l'uid. |
| 4 | Proprietaire du dossier de travail | `fs.statSync(process.cwd())` -> `uid`, `gid` | Le repli qui couvre `su -` et une session root ouverte directement : dans ces deux cas, aucune variable d'elevation ne survit. Le dossier ou la commande est lancee porte encore l'identite de la personne. |
| 5 | root legitime | identite effective a 0, et l'echelon 4 rend root lui aussi | Conteneur, integration continue, installation deliberee dans `/opt`. C'est un resultat de premiere classe, pas un echec : la reprise des droits n'a rien a corriger et le rapport le dit en clair. |
| 6 | Aucune elevation | `userInfo()` du processus courant | Le cas courant. L'utilisateur cible est celui qui a lance la commande. |

Valeur rendue : `{ uid, gid, name, home, source, eleve }`. Le champ `source`
nomme l'echelon qui a repondu, ce qui rend le rapport final lisible et le
diagnostic possible sans relancer l'installation.

Le champ `home` est le point le plus important en pratique. Il remplace
`os.homedir()` partout ou l'installateur ecrit hors du projet : `~/.byan/`
(identifiants), `~/.codex/config.toml`, `~/.claude/skills/`. Sans lui, un
fichier de secrets ressort en `root:root` mode 0700 dans `/root/.byan/`,
illisible par son proprietaire declare.

### L'exception git ne couvre que sudo

git refuse d'operer sur un depot dont le proprietaire differe de l'identite
effective du processus : c'est le message `detected dubious ownership`. git
fait une exception pour sudo, en comparant contre `SUDO_UID`. Cette exception ne
couvre pas les autres echelons.

Consequence directe : sous `doas`, sous `su` ou en session root ouverte
directement, la commande `git config core.hooksPath .githooks` posee par
l'installateur tombe sur `dubious ownership` et echoue. Le filet pre-commit du
mode strict n'est pas cable, et l'echec passe en silence si le code d'erreur
n'est pas remonte dans le plan. Le geste de reparation est au tableau de la
section 8.

## 3. La politique de droits par systeme

Le clivage utile n'est pas Linux / macOS / Windows. C'est **POSIX contre listes
de controle d'acces**. Deux branches derriere une interface commune :

```
ensureOwnership(dossier, cible)        -> { issue, detail }
ensureSharedGroup(dossier, groupe)     -> { issue, detail }

issue = reussi | non-applicable | echoue
```

Trois issues et non deux : un systeme de fichiers qui ignore la propriete POSIX
rend `non-applicable`, ce qui est un fait a rapporter, pas une panne a signaler
(section 7).

### Branche POSIX (Linux, macOS, BSD)

Trois gestes, dans cet ordre, et les trois sont necessaires.

1. **`fs.chown` apres coup.** Le proprietaire et le groupe sont portes par
   l'inode. Il n'y a pas d'heritage du proprietaire depuis le dossier parent :
   un fichier cree prend l'identite effective du processus createur. La
   correction se fait donc apres l'ecriture, par un parcours recursif de
   l'arborescence posee.

2. **Le bit setgid `0o2000` sur CHAQUE dossier.** Sans lui, un fichier cree dans
   le dossier prend le groupe primaire de son createur et pas celui du dossier.

   La mesure du 2026-08-11 montre que le bit se propage tout seul aux
   sous-dossiers crees DANS un dossier qui le porte. Une premiere version en a
   conclu qu'une seule pose a la racine suffisait. C'est faux sur une
   arborescence deja ecrite, et le terrain l'a tranche : essai du 2026-08-12 sur
   un serveur reel, `--group docker`, le gid etait bien pose sur les 7831
   entrees mais **un seul dossier sur 1187 portait le setgid** — la racine. Un
   sous-dossier cree ensuite sous `_byan/` ressortait au groupe primaire de son
   createur, en 755.

   La propagation ne vaut que pour ce qui est cree APRES la pose. Les
   sous-dossiers d'une installation existent deja au moment ou l'on pose le
   bit : il faut le leur donner un par un, pendant le meme parcours recursif.
   Sinon le groupe partage tient pour l'existant et lache pour tout ce qui sera
   ecrit ensuite — c'est-a-dire pour ce dont un projet a plusieurs mains a
   reellement besoin.

   Detail d'ecriture : `fs.constants` n'expose pas de constante `S_ISGID`, le
   bit s'ecrit en litteral octal `0o2000`.

3. **`umask 0o002` pendant l'execution.** Avec le setgid pose mais un umask 022
   actif, le fichier ressort en 644 : il porte le bon groupe et le groupe n'a
   pas le droit d'ecriture. Le setgid transporte l'appartenance, pas la
   permission. L'installateur abaisse donc son umask a `0o002` pour la duree de
   son execution et le restaure en sortant. Resultat vise : fichiers en 664,
   dossiers en 2775.

**Difference macOS.** La semantique BSD herite le groupe du dossier parent meme
sans setgid. La pose du bit y est donc redondante, et inoffensive. C'est
volontaire : un seul chemin de code sert les deux systemes, ce qui evite une
branche par systeme dont l'une des deux ne serait pratiquement pas exercee.

**Resolution d'un nom de groupe en identifiant.** Node ne sait pas le faire.
Lire `/etc/group` directement ne suffit pas : `nsswitch` peut designer une
seconde source (systemd, LDAP, annuaire d'entreprise) que ce fichier ignore. Il
faut sortir vers l'outil du systeme :

```bash
getent group byan          # Linux et BSD, respecte nsswitch
dscl . -read /Groups/byan PrimaryGroupID    # macOS
```

### Branche listes de controle d'acces (Windows)

Windows n'a pas de couple proprietaire/groupe au sens POSIX. Un objet porte un
descripteur de securite contenant une liste d'entrees d'acces, et chaque entree
peut etre marquee heritable : `OI` (les fichiers crees dedans la recoivent),
`CI` (les sous-dossiers crees dedans la recoivent).

Node n'expose aucune fonction pour manipuler ce descripteur. Il faut sortir vers
`icacls` :

```bat
icacls "C:\chemin\projet\_byan" /grant "byan:(OI)(CI)(M)" /T
```

`M` accorde la modification, `/T` applique a l'existant. L'heritage NTFS est
deja actif par defaut sur un dossier nouvellement cree : la pose sur la racine
`_byan/` couvre la descendance future, la passe `/T` ne sert qu'a rattraper ce
qui a ete ecrit avant.

## 4. Le geste administrateur : le groupe partage

Le groupe partage existe pour une raison precise : permettre a un administrateur
de donner acces a **tous** les projets BYAN d'un serveur avec une seule
commande, au lieu d'un `chown` par projet a chaque arrivee dans l'equipe.

| Systeme | Commande |
|---------|----------|
| Linux | `sudo usermod -aG byan <utilisateur>` |
| macOS | `sudo dseditgroup -o edit -a <utilisateur> -t user byan` |
| Windows | `net localgroup byan <utilisateur> /add` (invite de commandes en administrateur) |

Creation prealable du groupe, si besoin : `sudo groupadd byan` sous Linux,
`sudo dseditgroup -o create byan` sous macOS,
`net localgroup byan /add` sous Windows.

**L'appartenance a un groupe est lue a l'ouverture de session.** Un utilisateur
ajoute pendant qu'il est connecte garde les groupes de sa session en cours : il
doit fermer et rouvrir sa session pour que l'appartenance prenne effet.
`id -nG` affiche ce que la session voit reellement, `id -nG <utilisateur>`
affiche ce que la base des comptes declare : quand les deux listes different,
c'est la reouverture de session qui manque.

## 5. Le umask cote serveur

L'installateur abaisse son umask a `0o002` pendant son execution. La portee de
ce reglage est le processus et ses enfants, pour cette execution seulement.

Ce que les utilisateurs creeront **plus tard** dans le projet retombe sous le
umask du systeme, qui vaut 022 sur la majorite des distributions. Un fichier
cree ensuite ressort en 644 : il porte le bon groupe grace au setgid, et le
groupe partage n'a pas le droit d'ecriture dessus. Le travail collectif casse
au premier fichier ajoute apres l'installation.

Le reglage durable est a poser par l'administrateur, sur le serveur, hors de
l'installateur :

```bash
# Option 1 — un fichier de profil, lu par les sessions interactives
echo 'umask 002' | sudo tee /etc/profile.d/byan-umask.sh
sudo chmod 644 /etc/profile.d/byan-umask.sh

# Option 2 — pam_umask, applique a toutes les sessions (interactives ou non)
# dans /etc/login.defs :   UMASK 002
# ou dans /etc/pam.d/common-session :
#   session optional pam_umask.so umask=002
```

Une precaution avant de le poser : `umask 002` n'a de sens que sur un systeme
en groupes prives par utilisateur, ou le groupe primaire de chacun ne contient
que lui. Si le groupe primaire par defaut est un groupe collectif du type
`users`, un umask 002 general ouvre l'ecriture de tous les fichiers personnels
a tout le monde. `id -gn` donne le groupe primaire du compte courant.

C'est une decision d'administrateur, avec ses consequences hors de BYAN.
L'installateur ne l'impose pas et ne modifie pas ces fichiers.

## 6. Les sorties de secours

Trois options en ligne de commande, et une regle qui protege l'existant.

| Option | Effet | Quand s'en servir |
|--------|-------|-------------------|
| `--no-chown` | Aucune reprise des droits. L'arborescence garde l'identite du processus qui l'a ecrite. | Image de conteneur ou d'integration continue ou l'identite finale est posee ailleurs (par `COPY --chown`, par le runtime, par un montage). |
| `--owner=<utilisateur>` | Force l'utilisateur cible et court-circuite les six echelons de la section 2. Accepte un nom ou un identifiant numerique. | Deploiement pour un compte de service qui n'est ni l'appelant ni le proprietaire du dossier de travail. |
| `--group=<nom>` | Nomme le groupe partage a poser (identifiant du groupe et bit setgid). | Serveur partage ou le groupe ne s'appelle pas `byan`. La valeur est retenue pour les reinstallations suivantes : l'etape de configuration fusionne `config.yaml` au lieu de le reecrire en entier. |

**La regle qui protege l'existant.** Un dossier cible deja possede par root,
sous un dossier parent lui aussi possede par root, est laisse tranquille. Ce
motif designe une installation deliberee dans `/opt`, dans `/usr/local`, ou dans
une image d'integration continue : la reprise des droits n'y corrige pas une
erreur, elle casserait un montage qui fonctionne. Le rapport final l'annonce
comme un choix explicite, avec l'issue `non-applicable`.

## 6bis. L'URL de l'API byan_web

Une seule source la donne : `install/lib/api-defaults.js`. Elle valait
auparavant `http://localhost:3737` a trois endroits distincts, ce qui posait
sur chaque projet une configuration pointant vers la machine de l'utilisateur,
ou byan_web n'ecoute pas. Le serveur MCP demarrait alors sans joindre l'API.

**L'ordre de resolution**, du plus fort au plus faible :

| Rang | Source | Geste correspondant |
|------|--------|---------------------|
| 1 | `--api-url <url>`, ou la reponse donnee sous `--ask` | L'intention exprimee maintenant. |
| 2 | `BYAN_API_URL` dans l'environnement | Le geste d'un administrateur ou d'une chaine d'integration continue. |
| 3 | La valeur retenue dans `~/.byan/credentials.json` | Une installation precedente l'a memorisee ; la relire evite de re-saisir a chaque projet. |
| 4 | Le host de production | `https://byan-api.stark.a3n.fr`. |

Un suffixe `/api` en fin d'URL est retire a chaque echelon : les endpoints le
portent deja, et une base qui le contient produit `/api/api/projects`.

**Le bon host, mesure le 2026-08-11.** Deux noms coexistent et un seul est
l'API :

```
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://byan-api.stark.a3n.fr/api/health
  -> 200 application/json          ({"status":"ok","version":"1.0.0"})

curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://byan.stark.a3n.fr/api/health
  -> 302 text/html                 (redirection vers auth.acadenice.com)
```

`byan.stark.a3n.fr` est l'interface web, derriere son authentification. La
prendre pour l'API donne une reponse qui ressemble a une reponse — une page de
connexion en HTML la ou le client attend du JSON. C'est la meme panne que celle
rencontree cote Leantime, et la raison pour laquelle le client y rejette un
corps non-JSON au lieu de le lire comme un resultat vide.

**Les deux modes du terminal.**

| Option | Effet |
|--------|-------|
| aucune | Parcours automatique, zero question. L'URL vient de l'echelle ci-dessus. |
| `--ask` | Ouvre les questions : URL de l'API puis token, via le demandeur existant. Ce qui est saisi est ecrit dans `.env`, `.mcp.json` et `~/.byan/credentials.json`, et sert a l'installation en cours. |
| `--api-url <url>` | Pose l'URL sans poser de question. Se combine avec le parcours automatique. |

## 7. Les limites connues

**`chown` n'a pas d'effet sur certains systemes de fichiers.** exFAT et NTFS ne
portent pas de propriete POSIX. `/mnt/c` sous WSL n'en porte pas non plus tant
que l'option de montage `metadata` n'est pas activee. Beaucoup de montages
reseau sont dans le meme cas : CIFS/SMB impose l'identite du montage, NFS avec
ecrasement de root reecrit l'identite cote serveur. Dans ces cas, l'appel
aboutit sans changer quoi que ce soit, ou echoue avec `EPERM` alors que le
processus est en root. L'issue rendue est `non-applicable`, distincte d'un
echec : il n'y a rien a reparer, le systeme de fichiers ne sait pas stocker
l'information demandee.

**Windows sous elevation.** Un processus eleve cree des fichiers appartenant a
`BUILTIN\Administrators`, pas au compte qui a demande l'elevation. `fs.chown`
ne corrige pas ce point : sur `win32` l'appel n'a pas d'effet utile. La
correction passe par `icacls` (section 3), et la propriete elle-meme par
`takeown /F <chemin> /R` execute par le compte cible.

**macOS non mesure.** Le comportement decrit dans ce document pour macOS —
heritage BSD du groupe depuis le dossier parent sans setgid, resolution de
groupe par `dscl`, ajout par `dseditgroup` — vient de sources techniques
concordantes. Il n'a pas ete mesure sur une machine Apple au 2026-08-11. Un
releve sur materiel Apple reste a faire.

**Le setgid ne regarde pas en arriere.** Le bit conditionne le groupe des
fichiers crees apres sa pose. Ce qui existait avant garde son groupe d'origine,
d'ou le parcours recursif de reprise plutot que la seule pose du bit.

**Un sous-processus echappe a la reprise deja passee.** `npm install` dans le
dossier du serveur MCP, `git config`, l'installation de `rtk` qui delegue a
brew, curl ou cargo, le `npx` des extensions MCP : chacun ecrit sous l'identite
du processus qui l'a lance. Une reprise des droits placee avant eux laisse leur
production en `root:root`. C'est pourquoi la passe est branchee a la fin de
`runInstall`, apres le dernier sous-processus, et pas au niveau des ecritures
`fs` qui ne voient pas un sous-processus.

## 7bis. Les quatre abstentions, et pourquoi elles valent mieux qu'un demi-geste

Une revue adversariale du 2026-08-12 a produit vingt constats reproduits. Quatre
d'entre eux ont donne un refus explicite plutot qu'un comportement de repli. Le
principe commun : quand l'installateur ne peut pas faire la chose juste, il
s'abstient ET le dit, au lieu de faire une chose approchante en silence.

**Le home de la cible n'est pas resolu.** Sous `pkexec` ou `su`, avec un compte
qui vient d'un annuaire (LDAP, SSSD) plutot que de `/etc/passwd`, la resolution
rend un uid sans home. Le repli naturel — `os.homedir()` — designe alors `/root`
sous elevation. Les quatre etapes qui ecrivent hors du projet (`codex`,
`credentials`, `google-purge`, `skills-sync`) sont **ecartees**, avec cette
raison dans le rapport. Un jeton d'API pose dans le home de root n'est pas un
demi-succes : c'est un fichier au mauvais endroit, que la reprise des droits ne
rattrape pas puisqu'elle passe apres. Contournement : passer `--owner <compte>`
si le compte est connu du systeme, ou installer sans elevation.

**Le dossier d'installation est un lien symbolique.** `--dir /srv/byan` ou
`/srv/byan` pointe vers `/mnt/data/byan` : les etapes d'ecriture suivent le lien,
mais `lstat` d'un lien rend `isDirectory()` faux — le parcours de reprise ne
demarrait pas et rendait `ok` apres avoir corrige une seule entree. Pire pour le
groupe partage : `chmod` suit le lien tandis que `lstat` rend le mode DU LIEN
(`0777`), donc le vrai dossier ressortait en `2777` (`drwxrwsrwx`), ouvert en
ecriture a tous. L'installateur resout desormais le chemin une fois a l'entree ;
et les deux fonctions de `ownership.js` refusent une racine symbolique avec la
raison `racine-symbolique` plutot que de la traiter a moitie.

**La cible resolue est root.** Cette reprise existe pour SORTIR une arborescence
de root. La rendre A root est le geste inverse — et il se declenchait avec
`SUDO_UID=0` dans l'environnement. Toute cible a l'uid 0 fait desormais refuser
la reprise, avec sa raison.

**La descente de privilege serait incomplete.** L'installation de `rtk` delegue a
`cargo`, qui ecrit dans le home. Le sous-processus doit donc tourner sous
l'identite de la cible, uid ET gid. Node ignore silencieusement un `gid` nul :
le processus tournait alors sous le bon uid mais gardait le GROUPE root. Quand
le gid est inconnu, l'etape refuse et le dit, au lieu de tourner a moitie
depouillee. L'environnement transmis est en plus nettoye de `SUDO_*`, `DOAS_*` et
`PKEXEC_*`, et recoit un PATH derive du home cible.

**Et un cinquieme, cote fin de course.** Sous elevation, le terminal ne lance
plus Claude Code : il imprime la commande et nomme l'utilisateur a reprendre. Le
lancer ici le ferait tourner en root, et tout ce qu'il ecrirait ensuite dans le
projet reviendrait a root — defaisant la reprise acquise deux etapes plus tot.

**`EPERM` porte deux causes, et le rapport les separe.** Le meme code d'erreur
signale un montage qui ne connait pas la propriete POSIX, et un processus qui
n'a pas le droit de donner un fichier. La distinction se lit sur l'uid effectif :
un compte ordinaire visant un autre uid obtient `echoue / privilege-insuffisant` ;
un processus root qui se fait quand meme refuser obtient `non-applicable`.
Avant, un `chown` vers l'uid 0 depuis un compte ordinaire, sur un `tmpfs`
parfaitement POSIX, rapportait « montage sans proprietaire POSIX ».

**Ce que porte le verdict global.** `ok` est fonde sur l'absence d'echec parmi
les etapes prevues. Trois etapes restent tolerantes parce qu'elles n'alterent pas
ce qui est livre : `rtk` (outil d'appoint), `google-purge` et `skills-sync` (hors
projet). Une reprise de droits en echec, elle, fait basculer le verdict.

## 8. Tableau de diagnostic

| Symptome observe | Cause | Geste |
|------------------|-------|-------|
| `_byan/` et son contenu en `root:root`, l'utilisateur ne peut plus editer ses agents | Installation lancee sous elevation, sans reprise des droits (version anterieure a ce chantier, ou `--no-chown` pose) | Relancer l'installation, ou corriger a la main : `sudo chown -R <utilisateur>:<groupe> _byan .claude` puis `sudo chmod -R g+w _byan` |
| Claude Code present sur la machine, mais l'etape Claude est sautee sous elevation | `os.homedir()` rend `/root` : ni `~/.claude` ni le PATH de l'utilisateur ne sont vus. Le binaire vit souvent dans `~/.local/bin`, absent du PATH de root | Verifier `echo $SUDO_USER` et `getent passwd <nom>` pour le home attendu ; la resolution de la section 2 doit rendre ce home. Contournement immediat : lancer l'installation sans elevation |
| Le groupe est correct mais les fichiers ressortent en 644, le groupe ne peut pas ecrire | Le setgid est pose, l'umask du systeme vaut 022 et retire l'ecriture au groupe. Le setgid porte l'appartenance, pas la permission | `chmod -R g+w` sur l'existant, puis poser le umask 002 durable de la section 5 pour ce qui sera cree ensuite |
| Filet pre-commit non cable, `.git/config` sans `core.hooksPath`, aucune erreur affichee | Elevation par `doas`, `su` ou session root : git refuse le depot en `dubious ownership` et son exception ne couvre que sudo | Rejouer la commande sous l'identite du proprietaire : `git -C <projet> config core.hooksPath .githooks`. En dernier recours pour le compte qui doit operer : `git config --global --add safe.directory <projet>` |
| Rapport de reussite alors qu'une etape a ete sautee | Le verdict est calcule sur les etapes executees : une etape absente du plan est absente du denominateur | Lire la liste des etapes du rapport et non le seul verdict global. Le plan porte l'ensemble des etapes prevues avec un statut chacune : faite, sautee avec sa raison, en echec |
| `chown` rendu sans erreur, la propriete ne change pas | Systeme de fichiers sans propriete POSIX : exFAT, NTFS, `/mnt/c` sous WSL sans `metadata`, montage CIFS ou NFS | Issue `non-applicable`, il n'y a rien a reparer. Pour un projet a plusieurs mains, le poser sur un systeme de fichiers POSIX, ou monter `/mnt/c` avec `metadata` dans `/etc/wsl.conf` |
| Sous Windows, les fichiers appartiennent a `BUILTIN\Administrators` | Le terminal a ete ouvert en administrateur : c'est le groupe des administrateurs qui devient proprietaire, pas le compte appelant | `takeown /F <chemin> /R` sous le compte cible, puis `icacls "<chemin>" /grant "<compte>:(OI)(CI)(M)" /T` |
| Les etapes Codex, credentials et skills-sync sont sautees avec « home de l'utilisateur cible non resolu » | Elevation par `pkexec` ou `su` avec un compte qui n'est pas dans `/etc/passwd` (annuaire LDAP ou SSSD) : l'uid est connu, le home non | Passer `--owner <compte>` si le compte est resolvable, ou relancer sans elevation. Les ecritures hors projet sont volontairement ecartees plutot que redirigees vers `/root` |
| Reprise refusee avec « racine symbolique » | Le dossier d'installation est un lien symbolique | Passer le chemin reel : `create-byan-agent --cli --dir "$(readlink -f /srv/byan)"` |
| Reprise refusee avec « la cible resolue est root » | `SUDO_UID=0` dans l'environnement, ou `--owner root` | Cette reprise sert a sortir une arborescence de root. Pour une installation deliberee en root, utiliser `--no-chown` |
| Reprise en echec avec « privilege-insuffisant » | Le processus n'est pas root et vise un autre utilisateur que lui-meme | Relancer avec l'elevation, ou viser son propre compte. Ce n'est pas un probleme de systeme de fichiers |
| L'etape rtk refuse avec « descente de privilege impossible » | Le gid de la cible est inconnu : le sous-processus tournerait sous le bon utilisateur mais avec le groupe root | Verifier `getent passwd <compte>`. rtk s'installe ensuite a la main sous le compte cible |
| Sous elevation, Claude Code n'est pas lance en fin d'installation | Comportement voulu : le lancer en root ferait revenir a root tout ce qu'il ecrirait ensuite | Reprendre la main sous le compte cible, puis lancer la commande affichee |

## 9. Voir aussi

- `install/lib/target-user.js` — la chaine de resolution de la section 2.
- `install/lib/resolve-binary.js` — le parcours du PATH et les emplacements
  connus, avec le home de l'utilisateur cible injecte.
- `install/lib/ownership.js` — `ensureOwnership` et `ensureSharedGroup`, les
  deux branches de la section 3.
- `install/lib/install-engine.js` — l'ordonnancement de la passe de reprise et
  le calcul du verdict final.
- `.claude/rules/strict-mode.md` — le filet pre-commit que `core.hooksPath`
  cable, et ce qu'on perd quand la commande git echoue en silence.
