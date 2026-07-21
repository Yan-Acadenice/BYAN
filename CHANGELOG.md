# Changelog - BYAN (create-byan-agent)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [2.54.0] - 2026-07-21

### Added — Garde de fraicheur des skills (SessionStart)
- Nouveau hook `skill-freshness-check.js` (coeur pur `lib/skill-freshness.js`) :
  au demarrage de session, compare chaque `.claude/skills/<n>/SKILL.md` du
  projet avec la copie globale homonyme `~/.claude/skills/<n>/SKILL.md`, par
  CONTENU (l'egalite d'octets dit "fidele" ; une date recente ne dit rien).
  En cas de divergence, injecte un signalement borne (6 noms max) avec la
  commande de synchro exacte. Silencieux quand tout est fidele, quand la copie
  globale n'existe pas, ou quand le projet n'a pas de skills ; sort en 0 dans
  tous les chemins (ne bloque pas une session).
- Ferme le piege constate le 2026-07-21 : une copie globale du 30 juin masquait
  le skill projet — le rail auto-dispatch livre en 2.53.0 ne se declenchait pas
  car `/byan-byan` chargeait la copie perimee. Point verifie aupres de la doc
  officielle Claude Code : la regle de priorite skills user vs projet en cas de
  collision de nom n'y est pas clairement documentee (le hook signale donc le
  FAIT de la divergence, sans affirmer une regle de chargement).
- Aucune ecriture automatique dans `~/.claude/skills` : une variante user-level
  peut etre deliberee — le hook signale, l'humain tranche.
- Cablage : enregistre sous SessionStart dans `.claude/settings.json` (repo +
  template) ; les deux fichiers shippent via le miroir `template-sync.js`.

## [2.53.0] - 2026-07-21

### Added — Rail automatique : workflow natif byan-auto-dispatch (F2)
- Nouveau workflow Claude natif `.claude/workflows/byan-auto-dispatch.js` : il
  decoupe une tache en etapes typees (nature + complexite 0-100) via un agent
  d'analyse (sonnet, schema JSON force), route chaque etape sur le bon modele
  par l'echelle v3 (haiku < 34, sonnet < 67, opus < 90, fable >= 90), route les
  etapes shell/deploiement/navigation vers Codex (repli Claude annonce si Codex
  n'est pas disponible ; la verification reste sur le modele de session, non
  deleguee), ecrit `_byan-output/plan.md` (table etape x nature x complexite x
  moteur x modele + consignes), execute chaque etape en sequence sur le modele
  route, et verifie le livrable en fin.
