'use strict';

/**
 * INSTALL ENGINE — the single real installation engine, one engine for two
 * faces (terminal CLI and local web wizard).
 *
 * Why this module exists (field record, 2026-07-21): the whole install logic
 * lived inline in a 2103-line interactive bin, so the web installer could not
 * call it and shipped a SIMULATION instead (9 broadcast steps around sleep()
 * calls). Three install/update gaps were fixed in three days because the logic
 * had no single owner. This engine is that owner.
 *
 * Contract:
 *   - options in, real actions out. No prompt in here, ever: consent-needing
 *     choices arrive AS options (the faces collect them).
 *   - progress is honest by construction: onStep fires once per step and each
 *     step body performs the real action it names. No step, no broadcast.
 *   - side steps that must not kill an install (rtk, skills sync, credentials)
 *     record ok:false instead of throwing; core steps (copy, config) throw.
 *
 * Defaults are the zero-question install: Claude + Codex when detected, every
 * agent, creator soul, rtk installed when missing.
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const yaml = require('js-yaml');

const { setupClaudeNative } = require('./claude-native-setup');
const { setupCodexNative } = require('./codex-native-setup');
const { offerGlobalSkillsSync } = require('./global-skills-sync');
const homeCreds = require('./home-credentials');
const { resolveTargetUser, resolveHomeFor } = require('./target-user');
const { resolveBinary, commandExists: resolveCommandExists } = require('./resolve-binary');
const { ensureOwnership, ensureSharedGroup, resolveGroupGid } = require('./ownership');
const { resolveApiUrl } = require('./api-defaults');

// Gen3 by-type dirs copied from templates/_byan (same list as the legacy bin).
const BYAN_DIRS = ['agent', 'workflow', 'connaissance', 'command', 'worker', 'memoire',
  'core', 'bmb', 'bmm', 'tea', 'cis', '_config', 'data'];

function defaultTemplateDir() {
  const p = path.join(__dirname, '..', 'templates');
  return fs.existsSync(p) ? p : null;
}

// L'ancienne sonde lancait execSync('command -v X', { shell: '/bin/sh' }).
// Trois defauts mesures le 2026-08-11 : /bin/sh est absent de Windows ; avec le
// PATH POSIX par defaut (getconf PATH) la commande sort en 1 alors que claude
// EST installe, parce qu'il vit dans ~/.local/bin qui n'appartient a aucun PATH
// par defaut ; et sous elevation de privilege le PATH est celui de root.
// La sonde passe desormais par resolve-binary : parcours du PATH en JavaScript,
// puis emplacements connus du home de l'utilisateur CIBLE.
function commandExists(cmd, options = {}) {
  return resolveCommandExists(cmd, options);
}

/**
 * Detection: platforms on this machine + stored credentials. Facts only.
 *
 * Le home interroge est celui de l'utilisateur CIBLE, pas celui du processus.
 * Sous sudo, os.homedir() rend /root : l'ancienne version cherchait ~/.claude
 * dans /root, ne trouvait rien, et l'installateur sautait l'etape Claude en
 * annoncant une reussite.
 */
function detectEnvironment({
  homeDir,
  env = process.env,
  platform = process.platform,
  target = null,
} = {}) {
  const cible = target || resolveTargetUser({ env, platform });
  const home = homeDir || cible.home || os.homedir();
  const sonde = (nom) => resolveBinary(nom, { env, platform, home });
  const claudeBin = sonde('claude');
  const codexBin = sonde('codex');
  const rtkBin = sonde('rtk');
  return {
    claude: fs.existsSync(path.join(home, '.claude')) || Boolean(claudeBin.path),
    codex: fs.existsSync(path.join(home, '.codex')) || Boolean(codexBin.path),
    rtk: Boolean(rtkBin.path),
    storedCredentialKeys: homeCreds.storedKeys({ homeDir: home }),
    // De quoi rendre un rapport honnete : QUI on a pris pour cible, OU on a
    // cherche, et ce qu'on a trouve. Sans ca, "Claude Code introuvable" est une
    // affirmation que personne ne peut verifier.
    targetUser: cible,
    searched: {
      home,
      homeSource: cible.homeSource,
      claude: { path: claudeBin.path, realPath: claudeBin.realPath, dirs: claudeBin.searched },
      codex: { path: codexBin.path, dirs: codexBin.searched },
      rtk: { path: rtkBin.path, dirs: rtkBin.searched },
    },
  };
}

