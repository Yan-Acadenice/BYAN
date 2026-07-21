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

// Gen3 by-type dirs copied from templates/_byan (same list as the legacy bin).
const BYAN_DIRS = ['agent', 'workflow', 'connaissance', 'command', 'worker', 'memoire',
  'core', 'bmb', 'bmm', 'tea', 'cis', '_config', 'data'];

function defaultTemplateDir() {
  const p = path.join(__dirname, '..', 'templates');
  return fs.existsSync(p) ? p : null;
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore', shell: '/bin/sh' });
    return true;
  } catch {
    return false;
  }
}

/** Detection: platforms on this machine + stored credentials. Facts only. */
function detectEnvironment({ homeDir = os.homedir() } = {}) {
  return {
    claude: fs.existsSync(path.join(homeDir, '.claude')) || commandExists('claude'),
    codex: fs.existsSync(path.join(homeDir, '.codex')) || commandExists('codex'),
    rtk: commandExists('rtk'),
    storedCredentialKeys: homeCreds.storedKeys({ homeDir }),
  };
}

/**
 * The Claude Code launch command for the end of install. The byan-channel is a
 * Claude Code research-preview feature behind an explicit flag; when the
 * installed CLI does not know the flag, the plain `claude` command is the
 * fallback. We only BUILD the command here — executing it is the caller's move.
 */
function claudeLaunchCommand() {
  if (!commandExists('claude')) return null;
  let helpText = '';
  try {
    helpText = execSync('claude --help', { encoding: 'utf8', timeout: 8000 });
  } catch {
    return { command: 'claude', channel: false };
  }
  const supportsChannel = helpText.includes('dangerously-load-development-channels');
  return supportsChannel
    ? { command: 'claude --dangerously-load-development-channels server:byan-channel', channel: true }
    : { command: 'claude', channel: false };
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
  const {
    projectRoot,
    projectName = path.basename(options.projectRoot || ''),
    templateDir = defaultTemplateDir(),
    userName = 'Developer',
    language = 'Francais',
    rtk = true,
    credentials = null,
    homeDir = os.homedir(),
  } = options;
  const onStep = hooks.onStep || (() => {});
  const log = hooks.log || (() => {});
  const claudeSetup = hooks.claudeSetup || setupClaudeNative;
  const codexSetup = hooks.codexSetup || setupCodexNative;

  if (!projectRoot) throw new Error('projectRoot est requis');
  if (!templateDir || !fs.existsSync(path.join(templateDir, '_byan'))) {
    throw new Error(`templates introuvables (${templateDir || 'aucun chemin'})`);
  }

  // Detection is injectable so tests do not depend on what THIS machine has.
  const detected = hooks.detect ? hooks.detect() : detectEnvironment({ homeDir });
  const platforms = options.platforms || { claude: detected.claude, codex: detected.codex };
  const byanDir = path.join(projectRoot, '_byan');
  const results = [];

  // Step plan is computed FIRST so index/total are stable and honest.
  const plan = [
    { id: 'detect', label: 'Detection de l\'environnement' },
    { id: 'copy-byan', label: 'Copie de la plateforme _byan/' },
    { id: 'config', label: 'Ecriture de la configuration du projet' },
  ];
  if (platforms.claude) plan.push({ id: 'claude', label: 'Installation Claude Code (.claude + serveur MCP + .mcp.json)' });
  if (platforms.codex) plan.push({ id: 'codex', label: 'Installation Codex (~/.codex)' });
  if (credentials && Object.keys(credentials).length) plan.push({ id: 'credentials', label: 'Memorisation de la configuration (~/.byan/credentials.json)' });
  if (platforms.claude) plan.push({ id: 'skills-sync', label: 'Controle des copies globales de skills' });
  if (rtk) plan.push({ id: 'rtk', label: 'Verification / installation de rtk' });
  plan.push({ id: 'verify', label: 'Verification finale' });

  let index = 0;
  const step = async (id, label, fn, { critical = true } = {}) => {
    index += 1;
    onStep({ index, total: plan.length, id, label });
    try {
      const detail = await fn();
      results.push({ id, ok: true, detail: detail || '' });
    } catch (err) {
      results.push({ id, ok: false, detail: err.message });
      if (critical) throw err;
      log(`[!] etape ${id} en echec (non bloquant) : ${err.message}`);
    }
  };

  await step('detect', plan[0].label, async () => {
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
    const configContent = {
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
    await fs.writeFile(path.join(bmbDir, 'config.yaml'), yaml.dump(configContent), 'utf8');
    return 'config.yaml ecrit';
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

  if (platforms.codex) {
    await step('codex', 'Installation Codex', async () => {
      await codexSetup(projectRoot, { templateDir, force: true });
      return 'squelettes .codex + config';
    }, { critical: false });
  }

  if (credentials && Object.keys(credentials).length) {
    await step('credentials', 'Memorisation de la configuration', async () => {
      const merged = homeCreds.writeCredentials(credentials, { homeDir });
      return `${Object.keys(merged).length} cle(s) en memoire dans ${homeCreds.credentialsPath(homeDir)}`;
    }, { critical: false });
  }

  if (platforms.claude) {
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
        const script = path.join(__dirname, '..', 'setup-rtk.js');
        const r = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 300000 });
        if (r.status !== 0) throw new Error(`setup-rtk sortie ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
        return 'rtk installe';
      });
      return rtkInstall();
    }, { critical: false });
  }

  let verify = { passed: 0, total: 0, failed: [] };
  await step('verify', 'Verification finale', async () => {
    const checks = [
      { name: 'Dossier agents', p: path.join(byanDir, 'agent') },
      { name: 'Agent BYAN', p: path.join(byanDir, 'agent', 'byan', 'byan.md') },
      { name: 'Workflows', p: path.join(byanDir, 'workflow') },
      { name: 'Config', p: path.join(byanDir, 'bmb', 'config.yaml') },
    ];
    if (platforms.claude) {
      checks.push(
        { name: 'CLAUDE.md', p: path.join(projectRoot, '.claude', 'CLAUDE.md') },
        { name: 'Regles Claude', p: path.join(projectRoot, '.claude', 'rules') },
        { name: 'Skill byan-byan', p: path.join(projectRoot, '.claude', 'skills', 'byan-byan', 'SKILL.md') },
        { name: 'Workflow auto-dispatch', p: path.join(projectRoot, '.claude', 'workflows', 'byan-auto-dispatch.js') },
      );
    }
    const failed = [];
    for (const c of checks) {
      if (!await fs.pathExists(c.p)) failed.push(c.name);
    }
    verify = { passed: checks.length - failed.length, total: checks.length, failed };
    if (failed.length) throw new Error(`verification incomplete : ${failed.join(', ')}`);
    return `${verify.passed}/${verify.total} controles OK`;
  });

  return {
    ok: results.every((r) => r.ok || !['detect', 'copy-byan', 'config', 'claude', 'verify'].includes(r.id)),
    steps: results,
    verify,
    launch: claudeLaunchCommand(),
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
  detectEnvironment,
  claudeLaunchCommand,
  BYAN_DIRS,
};