- Cablage skill `byan-byan` (section 0.5) : a CHAQUE tache non-conversationnelle
  recue par `/byan-byan`, ce workflow est invoque AUTOMATIQUEMENT (scriptPath +
  args {task, stamp}), sans demande a l'utilisateur. Exceptions nommees :
  question simple, action destructive (confirmation d'abord), FD multi-feature
  deja engage (sa phase DISPATCH peut invoquer le meme workflow par feature),
  demande explicite d'execution directe. Le gate utilisateur reste en fin, sur
  le livrable.
- Livraison npm : le script est ajoute au miroir `template-sync.js`.

### Changed — Langage precis, zero dialecte interne (F1, Mantra IA-26)
- Le filet plain-language s'etend : `nudge`, `up-tier`, `ladder`, `rung`,
  `runtime` rejoignent les mots a remplacer en prose ; nouvelle detection de
  l'anthropomorphisme d'outil (un MCP/serveur/hook dit "vivant" ou "mort") avec
  le remplacement exige : le fait observe, outil nomme ("byan_ping a repondu en
  0.3s", "le serveur ne repond pas, timeout 8s").
- Nouvelle clause de precision factuelle dans `.claude/rules/plain-language.md` :
  tout etat d'outil = l'outil nomme + l'appel + le resultat exact ; pas de
  resume flou ("ca marche") ; "non verifie" quand l'appel n'a pas ete fait.
- L'ancre de voix par tour et le tao (Section 4, Vocabulaire Interdit) portent
  les deux nouveaux interdits. Tests jest etendus (26 verts sur la suite
  plain-language).

## [2.52.0] - 2026-07-20

### Changed — Delegation Codex v3 : pression-only + obeissance au routeur (F1, F2)
- **F1 — la delegation ne se declenche plus que sous PRESSION budget.** La nature
  d'une tache (code / mecanique) n'est plus un declencheur d'auto-delegation a elle
  seule. Deleguer au Codex de l'abonnement (qui reste en dessous de Claude en
  qualite) vaut le coup pour epargner le budget Claude, pas par tache de code. Hors
  pression, le code tourne sur Claude sans rappel. Le seuil par defaut passe a 75 %
  (`autodelegate-decision.js` + `codex-delegate-guard.js` alignes sur un seul
  nombre). Sans jauge `budget`, la pression n'est pas calculee et rien n'est
  propose (documente, non bloquant).
- **F2 — le garde `codex-delegate-guard` obeit au routeur.** Le blocage ne mord
  que pour une tache que le `dispatch-router` route lui-meme vers Codex (nature
  execution / shell / deploiement / devops / navigateur). Une tache
  architecture / refactor / qualite / planif — et toute verification — route vers
  Claude, donc le garde reste silencieux. Le garde recalcule router + pression
  uniquement dans la branche ou un blocage est encore possible (les chemins
  d'autorisation courants ne paient rien) ; les deux signaux echouent en mode
  ouvert (signal irresolu -> on autorise, sans blocage a tort).

### Changed — Echelle de modele par complexite + Fable dernier recours (F3)
- **Cote routeur (`dispatch-router.claudeModelForComplexity`)** : echelle a quatre
  rungs — `haiku` (bas) -> `sonnet` (moyen) -> `opus` (haut) -> `fable` (extreme,
  dernier recours, ~2x le prix d'Opus). C'est une RECOMMANDATION par tache, pas un
  changement du modele de session en cours (Claude Code n'expose pas ce levier).
- **Cote leaves de workflow (`native-tiers` + linter)** : un up-tier explicite
  (`opus` / `fable`) devient un choix d'auteur AUTORISE sur n'importe quel leaf,
  miroir de l'echelle du routeur. Le plancher anti-downgrade est conserve (haiku /
  sonnet interdits sur un leaf protege) ; seul le plafond est ouvert (le pin-up
  n'est plus une violation). Nouveaux : `UP_TIER_MODELS`, `isUpTierModel`.
- **Revirement d'invariant assume** : l'ancienne ligne rouge "pas de Fable /
  pas de pin-up" est levee cote Claude. Cote Codex elle tient (Codex ne peut pas
  lancer un modele Claude) : `assertNoFable` garde le chemin Codex + `codex-bridge`.
- Doctrine alignee : `native-workflows.md`, `native-workflows-contract.md`,
  `intelligent-dispatch.md`, `codex-auto-delegation.md`, skill `byan-byan`.

## [2.51.0] - 2026-07-20

### Changed — Delegation Codex : fermeture de l'auto-esquive (option B)
- Le blocage `codex-delegate-guard` ne peut plus etre contourne par BYAN lui-meme.
  Retire : la marque de contenu auto-ecrite (`// BYAN-DELEGATE: reviewed`) et
  l'auto-passe par re-soumission/fenetre de grace — les deux permettaient a Claude
  de s'auto-accorder la sortie. Les seules sorties valides sont desormais : une
  delegation Codex reelle ce tour, Codex indisponible (detecte via `codex --version`),
  ou un opt-out HUMAIN ("reste sur claude" / "sans codex" dans la demande, ou le
  fichier `.byan-codex-autodelegate/off`). Le motif "script court / latence / je
  verifie" n'est plus une raison valide. Coeur pur `lib/codex-delegate-gate.js`
  (`humanOptOutFromText`, `decideDelegateGate` durci) + `codex-delegate-guard.js`
  (probe Codex, opt-out depuis la demande). Le rendu injecte (`autodelegate-decision`
  renderNudge), le skill `byan-byan` et `docs/codex-auto-delegation.md` sont alignes.

### Notes
- Constat de session : le CLI Codex de l'abo ChatGPT est plafonne a gpt-5.5 (5.6
  refuse). Recherche croisee : gpt-5.5 est sous le meilleur Claude sur tous les
  domaines mesures. Donc la delegation Codex vaut pour economiser le budget Claude,
  pas pour la qualite. Prochain chantier (FD dedie) : delegation declenchee par la
  PRESSION budget (~75%) au lieu de par-nature ; le blocage obeit au routeur ;
  echelle modele Claude par complexite (haiku/sonnet/opus) + Fable en dernier recours.

## [2.50.0] - 2026-07-17

### Added — BYAN souverainete (les concepts BYAN pilotent Claude, ne se font plus doubler)
- **WI-1 dent delegation Codex** : hook PreToolUse `codex-delegate-guard.js` (+ coeur pur `lib/codex-delegate-gate.js`) qui refuse-une-fois le premier Write/Edit de code delegable quand la voie Codex est armee (option + Codex linke) et qu'aucune delegation n'a eu lieu ce tour. Speed-bump, pas un mur : escape `.byan-codex-autodelegate/off`, marque `// BYAN-DELEGATE: reviewed`, fenetre de grace. Corrige la racine de l'incident (Claude codait lui-meme malgre la directive).
- **WI-2 filet de conformite de voix** : hook Stop `voice-conformance-check.js` (+ `lib/voice-conformance.js`) qui repere les signaux objectifs de derive (emoji, vouvoiement en grappe) et pose un drapeau relaye au tour suivant. Non bloquant (le registre reste semantique).
- **WI-3 filet dispatch runtime** : drapeau quand un tour ecrit du code sans avoir consulte `byan_dispatch`, hors FD.
- **WI-4 garde de porte d'entree renforce** : le signal visuel party-mode (`TaskCreate`/`TaskUpdate`) tient desormais la posture d'entree — plus de faux drapeau sur un tour party-mode.
- **WI-7 rapport d'armement** : `bin/byan-armament-report.js` (+ `lib/armament-report.js`) lit les registres autobench/punt/completeness et reporte le taux de declenchement (indicateur de risque de faux positif) avant toute decision d'armement. Verdict mesure : les 3 gardes restent DESARMEES (punt 42%, autobench 1%, completeness echantillon trop petit).

### Changed
- **WI-6 fuite Bash du strict-scope-guard** : `decideScope` couvre desormais les redirections d'ecriture Bash (`>`, `>>`, `tee`, heredoc) hors `allowedPaths`. Parseur resserre (cible en forme de chemin uniquement) pour eviter les faux positifs sur les operateurs de comparaison/arithmetique et les variables non resolues.
- **WI-5 fact-check-absolutes elargi** : plus d'absolus/superlatifs/best-practice/certitudes couverts (alignes sur `.claude/rules/fact-check.md`) ; `optimal` ecarte (trop courant) et strip d'exemples resserre a une puce (une phrase de prose commencant par un absolu reste policee). Le plafond des mantras semantiques (IA-16, #37...) est assume : doctrine + `byan-mantra-audit`, pas de fausse dent regex.

### Docs
- `docs/byan-sovereignty-chantier.md` : le chantier complet (constat, patron des 4 dents, plafond honnete, work items, risques) adosse a l'audit `byan-sovereignty-audit`.

### Tests
- +9 tests MCP (armament report + parite shipping anti-derive) ; +47 tests jest (dents + filets + fact-check + strict-scope Bash). jest 2699/0, MCP 855/0.

## [2.49.0] - 2026-07-16

### Added
- Chaine d'entree BYAN v2 dans le skill `byan-byan` (section 0) : comprendre la
  demande -> point de controle de plan uniquement sur doute -> dispatch Hermes
  automatique (agent + modele + effort) -> execution party-mode avec visuel live
  -> point de controle utilisateur en fin. L'humain reste requis seulement pour
  creer un nouvel agent, confirmer un destructif, ou trancher un plan en cas de
  doute.
- Visuel party-mode cable sur la liste de taches native (une entree par
  agent/etape, `TaskCreate` / `TaskUpdate` en direct) plus la table de dispatch
  affichee en tete de la phase BUILD.
- Garde "les deux moteurs" (`codexLinked()`) dans `codex-autodelegate.js` : la
  voie Codex ne s'arme que si l'option yanstaller est activee ET Codex est linke
  (`~/.codex/auth.json` ou `CODEX_API_KEY`) ; option seule = pas de delegation.

### Changed
- La delegation Codex sur voie armee passe de "conseil advisory" a "directive" :
  quand la voie est armee (option + les deux moteurs), le rendu injecte demande
  de deleguer le delegable via `codex-bridge` (repli Claude si Codex
  indisponible), au lieu de laisser BYAN executer sur Claude par defaut.
- Doctrine synchronisee (`.claude/rules/agent-entry-gate.md`, `.claude/CLAUDE.md`)
  a la chaine d'entree v2 ; la double validation est calibree (doute / nouvel
  agent / destructif) au lieu d'un reflexe a chaque tache.

### Docs
- `docs/codex-auto-delegation.md` : garde "les deux moteurs", directive-quand-arme,
  plafond honnete.
- `docs/per-platform-projection-opti.md` : chantier suivant planifie (coeur unique
  + deux projections optimisees par plateforme Claude/Codex, sans source rivale).

## [2.48.0] - 2026-07-16

### Added - The whole dispatch chain now runs automatically at the entry

- On every non-conversational task, BYAN runs the full chain of its own accord —
  the user no longer has to ask for it: (1) match the agent (agent-matcher),
  (2) route the runtime with dispatch-router (Codex for execution/shell/deploy/
  devops/browser ; Claude for architecture/refactor/quality/planning ; verification
  stays Claude ; no Fable ; model+effort by complexity), (3) execute — Codex-lane
  delegates to Codex via codex-bridge (`codex exec` -> diff -> Claude applies, with
  a Claude fallback when Codex is unavailable) ; Claude-lane runs on Claude at the
  chosen model.
- Reconciled with the double-validation rule: the human stays required only for
  (a) creating a NEW agent when none fits and (b) confirming a destructive action.
  Agent match, runtime routing and execution are automatic. Proportionate — a
  trivial task with an existing agent routes directly, no ceremony.
- Wiring only: the code (agent-matcher 2.47, dispatch-router + codex-bridge 2.46)
  already existed ; this connects it into the entry flow. Updated the byan-byan
  skill (section 0), `.claude/rules/agent-entry-gate.md`, and `CLAUDE.md`. Honest
  ceiling: the auto-chain is driven by the loaded skill (via `/byan-byan`) plus the
  reactive nets — not a guarantee outside a loaded skill.
- Skill bundles rebuilt ; jest 2640 + MCP 846 green ; zero emoji ; mirrored to
  install/templates.

## [2.47.1] - 2026-07-16

### Fixed - Doctrine told users to invoke with `@byan`, which does not load the skill

- The docs said "tape `@byan` / `@hermes`" to invoke BYAN. In Claude Code, `@` is a
  file mention, not a skill loader — so the byan-byan skill (which holds the agent
  entry gate) was not loaded, and BYAN ran a task inline with no dispatch. Root
  cause of the entry gate appearing "not to work" on a real machine.
- Corrected the entry guidance in `CLAUDE.md`: invoke BYAN with the **command**
  `/byan-byan` (it loads the skill, the entry gate, and the rail) ; noted explicitly
  that `@byan`/`@hermes` do not load the skill. Mirrored to install/templates.
- Note: the entry-gate code (2.47.0) is unchanged and correct ; it simply was not
  reached because the skill was not loaded. Open question (does the loaded doctrine
  reliably make BYAN propose an agent, or is a hard pre-write block needed) is to be
  decided by testing `/byan-byan` with the rail actually loaded.

## [2.47.0] - 2026-07-16

### Added - Mandatory agent entry gate (match-or-create), the base of BYAN

- Makes the agent dispatch the front door of every non-conversational task: BYAN +
  Hermes evaluate which specialist agent fits the need and PROPOSE it ; the user
  validates (double validation IA + human) ; THEN the workflow runs. No suited
  agent -> propose an interview to frame the need -> web research on the trade's
  competencies + best practices -> create the tailored agent -> workflow. The
  interview is triggered by the ABSENCE of a suited agent, not by task size (a fit
  routes directly, no ceremony). This closes the gap where a plain task got done
  inline without any dispatch.
- F1 `lib/agent-matcher.js` — pure suitability pre-filter: (task text + roster)
  -> ranked candidates + a {fit | no-fit} verdict. Curated Hermes trigger words
  (weighted) over a title/role text overlap ; accent-insensitive ; a no-fit is the
  interview signal. Loader reads the roster from agent-manifest.csv (robust CSV
  parse). It PROPOSES, it does not decide alone.
- F2/F3 doctrine `.claude/rules/agent-entry-gate.md` (+ pointer in CLAUDE.md + a
  section 0 in the byan-byan skill): the rail, the two dispatch layers (agent vs
  runtime), the proportionality (verify every task, interview only on no-fit), the
  double validation, and the web-research step in agent creation.
- F4 reactive net `.claude/hooks/agent-gate-check.js` (+ pure core
  `lib/agent-gate.js`): a Stop hook that flags a task done directly (files written)
  with no agent proposal and outside an active FD cycle ; the next-turn voice
  reminder surfaces it in plain French. Non-blocking (the correction lands next
  turn) ; exits 0 in every path. Honest ceiling: no pre-display interception, so
  the rail is doctrine + this net, not a first-turn wall.
- F5: tests (`test/agent-matcher.test.js` node:test, `.claude/__tests__/agent-gate.test.js`
  jest). Full MCP suite + jest suite green ; workflow linter OK ; skill bundles
  re-checked ; zero emoji. Shipped via install/templates (5 files added to the sync
  manifest). Doc: `.claude/rules/agent-entry-gate.md`.

## [2.46.0] - 2026-07-15

### Added - Intelligent dispatch: Codex/Claude routing + architect-dev loop (option B)

- Route each task to the runtime that is genuinely better for it, on the right
  model and effort for its complexity, and let an architect (Claude) and a dev
  (Codex or Claude) exchange turn by turn until the work converges. Layered,
  ports-and-adapters design so the durable core stays independent of the transport.
- F1 `lib/dispatch-router.js` — pure routing brain: {nature, complexity} ->
  {runtime, model, effort}. Runtime table is the cross-checked result (Codex for
  execution/shell/deploy/devops/browser ; Claude for architecture/refactor/quality/
  planning ; unknown -> Claude). Complexity picks the Claude model tier via
  native-tiers (haiku/sonnet/inherit) or the Codex reasoning-effort (low/med/high).
  Two red lines enforced in code, not left to the caller: Fable is refused
  (assertNoFable throws) and verification is forced to Claude (a runtime does not
  grade its own work).
- F2 `lib/codex-bridge.js` — Codex transport behind a swappable adapter. The
  shipped codex-exec adapter runs `codex exec` read-only for a unified diff that
  Claude applies with git apply (Codex writes nothing -> works under a locked-down
  sandbox e.g. Landlock). Failure is a value (ok:false + reason) so the loop falls
  back to Claude. codex-mcp is a declared V2 slot (available:false) for the tighter
  `codex mcp-server` coupling later, with no change to F1/F4.
- F3 `lib/dispatch-blackboard.js` — the turn-by-turn shared board the agents use to
  exchange (build/render pure ; JSONL sidecar I/O isolated). The honest substitute
  for a live peer chat: an orchestrated loop, like a chat server holding the turns.
- F4 `lib/dispatch-orchestrator.js` — the loop core: routes via F1, runs
  architect<->dev through the board until convergence, executors injected (Codex vs
  Claude) so it is fully unit-tested. `.claude/workflows/intelligent-dispatch.js` is
  the native launch facade for one routed task (design -> implement -> verify ;
  the verify leaf is a Claude reviewer, not the dev).
- Enforcement: the Codex auto-delegate config ships DISARMED (absent = off) ;
  arming stays a per-machine opt-in (`_byan/_config/autodelegate.json`, gitignored).
  Unit tests: `test/dispatch-router|codex-bridge|dispatch-blackboard|dispatch-orchestrator.test.js`.
  Also corrected a pre-existing api-tools test drift (byan_api_knowledge_retrieve
  was registered in server.js but absent from the test's tool list). Full MCP suite
  green (833 node:test) + jest suite green. Doc: `docs/intelligent-dispatch.md`.
  Shipped via install/templates (10 files added to the sync manifest).

## [2.45.0] - 2026-07-15

### Added - Plain-language guard for every agent (Mantra IA-26 "Parler Reel")

- New team-wide rule: agents speak clear, coherent French to the user — no gratuitous
  English when a French word exists ("redemarrer le conteneur", not "cutoff"), no raw
  internal jargon (leaf/tier/downgrade/gate/inline/advisory), no misapplied metaphor
  (you do not "forge" a token). A technical term with no French equivalent (commit,
  cache, token) is kept but explained once. Test: the reader understands with no
  dictionary. This is the sibling of IA-23 (no emoji) and applies to ALL agents.
- Mechanism, in three layers, none of which re-generates an already-shown reply:
  1. The rule reaches every agent: mantra `IA-26` (`mantras.yaml` + `mantras-sources.md`),
     `.claude/rules/plain-language.md`, and a pointer in `CLAUDE.md`.
  2. BYAN's own voice stays fresh: a line in the per-turn reminder
     (`inject-voice-anchor.js`) + entries in `tao.md` Section 4 (Vocabulaire Interdit).
  3. A forward net (non-blocking): the Stop hook `plain-language-check.js` spots the
     known repeat-offenders in the finished reply and writes a one-turn flag under
     `_byan-output/`; the next-turn reminder reads it, signals it in plain French, and
     clears it. No blocking, no re-answer — the correction is carried to the next turn
     (a blocking guard would force a costly regen and the user has already read the slip).
- Core logic isolated in `.claude/hooks/lib/plain-language.js` (French-aware word
  boundary so "metier"/"chantier" stay clear of the "tier" match; code spans stripped
  before scanning). Tests: `.claude/__tests__/plain-language.test.js`. Full suite green
  (2629 jest). Shipped via `install/templates/`.

## [2.44.0] - 2026-07-15

### Changed - Revived the Sonnet middle tier for native-workflow model routing

- Native-workflow ANALYSIS leaves (score/rank/assess/design/nfr/coverage/
  recommend/synthesize) now auto-route to the balanced tier (`model: 'sonnet'`)
  instead of `deep` (inherit the session model). Before this, the Sonnet rung was
  reachable only through the explicit `mech-` opt-in, so on an Opus (or high-effort)
  session every analysis/verification/implementation leaf ran on Opus — the Sonnet
  tier was effectively dead (ledger: recent workflows logged all-`inherit`).
- This deliberately overrides the session model for analysis leaves; a genuinely
  frontier analysis opts back to the session model with the `deep-` label prefix
  (`deep-assess-architecture`), the mirror of the `mech-` opt-in. VERIFICATION and
  IMPLEMENTATION are untouched — a wrong check or a code-write still inherits the
  session model (no silent downgrade of the dangerous classes).
- Propagated through the enforcement stack: `modelRoutingViolations` accepts sonnet
  on an analysis leaf (its tier) and still blocks haiku (`analysis-below-tier`) and
  any downgrade on a protected leaf; added a non-blocking `untiered-analysis`
  advisory (surfaces an analysis leaf running deep, suggests `model: 'sonnet'`).
  Files: `native-tiers.js` (tierFor + `DEEP_PREFIX` + `synthes` keyword),
  `workflows-lint.js`, `bin/byan-lint-workflows.js`, native-workflows.md.
- The 21 committed workflows still pass the contract; MCP 792 + jest 2606 green.

## [2.43.0] - 2026-07-10

### Removed - Purged the Gen1 `_bmad/` legacy layer

- Removed the Gen1 `_bmad/` fallback from the layout resolver
  (`src/byan-v2/lib/layout-resolver.js`): `resolveAgent` / `agentDirs` now resolve
  Gen3 (`_byan/agent/<name>/`) and Gen2 (`_byan/agents/`, `_byan/<module>/agents/`)
  only. A pre-Gen3 project on the raw `_bmad/` layout is migrated with
  `scripts/migrate-bmad-to-byan.js` (agents land under `_byan/`, resolved by the
  Gen2 branches). Added a regression test locking Gen1 resolution to null.
- Deleted the frozen Gen1 content: `_bmad/` (677 files) and the dead shipped
  template `install/templates/_bmad/` (17 files) that the installer does not copy
  (it scaffolds `templates/_byan/`). Neither carried a live code path.
- Removed the dead `marc` agent residues (a GitHub Copilot CLI specialist for the
  already-removed Copilot platform, present only under `_bmad/`): the
  `subagent-generator` model-map key, an `agent-launcher` jsdoc example, and the
  `marc.md` entry in the migrator's agent list.
- Migrated `_bmad` doc references to `_byan` (CLAUDE.md, QUICK-START,
  GUIDE-UTILISATION, soul-activation, workers) and cleaned stale Gen1
  comments / dead branches (agent-packager, bridge, cli-detector, index example).
- Kept the migration back-compat intact: the webui legacy-install detection, the
  `migrate-bmad-to-byan` script, `stub-sync`, and the `_bmad-output` user-data scan.

### Note - Known follow-up

- `install/install.sh` (a dormant legacy shell installer) still scaffolds a Gen1
  `_bmad/` tree and promotes GitHub Copilot CLI. It ships but is not run by the
  npx flow. It needs a dedicated rework to align with the Gen3-only, Copilot-free
  product; deliberately left out of this purge to avoid touching an untested
  installer path.

## [2.42.1] - 2026-07-06

### Changed - Excised the dead stub half of the yanstaller module

- Removed six pure-stub files under `install/lib/yanstaller/` that had no caller
  (`installer.js`, `validator.js`, `recommender.js`, `interviewer.js`,
  `troubleshooter.js`, `wizard.js`). `installer.js` faked a successful install
  without touching the disk; `validator.js` returned `passed: true` for its ten
  checks without inspecting anything. The real installer is
  `install/bin/create-byan-agent-v2.js`.
- Dropped the half-implemented `install()`/`uninstall()` orchestrator from
  `install/lib/yanstaller/index.js`. The live surface consumed by the CLI
  (`update` / `rollback` / `backups` / `check`) and the web UI is untouched:
  `update`, `rollback`, `listBackups`, plus the `detector` / `platformSelector`
  / `updater` / `backuper` modules.
- Removed the dead `yanstaller.install()` call from the web UI install path
  (`install/src/webui/api.js`); it already had its own directory/config
  fallback and had logged that call as a stub.
- Added `install/__tests__/yanstaller/no-stub-guard.test.js`, a regression guard
  that keeps the excised stubs from creeping back and locks the surviving public
  surface. Net: -853 / +11 lines shipped to npm consumers.

### Changed - Purged emoji from the installer CLI output (Mantra IA-23)

- Removed every emoji from the 16 live installer files under `install/lib/` and
  `install/bin/` (201 occurrences). Status glyphs became bracket tags matching
  the existing `[DEBUG]` idiom: `[OK]` / `[INFO]` / `[WARN]` / `[ERROR]` / `[x]`;
  decorative glyphs were dropped and the arrow `->` de-symbolized. Message text,
  colors, and control flow are unchanged (a `git diff -w` is emoji-only).
- Updated the two coupled tests in lockstep: `install/__tests__/utils/logger.test.js`
  and `install/__tests__/integration/platform-integration.test.js`.

### Removed - Dead Copilot-era task-tool-interface stub

- Deleted `task-tool-interface.js` + `-mock.js` from both `src/byan-v2/dispatcher/`
  and `install/src/byan-v2/dispatcher/`, plus their test. The module had no caller
  outside its own test. Scrubbed the five stale `TaskToolInterface` doc references
  it left behind (`task-router` JSDoc + `COMPLETION-REPORT.md`).

## [2.42.0] - 2026-07-06

### Fixed - Shipped Claude Code hooks no longer spam MODULE_NOT_FOUND
- **Every hook command in the shipped `.claude/settings.json` is now
  self-guarded.** The hooks run on every tool (empty matcher); a bare
  `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/X.js` threw `MODULE_NOT_FOUND` on
  every tool call whenever the script was not resolvable — a non-BYAN project, an
  empty `$CLAUDE_PROJECT_DIR`, a partial install, or version drift. Each command
  is now `p="$CLAUDE_PROJECT_DIR/.claude/hooks/X.js"; [ -f "$p" ] || exit 0; exec
  node "$p"`: a missing script no-ops with exit 0 (the tool proceeds), a present
  script runs via `exec` so its exit code is preserved (a blocking PreToolUse /
  Stop guard still blocks). Covered by
  `install/__tests__/hook-invocation-guard.test.js` (guarded-shape on all 24
  commands + runtime sh simulation: absent/empty -> 0, blocker -> 2, stdin
  passthrough).

### Changed - Handoff auto-import instructions
- **Claude and Codex activation surfaces now know how to handle
  `importe depuis claude` / `importe depuis codex` automatically.** `CLAUDE.md`
  and BYAN skills instruct the assistant to run
  `byan-handoff latest --from <source> --prompt` and resume from the generated
  context without relying on native assistant memory.

### Added - Portable Claude/Codex Markdown handoff
- **BYAN can now export/import project state as a portable Markdown handoff for
  switching between Claude Code and Codex.** The new `byan-handoff` CLI writes
  handoffs under `_byan-output/handoffs/`, embeds a parseable
  `json byan-handoff` block, and can print a compact resume prompt via
  `byan-handoff latest --from <source> --prompt` or
  `byan-handoff import <file> --prompt`.
  A new `project-handoff` BYAN workflow documents the limit-switch protocol.
  Covered by `install/__tests__/project-handoff.test.js`.

### Changed - RTK offered on Codex-selected installs
- **Yanstaller now offers RTK when the selected target includes Codex, not only
  Claude Code.** Claude Code keeps the transparent `rtk init -g --auto-patch`
  hook path. Codex installs get the verified native `rtk` binary and an explicit
  no-transparent-hook status, matching BYAN's current Codex adapter model.
  Covered by `install/__tests__/rtk-integration.test.js`.

### Added - Codex native skills in yanstaller
- **Codex installs now get real native skills, not just project prompt stubs.**
  When the yanstaller target includes Codex (Codex-only or Claude+Codex), it
  writes the BYAN MCP entry to `~/.codex/config.toml` and copies BYAN skill
  folders into `~/.codex/skills`, creating `~/.codex` when Codex was explicitly
  selected. The project template also ships `.codex/skills/byan/SKILL.md`, so a
  fresh Codex install has a native skill named `byan` in addition to the
  Claude-derived BYAN specialty skills. This closes the gap where a fresh
  machine had `.codex/prompts/` and MCP wiring but no native `$byan` / BYAN skill
  surface for delegation. Covered by `install/__tests__/codex-native-setup.test.js`.

### Added - Codex auto-delegation (opt-in, native)
- **BYAN now proposes handing delegable work to Codex on your ChatGPT
  subscription (no API credit) when Claude nears its 5h limit.** A
  `UserPromptSubmit` hook estimates the rolling-5h Claude consumption from the
  local transcripts (live) + session-meta (fallback), and nudges delegation on
  three triggers: pressure (>= 80% estimated, configurable), task nature
  (delegable coding work), and an opt-in perf forces table. The red line holds:
  only delegable natures are proposed; judgment / soul / verification stay on
  Claude. Disarmed by default — the yanstaller arms it on opt-in (device-flow
  `codex login --device-auth`, entitled model gpt-5.4) by writing
  `_byan/_config/autodelegate.json`. The 5h gauge is an honest ESTIMATE (no
  provider exposes a machine-readable quota; `pct` is null without a configured
  budget), and perf routing ships neutral (below the L2 perf floor, tagged
  heuristic). New: `.claude/hooks/codex-autodelegate.js` +
  `.claude/hooks/lib/{usage-estimator,autodelegate-decision,perf-routing}.js`,
  `install/lib/codex-autodelegate-setup.js`. 47 unit tests. See
  `docs/codex-auto-delegation.md`.

### Fixed
- **lb: Codex pool targeted a non-entitled model on ChatGPT subscription.** The
  provider defaulted to `gpt-5-codex`; the OpenAI backend rejects every
  `-codex`-suffixed model on a subscription account (API-key only). Default is
  now the entitled `gpt-5.4`, and a new pure `resolveCodexModel({ requested,
  authPool })` remaps a `-codex` request to `gpt-5.4` under subscription auth
  only (passthrough on api-key or an already-plain id). `loadbalancer.default.yaml`
  codex models set to `gpt-5.4`. Covered by 7 new unit tests (mock runner, no
  real CLI/network). See `docs/loadbalancer-multipool.md`.

## [2.41.0] - 2026-07-03

### Added - multi-pool subscription arbitrage: Codex as a second pool + the 5h-window ladder

The load-balancer had claude + copilot + byan_api but no OpenAI pool, and its
pressure-score modelled API-burst (429) pressure, not the rolling 5h subscription
window that users actually hit. This release adds the second pool and the window
tracking that switches before the wall, without denaturing BYAN.

- **CodexProvider** (`src/loadbalancer/providers/codex-provider.js`) - wraps the
  `codex exec --json` SYSTEM CLI (not an npm SDK); degrades to disabled if the
  binary is absent; two auth pools (CODEX_API_KEY per-token, else the
  ChatGPT-subscription session). Rate-limit exhaustion read from stderr (no
  machine-readable quota, OpenAI issue #10233). Registered in the yaml +
  capability-matrix; provider factory (`providers/factory.js`).
- **subscription-window tracker** (`subscription-window.js`) - per-pool rolling-5h
  + weekly token burn, a `window-proximity` signal (distinct from 429-pressure) +
  ETA. Honest estimate: `null` proximity without a configured budget, no
  fabricated percentage.
- **Execution stubs unblocked** (`mcp-server.js`) - `lb_send` / `lb_switch` /
  `lb_get_context` now really route / transfer context / read state; the
  SessionBridge and GracefulDegradation (previously orphaned) are wired; all
  seams injectable so tests avoid spawning codex or hitting the OpenAI quota.
- **switch-tolerance** (`switch-tolerance.js`) - the red line: only delegable
  natures (exploration / mechanical / implementation) may cross to Codex;
  verification / analysis / soul / identity / review / gate stay on Claude and
  queue rather than denature.
- **4-rung degradation ladder** (`degradation-ladder.js`) - HEALTHY ->
  PRIMARY_HOT -> PRIMARY_EXHAUSTED -> ALL_EXHAUSTED, driven by the window
  proximity, obeying the red line at every rung. `planRoute(nature)` on the live
  shell.
- **lb_budget** MCP tool + `getBudget()` - the anti-"5h limit reached" dashboard:
  per-pool 5h/weekly burn, proximity, ETA, rung, with the honest estimate/
  doubles-the-ceiling note.
- **Docs** - `docs/loadbalancer-multipool.md` (architecture, the red line, the two
  hard truths, honest shipping status).

### Added - native workflow model tiering: the sonnet tier lives, ad-hoc scripts are gated

Claude Code's Workflow tool runs every `agent()` leaf on the session model
unless the script pins `opts.model`, and the tiering contract only reached
committed `.claude/workflows/*.js` through the repo linter. Two consequences,
both observed live: ad-hoc scripts (written inline for one run) executed
all-deep (14 agents on Opus for one review), and the `balanced` tier was
unreachable (0/131 committed leaves on sonnet). This release closes both.

- **`mech-` opt-in class (native-tiers)** - a `mech-` label prefix
  (`mech-validate-json`) declares a MECHANICAL verification: a binary,
  judgment-free check (JSON parses, schema matches, lint passes) that tiers to
  `balanced` (sonnet). Explicit opt-in only, no keyword fuzziness:
  `validate-json` without the prefix stays protected (deep). The linter holds
  the script to the declaration: `mechanical-without-model` and
  `mechanical-below-tier` are hard contract violations.
- **tier-script engine + CLI** - `lib/tier-script.js` analyzes any workflow
  script TEXT (committed, ad-hoc or draft): one verdict per labelled leaf
  against native-tiers, plus the deny-once gate decision. Parsing stays in
  `workflows-lint.js` (`extractLabelledLeaves`). `bin/byan-tier-script.js`
  prints the report (exit 0 clean/acknowledged, 1 gaps, 2 violations).
- **tier gate hook** - `.claude/hooks/tier-script-guard.js` (PreToolUse,
  matcher `Workflow`) gates EVERY Workflow invocation at the one chokepoint an
  ad-hoc script crosses. Undecided exploration/`mech-` leaves deny ONCE with
  the exact leaf list; `// BYAN-TIER: reviewed` acknowledges deliberate deep
  choices; an identical resubmission passes (deny-once by design); registry
  invocations pass. It rewrites nothing (STRICT-2 No Downgrade). Every
  decision lands in `_byan-output/tier-ledger.jsonl` with a per-model
  histogram - the measurement basis for token gains. Escape hatch:
  `.byan-tier/off`.
- **`byan_dispatch` batch mode** - `{ leaves: [{ label, nature? }] }` returns
  the `opts.model` per planned leaf BEFORE the script is written; the nature
  enum gains `mechanical` on both axes.
- **Docs** - `native-workflows.md` rule + `docs/native-workflows-contract.md`
  describe the three live tiers, the two nets (repo linter floor + tier gate
  hook) and the authoring flow; byan-byan and hermes-dispatch skills carry the
  same doctrine.

### Added - shippable soul stays in sync with the active soul (byan-sync-soul)

BYAN's active identity (`_byan/agent/byan/soul.md`, `tao.md`) is shipped to a
fresh install via the prefixed copies `byan-soul.md` / `byan-tao.md`, which the
installer copies into place at setup. Those copies were a MANUAL mirror and had
drifted: `byan-soul.md` had missed the `## Valeurs` section and the 2026-07-02
couche-vivante revision, so a fresh install shipped a stale identity. The
2026-03-27 revision had warned that soul transmission needs maintenance — the
manual sync did not hold.

- **New generator `byan-sync-soul`** (`lib/sync-soul.js` + `bin/byan-sync-soul.js`)
  mirrors the active soul + tao into the shippable prefixed copies. `--check`
  reports drift and exits non-zero.
- **Pre-commit gate**: `.githooks/pre-commit` runs `byan-sync-soul --check`, so a
  commit whose shippable soul drifted from the active one is blocked. Dev-repo
  tooling — the bin is not shipped, so the gate no-ops in installed projects
  (`[ -f ]` guard), where it is not needed.
- **Caught up**: `byan-soul.md` now carries the `## Valeurs` section and the
  2026-07-02 revision; `byan-tao.md` was already in sync.
- **soul-memory is out of scope**: `byan-soul-memory.md` is a curated seed journal
  (distinct from this repo's living `soul-memory.md`), so it is not mirrored.

Files: `_byan/mcp/byan-mcp-server/lib/sync-soul.js` + `bin/byan-sync-soul.js` +
`test/sync-soul.test.js`, `.githooks/pre-commit` (+ template mirror),
`_byan/agent/byan/byan-soul.md` (+ template mirror). Adversarial review
(bmad-compliance) approved, 0 must_fix; it corrected an inaccurate rationale in
the comments (the installer copies, it does not rename), fixed before merge.
MCP node --test 733/733, jest root 2473/2473.

### Added - strict self-verify checklist from measured recurring gaps

Strict mode now carries a self-verify checklist of BYAN's OWN most frequent
blind spots, so each self-verify pass checks them on top of the locked
acceptance criteria. The three themes are not guessed — they were harvested from
the strict audit log by `byan_insight_digest` (self-verify gap clustering):
tests/coverage (observed 20x), doc-follows-code (10x), scope-discovery (7x). The
heterogeneous "other" cluster (18x) was deliberately excluded — too mixed to
become a single check.

- **Single source of truth**: the checklist lives under `self_verify.checklist`
  in `_byan/_config/strict-mode.yaml`. Each item is a testable question plus an
  `observed` count kept as the WHY (a signal, not a target).
- **Propagated by the generator**: `byan-sync-rules` renders it into the three
  operative surfaces — the `byan-strict` SKILL (a `## Self-verify checklist`
  section), `.claude/hooks/lib/strict-config.json` (`self_verify_checklist`, with
  `observed` stripped as source-only), and the `AGENTS.md` block (Codex parity).
  Idempotent; an older config with no checklist renders an empty list and no
  section.
- **Anti-drop**: a test asserts the real `strict-mode.yaml` carries the three
  themes and that they survive the generator, so a future edit cannot silently
  drop them. Additive only — `min_passes`, `last_verdict_must_be`, mantras,
  banners and the scope guard are unchanged.

This closes the insight loop from the 2026-07-02 soul revision: a measured,
recurring gap becomes a mechanized check rather than a remembered intention.

Files: `_byan/_config/strict-mode.yaml`, `_byan/mcp/byan-mcp-server/lib/sync-rules.js`,
`_byan/mcp/byan-mcp-server/test/sync-rules.test.js`, regenerated
`.claude/skills/byan-strict/SKILL.md` + `.claude/hooks/lib/strict-config.json` +
`AGENTS.md` (+ install template mirrors). Adversarial review (bmad-compliance)
approved, 0 must_fix, 7/7 criteria. MCP node --test 726/726, jest root 2473/2473.

## [2.38.0] - 2026-06-30

### Added - yanstaller installs the byan-channel MCP entry by default (inert)

`npx create-byan-agent` now registers a second MCP server, `byan-channel`,
alongside `byan` in the project `.mcp.json`. It is a Claude Code RESEARCH PREVIEW
channel (v2.1.80+) and ships INERT: registering it enables nothing on its own --
it is only loaded when the user launches
`claude --dangerously-load-development-channels server:byan-channel`. No
`channelsEnabled`, no `allowedChannelPlugins`, no auto-activation flag is written.
Codex is not covered by this feature.

- **Port (read-only from byan_web)**: `channel-entry.js`, `lib/channel-server.js`,
  `lib/channel-poll.js` brought into `_byan/mcp/byan-mcp-server/`. The entry
  resolves its own config at boot via `resolve-config.js` (env ->
  `~/.byan/credentials.json` -> defaults), so no secret is needed in `.mcp.json`.
- **Wiring -- one shape, every writer**: the byan + byan-channel entry shape has a
  single source of truth, `mcpConfig.mergeByanEntry`, with no `.mcp.json` template
  to drift out of sync. Both writers route through it -- `generateMcpConfig` (the
  primary native-setup path, a pure delegation) and `installDirectMCP` -- so they
  are byte-coherent. Each writes a project-relative path (not absolute, not
  `{{PROJECT_ROOT}}`), preserves an existing custom `command` and non-byan env,
  strips `BYAN_API_URL`/`BYAN_API_TOKEN`, and merges into an existing `.mcp.json`
  without clobbering other servers. Additional default MCP servers are registered
  via `addMcpEntry` (mcp-extensions), not a template.
- **Portable + secret-free**: relative paths survive a moved / npm-shipped repo;
  the channel env is forced empty; no token shape can land in tracked `.mcp.json`.
- **Shipped**: the 3 runtime files + 2 tests are in `TARGET_ADDITIONS` and
  mirrored to `install/templates`, parity enforced by `byan-sync-template --check`.
- **Honest post-install message**: states research-preview, version gate, inert
  default, the activation flag, and that Codex is not covered.

Files: `install/packages/platform-config/lib/mcp-config.js` (mergeByanEntry /
mergeChannelEntry / mergeLeantimeRefs -- relative args, command preserved),
`install/lib/claude-native-setup.js` (generateMcpConfig is a pure delegation to
the shared merge), `install/lib/platforms/claude-code.js` (installDirectMCP),
`install/bin/create-byan-agent-v2.js` (message),
`_byan/mcp/byan-mcp-server/{channel-entry,lib/channel-server,lib/channel-poll}.js`,
`_byan/mcp/byan-mcp-server/lib/template-sync.js`,
`_byan/mcp/byan-mcp-server/test/{channel,channel-resolve}.test.js` (+ install
templates). Adversarial review (bmad-compliance) caught 3 message/coherence gaps,
all fixed before merge; a follow-up adversarial pass drove removal of the now-dead
`.mcp.json.tmpl` so the byan/byan-channel shape has a single source of truth.
jest root 2473/2473, MCP node --test 723/723.

## [2.37.1] - 2026-06-30

### Fixed - strict-stop-guard false positive on mentioned completion markers

`claimsCompletion` matched a completion marker ANYWHERE in the assistant message,
so a turn was blocked even when a marker was merely MENTIONED, not claimed:
`complete` inside `byan_strict_complete`, `done` inside the `BYAN-BENCH:done`
marker comment, or an accented marker embedded in another word (`fini` in
`indefini`, `termine` in `determine`). Hit repeatedly in one session. Hardened: a
working copy is denoised first (fenced + inline code, HTML comments, snake_case /
namespaced identifiers stripped), then markers match only as a standalone claim
with Unicode-aware boundaries and a permissive trailing inflection (`livre` ->
`livree` / `livres`). Bias toward fewer false blocks -- the pre-commit gate stays
the hard net for a real premature completion. Genuine claims (`done`,
`c'est termine`, `feature livree`, `the build is complete`) still fire. +4
regression tests.

Files: `.claude/hooks/strict-stop-guard.js` (+ install template),
`_byan/mcp/byan-mcp-server/test/strict-hooks.test.js`. MCP node --test 714/714,
root jest 2466/2466.

## [2.37.0] - 2026-06-30

### Added - Prod-grade + maximal scope as the mechanical default (anti-downgrade)

A 4-lens diagnosis workflow established WHY the agent kept drifting toward MVP /
half-work despite the whole anti-downgrade arsenal: it was OPT-IN (every guard a
no-op until a scope is locked), the strict loop was self-judged (agent writes the
contract, grades its own verdict), and the cost model was anchored on human-2010
time, generating the MVP-split reflex. This ships the mechanical, default-on fix.

- **F1 -- delivery-contract anchor (LIVE).** New `inject-delivery-default.js`
  (UserPromptSubmit) + pure lib `delivery-contract.js` re-inject a contract every
  turn: grade=PROD, scope=MAXIMAL (proposing an MVP / short-deliverable /
  dont-block-the-heavy split is forbidden unless the user types an opt-out word
  THIS message), cost yardstick=AI-2026 (estimate in agent-time x10, not
  human-by-hand). Opt-out wordlist in `_byan/_config/delivery-default.json`. The
  opt-out parser is biased toward PROD: a single opt-out word counts only as a
  short directive or with a go-cheap cue, is dropped when negated ("pas de mvp"),
  and a mere mention in a long meta message leaves the anchor armed. Preserved
  across compaction (CLAUDE.md) and mirrored to AGENTS.md (Codex).
- **F2 -- non-agent completeness judge (built, DISARMED).** `completeness-evidence.js`
  wired additively into strict `complete()` + the pre-commit gate: a "done" claim
  is backed by a non-fabricable artifact (a real test-runner exit, a `git diff`
  vs the locked paths, a file that exists), breaking the judge=defendant loop.
  Ships behind `completenessGate.armed=false` (collect + ledger only) so it does
  not change behavior or self-lock until the ledger validates arming.
- **F3 -- punt-guard (built, DISARMED).** Stop hook + pure `punt-detect.js`
  flags handing the user a runnable command the agent could run itself, with a
  creds carve-out (git push / npm publish). Ships behind `puntGuard.armed=false`
  (observe + ledger).

Caught in build: F1's first live turn revealed a false positive (the anchor
self-disabled on any message that merely mentioned an opt-out word). Fixed in
place with the negation + directive-context hardening above + 3 regression tests.

Files: `.claude/hooks/inject-delivery-default.js`, `.claude/hooks/lib/delivery-contract.js`,
`.claude/hooks/punt-guard.js`, `.claude/hooks/lib/punt-detect.js`,
`_byan/mcp/byan-mcp-server/lib/completeness-evidence.js`, wired into `strict-mode.js`
+ `precommit-gate.js`, `_byan/_config/delivery-default.json`, `.claude/settings.json`,
CLAUDE.md + AGENTS.md (+ install templates) + tests. MCP node --test 710/710, root
jest 2466/2466. Strict scope 9f8c6048.

## [2.36.0] - 2026-06-29

### Added - Leantime auto-sync: complexity, priority and description on task creation

The FD->Leantime auto-sync (which already creates tasks and drives the
todo/doing/review/done lifecycle) now enriches each created task with effort,
priority and a traceable description -- no manual board work.

- **F1 -- pure resolvers + enriched intent** (`leantime-fd-core.js`). Two
  exported pure functions: `priorityToLeantime` (P1/P2/P3 -> 3/2/1, omitted when
  unknown) and `complexityToStorypoints` (a finite `item.complexity` bucketed on
  the Fibonacci scale <=15->2 / 16-39->5 / 40-69->8 / >=70->13, else derived from
  priority P1->8 / P2->5 / P3->3, default 3 -- returns a numeric estimate).
  `decideActions` now emits `{ priority?, storypoints, description }` in the
  `task_create` intent (`description` = `BYAN FD <id> -- <headline>` +
  ` [complexity:N]` when finite).
- **F2 -- carrier + passthrough** (`leantime-sync.js` + the `leantime-fd-sync`
  hook, source + install template). `createTask` accepts and sends `storypoints`;
  the hook passes `description` / `priority` / `storypoints` through to it. The
  lifecycle sync is untouched.

Note: `storypoints` is the presumed Leantime effort field, `[UNVERIFIED]` against
a live instance (Leantime unreachable at build time). An unknown key is at worst
ignored by `addTicket` (no break), and the complexity is also carried in the
description as a fallback. Flagged for a live-verify when reachable.

Files: `_byan/mcp/byan-mcp-server/lib/leantime-fd-core.js`, `lib/leantime-sync.js`,
`.claude/hooks/leantime-fd-sync.js` (+ install template), `test/leantime-fd-core.test.js`
+ `test/leantime-sync.test.js` (+7 tests). MCP node --test 696/696, root jest
2441/2441. Strict scope 80405c59.

## [2.35.0] - 2026-06-26

### Added - Portable core / native projection doctrine + degradation litmus

BYAN's memory/identity is now governed by an explicit architecture doctrine: a
portable in-repo core, with native Claude features as opportunistic write-through
accelerators rather than dependencies.

- **F1 -- doctrine.** New `.claude/rules/portable-core.md` (+ install template)
  states the boundary: source of truth lives under `_byan/` (+ byan_web); native
  features (prompt caching, `@-import` memory files, hooks, subagent isolation)
  are write-through accelerators; the native AutoMem
  (`~/.claude/projects/<hash>/memory/`) is explicitly out-of-perimeter
  (per-machine, not shippable, not a BYAN source). Carries a feature -> adapter
  -> degraded-path table. Mirrored to `AGENTS.md` (Codex) and pointed to from
  `.claude/CLAUDE.md` WITHOUT an `@-import` (token budget).
- **F2 -- degradation litmus.** New `.claude/__tests__/portable-core.test.js`
  makes independence mechanical: identity (soul/tao/soul-memory) reconstructs from
  portable `_byan/` artifacts alone, and no critical read path depends on the
  native AutoMem (regression guard).

Origin: a memory-integration audit found BYAN runs a parallel memory stack that
does not touch the native AutoMem -- largely justified by npm portability, but
undocumented and drift-prone. This codifies the boundary instead of syncing two
stores (F3 anti-drift guard cut, YAGNI).

Files: `.claude/rules/portable-core.md` (+ template), `AGENTS.md`,
`.claude/CLAUDE.md` (+ template), `.claude/__tests__/portable-core.test.js`.
root jest 2441/2441, MCP node --test 689/689. Strict mode: scope 591e6e49.

## [2.34.0] - 2026-06-25

### Changed - Context engineering: do more with less (compaction + subagent isolation)

Two context-engineering moves from Anthropic's guidance, applied without touching
BYAN's persistent identity.

- **G2 -- compaction directive.** A `## Compact instructions` section in
  `.claude/CLAUDE.md` tells the compaction what to preserve when a long session is
  summarized: the active FD state (phase, backlog, verdicts -- `_byan-output/fd-state.json`),
  the active Strict Mode session, BYAN's soul/tao voice, and recent commits. It
  complements the `pre-compact-save` PreCompact hook (which writes a file snapshot):
  one says what to keep in-context, the other persists a snapshot to disk.
- **G3 -- subagent isolation doctrine in hermes.** The dispatcher's worktree path
  already capped the subagent's return; the `mcp-worker` path did not, and the
  isolation principle was unnamed. Both spawn paths now cap the return to a
  distilled summary (< 200 words / ~1-2k tokens) -- verbose tool output and
  intermediate reasoning stay in the subagent's own context. A new "Subagent
  isolation (token leverage)" section + a hard rule codify it (Anthropic: a
  subagent may burn ~9k tokens internally yet return ~1-2k).

Files: `.claude/CLAUDE.md` (+ template), `.claude/skills/byan-hermes-dispatch/SKILL.md`
(+ template), skill-bundles manifest + ZIP rebuilt, `.claude/__tests__/claude-md-context-budget.test.js`.
root jest 2432/2432, MCP node --test 689/689. Source: Anthropic "Effective context engineering for AI agents".

## [2.33.0] - 2026-06-25

### Changed - Keep BYAN's voice alive on long sessions (tao persistence)

Hardens the 2.32.0 tao cache-alignment so BYAN's voice does not fade on a long
session, without re-introducing the per-turn cost.

- **F1 -- heart-survival pinned.** A test (`.claude/__tests__/soul-hooks.test.js`)
  now fails if `inject-tao.js` stops being wired under SessionStart with an
  all-sources matcher (so it keeps re-firing on `source: "compact"`) or stops
  emitting the full tao. Claude Code re-fires SessionStart after each compaction
  (per its docs), re-injecting the full tao then; this test guards that floor
  against a silent refactor.
- **F2 -- periodic refresh.** `inject-voice-anchor.js` re-injects the FULL tao
  every N turns (N via `BYAN_TAO_REFRESH_EVERY`, default 12); the other turns keep
  the compact anchor. A per-turn counter under `_byan-output/` (gitignored), reset
  at SessionStart by `inject-tao.js`, drives the cadence -- so the voice is
  refreshed close to the live edge at least every N turns, between compactions.
  Amortized cost stays well under the pre-2.32.0 per-turn tao.
- **Honest floor.** The periodic refresh is best-effort: it needs a writable
  counter, and each turn is a separate process. If `_byan-output/` is not writable
  the hook degrades to the anchor (exit 0, no crash) and the SessionStart /
  compaction re-injection remains the floor. A test pins that degradation.

Built under BYAN Strict Mode; reviewed by bmad-compliance (one CHANGES round on the
FS-degradation honesty, then approve). root jest 2430/2430, MCP node --test 689/689.

## [2.32.0] - 2026-06-25

### Changed - Token cost reduction for BYAN's persistent identity (cache + dedup)

Cuts the per-turn token cost of BYAN's persistent identity payload without making
any of it conditional: tao, mantras, skeptic, ELO and fact-check stay applied each
turn. Two levers attack the transport/representation cost, not the presence.

- **Cache-align tao injection.** The full tao was re-injected each turn via a
  UserPromptSubmit hook (~14.9 KB per turn, re-billed at the growing edge of the
  conversation). It now loads once at SessionStart (`inject-tao.js` -> SessionStart,
  the cacheable prefix), and a new `inject-voice-anchor.js` injects a compact
  ~95-token voice anchor each turn (register + signatures + tutoiement + zero-emoji
  + IA-16). Per-turn tao transport drops 14898 -> 383 chars (97.4% lower); the full
  tao stays present, moved to the session prefix.
- **De-duplicate the persistent doctrine.** `strict-mode.md`, `benchmark.md` and
  `fact-check.md` were `@`-imported by `CLAUDE.md`, force-loading the full files
  into every turn (~5964 tokens). The `@`-imports become lean plain pointers. The
  behavioral summary stays inline in `CLAUDE.md` and the enforcement lives in the
  hooks (`strict-*-guard`, `autobench-stop-guard`, `fact-check-*`); the full rule
  files stay reachable on demand via their skills. The benchmark pointer is
  regenerated from the `sync-rules` renderer. `elo-trust` and `team-doctrine` keep
  their `@`-import.

A third idea (output-side filtering) was closed as already covered by RTK + Claude
Code's native large-output truncation -- a documented redundancy, not a cut.

Files: `.claude/hooks/inject-tao.js` (now SessionStart), `.claude/hooks/inject-voice-anchor.js`
(new), `.claude/settings.json`, `.claude/CLAUDE.md`, `_byan/mcp/byan-mcp-server/lib/sync-rules.js`
(renderer), `_byan/mcp/byan-mcp-server/lib/template-sync.js` (ships the new hook), `AGENTS.md`
(regenerated), plus the template mirrors. Built under BYAN Strict Mode; reviewed by bmad-compliance
(approve, identity line held); root jest 2420/2420, MCP node --test 689/689, zero emoji. Token
figures are char/4 estimates; `/context` is the exact counter-test.

## [2.31.0] - 2026-06-24

### Added - Install-time service-account key setup for byan_publish

BYAN is open-source, so no Google key ships in the npm package: each user
provides their own service-account key, on their own machine. This release adds
the install-time setup that wires that key for `byan_publish` (the headless
Google Docs publisher from 2.30.0).

- `install/lib/gdoc-setup.js` (new) : `setupGdocPublish` guides the user to the
  Google Cloud console, imports the downloaded SA JSON into
  `~/.byan/google-sa.json` (mode `0600`, dir `0700`), validates it
  (`client_email` + `private_key`), then persists the path via `writeCredentials`
  (`GOOGLE_APPLICATION_CREDENTIALS` + optional `GDOC_TEMPLATE_ID` /
  `GDOC_LOGO_PNG_URL`). Every side-effecting dep (prompt / fs / writeCredentials)
  is injected; the function stays graceful (a missing, invalid, or unreadable key
  degrades to `configured:false` rather than throwing). Only the key path is
  persisted -- the secret stays on disk in `~/.byan/`, out of the repo.
- `install/setup-gdoc.js` (new) + `npm run setup-gdoc` : run the setup on demand,
  outside the installer.
- `install/bin/create-byan-agent-v2.js` : opt-in block (prompt default no, mirrors
  the RTK block; gated by `shouldOfferGdoc` -- TTY only, skipped on
  `BYAN_SKIP_GDOC=1`).
- `@byan/platform-config` : `KNOWN_KEYS` extended with
  `GOOGLE_APPLICATION_CREDENTIALS`, `GDOC_TEMPLATE_ID`, `GDOC_LOGO_PNG_URL` so
  `writeCredentials` persists them (covered by test).
- Guide : `docs/google-docs-publish.md` documents the open-source per-user key
  model and the `npm run setup-gdoc` path (mirrored to `install/templates/docs/`).

Built under BYAN Strict Mode (scope locked, self-verified) ; secrets and
never-throws self-reviewed PASS (independent compliance pass to re-run before
publish, transient API outage at review time). Root jest 2389/0.

## [2.30.0] - 2026-06-24

### Added - byan_publish : Google Docs brandés, headless (service account)

New MCP tool `byan_publish` : a byan-owned, headless Google Docs publisher. A
service-account JWT (durable, no OAuth, no browser, no 7-day refresh-token expiry)
creates a branded Google Doc from a content object and returns its URL, optionally
sharing it. Distinct from the gw OAuth connector.

- `lib/gdoc-content.js` (pure) : content -> Docs `batchUpdate` requests. Template
  mode (`replaceAllText` over a branded template) or programmatic mode (insert +
  the AcadéNice palette : marine `#0e2656`, teal `#24947a`, turquoise `#4cccb8`).
- `lib/gdoc-client.js` : service-account auth (google-auth-library JWT, scopes
  `documents` + `drive.file`) + create-or-copy + `batchUpdate` +
  `permissions.create`. googleapis is lazy-loaded so the server boots without it ;
  every failure path returns `{ ok:false, reason }` (no-credentials /
  bad-credentials / invalid-content / dep-missing / api-error) rather than
  throwing. The SA key is read from a path (`GOOGLE_APPLICATION_CREDENTIALS`, via
  resolve-config) and stays on disk -- not serialized into any output.
- `byan_publish` registered in server.js, kept OUT of `REMOTE_SAFE_TOOLS`
  (network+auth, stdio-only). New deps : `googleapis` + `google-auth-library`.
- Guide : `docs/google-docs-publish.md` (SA key recipe + usage + branding/template
  + the standalone-vs-Workspace ownership model).

The single manual step is creating the SA key (Google Cloud IAM). RNCP/eval
content plugs in later as a thin adapter. Built under BYAN Strict Mode (scope
locked, self-verified) ; reviewed by bmad-compliance (security : secrets +
no-throw PASS, narrow scopes, fact-check floor L1). MCP suite 687/687, root jest
2378/0.

## [2.29.4] - 2026-06-24

### Changed - Google Workspace (gdrive) install: durable OAuth "Internal"

The installer's Google Workspace setup guide now points to an OAuth consent
screen in "Internal" mode instead of "External / Testing". "External + Testing"
expires the refresh token in ~7 days for scopes beyond openid/email/profile (all
of gw's Drive/Docs/... scopes qualify); "Internal" removes that expiry and skips
Google app verification (source: developers.google.com/identity/protocols/oauth2).
The result: ONE durable OAuth client is byan's single Google credential, and the
claude.ai Drive connector becomes redundant.

- `install/lib/mcp-extensions/gdrive.js`: `SETUP_LINKS` + `printSetupGuide` guide
  to Internal, with the durability rationale, the org-Workspace prerequisite, and
  the honest limit (one browser login at setup, org-only). A durability reminder
  fires on the reuse path too.
- The package `google-workspace-mcp` does not support service accounts (its
  README), so "Internal" is the durable path that keeps its 95+ tools. A
  service-account route (for fully headless publishing) would be a separate,
  byan-owned Google client — out of scope here.
- New guide: `docs/google-workspace-setup.md` (one-time Internal recipe + the
  mutualization rationale).

Reviewed by bmad-compliance (auth domain, fact-check floor L1). 2378 tests green.

## [2.29.3] - 2026-06-24

### Fixed - RTK hook now actually installed (--auto-patch)

2.29.2 wired only the RTK instruction layer, not the transparent hook. `wireHook`
ran `rtk init -g` with stdio piped (no TTY), but bare `rtk init -g` PROMPTS before
patching `settings.json`, so the prompt was skipped and rtk wrote `RTK.md` + the
`@RTK.md` reference WITHOUT the PreToolUse hook — `rtk init --show` reported
"Hook: not found". `wireHook` now calls `rtk init -g --auto-patch`, which patches
`settings.json` non-interactively, so the command-rewriting hook is installed. An
older rtk lacking the flag degrades gracefully (reason `hook-failed`; the install
still succeeds). `doctor()` and the installer consent prompt were updated to match.
Verified live on a Debian/zsh host: `rtk init --show` reports "Hook: configured"
after the fix.

If you installed 2.29.x before this and RTK feels inactive, re-run
`rtk init -g --auto-patch`.

## [2.29.2] - 2026-06-23

### Fixed - RTK optional install: fail-proof, off-PATH, shell-aware

The 2.29.x RTK installer could hang silently and mis-report a successful build.

- **Bounded + visible.** The delegated install now runs with a per-strategy
  timeout (brew/script 5min, cargo 20min; override via `BYAN_RTK_TIMEOUT_MS`,
  positive integers only) and inherited stdio, so progress streams live instead
  of a frozen line. Inherited stdio also sidesteps execSync's 1MB maxBuffer cap a
  verbose build would blow.
- **Off-PATH resolution.** `cargo install` drops the binary in `~/.cargo/bin`,
  which a Debian non-login PATH does not include — the install succeeded but
  `rtk --version` reported "unverified". The installer now resolves rtk across
  known dirs (PATH, `~/.cargo/bin`, `~/.local/bin`, `/usr/local/bin`, brew prefix,
  `CARGO_HOME`), verifies + wires the hook by the resolved path, and prints a
  shell-correct PATH hint (`fish_add_path` on fish, `export` on bash/zsh,
  `$env:PATH` on Windows).
- **Prebuilt preferred.** Strategy order is now brew > script > cargo: the
  prebuilt-binary script (pinned to the immutable tag ref, which SHA-256-verifies
  the binary per refs/tags/v0.42.4/install.sh) is fast and PATH-stable; cargo
  (from-source, off-PATH, slow) becomes the last-resort fallback.
- **Stays graceful.** Hardened the no-throw contract: a HOME-less environment
  (`os.homedir()` throwing) no longer propagates out of `setup-rtk.js`.

Reviewed by an adversarial workflow (correctness + supply-chain + mantras) plus a
compliance pass; 2375/2375 tests green (49 dedicated to RTK).

## [2.29.1] - 2026-06-23

### Fixed - Republish (the 2.29.0 npm tarball was missing)

The 2.29.0 publish registered its registry metadata + the `latest` dist-tag but
the `.tgz` blob did not upload (a broken/interrupted publish), so
`npm i create-byan-agent@latest` returned a 404 on install. npm does not allow
overwriting an existing version, so 2.29.1 republishes the exact 2.29.0 content
(the RTK token optimizer + OKF format adoption — no code change) with a clean
tarball. Stopgap until 2.29.1 is live:
`npm dist-tag add create-byan-agent@2.28.0 latest`.

## [2.29.0] - 2026-06-23

### Added - Native opt-in RTK token optimizer (rtk-ai/rtk)

- The yanstaller now offers RTK ("Rust Token Killer", Apache-2.0) during install:
  a single zero-dep binary that compresses dev-command output before the LLM
  context (-60/90% tokens) and wires into Claude Code via its own hook.
- Integration is thin and delegating (`install/lib/rtk-integration.js` +
  `native-helper.js`): the install is handed to rtk's own canonical installer
  (brew / `cargo --tag v0.42.4` / the pinned `install.sh`, which passes
  `RTK_VERSION` so the downloaded binary is pinned too), and the hook wiring to
  rtk's own `rtk init -g`. No bespoke per-OS download/checksum logic.
- Opt-in and safe: the prompt defaults to NO and discloses the install mechanism
  and the global hook; gated on a TTY + an available installer; opt out with
  `BYAN_SKIP_RTK=1`. Every failure path is a graceful no-op that leaves the BYAN
  install intact. Retry anytime with `npm run setup-rtk`. 25 unit tests.

### Added - Open Knowledge Format (OKF v0.1) adoption for the knowledge base

- BYAN's knowledge is now interoperable with the Open Knowledge Format
  (GoogleCloudPlatform/knowledge-catalog) — markdown + YAML frontmatter, vendor-
  neutral, zero runtime deps. Only the FORMAT is adopted; the GCP reference agent
  (Python + BigQuery/Gemini) is deliberately left out (not vendored).
- `lib/okf-format.js` (parse/serialize/validate frontmatter + BYAN type mapping)
  and `lib/okf-bundle.js` (pure, idempotent converter). `byan-okf build` emits a
  normalized OKF bundle to the gitignored `_byan-output/okf-bundle/` (NON-
  destructive — it leaves `_byan/connaissance` untouched); `byan-okf check`
  validates a bundle. 24 unit tests; a real build over the 43 knowledge files
  yields 41 valid OKF entries. The optional GCP enrichment bridge is parked as a
  phase-2 follow-on.

## [2.28.0] - 2026-06-23

### Added - Advisory model-tiering lint for native workflows

- `workflows-lint.js` gains `untieredExplorationViolations`: a NON-blocking
  advisory (surfaced by `byan-lint-workflows.js --advise`, plus a one-line
  summary on every run) that flags an exploration-labelled `agent()` leaf in a
  `.claude/workflows/*.js` script which runs on the session model instead of
  downgrading to `haiku` (a possible token saving). It reuses `classifyLeaf` /
  `isDowngradeModel` from `native-tiers.js` (single source of truth).
- It is DELIBERATELY out of `validateContract`: the anti-downgrade floor stays a
  hard rule, but forcing `haiku` onto a judgment-bearing leaf (a gate, a
  classification, an exact conversion consumed verbatim downstream) would be a
  STRICT-2 regression, so the per-leaf deep-vs-cheap call stays with the author.
- There is no per-leaf "effort" knob in the native `agent()` / Agent API (it
  exposes only `model`), so effort-by-complexity reduces to model-by-complexity.
  Documented in `native-workflows.md`, the SKILL DISPATCH section, and
  `docs/native-workflows-contract.md`.

### Changed - `.mcp.json` tests realigned to the portable-config design

- Five test suites still asserted the pre-portable `.mcp.json` shape
  (`env.BYAN_API_URL` present) and failed after 2.27.0. Realigned them to the
  portable invariant: the `byan` entry is present but carries no `BYAN_API_URL`
  and no token (the server self-resolves its config). Security invariants are
  unchanged: the no-token assertions and `verify`'s raw-token / `/api`-suffix
  drift detection remain. Full suite back to green (2326/2326).

## [2.27.0] - 2026-06-19

### Fixed - Portable MCP config: the server resolves its own credentials

The byan MCP server now resolves its config (`BYAN_API_URL` / `BYAN_API_TOKEN`
and the Leantime pair) instead of depending on `.mcp.json` `${...}` expansion,
which silently passed a literal `"${BYAN_API_URL}"` to the server when the
launcher could not expand it — breaking every byan_web call (projects/memory/
strict sync). This makes the MCP portable across zsh/fish/bash x Linux/Windows/
macOS and covers Claude Code AND Codex with one mechanism.

- `_byan/mcp/byan-mcp-server/lib/resolve-config.js` (new): per-key precedence
  `process.env -> ~/.byan/credentials.json -> localhost default`. An unexpanded
  `${...}` env value is treated as ABSENT (so a stale `.mcp.json` no longer
  poisons the config), and a missing/invalid credentials file degrades to
  defaults rather than throwing at boot. `server.js` wires it and backfills
  `process.env` so downstream readers (Leantime) see the resolved values.
- The yanstaller now writes a global, gitignored, chmod-600
  `~/.byan/credentials.json` (`byan-platform-config`'s new `credentials.js`,
  wired into `setupByanWebIntegration`) — one file for all the user's projects,
  via `os.homedir()` so it is truly cross-OS with no shell-profile editing.
- `.mcp.json` no longer carries byan config env: the template drops the `env`
  block and `mergeByanEntry` stops writing `BYAN_API_URL` (and repairs a stale
  entry by stripping any `BYAN_API_URL`/`BYAN_API_TOKEN` it carried). The token
  stays out of `.mcp.json` (it lives only in the gitignored credentials file
  and .env / settings.local.json).
- Precedence summary for operators: a real `BYAN_API_URL` env var still wins
  (prod sidecar / Docker / CI unaffected); the global credentials file is the
  local-dev fallback; `http://localhost:3737` is the last resort.
- Reviewed by Quinn + `bmad-compliance` (security domain): a TOCTOU on the
  credentials file (write-then-chmod exposed the token at 0644 for a window)
  was fixed by creating the file at mode 0600 directly, with a regression test.
- Tests: `resolve-config` (8) + `credentials` (8, incl. the TOCTOU + overwrite
  cases) + the realigned `mcp-config` suite; connector suite 635/635 green.

### Added - OAuth 2.1 per-member identity for the Claude Team org connector

The remote connector now carries per-member identity through OAuth 2.1
(authorization-code + PKCE S256), so a single Claude.ai Team org connector
authenticates each member as themselves. This is the only per-member path: a
Claude.ai org connector sends no custom auth header and has no per-member token
passthrough, so the API-key-paste channel (kept as a fallback) cannot identify
members on its own.

- Connector (`server-http.js`) becomes an OAuth protected resource (RFC 9728):
  serves `/.well-known/oauth-protected-resource` (+ the path-suffixed `/mcp`
  variant) advertising the byan_web authorization server, and validates every
  caller's Bearer per-request against byan_web `/api/auth/me` (loopback) BEFORE
  any tool runs — fail-closed on non-2xx, network error, or timeout. An
  unauthenticated `/mcp` hit returns `401` with
  `WWW-Authenticate: Bearer resource_metadata=...` to bootstrap the flow.
  `BYAN_OAUTH_ISSUER` (falls back to `BYAN_API_URL`) and
  `BYAN_MCP_BEARER_TIMEOUT_MS` configure it.
- byan_web (separate repo, committed on its own branch) gains the authorization
  server: `/.well-known/oauth-authorization-server`, `/authorize` (auto-consent
  from the Authentik SSO session), `/token` (PKCE S256, `application/x-www-form-urlencoded`,
  short-TTL revocable `byan_` access token), and the single-use `oauth_codes`
  table. The shared JSON body parser is untouched (Content-Type gating).
- `docs/oauth-connector.md`: the OAuth runbook — env vars, the proposed Traefik
  host-split diff (`/authorize` via forwardauth, `/token` + well-known via
  strip-trust), and the one-member pilot procedure with the five Claude.ai
  behaviors to live-verify.
- Reviewed by Quinn (qualitative) and `bmad-compliance` (adversarial, security
  domain): a loopback `redirect_uri` hardening (reject userinfo/query/fragment)
  and RFC 6749 §5.1 token-response cache headers were applied and re-verified
  with no residual bypass.
- Deferred, documented (not silently cut): Dynamic Client Registration
  (pre-registered `claude-ai` client id), refresh tokens (~1h re-auth),
  server-side `connector:read` scope enforcement (carried RBAC gap; TTL +
  revocation bound the blast radius), and `/token` rate-limiting.
- Operator-owned to go live: deploy, the Traefik host-split, the Claude.ai org
  connector registration, and the pilot.

### Added - Remote MCP connector enabling layer (BYAN native to Claude Team)

The MCP server can now serve a remote HTTP transport so BYAN can be added as a
Claude.ai Team Org Connector (which also syncs down to Claude Code), without
changing the local stdio path.

- `createByanServer({ token, remoteOnly })` factory extracted from `server.js`;
  the stdio entrypoint is guarded so importing the module no longer grabs stdio.
- `server-http.js`: a stateless streamable-HTTP transport on `/mcp` (+ `/health`),
  built on the bundled SDK transport (no new dependency). Streamable-HTTP carries
  the SSE streaming leg itself, so no separate legacy `/sse` endpoint is mounted.
- Per-request identity: the caller's token is read from each request's
  `Authorization` header and threaded through the byan_web calls (the module-global
  token becomes the local stdio fallback), so concurrent Team members reach
  byan_web with their own token instead of a shared one.
- Remote-safe surface: `remoteOnly` exposes only `REMOTE_SAFE_TOOLS`, a read-only
  byan_web-backed allowlist; filesystem-local / stateful / write tools stay
  stdio-only and are refused over the remote transport. `bin/byan-lint-remote-safe.js`
  (wired into pre-commit) guards the allowlist.
- Skill bundles: `bin/byan-build-skill-bundles.js` packages each `.claude/skills`
  SKILL.md as its own `.zip` into `dist/skill-bundles/` (zero-dep stored ZIP) — one
  archive per skill, shaped as a single top-level folder + SKILL.md, which is what
  Claude.ai org Skills accepts (a flat SKILL.md or a multi-skill archive is
  rejected). `skill-bundles-manifest.json` is the tracked drift ledger with a
  `--check` pre-commit gate.
- Tests: per-request auth isolation (two tokens reach byan_web with distinct
  headers), remote-surface filtering, and the skill bundler.
- Admin runbook: `docs/connector-admin-runbook.md`. The byan_web hosting track it
  depended on is now built (see the next entry); a true OAuth flow remains deferred.
  Projects/Artifacts have no external API so byan_web stays the state authority.

### Added - Remote connector hosting layer (byan_web sidecar + per-member enrollment)

The cross-repo byan_web track the enabling layer depended on is now built: the
connector runs as a hosted sidecar and each Claude Team member enrolls with their
own byan_web key.

- Sidecar image: `_byan/mcp/byan-mcp-server/Dockerfile` (node:22-slim + tini PID1,
  `npm ci --omit=dev`, `CMD node server-http.js`, wget-backed HEALTHCHECK on
  `/health`) plus a `.dockerignore`. byan_web references the image by tag and does
  not build the connector source (anti-vendoring boundary).
- Startup guard: `assertNoAmbientToken` fails the connector boot if `BYAN_API_TOKEN`
  is present, so a sidecar carries per-request identity only (defense-in-depth on
  top of `resolveCallerToken`, which ignores the env token in remote mode).
- Per-member enrollment (byan_web repo): `POST /api/connector/link` mints a personal
  `byan_` key (idempotent per user, raw returned once, sha256-at-rest, 90-day TTL)
  that the member pastes into the Claude.ai connector config. The minted key is a
  full-capability byan_web credential whose read-only behaviour is enforced at the
  MCP transport only, so it must be treated as a secret. byan_web changes:
  `routes/connector-link.js` + test, the `byan-mcp-connector` compose service, and a
  `byan-mcp.<domain>` Traefik route reusing `byan-strip-trust` with no SSO forwardauth.
- Connector smoke test (`/health` 200, import without binding a port), kept on the
  BYAN side so byan_web CI stays PostgreSQL-free.
- Runbook expanded: the hosting build, the per-member enrollment flow, the
  one-member 48h pilot gate, the security invariants, and the operator-only steps
  (DNS, image build, compose up, Claude.ai registration) that remain manual.

### Added - Leantime opt-in block in the installer (yanstaller)

`npx create-byan-agent` now offers an optional, opt-in Leantime board
connection (after the byan_web step, Claude Code targets only; defaults to no).
When accepted it prompts for the backend URL (with the wrong-host warning), the
`lt_` API key (masked), and an optional user id, then writes the vars to
`.claude/settings.local.json` + `.env` (both gitignored), adds the
`${LEANTIME_API_URL}` / `${LEANTIME_API_TOKEN}` references to the `byan` entry in
`.mcp.json` (references only, the secret stays out of tracked files), and runs a
reachability probe that flags the wrong-host case (`non_json`) at install time.

The Leantime token is per-instance: each user configures their own instance and
key, so it is not shared across installs. Mirrors the existing byan_web block and
reuses the shared `byan-platform-config` secret-writing primitives. New
`promptForLeantime` / `LEANTIME_ENV_KEYS` (token-prompt), `mergeLeantimeRefs` /
`ensureLeantimeRefs` (mcp-config), `validateLeantimeReachability` (validate), and
the `install/lib/byan-leantime-integration.js` wrapper. Scoped to
create-byan-agent; update-byan-agent parity is a follow-up.

## [2.26.0] - 2026-06-16

### Added - Leantime FD auto-sync hook (FD lifecycle -> board, automatic)

The FD -> Leantime mirror is now AUTOMATIC. A `PostToolUse` hook
(`.claude/hooks/leantime-fd-sync.js`, registered in `.claude/settings.json`) fires
after `byan_fd_advance` / `byan_fd_update` and drives the board with no agent
action: it ensures the project at DISCOVERY, creates one task per backlog feature
at DISPATCH, and moves tasks through `todo -> doing -> blocked/review -> done` as
the FD advances. This supersedes the hand-driven section 2.5 fire points (which
the agent had to run by hand and could skip).

- **Pure core** (`_byan/mcp/byan-mcp-server/lib/leantime-fd-core.js`):
  `decideActions` maps a phase transition + the sidecar to ordered Leantime
  intents; unit-tested for every transition. The hook is a thin I/O shell that
  executes them.
- **Best-effort + bounded**: the hook exits 0 in every path (a sync issue does
  not block the turn), no-ops when Leantime is off, self-heals a dropped call on
  the next phase event (a per-call timeout + a hook wall-clock budget), and logs
  every attempt to `.byan-leantime/sync.jsonl`.
- **Idempotence**: a gitignored sidecar (`.byan-leantime/map.json`, keyed by
  fd_id) is the single id ledger — a REFACTOR loop re-builds without duplicating a
  project or task. The hook does not write `fd-state.json` (state-coupling).
- **Human visibility** (`assignUserToProject` + `LEANTIME_ASSIGN_USER_ID`): an
  API-created project is owned by the API service user and hidden from a person's
  project selector; the hook relates the configured human so the board shows up.
  The underlying Leantime RPC reconciles a user's whole project list, so the
  assign reads the full list first and writes the union (fail-closed if that read
  is incomplete) to avoid unassigning the user's other projects.

### Added - Leantime project-management integration (one-way FD -> board)

BYAN can now mirror its Feature Development lifecycle onto a self-hosted Leantime
instance. When `LEANTIME_API_URL` + `LEANTIME_API_TOKEN` are configured, the FD
phases drive a Leantime project and one task per backlog feature ; when absent,
the tools report disabled and FD proceeds unchanged. The sync is one direction
(FD -> Leantime) and best-effort : a down or misconfigured Leantime degrades to
`{ synced:false, reason }` and does not block a phase transition.

- **Client** (`_byan/mcp/byan-mcp-server/lib/leantime-sync.js`): a JSON-RPC 2.0
  client for `<base>/api/jsonrpc`, authenticated by the Leantime-native
  `x-api-key` header (kept distinct from the byan_web `ApiKey/Bearer` scheme).
  Best-effort and does not throw, with an `AbortController` timeout and a
  non-JSON-200 guard that rejects an HTML login body (the wrong-host lesson)
  instead of reading it as an empty board. Business fns: `ensureProject`
  (idempotent by name), `createTask`, `moveTask`, `assignTask`, `getTask`,
  `getBoard`, plus `resolveStatusMap` / `resolveClientId` / `resolveEditorId`.
- **MCP tools** (7): `byan_leantime_ping`, `byan_leantime_project_ensure`,
  `byan_leantime_task_create`, `byan_leantime_task_move`,
  `byan_leantime_task_assign`, `byan_leantime_task_get`,
  `byan_leantime_board_get`. All but `ping` pass through `requireLeantime()`.
- **FD wiring** (`.claude/skills/byan-byan/SKILL.md` section 2.5): fire points
  DISCOVERY -> project_ensure, DISPATCH -> task_create per feature, BUILD ->
  doing, REVIEW/VALIDATE-KO -> blocked, VALIDATE-OK -> review, DOC -> done.
  Leantime ids persist into fd-state (`project_context.leantime.projectId`,
  backlog `leantime.taskId`) so a REFACTOR loop reuses tasks instead of
  duplicating them.
- **Status mapping**: the canonical FD columns (`todo|doing|blocked|review|done`)
  resolve to per-project Leantime status ids at call time, with a conservative
  fallback when the labels cannot be read.
- **Tests**: `test/leantime-sync.test.js` (14 cases: auth header, non-JSON guard,
  timeout, idempotence, column resolution) + `test/leantime-tools.test.js`
  (the 7-tool declaration/handler surface in server.js).
- **Docs**: `.claude/rules/byan-api.md` section 8 (the `byan_leantime_*` family +
  the wrong-host lesson).
- **Pending**: the live wire-format verification (one real POST with a Leantime
  PAT, to confirm `params:{values:{}}` wrapping against the running instance) is
  a documented follow-up ; the tested format follows the Leantime master source.

### Removed - GitHub Copilot CLI + VSCode dropped as target platforms (3 -> 2)

BYAN now targets two platforms: Claude Code and Codex. GitHub Copilot CLI and
the VSCode extension are no longer install targets. This is a breaking change for
anyone who relied on the Copilot/VSCode output.

- **Install path** (`npx create-byan-agent`): the platform menu, auto-select, and
  generated stubs cover Claude Code + Codex only. The `byan_copilot_*` MCP tool
  family and the `marc` Copilot-oriented agent were removed in the core pass
  (commit `0f06cf8`).
- **Web UI** (ships on npm via `install/src/webui`): the chat CLI selector, the
  `cli-detector` definitions, the platform-detection list, and the marketing copy
  drop Copilot and VSCode; the `copilot-adapter` bridge and its `createBridge`
  case are gone (`createBridge('copilot')` now rejects with `Unknown CLI adapter`).
- **Dead code**: both shipped copies of the orphaned `copilot-context` module
  (`src/byan-v2/context/` and `install/src/byan-v2/context/`) and two stale
  non-jest harnesses (`test-byan-v2-workflow.js`, `test-workflow-simple.js`) were
  deleted.
- **Note**: the `byan-loadbalancer` Copilot *provider* (an LLM backend, not an
  install target) is unaffected and stays.

### Added - Auto-Benchmark: native sourced decision benchmarks (C1-C5)

When the agent is about to ask you to choose between options, it now benchmarks
the fork by default: one compact `Option | criteria | Niv` table with a best-first
recommendation, sourced and confidence-tagged, at the right level of detail — so
you no longer have to ask each time. Two layers cover this honestly (Claude Code
exposes no pre-display interception hook today, GH #28273):

- **Proactive doctrine** (the broadly-portable layer). The full doctrine lives in
  `.claude/rules/benchmark.md`, generated from the single source of truth
  `_byan/_config/autobench.yaml` by `byan-sync-rules`, and a lean pointer is
  upserted cross-platform into `.claude/CLAUDE.md`, `AGENTS.md`, and
  `.github/copilot-instructions.md` (idempotent `BYAN-AUTOBENCH` markers). It
  covers the TRIGGER 2-gate rule (>= 2 non-substitutable options diverging on
  >= 1 weighted criterion) + the exemption list (y/n confirms, destructive
  prompts) + internal/external routing + a verbatim few-shot decision tree, the
  SCALER 5-level evidence rubric + strict-domain floors + the link-only-if-WebFetch
  rule, the FORMAT compact table with hard caps (<= 4 options / <= 4 criteria /
  <= 3 links) + collapse-the-degenerate + `[bench:expand]` opt-in, and the
  ANTI-BLOAT latency guard + escape-hatch + no-re-benchmark.
- **Reactive Stop hook** (`.claude/hooks/autobench-stop-guard.js`), the safety
  net. It **ships DISARMED**: it observes and ledgers every turn but stays inert
  (does not block) until you opt in — set `enforcement.armed: true` in
  `_byan/_config/autobench.yaml` and run `byan-sync-rules` (config-only; there is
  no loose flag file) — so day one is zero noise / zero latency.
  Detection is **artifact-primary**: a real fork is recognized from an
  `AskUserQuestion` tool_use in the finished turn, with the choice-language regex
  as a last-resort fallback. Block-once is content-hashed (no loop); a session
  escape-hatch (`touch .byan-autobench/off`) plus a cross-session toggle suppress
  it.
- **Tooling.** A `byan-benchmark` skill (conductor) and a DATA-only native
  workflow (`.claude/workflows/byan-benchmark.js`), both registered in the
  workflow manifest / PORTABLE bucket / INDEX. A BYAN-only opt-in layer enriches
  the matrix via `byan_fc_check`. Every fire/miss is audited to
  `_byan-output/benchmark-ledger.jsonl`.

### Added - byan-install-core (F1): headless, deterministic install engine

First feature of the installer refactor (FD lot 1). A new internal workspace
package `byan-install-core` (`install/packages/install-core/`) that replaces the
LLM-driven AUTO interview with a deterministic engine. It is the shared core both
front-ends bind to: the npm CLI wizard (F2, next) and the Electron app (F5).

- **Four-verb lifecycle.** `detect(opts)` builds a serializable MachineProfile
  (os, arch, node, npm, git, claude, codex) and is spawn-free by default
  (`probeVersions` is opt-in). `plan(profile, answers)` is pure and turns the
  non-interactive answers contract into an ordered InstallPlan. `apply(plan, opts)`
  is the only mutator. `verify(plan|target)` is read-only.
- **No LLM, no `which`.** Detection uses a pure-Node PATH walk (`lookpath`,
  honoring Windows PATHEXT); recommendations come from a versioned JSON decision
  table (`data/recommender.json`), not a model call.
- **Per-OS env + validate-or-die .mcp.json.** `env-writer` and `mcp-renderer`
  reuse the existing `byan-platform-config` package (idempotent marker blocks;
  a config is parsed and validated before any write, so a broken file is not
  emitted on an invalid input).
- **Per-user install, no sudo.** `--install-cli claude|codex` installs via
  `npm -g`; the AUTH step is an explicit handoff (the engine returns the manual
  command and reports a pending state rather than a fake authenticated success).
- **ES5 preflight.** `byan-install-core/preflight` is a dependency-free, ES5-only
  entry a launcher can require on an ancient Node to gate the version before any
  modern module loads.
- Tests: 9 suites / 161 tests for the package; full repo suite green
  (no regression). The CLI wizard, `doctor`, journal/resume and the v2.19
  `--yes` end-to-end snapshot land in the following features (F2, F3).

## [2.25.0] - 2026-06-09

### Added - Advisory auto-feed (BYAN learns from each session, automatically)

The insight loop observed and proposed; the missing half was the LEARNING. BYAN's
advisory ledgers (ELO trust, the suitability ledger) updated only when the agent
remembered to call a record tool. This wires the automatic half — outcomes are
recorded at end of turn, with no agent action — while behavior surfaces stay
human-gated.

- **Capture.** The `byan_outcome_log` MCP tool appends one validated advisory
  outcome to a buffer (cheap; it does not write a ledger directly). kind=elo logs
  `{domain, result}`; kind=suitability logs `{model, leafId, success}`.
- **Drain.** `.claude/hooks/drain-advisory.js` is a Stop hook that, at end of each
  turn, records the buffered outcomes into the ELO ledger (full Glicko update) and
  the suitability ledger, advancing a line cursor for idempotency. It is strictly
  non-blocking (all work in try/catch, emits `{continue:true}` and exit 0 on every
  path) and crosses the ESM/CJS boundary (the CJS ELO engine via require, the ESM
  suitability store via dynamic import).
- **Advisory-only.** The loop writes only the buffer and the two advisory ledgers.
  Behavior surfaces (routing, personas, mantra thresholds) are left untouched —
  those stay a human decision, consistent with the insight loop's gated philosophy.
- 71 tests (the pure planners, the buffer, and a drain-hook e2e with ledger
  snapshot/restore) plus a live smoke test recording a real Glicko update. The tool
  and hook ship in the template; the hook registers alongside the existing Stop
  hooks.
- Explicit follow-ups (out of this scope): the adversarial verdict panel that would
  feed suitability without a manual log, and a fact-graph-derived ELO source.

## [2.24.0] - 2026-06-09

### Added - Session insight loop (gated self-improvement)

BYAN already has advisory learning surfaces (ELO trust, the suitability ledger)
and the native Claude Code hooks already leave outcome trails on disk, but the
loop was open: the agent had to read and act on them by hand. This closes it,
under a strict gated philosophy.

- **Harvester** `_byan/mcp/byan-mcp-server/lib/insight-harvest.js` +
  `bin/byan-insight-digest.js` + the `byan_insight_digest` MCP tool: read the
  native trails (`tool-log.jsonl` health, strict `audit.log` recurring gaps,
  the suitability ledger routing outcomes, the ELO profile trends) and aggregate
  them into a digest with conservative, GATED proposals. Pure aggregation +
  IO-isolated reader, mirroring the template-fidelity pattern.
- **Gated by design.** The harvester only READS; it writes nothing to a behavior
  surface (routing, personas, mantra thresholds). Every proposal carries
  `gated: true` and is surfaced for a human to ratify — an agent that rewrote its
  own routing on a heuristic would be the silent-downgrade BYAN exists to prevent.
- **Skill** `byan-insight` presents the digest as a gated improvement proposal
  (observe, propose, human ratifies), consistent with the advisory ELO /
  suitability doctrine.
- **Guard false-positive fix.** `tool-failure-guard` flagged any tool whose result
  echoed the literal phrase "internal error" as a failure, exempting only
  Write/Edit/Read. Bash (diagnostic stdout) and MCP tools (echoed stored data) now
  join the echo-heavy set: their `is_error` flag is trusted, content patterns are
  not. A genuine failure still sets `is_error`. Caught live (a Bash log-grep
  blocked the session twice) and covered by unit + e2e tests.
- 43 harvester unit tests + the detector tests; the e2e guard tests moved their
  content-pattern cases onto a non-echo tool. The tool and skill ship in the
  template.

### Changed - Closed the fused-route and output-folder legacy debts

- Removed the dead parallel router `src/core/dispatcher/execution-router.js` (zero
  live consumers) and its test; the routing docs (`workers.md`,
  `feature-workflow.md`) and the loadbalancer architecture comment now point only
  to `byan_dispatch` and its two-axis model (strategy from score, model tier from
  nature).
- Standardized the documented output folder from the legacy `_bmad-output/` to the
  runtime's `_byan-output/` across the agent and platform docs plus an inert config
  default. Left untouched on purpose: the deliberate back-compat read in
  `agent-packager.js` (recovers agent creations from older installs under
  `_bmad-output/bmb-creations`), the migration guides, and the anti-regression
  tests that assert the old name is gone.

## [2.23.0] - 2026-06-09

### Added - Stub path normalizer + a 5th pre-commit gate (no _bmad/@bmad drift)

The installer generated platform stubs (`.codex/prompts`, `.github/agents`,
`.claude/skills`) across many versions; older generators wrote the legacy path
layout (`_bmad/*/agents/X.md`, `@bmad/bmm/agents/X.md`,
`@bmad-output/bmb-creations/X/X.md`), so the tracked corpus carried a mix of stale
path forms while the agent source files stayed clean. This adds the mechanism that
removes the drift and blocks its return.

- **Tool** `_byan/mcp/byan-mcp-server/lib/stub-sync.js` + `bin/byan-sync-stubs.js`:
  normalizes stale `_bmad/` and `@bmad/` PATH tokens to the `_byan/` canonical
  layout, in place and surgically. The `@bmad-<word>` invocation syntax and the
  `_bmad-output/` artifact dir are preserved; no stub is overwritten wholesale, so
  the github full-copies and hand-authored skills keep their content. `--check`
  reports any residual stale ref and exits non-zero.
- **5th pre-commit gate.** `.githooks/pre-commit` runs `byan-sync-stubs --check`
  after the template-fidelity gate, blocking a commit whose tracked stubs have
  drifted. It self-disables when the tool or the stub dirs are absent
  (installed-user no-op).
- **First run.** 101 stub files normalized (codex prompts + the Codex global
  `instructions.md` + 5 github stubs + their template twins); the byan github
  full-copy changed only its 3 stale path lines, its other 1059 lines untouched.
- Design mirrors the template-fidelity sync (pure rewrite rules + IO-isolated
  apply); 20 unit tests pin every rule, the two preservation cases, the IO layer,
  and idempotence. The tool ships in the template, so the gate is live for
  installed users too.

## [2.22.0] - 2026-06-09

### Changed - byan_dispatch routes the model tier by task nature, not by size

`byan_dispatch` fused two unrelated decisions into one route string
(`mcp-worker-haiku`, `main-thread-opus`): a short sequential task was downgraded
to haiku purely on its length, and a long one was pinned up to opus. That is the
size-driven mis-tiering the native-workflow doctrine (`native-tiers.js`) was built
to forbid, so the two routers disagreed. This decouples the two axes and makes
`native-tiers.js` the single source of truth for the model tier across both worlds.

- **Two independent axes.** `dispatch.js` now returns
  `{ score, strategy, nature, tier, model, parallelizable, reasoning }`. STRATEGY
  (where the work runs: `main-thread` / `agent-subagent-worktree` / `mcp-worker`)
  stays derived from the scalar score + `parallelizable`. TIER (which model) is
  derived from the task NATURE, decoupled from size.
- **One source of truth.** `dispatch.js` imports `classifyLeaf` / `tierFor` /
  `TIER_MODEL` directly from `native-tiers.js` — a one-way dependency toward the
  tier authority rather than a duplicated rule. Only an `exploration` nature
  downgrades to `haiku`; `implementation` / `verification` / `analysis` (and any
  unmatched task) stay `deep` (inherit the session model). No pin-up to opus.
- **Conservative by default.** An optional `nature` arg sets the tier directly;
  absent or invalid, the task text is classified, whose own default is
  `implementation` (deep) — so a miss protects the work instead of downgrading it.
- **Consumers realigned.** The `byan_dispatch` tool schema gains an optional
  `nature` enum; the three consuming skills (byan-byan Phase 4, byan-hermes-dispatch
  step 3, byan-orchestrate) read `strategy` + `model` from the new shape. The
  fused-route strings are dropped from the live routing path.
- 22 dispatch unit tests pin the contract (no downgrade for protected natures,
  exploration to haiku, no pin-up, conservative fallback, strategy preserved across
  the score bands) plus the hermes-e2e non-regression. Template re-synced.

### Known debt

The legacy fused-route vocabulary (`mcp-worker-haiku` / `main-thread-opus`) still
appears in two doctrine docs (`_byan/worker/workers.md`,
`_byan/workflow/simple/byan/feature-workflow.md`) and a dead, unreferenced parallel
router (`src/core/dispatcher/execution-router.js` + its test). These have no live
consumer and are scoped to a follow-up cleanup.

## [2.21.0] - 2026-06-08

### Added - Template fidelity sync (the published package matches its CHANGELOG)

Only `install/templates/` ships on npm (`package.json` `files[]`), but the dev
code lives at root `_byan/` and `.claude/`. With no mechanism to mirror root into
the template, the template had drifted: 81 stale files had accumulated across
several chantiers, so the routing and ledger work below existed at root yet was
absent from the package a user would install. This adds the missing mechanism and
re-aligns the template.

- **Sync tool** `_byan/mcp/byan-mcp-server/lib/template-sync.js` +
  `bin/byan-sync-template.js`: re-syncs every file already in the template from its
  root twin, adds an explicit target list, and excludes runtime seeds
  (`_byan/memoire/**`). The mirrored perimeter is the template itself rather than a
  walk of root, so dev-only files do not leak into the package. `--check` reports
  drift and exits non-zero without writing.
- **First-run result.** 79 stale files re-synced and the 7 missing routing/ledger
  artifacts added, so the shipped `server.js` registers the `byan_suitability`
  tools and the downgraded workflows ship as intended. Runtime seeds left
  untouched.
- **Anti-recidive gate.** A fourth pre-commit gate runs `byan-sync-template.js
  --check` and blocks a commit whose template has drifted from root. It is a no-op
  for an installed user (the tool is dev-only, so the gate self-disables there).
- 19 unit tests: idempotence, exclusion of runtime seeds, drift detection,
  atomic-copy rollback, and perimeter tightness. Guide in
  `docs/template-fidelity.md`.

### Added - Model routing for native workflows (tier the leaves, keep heavy ones inherited)

The 20 native-workflow scripts (`.claude/workflows/*.js`) all ran every `agent()`
leaf on the session model (Opus by default): the read-the-file leaf paid the same
tier as the implement-and-verify leaf. This wires BYAN's complexity doctrine into
the Workflow tool's `opts.model` lever, conservatively.

- **Single source of truth** `_byan/mcp/byan-mcp-server/lib/native-tiers.js`: the
  tier vocabulary (`cheap`/`balanced`/`deep`), a label-driven leaf classifier, and
  the model map. `deep` is an OMISSION (inherit the session model), not a pin — we
  only ever route DOWN, and only exploration leaves.
- **Anti-downgrade guard** in `workflows-lint.js` (`modelRoutingViolations`),
  folded into `validateContract`, so `byan-lint-workflows` and the pre-commit gate
  reject any protected (implement/verify/analysis) leaf carrying a downgrade or any
  unknown model literal.
- **Conservative application.** Of 19 exploration-labelled leaves, only 5 are
  downgraded to `haiku` (`dev-story:load-story` + the 4 excalidraw
  `load-resources`). An adversarial review pass (3 skeptics) caught 4 candidates
  whose output feeds a downstream gate/score without a re-read
  (`document-discovery`, `parse-epics`, the two `discover-tests`); those were
  reverted to `deep`.
- **Regression guard** `test/native-routing-integration.test.js` pins the invariant
  on the shipped scripts. Contract documented in `docs/native-workflows-contract.md`.

### Added - Model-suitability ledger (advisory learning layer above the routing floor)

The static routing floor does not widen itself. The suitability ledger learns,
per `(model x leaf)`, whether a cheap model proved adequate, and advises keep /
watch / demote — above the floor, with a human deciding. It does not edit routing
and the linter floor stays the hard gate.

- **Math** `_byan/mcp/byan-mcp-server/lib/suitability.js`: a Beta-Bernoulli
  posterior, pure and deterministic (no clock/RNG/IO). The verdict reads the
  credible LOWER bound, so a thin sample stays `watch` (a high mean over 3 runs
  is not `keep-cheap`); `keep-cheap` needs roughly 30 clean outcomes.
- **Store** `lib/suitability-store.js`: the sole write path, atomic tmp+rename,
  best-effort no-op that does not throw or corrupt the ledger on a failed write.
- **Feeder** `lib/suitability-feeder.js`: maps an adversarial-panel verdict to a
  binary outcome (at least half refute = flagged).
- **MCP tools** `byan_suitability_record` / `byan_suitability_report`, **CLI**
  `bin/byan-suitability.js` (read-only), and **skill** `byan-suitability` (the
  hybrid wiring: the script returns DATA, the skill records via MCP).
- 38 unit tests. Auto-promotion is deferred (phase 2) so a hot-hand streak cannot
  slip a downgrade past human review.

### Changed - Widened the safe-downgrade set (5 -> 11 leaves)

An adversarial panel (one skeptic per leaf, each asked to PROVE the leaf is
analysis) re-judged 6 deep exploration leaves whose output is re-read or
re-synthesized by a later Opus step. The 6 cleared as genuine reads and now run
on haiku, doubling the downgraded set:

- document-project: scan-existing-docs (renamed from existing-docs) and source-tree
- the four excalidraw context leaves: read-context (wireframe), read-requirements
  (flowchart), context-scan (dataflow), parse-spec-intent (diagram)

Five labels were honestly renamed so the deterministic classifier reads them as
exploration; a leaf the panel found to be genuine analysis would have stayed deep.
The 4 earlier reverts (document-discovery, parse-epics, the two discover-tests)
were re-checked with token net-math and stay deep: adding a re-read is net-negative
or marginal there. native-routing-integration.test.js floor raised 1 -> 11; the
panel verdicts seed the suitability ledger.

## [2.20.1] - 2026-06-04

### Fixed - Post-audit hotfix (adversarial self-audit of 2.20.0)

- **N2 skill crash guard.** The shipped `byan-mantra-audit` skill invoked
  `src/byan-v2/generation/mantra-audit.js` blindly; a generated / npm-installed
  project does not ship that runtime, so the skill crashed with MODULE_NOT_FOUND.
  The skill now checks for the runtime first and degrades with a clear message. The
  deeper installer bug (the v2 runtime is not delivered to generated projects today,
  so the mantra gate stays a silent no-op there) is tracked as a separate chantier;
  the pre-commit gate and Stop hook already self-guard rather than crash.
- **scope-resolver precedence collapse.** An all-invalid `mantra_scopes` frontmatter
  (e.g. a `sdlc-cod` typo) silently collapsed a persona to universal-only, weakening
  the anti-stub floor it feeds. It now falls through to the agent/module map when no
  named scope is valid; an explicit `[universal]` is still honored. Regression-tested.
- **CHANGELOG accuracy (2.20.0).** The CIS floor figures paired inconsistent
  before-baselines; corrected to a single univ-only baseline.
- **Dead mantras documented.** M8 is not the only zero-match mantra under the keyword
  validator: M1 (Un seul responsable), M6 (INVEST), M28 (Sprint review) also match
  0/12 of their sdlc-process personas. Flagged for a future keyword / coverage pass.

### Fixed - Full jest suite green (35 -> 0 failures, all legitimate)

A clean `npm install && npm test` surfaced 35 pre-existing failures across 12 suites
(none from the mantra work, proven by git). All fixed without weakening an assertion:

- **VoiceIntegration crash.** It called `this.logger.debug/warn`, which a minimal
  logger lacks, killing the jest worker (and cascading into system-integration and
  full-bmad). Hardened the consumer with a level-fallback shim, added the missing
  `Logger.debug`, crash-proofed the detached voice-init in index.js, added the
  `SessionState` get/set store it relied on, and removed an emoji from source.
- **Stale unit tests realigned.** active-listener (`confirmed` -> live `validated`)
  and glossary-builder (string -> the live `{reason, suggestions}` object API) were
  brought up to the shipped contract two integration suites already prove; assertions
  were tightened, not lowered.
- **node:test files de-conflicted from jest.** The `/api/*`, `fs-migration-hook` and
  `e2e-remote-import` suites run under `node --test`; jest's broad glob swept them up.
  Excluded via `testPathIgnorePatterns` (they keep their own runner).
- **Perf microbench stabilized.** The construction-overhead test measured 1ms
  scheduling jitter; replaced with an interleaved median-of-200 hrtime measurement
  and a 20ms absolute ceiling that still catches a real regression.
- **Hermetic env.** `jest.setup.js` strips ambient `BYAN_API_*` so staging/flush
  suites no longer pass or fail by accident depending on the dev/CI shell.
- **Installer feature implemented (FD 20260428).** `setupClaudeNative` now writes the
  `enabledMcpjsonServers` whitelist to `.claude/settings.local.json` (byan + accepted
  extensions, idempotent), strips `BYAN_API_TOKEN` from `.mcp.json` (template + code),
  and honors the caller's `apiUrl` (new `install/lib/settings-local.js`). The stale
  `e2e-install-update` test (asserting the pre-security token-in-.mcp.json contract)
  was removed; correct-contract coverage lives in migrate-mcp-config + post-install.e2e.

Result: 104 suites / 2039 tests green.

## [2.20.0] - 2026-06-04

### Changed - Mantra taxonomy v2: sdlc-ops split + creative family (corpus 64 -> 71)

The N2 embodiment audit surfaced two taxonomy biases. (1) sdlc-code conflated
code-craft with release/ops, so a dev agent was judged against release mantras it
never performs. (2) The corpus had no creative mantra, so the six CIS agents were
scored only against analytical principles that are the opposite of their craft.

- **sdlc-ops scope.** Six release/deploy mantras (M8 freeze, M16 semver, M17
  changelog, M18 env parity, M19 CI/CD, M20 rollback) move from sdlc-code to a new
  `sdlc-ops` scope. Deploy/ops agents (rachid, patnote, yanstaller, marc, codex,
  claude) gain it; dev/architect shed it (they craft, not release).
- **Creative family (7 mantras, CR-1..CR-7).** A new `creative` scope + category,
  derived from the real CIS personas: Diverge Before Converge (brainstorming),
  Anchor in the Human Need (design-thinking), Reframe to the Root Cause
  (problem-solving), Judge Ideas by New Value (innovation), Find the Authentic
  Story (storytelling), Serve the Audience's Attention (presentation), Prototype-
  Test-Pivot (iteration). The 6 CIS agents are now scored on their own craft.
- **scope-resolver** registers the two new scopes in `VALID_SCOPES` so they are
  not silently dropped at resolution (the design's own Zero-Trust blocker).
- **Corpus 64 -> 71.** metadata recomputed (scopes, categories, priorityLevels);
  the strict 12-mantra regime is byte-untouched. No-scope total tests updated to
  71; the all-five-scopes union test drops 60 -> 54 as the six ops mantras leave
  sdlc-code. Keyword lists were cleaned of over-broad signals per an adversarial
  review.

Measured (floor, univ-only baseline -> univ+creative): dev sheds ops (applicable
42 -> 36). The CIS agents are scored on their own craft, which shifts the floor by
relevance rather than uniformly: brainstorming-coach 45 -> 48, innovation-strategist
65 -> 59 (it matches fewer of its own creative mantras in vocabulary).

### Changed - Domain-aware mantra validator (Option C: N1 anti-stub floor + N2 embodiment audit)

The mantra compliance bar was an all-64 keyword-density proxy with an 80% gate
that focused personas did not reach (measured median 11%, 0 of 120 gated files at
>= 80%): it implicitly graded each agent as a software-delivery agent, so a UX or
storyteller persona was failed for missing Scrum/Merise vocabulary. The gate
stayed green only through broad exemptions, masking the mis-fit. This reworks the
metric to score each persona only against the mantras that apply to it.

- **Taxonomy.** Each of the 64 mantras carries a `scope`
  (`universal` | `sdlc-process` | `sdlc-code` | `sdlc-modeling` | `sdlc-test`) in
  `mantras.json`. The four runtime-enforced mantras (IA-1, IA-9, IA-21, IA-23,
  checked by hooks / fact-check rather than declared in a persona file) are
  flagged `behavioral` and excluded from persona-file scoring.
- **Domain-aware validator.** `validate(def, { scope })` scores only the
  applicable subset (universal + the persona's declared scope, behavioral
  excluded); `totalMantras` becomes the applicable count. With no scope it scores
  all 64 (legacy behavior preserved, existing tests untouched). A reusable
  `applicableMantras(scope)` is exposed. Score bands moved to single constants.
- **Per-agent scope resolution.** `scope-resolver.js` resolves a persona to its
  scope set, precedence explicit-frontmatter > per-agent map > module-derived >
  `universal`, with `universal` force-unioned. The map lives in
  `src/byan-v2/data/agent-scopes.json`.
- **Emoji-icon fix.** The no-emoji mantra (IA-23) excludes `icon="..."`
  frontmatter attributes from its scan (an icon glyph is display metadata, not
  pollution); a real emoji in the body is still caught.
- **Anti-stub floor, honestly named.** The pre-commit gate and Stop hook score the
  canonical Gen3 persona sources (`_byan/agent/<name>/<name>.md`) domain-aware at a
  floor of 30 (the real roster spans 34-73, median 50). It is an anti-stub /
  anti-zombie floor, not a deep quality bar.
- **N2 embodiment audit (out-of-band).** `src/byan-v2/generation/mantra-audit.js` (`prepare` /
  `score`) plus the `byan-mantra-audit` skill measure genuine embodiment via an
  LLM judge, kept out of the commit path (the judgment is semantic).
- **Bugs fixed in passing.** B1: the stale `install/templates/.githooks/pre-commit`
  mirror is re-synced (it lagged the source, missing the workflow-lint block). B2:
  the gate no longer targets empty legacy dirs (`_byan/agents`, `_byan/bmb/agents`),
  it targets the real sources. B3: the FD VALIDATE wording (SKILL, fd-phase-guard,
  feature-workflow, GUIDE) is realigned to the floor, no longer asserting an
  unreachable 80%. Config `categories` is revived as `scopes`.

New unit tests: scope filtering, behavioral exclusion, emoji-icon, scope-resolver,
N2 audit. Strict regime (12 mantras, byan-strict at 100%) untouched.

### Added - Native workflow bridge, Phase 1 (Hybrid: gate outside, engine inside)

BYAN workflows are LLM-interpreted and human-gated; Claude Code's in-CLI Workflow
tool runs a deterministic JS script with no in-run human gate. Phase 1 ports the
non-gated subset (autonomous + deterministic pipeline) to the native tool, while
the gated majority stays markdown by design. Scope is coupled to target: broad
coverage (gated workflows) would need the Agent SDK and is parked (Phase 2).

- **F1 — registry + dual-path resolver.** `byan-build-workflows`
  (`_byan/mcp/byan-mcp-server/bin/`, ESM, sibling to `byan-build-index`) reads
  the workflow manifest and writes `.claude/workflows/INDEX.md` idempotently
  (20 portable workflows: 11 autonomous + 9 pipeline). `resolveWorkflow(name)`
  prefers `.claude/workflows/<name>.js`, else falls back to the markdown workflow
  (Gen3-first dual-path).
- **F2 — pilot port `dev-story`.** `.claude/workflows/dev-story.js` runs the
  red-green-refactor loop as a JS `while` loop with a real 3-cycle convergence
  counter (replacing the doc-only "3 failures -> HALT" rule). The deterministic
  core lives in `lib/native-loop.js` (unit-tested) and is mirrored inline since
  the sandbox forbids imports. The script returns a structured verdict; the
  `byan-native-dev-story` skill owns the human gate and records state via MCP.
- **F3 — enforcement bridge.** `byan-lint-workflows` fails if a
  `.claude/workflows/*.js` imports/requires `lib/fd-state.js` (or the strict-mode
  lib); wired into `.githooks/pre-commit` since the in-session hooks do not fire
  inside a script. Contract documented in `docs/native-workflows-contract.md` and
  `.claude/rules/native-workflows.md`.

25 new unit tests (node --test). Mirrored into `install/templates/`.

- **F4 + F5 - the 19 remaining portable workflows ported.** Every autonomous
  (10: create-story, qa-automate, the 8 testarch-*) and pipeline (9:
  check-implementation-readiness, code-review, the 4 create-excalidraw-*,
  document-project, quick-dev, sprint-planning) workflow now has a faithful
  native `.claude/workflows/<name>.js` that mirrors its real source steps. Each
  keeps human gates OUT of the script (returns a structured verdict), uses no
  import/state-coupling/wall-clock/RNG, and passes `node --check` +
  `byan-lint-workflows`. `.claude/workflows/INDEX.md` now reports 20/20 native
  (11 autonomous + 9 pipeline). Mirrored into `install/templates/`.

- **F6 - native-workflow contract validator.** `byan-lint-workflows` now enforces
  the full contract on every `.claude/workflows/*.js`: no state coupling
  (comment-stripped), no wall-clock/RNG token anywhere in the raw text (the
  launch validator rejects those even in comments or strings - the exact failure
  a manual review caught while porting), a pure `export const meta` literal first,
  and `node --check` syntax. `validateContract()` is exported and unit-tested
  (clock-in-comment case included). Wired into the pre-commit gate. Speculative
  brainstorm items (golden-file LLM diff, dry-run mode, schema-first frontmatter)
  were dropped per Ockham.

### Fixed - hygiene debts surfaced while porting (F7)

- **Dispatch matrix doc realigned to code.** The DISPATCH table in
  `_byan/workflow/simple/byan/feature-workflow.md` advertised `<30 / 30-60 / >=60`
  (Worker/Sonnet/Opus) which did not match `byan_dispatch` / `lib/dispatch.js`
  (`main-thread <15` / `agent-subagent-worktree <40+parallel` / `mcp-worker-haiku
  <40` / `main-thread-opus >=40`). The doc now mirrors the code, the single
  source of truth.
- **Strict scope-guard mid-segment glob fixed.** `matchesPrefix` reduced a glob
  to the literal lead before the first wildcard and then forced a `/` boundary,
  so a mid-segment glob like `.claude/skills/byan-*/**` wrongly denied
  `.claude/skills/byan-native-dev-story/...`. It now matches mid-segment globs as
  a raw prefix while preserving the directory-boundary behavior (`_byan/**`
  matches `_byan/x` but not `_byanX`). Tested in `strict-hooks.test.js`.

Two related items were investigated and deliberately left unchanged: retargeting
the mantra pre-commit bar onto canonical Gen3 agent sources does not help (those
sources also score below the 80% keyword-density bar - `byan` 73%, `dev` 38% - so
the bar itself, not its target, is the open question, left as a policy decision);
and the "FD state pushed to byan_web" claim is absent from the repo (FD state is
pure-local by design; only strict mode pushes to byan_web), so there was nothing
to fix.

---

## [2.19.2] - 2026-06-02

### Fixed - `update-byan-agent update` is non-destructive, non-interactive, and local

Field testing of the 2.19.1 updater surfaced four real bugs in
`update-byan-agent/bin/update-byan-agent.js` (the published template `_byan` was
verified healthy and is untouched):

- **No more redundant network install.** The updater runs via
  `npx -p create-byan-agent@latest`, so the `@latest` package (and its template)
  is already on disk next to the running bin. It now resolves the template from
  the running package root (`path.resolve(__dirname, '..', '..')`, with a
  `node_modules/create-byan-agent` fallback) instead of re-running
  `npm install --no-save create-byan-agent@latest` into the user project (which
  pulled ~215 packages, took minutes, had no timeout, and emitted no output).
  The `.github/agents`, Claude-native, and fs-migration refreshes now resolve
  from that same local root, so the F22 Gen3 stub refresh is no longer silently
  skipped when the user project has no local `node_modules`.
- **Non-destructive rebuild.** The replacement template is validated as a
  non-empty directory and fully staged beside the live tree before anything is
  deleted; the swap is then two atomic renames. A failed or empty source aborts
  the update with the existing `_byan` left intact (previously `_byan` was
  `rm -rf`'d up front, so a failing install left the project relying on backup
  rollback).
- **Non-interactive support.** `update` accepts `-y/--yes` and
  `--non-interactive`, and auto-confirms when `--force`, `--yes`,
  `--non-interactive`, or a non-TTY stdout is detected. In CI / headless / piped
  runs the updater no longer hangs on the `Y/n` prompt.
- **Honest diagnostics.** A template that cannot be used now reports whether the
  package could not be resolved at all vs. the template directory being present
  but empty, and prints the probed paths — instead of the misleading
  "_byan directory not found in npm package" that blamed a healthy package.

Covered by `update-byan-agent/__tests__/apply-update.test.js` (11 tests:
local resolution, full Gen2->Gen3 replace, stub refresh, swap atomicity, and the
destructive-safety guard). The updater bin now reports its real package version
instead of a stale hard-coded literal.

---

## [2.19.1] - 2026-06-02

### Fixed - Agent stubs repointed to the by-type (Gen3) layout

2.19.0 shipped the platform on the Gen3 by-type layout (`_byan/agent/<name>/`),
but the Copilot CLI stubs (`.github/agents/*.md`) and the `byan-byan-test`
Claude skill still loaded agents from the old Gen2 module paths
(`_byan/bmb/agents/<name>.md`) with no fallback. On a fresh AUTO-mode install,
or after `update-byan-agent` refreshed the stubs, those loaders pointed at files
that no longer exist at that path, so the agent failed to load.

- Every shipped stub now loads agents Gen3-first with a legacy fallback:
  `_byan/agent/<name>/<name>.md (new layout); if absent, _byan/*/agents/<name>.md (legacy layout)`.
  Both loader forms are covered (`LOAD the FULL agent file from ...` and the
  `<step>Load persona from ...` activation form), in the template and at the
  repo root.
- The `byan-byan-test` Claude skill stub points Gen3-first as well.
- A regression guard (`install/__tests__/template-gen3-layout.test.js`) asserts
  no shipped stub references a Gen2-only agent path, so this cannot drift back.

The repoint is layout-agnostic: a project still on Gen2 keeps resolving via the
legacy fallback, a Gen3 project resolves the new home first. This makes both the
fresh install and the update path non-breaking regardless of which layout the
target project is on.

---

## [2.19.0] - 2026-06-01

### Added - Platform migrated to the by-type (Gen3) layout

The 2.18.0 tooling could migrate `_byan/` to the by-type layout, but the
platform code still resolved the old module layout. This release makes the read
side layout-aware, then executes the physical cutover (Phase B), and finally
makes fresh installs born on the by-type layout. The platform repo, the install
template and the resolver are now all on Gen3, with a Gen2 fallback retained for
existing installs.

#### Read side — layout-aware resolution (F12-F14)

- **F12 — read-side layout resolver.** New `src/byan-v2/lib/layout-resolver.js`
  resolves agents, soul/tao, knowledge, memory and config Gen3-first with a Gen2
  fallback. Adopted across `elo-store`, the fact-check stack, the agent packager,
  the webui chat bridge/detector, the stub generators and the Claude Code hooks.
- **F13 — webui `api.js`.** Moved off the dead Gen1 `_bmad/` tree: install
  detection, rollback target, the scaffolded skeleton and the base-config writer
  now use `_byan/` (tolerant of a legacy `_bmad/` checkout). The base-config
  writer guards on `resolveConfig()` so it does not shadow the authoritative
  `_byan/bmb/config.yaml`.
- **F14 — completeness audit + the breaks it surfaced.** A multi-agent audit of
  all layout-path references confirmed 7 breaks the resolver adoption had missed:
  6 drifted `install/templates/.claude/hooks/*` mirrors (re-synced to their
  already-correct source twins) and `install/src/webui/chat/session-manager.js`
  (chat history dir hardcoded to `_byan/_memory/`, now resolved Gen3-first).

#### Cutover — the physical move (F16-F18)

- **F16 — migration map completed + body-reference rewriter.** The migration map
  gained the retained-module rule (module `config`/`help`/`teams`/`data` and core
  `base`/`activation`/`model-selector` stay in place), the testarch and resources
  rules, and the workers move. New `rewrite-refs.js` + `byan-rewrite-refs` CLI
  rewrite intra-file `_byan/...` references for `move` entries only, so the pass
  is idempotent (`split`/`keep` targets stay untouched).
- **F18 — Phase B executed.** The platform `_byan/` tree was physically moved to
  the by-type layout: agents to `agent/<name>/`, workflows to `workflow/simple/`,
  knowledge to `connaissance/`, memory to `memoire/`, tasks to `command/`,
  workers to `worker/`, and the root soul to `agent/byan/`. Content references and
  manifest path columns were rewritten and `INDEX.md` regenerated. `config.yaml`
  was left in place (its readers depend on the keys a split would separate). The
  flagship-agent collision (byan/marc/rachid existing in both the flat and a
  module dir with different bodies) resolves module-wins: the module copy is
  canonical at `_byan/agent/<name>/<name>.md`, the flat copy preserved at
  `_byan/agent/<name>-flat/`.

#### Tooling and enforcement (F16, F19, F20)

- **F19 — yanstaller migrates existing projects.** The update hook
  (`install/lib/fs-migration-hook.js`) runs the full chain — `migrate-fs` ->
  `rewrite-refs` -> `rewrite-manifests` -> `reconcile-manifests` -> `build-index`
  — so an existing install converges to the by-type layout. It stays dormant
  unless `BYAN_FS_MIGRATE=1` or `_byan/_config/migrate-fs.enabled` is set, and it
  backs up `_byan/` before acting. New `byan-rewrite-manifests` CLI rewrites the
  manifest path columns.
- **F20 — strict scope-guard glob fix.** `matchesPrefix` reduced a glob to its
  literal prefix before matching, so an `allowedPath` like `_byan/**` or
  `src/**/*.test.js` is honored instead of refusing writes inside the intended
  directory; non-glob prefixes keep their exact behavior.

#### Born Gen3 — fresh installs (F21)

- **F21 — install template on the by-type layout.** `install/templates/_byan/`
  was migrated to Gen3 (the same chain, with the bundled MCP server left
  byte-identical), and `create-byan-agent-v2.js` was updated to match: the copy
  whitelist now lists the by-type dirs (`agent`, `workflow`, `connaissance`,
  `command`, `worker`, `memoire`) alongside the retained module dirs, and the
  active soul (soul/tao/soul-memory/creator-soul) is written to
  `_byan/agent/byan/` so it resolves Gen3-first. A new
  `install/__tests__/template-gen3-layout.test.js` guards the template shape and
  the installer whitelist against a regression to Gen2.

### Notes

- The Gen2 fallback in the resolver remains, so an install that predates this
  release keeps working; the F19 hook converts it to Gen3 on update when enabled.
- `byan_version` in the installed configs is unchanged (separate axis, per the
  2.18.0 release convention).
- See `docs/refactor/` for the per-feature notes: `F12-layout-adoption.md` (read
  side), `F7-migration-map.md` (map + rewriter) and `README.md` (index).

---

## [2.18.0] - 2026-05-27

### Added - BYAN refactor: workflow atomisation + by-type file system tooling

Refactor `_byan/` from the BMAD module layout toward an explicit by-type layout,
and atomise the dev workflow. Design + tooling delivered (FD byan-refactor-cli-workflows,
10 features under Strict Mode, 99/99 tests). See `docs/refactor/README.md`.

#### Tooling (shipped in install/templates/_byan/mcp/byan-mcp-server/)

- **`byan-build-index`** — generates `_byan/INDEX.md` (cross-platform FS map) from the
  manifests; deterministic and idempotent.
- **`byan-migrate-fs`** — migrates the legacy module layout to the by-type layout;
  idempotent, non-destructive (a customized target is preserved, not overwritten),
  dry-run by default.
- **`migration-map`** — pure mapping legacy -> by-type with collision/provenance handling.
- **`byan-reconcile-manifests`** — dedups the `*-manifest.csv` files.
- **yanstaller wiring (dormant)** — `install/lib/fs-migration-hook.js`, called in the
  update flow. Acts only when explicitly enabled AND the legacy layout is present
  (backs up `_byan/`, then migrate -> reconcile -> build-index); a no-op otherwise.
  Awaits platform adoption of the new layout before activation.

#### Design (docs/refactor/)

- Merise data dictionary + MCD (12 entities), `workflow_dev` spec, `cdcf` simple workflow,
  target arborescence (SYSTEME + PROJET zones).

#### Fixed

- npm package size: excluded parasitic dev `node_modules` from the tarball (~80MB -> 6.3MB)
  while keeping the required `byan-platform-config` bundle.
- Removed 3 stale `create-byan-agent` CLI variants (canonical: `-v2`).
- Deduped the `drawio` agent-manifest row.

---

## [2.17.0] - 2026-05-27

### Added - BYAN Strict Mode shipped to npm + byan_web persistence

Anti-downgrade enforcement now packaged for `npx create-byan-agent` and backed by the byan_web API.

#### Strict Mode distribution

- Mirrored the full strict feature into `install/templates/` so a fresh install ships it: MCP tools (`byan_strict_*`), Claude Code hooks (Stop / PreToolUse / UserPromptSubmit), the `byan-strict` skill, `strict-mode.yaml`, and the generated runtime config.
- `settings.json` template now registers the three strict hooks.
- Installer wires the cross-platform pre-commit gate: copies `.githooks/` and sets `core.hooksPath` when the target is a git repo (`claude-native-setup.js`).

#### Server-side persistence (API authority)

- byan_web migration `033-strict-sessions.sql` + `routes/strict-sessions.js` (POST lock/upsert, PATCH verify/complete/abort, GET list + by id), scoped to the API key user with optional project attachment.
- New `lib/strict-sync.js` isolates network I/O: each local mutation pushes best-effort to the API; `byan_strict_status` and the pre-commit gate consult the API first and fall back to the local mirror when it is unreachable.
- `.mcp.json` carries `BYAN_API_TOKEN` via env (no secret committed).

---

## [2.16.2] - 2026-05-02

### Added - Electron desktop app v1.0 (Linux + Windows)

Commits ea7abf3 + e905bee. App lives in `app/` as a standalone package (not a workspace of the root); builds and publishes independently of `create-byan-agent`.

#### Core shell and security (F1, F2, F12)

- **F1 app shell** — Electron main process in TypeScript (`app/main/`), compiled to `dist/main/`. Window lifecycle, splash, tray (Linux/Win only).
- **F2 IPC contract** — Preload bridge via `contextBridge` (`app/preload/`). All renderer-to-Node calls go through typed IPC channels; `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- **F12 strict CSP** — Content Security Policy header injected by main process; default-src self, no inline scripts, no eval.

#### Local server lifecycle and renderer (F3, F13)

- **F3 lifecycle** — Main process spawns and supervises the existing `install/src/webui/server.js` local server on a free port; emits `server-ready` IPC event to renderer.
- **F13 dev hot reload** — `npm run dev` runs renderer (Vite dev server, port 5173), main watcher (`tsc -w`), and preload watcher concurrently via `concurrently`; `BYAN_DEV=1` env flag switches main to load the Vite URL instead of `dist/renderer/index.html`.

#### Authentication (F5)

- **F5 hybrid login** — Three login modes selectable at runtime: cloud (`byan.acadenice.fr`), local (auto-detected server), custom URL. Mode persisted in app config; switchable from the native menu.

#### Onboarding (F4)

- **F4 5-step onboarding** — Welcome -> Platform detection -> Config preview -> Apply -> Done. Covers Linux and Windows; macOS branch present but gated (F21 deferred). Onboarding state persisted via Electron store; skipped on subsequent launches.

#### Secure storage (F6)

- **F6 keytar** — API tokens stored via `keytar` (libsecret on Linux, Credential Manager on Windows). Token stored in the OS keychain, not in plaintext config files; IPC `get-token` / `set-token` channels exposed through preload only.

#### Native integration (F19)

- **F19 native menu** — Application menu built with `Menu.buildFromTemplate`; entries: File (quit), Edit (cut/copy/paste/select-all), View (reload, devtools in dev mode), Help (about). Consistent on Linux and Windows.

#### Cross-platform build (F10)

- **F10 build** — `npm run build` compiles main + preload (TypeScript) and bundles renderer (Vite). `npm run build:linux` produces AppImage + deb via electron-builder. `npm run build:win` produces NSIS installer via cross-compilation (Wine on Linux CI or native Windows runner).

#### CI matrix (F11, P1)

- **F11 + P1 GitHub Actions matrix** — Workflow `.github/workflows/electron-ci.yml` runs on `ubuntu-latest` (Linux build + unit tests) and `windows-latest` (Windows build + unit tests) in parallel. Draft GitHub Release created automatically when a `v*` tag is pushed; AppImage, deb, and NSIS installer attached as artifacts.

#### Test suite (F18)

- **F18 E2E Playwright** — Playwright suite in `app/__tests__/` using `playwright-electron`; covers: app launch, onboarding flow, login modal, token store round-trip, native menu visibility. `npm run test:e2e` runs the full suite headlessly.

### Changed

- `install/src/webui/server.js` and `install/src/webui/api.js` — minor edits to support port-injection from the Electron main process (F3: server accepts `BYAN_PORT` env var, binds to `127.0.0.1` only, emits a ready signal to stdout that main process parses).

### Notes

- **F21 macOS** — deferred; code branch exists, not tested, no CI runner. Target: v1.1.
- **F9 auto-update** — electron-updater integration deferred to P2 (v1.1). Update check menu item is present but inert.
- **F14 MCP control panel** — deferred to P2 (v1.1).
- **First CI run** — push tag `v0.1.0-rc` to trigger the first draft release and validate artifact upload end-to-end before promoting to `v1.0.0`.

---

## [2.9.10] - 2026-04-21

### Fixed - MCP auth scheme wrong for byan_web API keys

- **`authHeaders()` in `install/templates/_byan/mcp/byan-mcp-server/server.js`** now auto-detects the auth scheme: tokens prefixed `byan_` use `Authorization: ApiKey <token>` (byan_web convention), everything else falls back to `Bearer`. Previously everything was sent as `Bearer`, which byan_web rejects with 401, and the MCP tools silently returned empty fallback payloads (`{projects: []}`).
- **Verified** against `https://byan-api.stark.a3n.fr/api/auth/me` with a real byan_web API key → `HTTP 200`, user identified.

---

## [2.9.9] - 2026-04-21

### Fixed - MCP copy filter broke on global npm install (root cause of 2.9.6 bug)

- **`copyMcpServer` filter now resolves paths relative to the template src** — the previous filter `(s) => !s.includes('node_modules')` inspected the absolute path, so when BYAN was installed globally (e.g. `/usr/local/lib/node_modules/create-byan-agent/...`), every template file looked like it lived under `node_modules` and was silently skipped. The empty `_byan/mcp/byan-mcp-server/` dossier observed on 2.9.6/2.9.7/2.9.8 had this cause — the post-copy assertion added in 2.9.7 only surfaced the symptom.
- **`makeNodeModulesFilter(srcRoot)` extracted and exported** — used by `copyMcpServer`; splits the relative path on path separators and skips any component named `node_modules`.
- **Regression test** added that builds a filter rooted at `/usr/local/lib/node_modules/create-byan-agent/.../byan-mcp-server` and confirms `server.js` passes while a nested `node_modules/` subdir is rejected.
- **Observed on**: `sudo npm install -g create-byan-agent@2.9.8` → `npx create-byan-agent` → `MCP server copy produced no server.js`.

---

## [2.9.8] - 2026-04-21

### Fixed - `update-byan-agent` CLI broken on fresh npm install

- **`update-byan-agent/` added to `package.json` `files` array** — previously only `update-byan-agent/bin/` shipped (because it was listed in `bin`), but `update-byan-agent/lib/` (analyzer, backup, customization-detector) was missing. Running `update-byan-agent` crashed with `Cannot find module '../lib/analyzer'`.
- **Observed on**: npm install 2.9.7, `cd ~/byan_web && update-byan-agent` → `MODULE_NOT_FOUND`.

---

## [2.9.7] - 2026-04-21

### Fixed - MCP server empty-directory install bug

- **`copyMcpServer` now asserts `server.js` exists after copy** — previously, a partial copy could leave `_byan/mcp/byan-mcp-server/` empty, causing Claude Code to fail with `Cannot find module '.../server.js'` on the next launch. The post-copy check now throws a clear error instead of silently succeeding.
- **`create-byan-agent-v2.js` surfaces Claude native-setup failures in red** — prior behavior showed a yellow "partial" warning that users missed; now the failure is explicit and points at the MCP directory to inspect.
- **Regression test** added in `claude-native-setup.test.js` that mocks `fs.copy` to a no-op and verifies the post-copy assertion throws.
- **Observed on**: byan_web install with 2.9.6, dossier `_byan/mcp/byan-mcp-server/` vide, MCP failed in Claude Code.

---

## [2.7.0] - 2026-02-21

### Added - Soul System + Tao System

#### Tao System (Voice Directives)

**New concept: Agent Tao** -- Each agent now has a `tao.md` that defines HOW they speak. The soul says WHO you are, the tao says HOW you show it.

- **Tao agent** (`_byan/agents/tao.md`) -- Voice Director, forges and audits agent voices
- **tao-template.md** -- 7-section template: Register, Signatures, Temperature, Forbidden Vocabulary, Non-dits, Emotional Grammar, Concrete Examples
- **BYAN tao** (`_byan/tao.md`) -- BYAN's voice: "Attends -- pourquoi ?", "OK. On construit.", "Ca, c'est du generique."
- **Step 2b/2c loading** -- Tao loaded silently during activation, after soul
- **TAO rule** -- Injected into all agents with tao files
- **Anti-uniformity test** -- Each tao verified: if you remove the name, you still know who speaks
- **3-layer voice model** -- Creator accent (shared) + Module accent (profession) + Agent accent (individual)
- **16 tao files created** -- BYAN + 7 BMM + 5 CIS + TEA + Core + Forgeron
- **Creation workflow integration** -- interview-workflow and quick-create now generate tao alongside soul

#### Soul System

**New concept: Agent Souls** -- Each BYAN agent now has a `soul.md` that provides personality and behavioral guardrails, distilled from the creator's values through a psychological interview ("forge").

#### Architecture

- **Two-layer soul**: Immutable core (3 truths from creator, never modified) + living layer (evolves through experience, user-validated)
- **Inheritance chain**: `creator-soul.md` -> BYAN `soul.md` -> each agent's `{id}-soul.md`
- **Soul memory**: Living journal (`soul-memory.md`) that captures resonances, tensions, and insights across sessions
- **Anti-dissonance protocol**: Entries validated against immutable core before writing
- **Periodic revision**: Every 14 days, agent runs a 5-question auto-diagnostic on its living layer

#### Core Files

- `_byan/creator-soul.md` -- Yan's immutable soul (source of all agent souls)
- `_byan/soul.md` -- BYAN's soul distilled from creator
- `_byan/soul-memory.md` -- BYAN's living journal

#### Workflows

- `forge-soul-workflow.md` -- 4-phase psychological interview (Blessure -> Fierte -> Coleres -> Essence)
- `soul-memory-update.md` -- Automatic memory update (introspection -> proposal -> anti-dissonance -> writing)
- `soul-revision.md` -- Periodic 5-question auto-diagnostic

#### Agent & Integration

- **Le Forgeron** -- Dedicated soul forging agent (`_byan/bmb/agents/forgeron.md`) with its own soul
- **[FORGE] menu** -- Added to BYAN for direct soul forging from menu
- **[SOUL] menu** -- View/edit BYAN's soul from menu
- **EXIT hook** -- Mandatory soul introspection before quitting any session
- **Mid-session triggers** -- Emotion patterns (frustration, pride, tension) trigger immediate introspection

#### Soul Inheritance in Agent Creation

- `soul-template.md` -- Template used when BYAN creates new agents
- `soul-memory-template.md` -- Template for new agent soul memories
- Interview and quick-create workflows updated to generate soul as deliverable
- `base-agent-template.md` updated with step 2a (soul loading), SOUL rule, SOUL-MEMORY rule, exit hook, revision check

#### Soul Compliance (Validation)

- Step 5b added to `validate-agent-workflow.md` -- 8-point soul compliance checklist
- Scoring: -10% per WARNING, -20% per FAIL, <60% = rework needed

#### 23 Agent Souls Created

| Module | Agents |
|--------|--------|
| BYAN | byan, forgeron |
| BMM (7) | analyst, architect, dev, pm, quinn, sm, ux-designer |
| CIS (5) | brainstorming-coach, creative-problem-solver, design-thinking-coach, innovation-strategist, presentation-master |
| TEA (1) | tea (Murat) |
| Core (1) | bmad-master |
| _byan (7) | skeptic, marc, rachid, yanstaller, turbo-whisper, jimmy, mike |

#### Creator's Immutable Core (from Forge)

1. "Il y a toujours une solution -- trouver la meilleure ou la moins pire"
2. "La verite avant tout -- le mensonge est une trahison fondamentale"
3. "Tout le monde merite le respect -- sans condition"

---

## [2.5.0] - 2026-02-19

### 🔄 Version Update

**Minor version bump to 2.5.0**

- Updated package version from 2.4.6 to 2.5.0
- Synchronized version references in README.md and package.json description
- Preparation for new features and improvements

---

## [2.4.5] - 2026-02-12

### 🐛 Fixed - Copilot CLI Auth Command

**Problem:** Auth check used `gh auth status` instead of `copilot --version`. GitHub CLI (gh) is separate from Copilot CLI.

**Fix:** 
- Auth check: `gh` → `copilot --version`
- Login instruction: `gh auth login` → `copilot auth`

---

## [2.4.4] - 2026-02-11

### 🐛 Fixed - Config Prompt Scope Bug

**Problem:** `config.userName` was undefined when user skipped interview or Turbo Whisper installation, causing crashes.

**Root Cause:** The `const config = await inquirer.prompt(...)` was inside the `if (installMode === 'custom' && interviewResults)` conditional block. Users taking other paths never got prompted for their name.

**Fix:** Moved user config prompt (name + language) BEFORE the conditional block so it's asked for ALL installation modes.

```javascript
// Before: config defined inside conditional (bug)
if (installMode === 'custom' && interviewResults) {
  const config = await inquirer.prompt(...); // Only for custom mode!
  ...
}
// config.userName → undefined for auto/express modes

// After: config defined before conditional (fixed)
const config = await inquirer.prompt([...]); // Asked for ALL modes
if (installMode === 'custom' && interviewResults) {
  // config available here
}
// config.userName → always defined
```

---

## [2.4.3] - 2026-02-11

### 🐛 Fixed - Codex Trusted Directory + Auth Loop

**Codex Fix:** Added `--skip-git-repo-check` to `codex exec` command to allow Phase 2 chat when not inside a trusted git repository.

**Auth Flow Improvement:** Replaced simple version check with real authentication verification:
- **Copilot**: `gh auth status` (actual login check)
- **Claude**: `claude -p "reply OK" --max-turns 1` (real API call)
- **Codex**: version check (no auth status command available)

If not authenticated, user gets 3 choices: Retry (loop), Auto mode (skip AI chat), or Cancel. No more silent bypass.

---

## [2.4.2] - 2026-02-11

### 🐛 Fixed - Claude Phase 2 System Prompt Separation

**Problem:** On Windows 11, Claude Code Phase 2 chat responded with generic "How can I help you today?" instead of acting as Yanstaller persona.

**Root Cause:** `claude -p "entire_blob"` treats the argument as a user query, not system instructions. The entire system context (Hermes docs, agent catalog, conversation history, instructions) was passed as `-p` argument. Claude ignored it and responded with its default greeting.

**Fix:** Split system prompt from user message using proper Claude Code CLI flags:
- System context → `--append-system-prompt-file` (temp file, auto-cleaned)
- User message → `-p` (just the actual user query)

```javascript
// Before (broken): everything as -p argument
runCliCommand('claude', ['-p', fullPrompt], projectRoot);

// After (fixed): proper separation
runCliCommand('claude', [
  '-p', message,                          // user query only
  '--append-system-prompt-file', tmpFile   // system context in file
], projectRoot);
```

**Impact:** Claude Code Phase 2 now correctly receives Yanstaller persona, Hermes knowledge, and conversation history as system instructions while treating user input as the actual query.

---

## [2.4.0] - 2026-02-11

### ✨ Added - Claude Code Native Agent Integration

**New Feature: BYAN agents natively integrated with Claude Code**

Claude Code uses `.claude/CLAUDE.md` and `.claude/rules/*.md` for project memory.
Yanstaller now creates this structure automatically when Claude is detected.

**Files Created in User Project:**
```
.claude/
  CLAUDE.md                      # Main project memory with Hermes entry point
  rules/
    hermes-dispatcher.md         # Hermes commands, routing rules, pipelines
    byan-agents.md               # 35+ agents across 5 modules (tables)
    merise-agile.md              # Methodology, mantras, dev cycle, test levels
```

**Hermes Always Included:**
- Hermes dispatcher is the universal entry point on ALL Claude Code projects
- `CLAUDE.md` references Hermes and links to rules via `@.claude/rules/` imports
- Claude Code auto-loads all `.claude/rules/*.md` at session start

**How It Works:**
- User runs `npx create-byan-agent` and selects Claude Code platform
- Yanstaller detects Claude and installs `.claude/` structure
- Claude Code reads `CLAUDE.md` + all `rules/*.md` at every session start
- User asks "quel agent pour mon projet?" → Claude knows Hermes and all agents
- No MCP server needed for agent knowledge (native Claude Code memory)

**Verification:**
- Installation checks: CLAUDE.md, rules/ directory, hermes-dispatcher.md
- Updated success message with Claude-specific activation instructions

**Based on Claude Code SDK:**
- Uses official `.claude/rules/*.md` modular rules system
- Uses `@path` import syntax for cross-referencing
- Rules auto-loaded per session (no manual configuration)

---

## [2.3.8] - 2026-02-11

### 🐛 Fixed - Windows 11 + Claude Code Compatibility

**Cross-Platform CLI Execution:**
- Replaced `execSync` with `spawnSync` in Phase 2 chat (no shell = no character interpretation)
- On Unix: args passed directly (no `@`, `$`, `%` interpretation)
- On Windows: `shell: true` for `.cmd` file support, stdin for long prompts
- Removed all bash-only syntax: `$(cat ...)`, `2>/dev/null`, single-quote escaping

**Version Display Fix:**
- `BYAN_VERSION` now reads from `package.json` (was hardcoded as `2.3.0`)
- Banner now shows correct installed version

**Claude-Aware Model Selection:**
- When Claude platform selected, model switches from `gpt-5-mini` to `claude-haiku-4.5`
- `generateDefaultConfig()` now accepts `selectedPlatform` parameter
- Display: "Model adapte: claude-haiku-4.5 (plateforme: Claude)"

**Claude Auth Improvements:**
- Login command fixed: `claude login` (was `claude auth`)
- Shows 3 connection methods on failure:
  1. `claude login` (OAuth)
  2. `export ANTHROPIC_API_KEY=sk-ant-...`
  3. `/login` dans Claude Code
- Auth error detection in Phase 2 chat with specific guidance

**Files Modified:**
- `install/lib/phase2-chat.js`: New `runCliCommand()` helper, cross-platform `sendChatMessage()`
- `install/bin/create-byan-agent-v2.js`: `spawnSync` imports, dynamic version, platform-aware model

---

## [2.3.7] - 2026-02-11

### 🐛 Fixed - Codex Prompt Escaping

**Issue:** Bash interpreted `@hermes` as shell command in Codex prompts
- Phase 2 chat with Codex failed with `/bin/bash: ligne 1: @hermes : commande introuvable`
- Root cause: `echo "${prompt}"` with double quotes allowed bash to interpret special characters
- The Hermes documentation contains `@hermes` examples, which bash tried to execute

**Fix:**
- Changed `install/lib/phase2-chat.js`: Use single quotes for Codex echo command
- Escape single quotes within content: `replace(/'/g, "'\\''")` 
- Prevents bash from interpreting `@`, `$`, backticks, and other special chars
- Copilot and Claude already working (direct arguments, not shell expansion)

**Impact:** Yanstaller Phase 2 now works correctly with Codex platform

---

## [2.3.6] - 2026-02-11

### ✨ Enhanced - Hermes in Yanstaller Knowledge Base

**Feature:** Yanstaller Phase 2 now knows complete BYAN ecosystem
- Added full Hermes documentation to Phase 2 system prompt (~1500 tokens)
- Documents all 35+ agents across 5 modules (Core, BMM, BMB, CIS, TEA)
- Includes 7 predefined workflows with agent chains
- Explains smart routing capabilities and pipelines
- Yanstaller recommends Hermes as universal entry point

**Knowledge Expansion:**
- Before: ~300 tokens (basic user profile)
- After: ~1500 tokens (complete ecosystem)
- 5x increase in contextual intelligence

**Impact:** Users asking about Hermes or agents get intelligent, informed responses

---

## [2.3.5] - 2026-02-11

### 🐛 Fixed - Multi-Platform CLI Commands

**Issue:** Codex and Claude commands were incorrect
- Codex: `codex -p "prompt"` doesn't exist (wrong flag)
- Claude: `claude -p "prompt" --no-input` used wrong flags
- Both failed during Phase 2 chat in Yanstaller

**Fix:**
- `install/lib/phase2-chat.js`:
  - Codex: Changed to `codex exec` with stdin (line 175)
  - Claude: Changed to `claude -p` print mode (line 184)
  - Copilot: Already correct with `-p` flag

**Verified:**
- Copilot: `copilot -p "prompt" -s` ✓
- Codex: `echo "prompt" | codex exec` ✓
- Claude: `claude -p "prompt"` ✓

---

## [2.3.4] - 2026-02-11

### 🐛 Fixed - Yanstaller Phase 2 Config Bug

**Issue:** ReferenceError during Phase 2 chat initialization
- Error: `Cannot access 'config' before initialization`
- Root cause: `config` variable used at line 737 but defined at line 817
- Phase 2 chat failed to start

**Fix:**
- `install/bin/create-byan-agent-v2.js`: Moved config prompt to Phase 1.5 (before Phase 2 chat)
- Config now collected at lines 714-729 (userName, language)
- Passed to `launchPhase2Chat()` as parameters
- Removed duplicate config definition

**Impact:** Yanstaller Phase 2 now starts correctly with all platforms

---

## [2.3.3] - 2026-02-10

### 🐛 Fixed - GitHub Repository URLs

**Issue:** README and package.json pointed to wrong GitHub repository
- Old URL: `github.com/yannsix/byan-v2` (incorrect)
- Correct URL: `github.com/Yan-Acadenice/BYAN`

**Changes:**
- `README.md`: Updated 10 GitHub link occurrences
- `package.json`: Updated repository URLs (3 occurrences)
  - repository.url
  - bugs.url
  - homepage

**Impact:** Users can now find correct repository and report issues properly

---

## [2.3.2] - 2026-02-10

### 🏛️ Added - Hermes Universal Dispatcher

**Major Feature: Hermes Agent**
- New `hermes` agent: Universal dispatcher for entire BYAN ecosystem (573 lines XML)
- Intelligent routing to 35+ specialized agents across 5 modules
- 6-step mandatory activation sequence with config loading
- Menu-driven interface with 9 commands (LA, LW, LC, REC, PIPE, ?, @, EXIT, HELP)
- Smart routing rules: keyword-based agent recommendations
- 7 predefined pipelines (Feature Complete, Idea→Code, Bug Fix, etc.)
- Fuzzy matching for agent names
- Quick help system without loading full agents
- Multi-agent pipeline suggestions for complex goals

**Integration:**
- Added Hermes entry to agent-manifest.csv (first entry - core module)
- Created HERMES-GUIDE.md: Complete 10k+ word documentation
- Routing rules for all 35+ agents (bmm, bmb, cis, tea, core modules)
- Manifest-driven architecture (agent-manifest, workflow-manifest, task-manifest)

**Capabilities:**
1. **[LA]** List Agents - Display all 35+ agents by module
2. **[LW]** List Workflows - Show available workflows
3. **[LC]** List Contexts - Discover project contexts
4. **[REC]** Smart Routing - Recommend best agent(s) for task
5. **[PIPE]** Pipeline - Multi-agent workflow suggestions
6. **[?]** Quick Help - Brief agent info without loading
7. **[@]** Invoke - Direct agent activation
8. **[EXIT]** Exit Hermes gracefully
9. **[HELP]** Redisplay menu

**Files:**
- `install/templates/.github/agents/hermes.md` (573 lines, 168 XML tags)
- `install/HERMES-GUIDE.md` (10k+ words, complete usage guide)
- Updated `install/templates/_byan/_config/agent-manifest.csv` (Hermes first)

### 🐛 Fixed - Node.js 12 Compatibility

**Issue:** Optional chaining operator (`?.`) caused syntax errors on Node 12
- Node 12 doesn't support optional chaining (requires Node 14+)
- Server installations with older Node versions failed

**Changes:**
- Replaced all optional chaining in `install/` directory (9 instances across 5 files):
  - `install/bin/create-byan-agent-v2.js` (4 fixes)
  - `install/lib/phase2-chat.js` (1 fix)
  - `install/lib/yanstaller/platform-selector.js` (2 fixes)
  - `install/lib/yanstaller/agent-launcher.js` (2 fixes)
- Changed `package.json` engines requirement: `node >=18.0.0` → `>=12.0.0`
- All optional chaining replaced with explicit null checks

**Before:**
```javascript
interviewResults.agents.essential?.join(', ')
config?.communication_language || 'English'
```

**After:**
```javascript
interviewResults.agents.essential ? interviewResults.agents.essential.join(', ') : ''
config ? config.communication_language : 'English'
```

**Documentation:**
- Created `TEST-GUIDE-v2.3.2.md` with Node 12+ verification steps

### 🔧 Technical Details

**Hermes Architecture:**
- XML-based agent definition with mandatory activation
- 6-step activation: Load persona → Load config → Store vars → Display menu → Wait → Process
- Handler system: number, command, invoke, fuzzy
- Manifest-driven: Reads CSV files at runtime (never pre-load)
- Fail-fast error handling with actionable suggestions
- KISS principle: Minimal interface, maximum efficiency

**Mantras Applied:**
- #7: KISS (Keep It Simple, Stupid)
- #37: Ockham's Razor - Simplicity first
- #4: Fail Fast - Immediate actionable errors
- IA-21: Self-Aware Agent - "I dispatch, I do not execute"
- IA-24: Clean Code - Minimal, clear communication

**Agent Manifest:**
- 35+ agents across 5 modules (core, bmm, bmb, cis, tea)
- CSV format: name, displayName, title, icon, role, identity, style, principles, module, path
- Hermes entry: First line (dispatcher priority)

### 📚 Documentation

**New Guides:**
- `install/HERMES-GUIDE.md`: Complete Hermes documentation
  - Overview and installation
  - All 9 commands with examples
  - Routing rules table
  - Predefined pipelines
  - Troubleshooting
  - Roadmap

- `TEST-GUIDE-v2.3.2.md`: Node 12+ compatibility guide
  - Verification steps
  - Before/after code examples
  - Testing checklist

### 🎯 Use Cases

**Hermes Examples:**

1. **New Project Discovery:**
   ```bash
   @hermes
   [1] [LA]  # List all agents by module
   [?dev]    # Quick info on Dev agent
   @dev      # Invoke Dev agent
   ```

2. **Smart Routing:**
   ```bash
   @hermes
   [4] [REC]
   # User: "créer API backend avec tests"
   # Hermes recommends: PM → Architect → Dev → Tea
   ```

3. **Pipeline Creation:**
   ```bash
   @hermes
   [5] [PIPE]
   # User: "feature complète de A à Z"
   # Hermes suggests: PM → Architect → UX → SM → Dev → Tea
   ```

### 🔄 Migration from 2.3.0/2.3.1

**No Breaking Changes** - Fully backward compatible

**New in 2.3.2:**
- Hermes agent available via `@hermes`
- Improved Node 12+ support (was 18+ in 2.3.0/1)
- Enhanced agent discovery via manifest

**Upgrade:**
```bash
npm install -g create-byan-agent@2.3.2
```

**Or via npx (always latest):**
```bash
npx create-byan-agent
```

### 📦 Package Info

**Size:** ~1.4 MB, 900+ files  
**Dependencies:**
- Required: commander, inquirer, fs-extra, chalk, winston, dotenv
- Optional: byan-copilot-router (cost optimizer)

**Engines:**
- Node.js: >=12.0.0 (was >=18.0.0 in 2.3.0/1)
- npm: >=6.0.0

### 🚀 Performance

**Hermes Performance:**
- Menu display: <50ms
- Agent list (35+): <100ms
- Smart routing: <200ms
- Agent invocation: <500ms
- Manifest parsing: <100ms (CSV)

**Install Performance:**
- Yanstaller: ~30-60 seconds (unchanged)
- Cost Optimizer: +5 seconds if enabled (optional)

---

## [2.3.1] - 2026-02-10

### 🔧 Fixed - Yanstaller Integration Issues

**Issue:** Yanstaller didn't prompt for platform or verify authentication

**Changes:**
- Added platform selection question after detection (Copilot/Codex/Claude)
- Added authentication verification with helpful error messages
- Modified `create-byan-agent-v2.js` to add platform selection (+60 lines)
- Updated `phase2-chat.js` to accept selectedPlatform parameter
- Changed `sendChatMessage()` to use selectedPlatform instead of array
- Added fallback to AUTO mode if authentication fails

**Files:**
- `install/bin/create-byan-agent-v2.js` (platform selection logic)
- `install/lib/phase2-chat.js` (platform parameter)
- Commit: "fix: improve Yanstaller integration and error handling"

---

## [2.3.0] - 2026-02-10

### ✨ Added - Cost Optimizer Integration

**Feature: Cost Optimizer Worker**
- Integrated `@byan/copilot-router` (v1.0.1) as optional dependency
- New worker template: `install/templates/_byan/workers/cost-optimizer.js`
- Automatic installation option during Yanstaller setup
- 87.5% cost savings (based on real measurements)

**Changes:**
- Added `byan-copilot-router` to `optionalDependencies` in package.json
- Created cost-optimizer worker template with CopilotRouter integration
- Modified installer to ask: "Activer l'optimiseur de coûts LLM?"
- Auto-copy worker to `_byan/workers/` if enabled
- Worker auto-detects if router module installed

**Worker Features:**
- Complexity analysis (5 factors)
- Intelligent routing: worker (cheap) vs agent (expensive)
- Automatic fallback on worker failure
- Cost tracking and statistics
- JSON/CSV export
- Daily/weekly reports

**Files:**
- `install/templates/_byan/workers/cost-optimizer.js` (202 lines)
- `install/templates/_byan/workers/README.md` (documentation)
- Updated `install/bin/create-byan-agent-v2.js` (installer question)

---

## [2.2.0] - 2026-02-08

### ✨ Added

**New Agents:**
- `hermes` (prototype): Universal dispatcher for BYAN agents
- `marc`: GitHub Copilot CLI integration specialist
- `rachid`: NPM/NPX deployment specialist
- `patnote`: Update manager and conflict resolution
- `carmack`: Token optimizer for BYAN agents

**Developer Experience:**
- Enhanced CLI with better error messages
- Improved platform detection (Copilot/Codex/Claude)
- Auto-detection of installed AI platforms

### 🔧 Changed

- Refactored agent templates for better modularity
- Improved manifest system (agent-manifest.csv)
- Better configuration management

---

## [2.1.0] - 2026-02-05

### ✨ Added

**BYAN v2 Core:**
- Intelligent agent creation via 12-question interview
- 64 mantras integration (Merise Agile + TDD)
- Multi-platform support (GitHub Copilot, Codex, Claude)
- Yanstaller: Smart installer with platform detection
- Agent manifest system
- Workflow manifest system

**Agents:**
- `byan`: Intelligent agent creator
- `bmad-master`: Workflow orchestrator
- `analyst`: Business analyst (Mary)
- `architect`: System architect (Winston)
- `dev`: Developer (Amelia)
- `pm`: Product manager (John)
- `sm`: Scrum master (Bob)
- `quinn`: QA engineer
- `tech-writer`: Documentation specialist (Paige)
- `ux-designer`: UX designer (Sally)
- `quick-flow-solo-dev`: Fast brownfield dev (Barry)
- `brainstorming-coach`: Brainstorming (Carson)
- `tea`: Test architect (Murat)
- And 20+ more specialized agents

**Modules:**
- `core`: Foundation (bmad-master, yanstaller, merise expert)
- `bmm`: Business Modeling & Management (SDLC agents)
- `bmb`: Builder agents (BYAN, agent-builder, etc.)
- `cis`: Creative & Innovation Strategy
- `tea`: Test Architecture

---

## [2.0.0] - 2026-01-15

### 🎉 Initial Release - BYAN v2

**Major Rewrite:**
- Complete platform rewrite from v1.x
- Markdown + YAML agent definitions
- XML-based agent structure
- Multi-platform support
- Module system (core, bmm, bmb, cis, tea)

**Core Features:**
- Intelligent agent creation
- Structured interview process
- Manifest-driven architecture
- Config system with YAML
- Template engine
- Platform detection
- NPX integration

---

## [1.x] - 2025 (Legacy)

**Note:** v1.x was the original BYAN prototype. See git history for details.

---

## Legend

- 🎉 Major release
- ✨ New features
- 🔧 Changes
- 🐛 Bug fixes
- 📚 Documentation
- 🔄 Migration guide
- 💥 Breaking changes
- 🔐 Security fixes
- 🚀 Performance improvements

---

**Latest:** [2.3.2] - Hermes Universal Dispatcher + Node 12+ Support  
**Download:** `npm install -g create-byan-agent@2.3.2`  
**NPX:** `npx create-byan-agent` (always latest)