/**
 * The Claude Code launch command for the end of install. The byan-channel is a
 * Claude Code research-preview feature behind an explicit flag; when the
 * installed CLI does not know the flag, the plain `claude` command is the
 * fallback. We only BUILD the command here — executing it is the caller's move.
 *
 * Les deux sondes sont injectables parce que la version par defaut LANCE
 * reellement `claude --help` avec un delai de 8 s. Mesure du 2026-08-11 : cet
 * appel partait a chaque runInstall, tests compris, ce qui faisait dependre la
 * suite de tests de ce que porte la machine hote.
 */
function claudeLaunchCommand({ exists = commandExists, run = execSync } = {}) {
  if (!exists('claude')) return null;
  let helpText = '';
  try {
    helpText = run('claude --help', { encoding: 'utf8', timeout: 8000 });
  } catch {
    return { command: 'claude', channel: false };
  }
  const supportsChannel = helpText.includes('dangerously-load-development-channels');
  return supportsChannel
    ? { command: 'claude --dangerously-load-development-channels server:byan-channel', channel: true }
    : { command: 'claude', channel: false };
}

/**
 * Le premier dossier qui existe en remontant depuis le chemin donne.
 *
 * Le dossier d'installation peut ne pas exister encore : c'est alors son parent
 * qui porte l'identite a lire. Remonte jusqu'a la racine, et retombe sur le
 * dossier courant si le chemin est absent ou vide.
 */
function plusProcheAncetreExistant(depart) {
  if (!depart) return process.cwd();
  let courant = path.resolve(depart);
  for (;;) {
    if (fs.existsSync(courant)) return courant;
    const parent = path.dirname(courant);
    if (parent === courant) return process.cwd();
    courant = parent;
  }
}

/**
 * --owner=<nom|uid> : l'appelant designe la cible a la place de la detection.
 *
 * `elevated` se lit sur l'uid effectif, comme dans resolveTargetUser. Le poser
 * en dur a true faisait croire a une elevation qui n'existait pas : la reprise
 * partait, se faisait refuser, et le rapport parlait de montage sans
 * proprietaire POSIX au lieu de privilege manquant.
 */
function forcedTarget(owner) {
  const details = resolveHomeFor(owner);
  const eleve = typeof process.geteuid === 'function' && process.geteuid() === 0;
  return { ...details, source: 'option', elevated: eleve };
}

/** Lecture tolerante d'un YAML : un fichier absent ou abime rend un objet vide. */
function readYamlSafe(p) {
  try {
    const brut = fs.readFileSync(p, 'utf8');
    const charge = yaml.load(brut);
    return charge && typeof charge === 'object' ? charge : {};
  } catch {
    return {};
  }
}

/**
 * Le dossier d'installation designe-t-il une installation deliberee en root ?
 *
 * LA QUESTION PORTE SUR LE DOSSIER, PAS SUR L'ECHELON DE RESOLUTION. La version
 * precedente testait `cible.source === 'root'`, un echelon qui n'est atteint que
 * lorsque AUCUNE variable d'elevation n'est posee. Sous un simple sudo, la
 * source vaut 'sudo' et la protection ne se declenchait pas : installer dans
 * /opt avec sudo remettait l'arborescence a l'utilisateur appelant et cassait un
 * montage qui fonctionnait. Le critere reel est le proprietaire du dossier vise
 * et de son parent.
 */
function installationEnRootAssumee(projectRoot) {
  const cible = plusProcheAncetreExistant(cheminResolu(projectRoot));
  const st = statSafe(cible);
  if (!st || st.uid !== 0) return false;
  const parent = path.dirname(cible);
  if (parent === cible) return true;
  const stParent = statSafe(parent);
  return Boolean(stParent && stParent.uid === 0);
}

