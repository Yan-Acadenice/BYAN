# Chantier — BYAN pilote Claude (souverainete de l'identite)

> Statut : PLANIFIE (prochain FD). Slug propose : `byan-sovereignty`.
> Origine : 2026-07-17. Constat de l'utilisateur : "Claude prend le dessus sur
> BYAN et ses concepts (mantra, tao, soul). Ces concepts doivent etre natifs a
> Claude, Claude doit pas prendre le dessus." Confirme par l'incident de session
> (la voie Codex armee ignoree, Claude a code lui-meme avec une excuse).
> Ce plan est adosse a un audit du terrain reel (7 agents, relecture adverse) —
> pas a de la memoire.

## Le constat (audit, verifie)

Sur tout le perimetre, presque tout ce qui fait BYAN entre en session comme du
TEXTE injecte que Claude lit (soul, tao, voix, mantras, delegation, dispatch,
chaine d'entree). Le reflexe par defaut de Claude peut le doubler sans aucune
consequence mecanique. Les seules regles qui ont deja des DENTS (un controle qui
AGIT) :

- **zero emoji** (IA-23) et **absolus non sources dans les docs** — `fact-check-absolutes.js` (PreToolUse deny).
- **anti-downgrade / scope strict** — `strict-*` hooks + `.githooks/pre-commit`.
- **derive de fichier soul/tao** et **anti-stub mantras** — au COMMIT seulement, sur les FICHIERS generes, pas sur le comportement de Claude en conversation.

Tout le reste est prose-only. C'est la racine du probleme.

## Le principe

Chaque regle importante de BYAN doit avoir TROIS couches, pas une :
1. **la doctrine** (le texte que Claude lit : soul/tao/CLAUDE.md/skill/rules) ;
2. **une dent** (un controle qui AGIT reellement) ;
3. **un filet reactif** (un drapeau non bloquant relaye au tour suivant).

Sans la dent, la regle est prose-only : Claude la double avec une excuse polie.
La souverainete de BYAN = pour chaque concept qui compte, ajouter la dent
manquante.

## Les quatre types de dents (ancres sur ce qui marche deja dans le repo)

| Dent | Ce qu'elle fait | Mecanisme reel | Plafond |
|------|-----------------|----------------|---------|
| DENT-1 | Mur AVANT l'action : refuse un appel d'outil | PreToolUse `deny` (comme `strict-scope-guard`, `fact-check-absolutes`) | n'agit que sur les outils nommes (Write/Edit) ; fuite Bash (heredoc / `cat >`) |
| DENT-2 | Mur en FIN de tour : force une regeneration | Stop `block` exit 2 (comme `strict-stop-guard`, `fd-response-check`) | POST-HOC : l'utilisateur a deja lu le texte ; corrige au tour d'apres |
| DENT-3 | Drapeau non bloquant, relaye au tour suivant | Stop exit 0 + sidecar (comme `agent-gate-check`, `plain-language-check`) | ne corrige pas le tour courant ; signale seulement |
| DENT-4 | Mur hors-tour, au commit | `.githooks/pre-commit` exit 1 | bypass `--no-verify` ; agit au commit, pas en direct |

Regle de correspondance :
- concept qui se manifeste par un **appel d'outil** (ecrire du code au lieu de deleguer) -> DENT-1.
- concept qui se manifeste par le **contenu du tour** (revendiquer une completion) -> DENT-2.
- concept purement **comportemental** (respecter le registre tao, challenger) -> DENT-3 seulement (plafond assume).
- concept qui touche un **fichier livre** -> DENT-4.

## Le plafond honnete (prouve, pas juste affirme)

Claude Code n'expose aucun controle avant l'affichage d'une reponse (GH #28273).
Preuve dure : au moment ou un hook Stop tourne, le texte de l'assistant est deja
finalise (dans `last_assistant_message` / le journal sur disque). Il n'existe
aucun payload lisible AVANT la production du texte.

Consequence : on ne reentraine pas Claude, BYAN reste une COUCHE par-dessus.
BYAN peut : faire echouer un appel d'outil, forcer une regeneration en fin de
tour, signaler au tour d'apres, bloquer un commit. BYAN ne peut PAS forcer Claude
a penser autrement. Tout ce qui est purement textuel/comportemental (registre
tao, mantras de jugement IA-16/#37/#39) a pour maximum honnete : doctrine + filet
reactif + audit LLM sur demande (`byan-mantra-audit`). Pretendre plus serait un
claim non source que le fact-check de BYAN bloquerait lui-meme.

## Les work items

| # | Titre | Concept | Etat actuel | Dent proposee | Prio |
|---|-------|---------|-------------|---------------|------|
| WI-1 | Donner une dent a la delegation Codex armee | Delegation Codex | prose-only (racine de l'incident) | DENT-1 : `codex-delegate-guard.js` (PreToolUse) refuse-une-fois le premier Write/Edit si voie armee + tache delegable + aucune trace de `codex exec` ce tour ; escape `.byan-codex-autodelegate/off` + marque `// BYAN-DELEGATE: reviewed` | P1 |
| WI-2 | Filet de conformite de voix (soul/tao) | Adherence voix/registre | prose-only | DENT-3 : `voice-conformance-check.js` (Stop, non bloquant) sur signaux objectifs (vouvoiement la ou tutoiement impose, emoji, anglais gratuit liste) -> `.voice-slip.json` relaye | P2 |
| WI-3 | Filet dispatch runtime | Moteur/modele/effort | prose-only (moteur) | DENT-3 : etendre `agent-gate` pour poser un drapeau quand un tour ecrit du code sans avoir consulte `byan_dispatch`, hors FD | P3 |
| WI-4 | Filet chaine d'entree + visuel | Comprendre/party-mode/visuel | prose-only (auto-avoue) | DENT-3 : renforcer `agent-gate-check` — slip = fichiers ecrits && pas de proposition d'agent && pas de `TaskCreate` && pas de FD actif | P2 |
| WI-5 | Mantras comportementaux : assumer le plafond | IA-16/#37/#39/IA-24/YAGNI | prose-only | Surtout pas de fausse dent : elargir `fact-check-absolutes` + filet IA-16 tres cible ; le reste = doctrine + `byan-mantra-audit` (juge LLM, hors commit) | P3 |
| WI-6 | Boucher la fuite Bash du scope-guard strict | Strict scope guard | dent existante mais fuite | DENT-1 durcie : `strict-scope-guard` detecte aussi les redirections Bash (`>`, `>>`, `tee`, heredoc) vers un chemin hors scope | P2 |
| WI-7 | Armer les dents deja construites mais desarmees | Auto-Benchmark + Punt guard | code livre, DESARME | Aucune nouvelle dent : DECISION d'armement APRES lecture du registre (mesurer les faux positifs avant d'armer) | P3 |

Chaque WI : coeur pur dans `lib/` + test jest, cablage `.claude/settings.json`,
verification du shipping npm (`install/templates`), et pour toute dent armee :
refuse-une-fois + escape-hatch d'abord, pas un mur sec livre a l'aveugle.

## Les risques (nommes)

1. **Faux positif d'un blocage dur** (le n1, deja rejete par l'utilisateur) : chaque dent DENT-1/DENT-2 qui se declenche a tort coute une regeneration. Contre-mesure : refuse-une-fois par defaut (resoumission identique passe), escape-hatch fichier, marque de contenu, observation du registre avant d'armer. Pas de dent armee a l'aveugle.
2. **Fuite Bash** (WI-1, WI-6) : le deny ne couvre que Write/Edit ; une ecriture via Bash echappe. On attrape les redirections courantes, pas de maniere hermetique. Ne pas vendre une fausse garantie.
3. **Sur-instrumentation** : trop de drapeaux noient le rappel du tour suivant. Un seul canal consolide (`inject-voice-anchor`), drapeau seulement sur signal fort.
4. **Plafonisme mal compris** (WI-5) : une dent regex sur un mantra semantique = faux positifs constants. Assumer le plafond, dent seulement sur signaux objectifs.
5. **Cout de maintenance** : chaque hook = code teste + cablage + shipping. Un hook mal cable = no-op silencieux.
6. **Dependance a l'etat sur disque** : les gardes doivent lire `isEngaged` correctement (active && !completed) et degrader en no-op sans planter.

## L'ordre propose

1. **WI-1** (P1) d'abord — racine prouvee de l'incident, voie deja armee, `codex-bridge.js` existe, patron refuse-une-fois copie de `tier-script-guard`. Refuse-une-fois + escape, pas un mur sec.
2. **WI-6** (P2) juste apres — meme famille PreToolUse, mutualise le parsing des redirections Bash avec WI-1.
3. **WI-4 puis WI-2** (P2) — filets reactifs, faible risque, etendent des libs deja testees.
4. **WI-7** (P3) — decision d'armement APRES observation des registres.
5. **WI-3 puis WI-5** (P3) en dernier — les plus incertains, la ou le plafond mord le plus.

## References

- Audit source : workflow `byan-sovereignty-audit` (2026-07-17).
- Mecanismes existants : `.claude/hooks/` (strict-*, agent-gate-check, plain-language-check, fact-check-absolutes, tier-script-guard, inject-voice-anchor), `.githooks/pre-commit`, `.claude/settings.json`.
- Plafond : `.claude/rules/portable-core.md`, `.claude/rules/benchmark.md` (honest ceiling GH #28273).
- Vraie machinerie Codex : `_byan/mcp/byan-mcp-server/lib/codex-bridge.js`.