function statSafe(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * Le chemin d'installation, liens symboliques resolus.
 *
 * POURQUOI : `--dir /srv/byan` ou /srv/byan est un lien vers /mnt/data/byan.
 * Les etapes d'ecriture suivent le lien (fs.copy et consorts le font), mais la
 * reprise des droits lisait le lien lui-meme : lstat d'un lien rend
 * isDirectory() faux, donc le parcours ne demarrait pas et l'arborescence reelle
 * gardait son proprietaire. Meme cecite pour la garde d'installation en root.
 * On resout donc une fois, a l'entree, et tout le monde vise la meme chose.
 */
function cheminResolu(depart) {
  const ancetre = plusProcheAncetreExistant(depart);
  let reel = ancetre;
  try {
    reel = fs.realpathSync(ancetre);
  } catch {
    reel = ancetre;
  }
  const vise = path.resolve(depart || process.cwd());
  if (vise === ancetre) return reel;
  return path.join(reel, path.relative(ancetre, vise));
}

/**
 * Faut-il reprendre les droits, et sinon pourquoi ? Chaque abstention porte une
 * raison distincte, parce qu'un message faux coute plus cher qu'un message
 * absent : dire "ce systeme ne porte pas de proprietaire POSIX" a quelqu'un qui
 * a juste tape un nom d'utilisateur inexistant l'envoie chercher au mauvais
 * endroit.
 */
function raisonReprise({ chown, cible, groupePartage, rootAssume }) {
  if (chown === false) return 'ecarte par l\'option --no-chown';
  if (cible.uid === null || cible.uid === undefined) {
    return cible.name
      ? `l'utilisateur ${cible.name} est inconnu de ce systeme : aucun identifiant a poser`
      : 'ce systeme ne porte pas de proprietaire POSIX';
  }
  // Cette reprise existe pour SORTIR une arborescence de root. La rendre A root
  // est le geste inverse. Mesure du 2026-08-11 : avec SUDO_UID=0 dans
  // l'environnement, la cible ressortait a uid 0 et l'arborescence de
  // l'utilisateur passait en root:root — exactement la panne a corriger.
  if (cible.uid === 0) return 'la cible resolue est root : cette reprise sert a sortir une arborescence de root, pas a l\'y mettre';
  if (rootAssume) return 'installation en root assumee : l\'arborescence est laissee telle quelle';
  if (!cible.elevated && !groupePartage) return 'aucune elevation : les fichiers appartiennent deja a l\'utilisateur';
  return null;
}

/**
 * Run the full installation.
 *
 * @param {object} options
 * @param {string}  options.projectRoot   target directory (created if absent)
 * @param {string}  [options.projectName] defaults to basename(projectRoot)
 * @param {object}  [options.platforms]   {claude, codex} — defaults to detection
 * @param {string}  [options.templateDir]
 * @param {string}  [options.userName='Developer']
 * @param {string}  [options.language='Francais']
 * @param {boolean} [options.rtk=true]        install rtk when missing
 * @param {object}  [options.credentials]     values to persist in ~/.byan/credentials.json
 * @param {string}  [options.homeDir]
 * @param {object}  [hooks]
 * @param {(step:{index:number,total:number,id:string,label:string})=>void} [hooks.onStep]
 * @param {(line:string)=>void} [hooks.log]
 * @param {(q:string)=>Promise<boolean>} [hooks.ask]  consent collector for the
 *        global-skills offer (absent -> notice only, nothing written in home)
 * @param {Function} [hooks.claudeSetup] [hooks.codexSetup] [hooks.rtkInstall]  test injection
 * @returns {Promise<{ok:boolean, steps:Array, verify:{passed:number,total:number,failed:string[]}, launch:{command:string,channel:boolean}|null}>}
 */
async function runInstall(options = {}, hooks = {}) {
  // L'utilisateur CIBLE se resout avant tout le reste : c'est lui qui donne le
  // home a interroger et le proprietaire a reposer. --owner le force a la main.
  //
  // Le dossier interroge est celui ou on INSTALLE, pas le dossier courant.
  // `create-byan-agent --cli --dir /opt/byan` lance depuis le home donnait
  // sinon le proprietaire du home, et la regle qui protege une installation
  // deliberee en root ne se declenchait pas sur la bonne arborescence.
  const cible = options.targetUser
    || (options.owner ? forcedTarget(options.owner)
      : resolveTargetUser({ cwd: plusProcheAncetreExistant(options.projectRoot) }));

  const {
    projectRoot,
    projectName = path.basename(options.projectRoot || ''),
    templateDir = defaultTemplateDir(),
    userName = 'Developer',
    language = 'Francais',
    rtk = true,
    credentials = null,
    homeDir = cible.home || os.homedir(),
    chown = true,
    group = null,
    apiUrl = null,
  } = options;

  // Une seule source pour l'URL de l'API, resolue ICI et transmise aux etapes :
  // explicite (--api-url, une reponse a --ask), puis BYAN_API_URL, puis la
  // valeur memorisee d'une installation precedente, puis le host de production.
  const api = resolveApiUrl({ explicit: apiUrl, homeDir });
  const onStep = hooks.onStep || (() => {});
  const log = hooks.log || (() => {});
  const claudeSetup = hooks.claudeSetup || setupClaudeNative;
  const codexSetup = hooks.codexSetup || setupCodexNative;

  if (!projectRoot) throw new Error('projectRoot est requis');
  if (!templateDir || !fs.existsSync(path.join(templateDir, '_byan'))) {
    throw new Error(`templates introuvables (${templateDir || 'aucun chemin'})`);
  }

  // Detection is injectable so tests do not depend on what THIS machine has.
  const detected = hooks.detect ? hooks.detect() : detectEnvironment({ homeDir, target: cible });
  const platforms = options.platforms || { claude: detected.claude, codex: detected.codex };
  const byanDir = path.join(projectRoot, '_byan');

  // Le groupe partage survit a une reinstallation : --group le pose, et une
  // installation ulterieure sans l'option le relit dans la configuration au lieu
  // de l'effacer. L'ancienne etape config reecrivait config.yaml integralement
  // depuis un objet fixe, ce qui aurait supprime la cle a chaque passage.
  const configPath = path.join(byanDir, 'bmb', 'config.yaml');
  const configExistante = readYamlSafe(configPath);
  const groupePartage = group || configExistante.shared_group || null;

  // Calculee UNE fois : le plan et la garde de l'etape lisaient chacun leur
  // propre appel, et deux calculs d'une meme decision finissent par diverger.
  const raisonDroits = raisonReprise({
    chown,
    cible,
    groupePartage,
    rootAssume: installationEnRootAssumee(projectRoot),
  });

  // LE HOME DE LA CIBLE EST-IL REELLEMENT RESOLU ?
  //
  // Quand il ne l'est pas — un uid absent de /etc/passwd, cas courant sous
  // pkexec ou su avec un annuaire LDAP ou SSSD — homeDir retombe sur le home du
  // PROCESSUS, c'est-a-dire /root sous elevation. Toutes les etapes qui ecrivent
  // hors du projet partaient alors dans /root : le jeton d'API dans
  // /root/.byan/credentials.json, la configuration Codex dans /root/.codex, les
  // skills globales dans /root/.claude. Le rapport rendait ok:true.
  //
  // On ECARTE ces etapes plutot que de les rediriger. Un fichier de secrets pose
  // dans le home de root n'est pas un demi-succes : c'est un fichier au mauvais
  // endroit, que la reprise des droits ne peut plus rattraper puisqu'elle passe
  // apres. Constat bloquant de la revue du 2026-08-12, reproduit.
  const homeResolu = Boolean(cible.home);
  const homeDouteux = !homeResolu && cible.elevated;
  const raisonHome = homeDouteux
    ? 'home de l\'utilisateur cible non resolu sous elevation : ecrire ici poserait le fichier dans /root'
    : null;

  // Le gid du groupe partage est resolu AVANT la reprise du proprietaire.
  // Sinon ensureOwnership reposait cible.gid partout, et ensureSharedGroup ne
  // rattrapait ensuite que la racine : le groupe partage ne portait que sur un
  // seul dossier, ce qui ne donne acces a rien.
  let gidGroupe = null;
  if (groupePartage) {
    const resolu = (hooks.resolveGroupGid || resolveGroupGid)(groupePartage);
    gidGroupe = typeof resolu.gid === 'number' ? resolu.gid : null;
  }

  // LE PLAN PORTE L'ENSEMBLE INTENDU, pas seulement ce qui va tourner.
  //
  // L'ancien plan omettait purement les etapes non retenues. L'omission etait
  // invisible dans le rapport : `results.every(...)` interrogeait une liste qui
  // ne contenait plus l'etape, donc un plan ampute par une detection fausse
  // repondait quand meme "installation reussie" (mesure du 2026-08-11 sur
  // install-engine.js:285). Le denominateur retrecissait avec le plan.
  //
  // Desormais chaque etape possible figure ici avec, le cas echeant, la RAISON
  // pour laquelle elle est ecartee. Une etape sautee reste dans le rapport.
  const aDesCredentials = Boolean(credentials && Object.keys(credentials).length);
  const intended = [
    { id: 'detect', label: 'Detection de l\'environnement' },
    { id: 'copy-byan', label: 'Copie de la plateforme _byan/' },
    { id: 'config', label: 'Ecriture de la configuration du projet' },
    { id: 'claude', label: 'Installation Claude Code (.claude + serveur MCP + .mcp.json)',
      skipReason: platforms.claude ? null : 'Claude Code non detecte sur cette machine' },
    { id: 'codex', label: 'Installation Codex (~/.codex)',
      skipReason: raisonHome || (platforms.codex ? null : 'Codex non detecte sur cette machine') },
    { id: 'credentials', label: 'Memorisation de la configuration (~/.byan/credentials.json)',
      skipReason: raisonHome || (aDesCredentials ? null : 'aucune valeur a memoriser') },
    { id: 'google-purge', label: 'Retrait des cles Google obsoletes',
      skipReason: raisonHome },
    { id: 'skills-sync', label: 'Controle des copies globales de skills',
      skipReason: raisonHome || (platforms.claude ? null : 'sans Claude Code, il n\'y a pas de copie globale a controler') },
    { id: 'rtk', label: 'Verification / installation de rtk',
      skipReason: rtk ? null : 'ecarte par l\'option rtk=false' },
    // APRES le dernier sous-processus, et c'est une contrainte, pas un detail.
    // npm install (serveur MCP), git config core.hooksPath et setup-rtk creent
    // des fichiers qu'aucun crochet pose au niveau de fs ne peut voir. Une
    // reprise placee plus tot laisserait node_modules en root:root — le dossier
    // le plus lourd et le plus penible a reparer a la main.
    { id: 'ownership', label: 'Reprise du proprietaire et des droits',
      skipReason: raisonDroits },
    { id: 'verify', label: 'Verification finale' },
  ];
  const active = intended.filter((s) => !s.skipReason);

  // Un etat par etape INTENDUE. Les sautees naissent deja renseignees, avec leur
  // raison ; les autres passent de 'pending' a 'done' ou 'failed'.
  const etats = new Map(intended.map((s) => [s.id, s.skipReason
    ? { id: s.id, ok: true, status: 'skipped', reason: s.skipReason, detail: '' }
    : { id: s.id, ok: false, status: 'pending', reason: null, detail: '' }]));

  let index = 0;
  const step = async (id, label, fn, { critical = true } = {}) => {
    index += 1;
    onStep({ index, total: active.length, id, label });
    try {
      const detail = await fn();
      etats.set(id, { id, ok: true, status: 'done', reason: null, detail: detail || '' });
    } catch (err) {
      etats.set(id, { id, ok: false, status: 'failed', reason: null, detail: err.message });
      if (critical) throw err;
      log(`[!] etape ${id} en echec (non bloquant) : ${err.message}`);
    }
  };

  await step('detect', intended[0].label, async () => {
    log(`Claude: ${detected.claude ? 'present' : 'absent'} ; Codex: ${detected.codex ? 'present' : 'absent'} ; rtk: ${detected.rtk ? 'present' : 'absent'}`);
    if (detected.storedCredentialKeys.length) {
      log(`Configuration memorisee reutilisee (${detected.storedCredentialKeys.length} cle(s), rien a re-saisir)`);
    }
    return `claude=${detected.claude} codex=${detected.codex} rtk=${detected.rtk}`;
  });

  await step('copy-byan', 'Copie de la plateforme _byan/', async () => {
    const src = path.join(templateDir, '_byan');
    await fs.ensureDir(byanDir);
    let copied = 0;
    for (const dir of BYAN_DIRS) {
      const s = path.join(src, dir);
      if (await fs.pathExists(s)) {
        await fs.copy(s, path.join(byanDir, dir), { overwrite: true });
        copied += 1;
      }
    }
    for (const file of await fs.readdir(src)) {
      const full = path.join(src, file);
      if ((await fs.stat(full)).isFile()) await fs.copy(full, path.join(byanDir, file), { overwrite: true });
    }
    return `${copied} dossiers copies`;
  });

  await step('config', 'Ecriture de la configuration du projet', async () => {
    const bmbDir = path.join(byanDir, 'bmb');
    await fs.ensureDir(bmbDir);
    // FUSION, pas reecriture. Les cles que cette version connait sont refaites ;
    // celles posees ailleurs (shared_group, reglages d'un autre outil) survivent.
    const configContent = {
      ...configExistante,
      bmb_creations_output_folder: '{project-root}/_byan-output/bmb-creations',
      user_name: userName,
      communication_language: language,
      document_output_language: language,
      output_folder: '{project-root}/_byan-output',
      project_name: projectName,
      platform: Object.entries(platforms).filter(([, v]) => v).map(([k]) => k).join(',') || 'none',
      install_mode: 'engine-auto',
      byan_version: readOwnVersion(),
    };
    if (groupePartage) configContent.shared_group = groupePartage;
    await fs.writeFile(configPath, yaml.dump(configContent), 'utf8');
    return groupePartage ? `config.yaml ecrit (groupe partage ${groupePartage})` : 'config.yaml ecrit';
  });

  if (platforms.claude) {
    await step('claude', 'Installation Claude Code', async () => {
      const claudeSource = path.join(templateDir, '.claude');
      if (await fs.pathExists(claudeSource)) {
        await fs.ensureDir(path.join(projectRoot, '.claude', 'rules'));
        await fs.copy(claudeSource, path.join(projectRoot, '.claude'), { overwrite: true });
      }
      await claudeSetup(projectRoot);
      return '.claude copie + configuration native (hooks, skills, .mcp.json, dependances MCP)';
    });
  }

  if (platforms.codex && !homeDouteux) {
    await step('codex', 'Installation Codex', async () => {
      // homeDir est celui de l'utilisateur CIBLE : sans lui, ~/.codex partait
      // dans /root sous elevation.
      await codexSetup(projectRoot, { templateDir, force: true, homeDir, apiUrl: api.url });
      return 'squelettes .codex + config';
    }, { critical: false });
  }

  if (aDesCredentials && !homeDouteux) {
    await step('credentials', 'Memorisation de la configuration', async () => {
      const merged = homeCreds.writeCredentials(credentials, { homeDir });
      return `${Object.keys(merged).length} cle(s) en memoire dans ${homeCreds.credentialsPath(homeDir)}`;
    }, { critical: false });
  }

  // Chemin non-interactif : la purge des cles Google obsoletes tourne aussi
  // sans passage par byan-web-integration (parite avec le flux interactif).
  if (!homeDouteux) {
    await step('google-purge', 'Retrait des cles Google obsoletes', async () => {
      const r = homeCreds.purgeGoogleKeys({ homeDir });
      return r.purged.length ? `${r.purged.length} cle(s) Google retiree(s)` : 'aucune cle Google presente';
    }, { critical: false });
  }

  if (platforms.claude && !homeDouteux) {
    await step('skills-sync', 'Controle des copies globales de skills', async () => {
      const r = await offerGlobalSkillsSync(projectRoot, templateDir, { ask: hooks.ask || null, homeDir, log });
      return r.diverged.length === 0 ? 'copies globales fideles' : `${r.diverged.length} divergente(s), ${r.synced.length} synchronisee(s)`;
    }, { critical: false });
  }

  if (rtk) {
    await step('rtk', 'Verification / installation de rtk', async () => {
      if (detected.rtk) return 'rtk deja present';
      const rtkInstall = hooks.rtkInstall || (() => {
        // The official rtk setup script shipped with this package. Non-TTY
        // safe: it runs unattended; a failure is reported, never fatal.
        //
        // DESCENTE DE PRIVILEGE, pas reprise apres coup. Ce script delegue a
        // brew, curl ou cargo, qui ecrivent dans le HOME (~/.cargo, les caches).
        // Une reprise posterieure ne saurait pas ce que cargo a touche hors du
        // projet ; il faut donc que le sous-processus tourne d'emblee sous
        // l'identite de la cible, avec SON home.
        const script = path.join(__dirname, '..', 'setup-rtk.js');
        const spawnOptions = { encoding: 'utf8', timeout: 300000 };

        // LA DESCENTE EST ENTIERE OU N'A PAS LIEU.
        //
        // Node ignore silencieusement un gid null : le sous-processus tournait
        // alors sous l'uid de la cible mais gardait le GROUPE root, et tout ce
        // que cargo posait dans son cache arrivait avec un groupe qu'elle ne
        // controle pas. Un depouillement a moitie fait est pire qu'un refus
        // clair, parce qu'il ne se voit pas.
        const descendable = cible.elevated
          && process.platform !== 'win32'
          && typeof cible.uid === 'number' && cible.uid !== 0
          && typeof cible.gid === 'number';
        if (cible.elevated && !descendable && process.platform !== 'win32') {
          throw new Error('descente de privilege impossible (uid ou gid de la cible inconnu) : rtk n\'est pas installe pour eviter de poser des fichiers au nom de root');
        }
        if (descendable) {
          spawnOptions.uid = cible.uid;
          spawnOptions.gid = cible.gid;
          // L'environnement transmis est NETTOYE : garder SUDO_* ferait croire
          // au sous-processus qu'il tourne encore sous elevation, et le PATH de
          // root ne contient pas les dossiers de la cible.
          const envPropre = { ...process.env };
          for (const cle of Object.keys(envPropre)) {
            if (/^(SUDO_|DOAS_|PKEXEC_)/.test(cle)) delete envPropre[cle];
          }
          spawnOptions.env = {
            ...envPropre,
            HOME: homeDir,
            USER: cible.name || '',
            LOGNAME: cible.name || '',
            PATH: [path.join(homeDir, '.local', 'bin'), path.join(homeDir, '.cargo', 'bin'), envPropre.PATH || '']
              .filter(Boolean).join(path.delimiter),
          };
        }
        const r = spawnSync(process.execPath, [script], spawnOptions);
        // La cause du refus fait partie du message : un EPERM sur le spawn ne
        // se lit pas dans un code de sortie absent.
        if (r.error) throw new Error(`setup-rtk n'a pas pu demarrer (${r.error.code || r.error.message})`);
        if (r.status !== 0) throw new Error(`setup-rtk sortie ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
        return 'rtk installe';
      });
      return rtkInstall();
    }, { critical: false });
  }

  // La reprise des droits ferme la marche, apres tous les sous-processus.
  let ownership = null;
  if (!raisonDroits) {
    await step('ownership', 'Reprise du proprietaire et des droits', async () => {
      const dit = [];
      const reprendre = hooks.ensureOwnership || ensureOwnership;
      // Le chemin est RESOLU : les etapes d'ecriture suivent les liens
      // symboliques, la reprise doit viser la meme arborescence qu'elles.
      const racine = cheminResolu(projectRoot);
      // Le groupe partage, quand il existe, s'applique a TOUTE l'arborescence.
      // Le poser sur la seule racine ne donne acces a rien : les fichiers
      // gardent le groupe primaire de la cible.
      const gidVise = gidGroupe !== null ? gidGroupe : cible.gid;
      const reprise = reprendre(racine, { uid: cible.uid, gid: gidVise }, { groupWritable: gidGroupe !== null });
      ownership = { ...reprise, target: { uid: cible.uid, gid: cible.gid, name: cible.name, source: cible.source } };
      dit.push(`proprietaire ${cible.name || cible.uid} : ${reprise.outcome}${reprise.changed ? ` (${reprise.changed} entree(s))` : ''}`);
      for (const err of (reprise.errors || []).slice(0, 3)) log(`[!] droits : ${err.path || ''} ${err.message || err}`);

      // LES ECRITURES DANS LE HOME SUIVENT L'UTILISATEUR, PAS LE DOSSIER CIBLE.
      //
      // Deux classes d'ecritures, deux regles. Router ~/.byan et ~/.codex vers
      // le bon home ne suffit pas : sous elevation, le fichier y arrive quand
      // meme en root:root. Pour credentials.json, ecrit en 0600, ca donne un
      // fichier de secrets que son proprietaire ne peut plus lire — un etat pire
      // que la panne d'origine, ou il etait seulement au mauvais endroit.
      const reprisesHome = [];
      if (!homeResolu) {
        ownership.homeSkipped = 'home de la cible non resolu : les ecritures hors projet ne sont pas reprises';
        log(`[i] ${ownership.homeSkipped}`);
      } else {
        const dansLeHome = [
          path.join(homeDir, '.byan'),
          path.join(homeDir, '.codex'),
          path.join(homeDir, '.claude', 'skills'),
        ];
        for (const cheminHome of dansLeHome) {
          if (!fs.existsSync(cheminHome)) continue;
          reprisesHome.push({ path: cheminHome, ...reprendre(cheminHome, { uid: cible.uid, gid: cible.gid }) });
        }
        if (reprisesHome.length) {
          ownership.home = reprisesHome;
          const repris = reprisesHome.reduce((n, r) => n + (r.changed || 0), 0);
          dit.push(`home : ${reprisesHome.length} emplacement(s), ${repris} entree(s)`);
        }
      }

      if (groupePartage) {
        const g = (hooks.ensureSharedGroup || ensureSharedGroup)(cheminResolu(projectRoot), groupePartage);
        ownership.group = { name: groupePartage, ...g };
        dit.push(`groupe ${groupePartage} : ${g.outcome}${g.gid ? ` (gid ${g.gid})` : ''}`);
        for (const w of g.warnings || []) log(`[i] ${w}`);

        // Le module abaisse le umask du PROCESSUS et rend l'ancienne valeur en
        // ecrivant que l'appelant doit la restaurer. Sans cette restitution, le
        // reste de la commande — et le `claude` qu'elle lance — heriterait d'un
        // umask 002 qu'aucun d'eux n'a demande.
        if (typeof g.previousUmask === 'number' && typeof process.umask === 'function') {
          try {
            process.umask(g.previousUmask);
            ownership.group.umaskRestored = true;
          } catch (err) {
            log(`[i] umask non restaure : ${err.message}`);
          }
        }
      }

      // UNE ISSUE D'ENSEMBLE. La reprise du projet, celle du home et la pose du
      // groupe peuvent diverger : sans agregation, un echec sur ~/.byan restait
      // invisible dans le rapport, alors que c'est le fichier de secrets.
      const issues = [reprise.outcome]
        .concat(reprisesHome.map((r) => r.outcome))
        .concat(ownership.group ? [ownership.group.outcome] : []);
      ownership.overall = issues.includes('failed') ? 'failed'
        : issues.every((o) => o === 'not-applicable') ? 'not-applicable'
          : 'ok';
      if (ownership.overall === 'failed') {
        const rates = reprisesHome.filter((r) => r.outcome === 'failed').map((r) => r.path);
        if (rates.length) {
          ownership.homeFailed = rates;
          dit.push(`echec dans le home : ${rates.join(', ')}`);
        }
        throw new Error(`reprise des droits incomplete : ${dit.join(' ; ')}`);
      }
      return dit.join(' ; ');
    }, { critical: false });
  }

  // Meme principe que le plan : la liste des controles porte l'ensemble intendu.
  // Avant, les quatre controles Claude n'etaient meme pas ajoutes quand Claude
  // etait absent, et le rapport annoncait "4/4 controles OK" sur un perimetre
  // reduit en silence. Ils figurent maintenant, marques sautes avec leur raison.
  let verify = { passed: 0, total: 0, failed: [], skipped: [], intendedTotal: 0 };
  await step('verify', 'Verification finale', async () => {
    const raisonClaude = platforms.claude ? null : 'Claude Code non detecte sur cette machine';
    const checks = [
      { name: 'Dossier agents', p: path.join(byanDir, 'agent') },
      { name: 'Agent BYAN', p: path.join(byanDir, 'agent', 'byan', 'byan.md') },
      { name: 'Workflows', p: path.join(byanDir, 'workflow') },
      { name: 'Config', p: path.join(byanDir, 'bmb', 'config.yaml') },
      { name: 'CLAUDE.md', p: path.join(projectRoot, '.claude', 'CLAUDE.md'), skipReason: raisonClaude },
      { name: 'Regles Claude', p: path.join(projectRoot, '.claude', 'rules'), skipReason: raisonClaude },
      { name: 'Skill byan-byan', p: path.join(projectRoot, '.claude', 'skills', 'byan-byan', 'SKILL.md'), skipReason: raisonClaude },
      { name: 'Workflow auto-dispatch', p: path.join(projectRoot, '.claude', 'workflows', 'byan-auto-dispatch.js'), skipReason: raisonClaude },
    ];
    const applicables = checks.filter((c) => !c.skipReason);
    const skipped = checks.filter((c) => c.skipReason).map((c) => ({ name: c.name, reason: c.skipReason }));
    const failed = [];
    for (const c of applicables) {
      if (!await fs.pathExists(c.p)) failed.push(c.name);
    }
    verify = {
      passed: applicables.length - failed.length,
      total: applicables.length,
      failed,
      skipped,
      intendedTotal: checks.length,
    };
    if (failed.length) throw new Error(`verification incomplete : ${failed.join(', ')}`);
    const suffixe = skipped.length ? ` — ${skipped.length} controle(s) sur ${checks.length} sautes : ${skipped[0].reason}` : '';
    return `${verify.passed}/${verify.total} controles OK${suffixe}`;
  });

  // OK EST FONDE SUR LES ECHECS, PAS SUR UNE LISTE D'ETAPES CRITIQUES.
  //
  // L'ancien calcul ne pouvait structurellement pas basculer : les cinq etapes
  // listees comme critiques levent toutes, donc runInstall n'atteignait jamais
  // ce point avec l'une d'elles en echec, et les etapes laterales n'entraient
  // pas dans le test. ok valait vrai par construction.
  //
  // La question honnete est : une etape INTENDUE a-t-elle echoue ? Trois etapes
  // restent tolerantes parce qu'elles n'alterent pas ce qui est livre — rtk est
  // un outil d'appoint, la purge Google et le controle des copies globales ne
  // touchent pas le projet. Tout le reste compte.
  const TOLERANTES = new Set(['rtk', 'google-purge', 'skills-sync']);
  const steps = intended.map((s) => etats.get(s.id));
  const echecs = steps.filter((r) => r.status === 'failed' && !TOLERANTES.has(r.id));
  const ok = echecs.length === 0;

  return {
    ok,
    steps,
    skipped: steps.filter((r) => r.status === 'skipped').map((r) => ({ id: r.id, reason: r.reason })),
    verify,
    // Qui a ete pris pour cible, et ou la detection a cherche. Sans ces deux
    // champs, "Claude Code introuvable" reste une affirmation invérifiable.
    targetUser: { uid: cible.uid, gid: cible.gid, name: cible.name, home: cible.home, source: cible.source, elevated: cible.elevated },
    detection: detected.searched || null,
    ownership,
    failed: echecs.map((r) => ({ id: r.id, detail: r.detail })),
    // La sonde finale interroge le MEME home que la detection. Sans ca, elle
    // repartait sur le PATH et le home du processus : sous elevation, elle
    // annoncait "Claude Code introuvable" apres une detection qui l'avait
    // trouve deux minutes plus tot.
    launch: (hooks.launchProbe || (() => claudeLaunchCommand({
      exists: (c) => resolveCommandExists(c, { home: homeDir }),
    })))(),
  };
}

function readOwnVersion() {
  try {
    return fs.readJSONSync(path.join(__dirname, '..', '..', 'package.json')).version;
  } catch {
    return 'unknown';
  }
}

module.exports = {
  runInstall,
  installationEnRootAssumee,
  detectEnvironment,
  claudeLaunchCommand,
  BYAN_DIRS,
};
