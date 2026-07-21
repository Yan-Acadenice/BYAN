'use strict';

/**
 * GLOBAL SKILLS SYNC — closes the "stale global copy masks the fresh install"
 * trap at INSTALL TIME.
 *
 * Field failure (2026-07-21): the installer laid a fully up-to-date
 * .claude/skills/ in the project, but the user's manual copies under
 * ~/.claude/skills/ (same names, months old) kept being the ones the slash
 * command loaded — the freshly installed features stayed invisible. The
 * session-start freshness hook flags this at the NEXT session; the installer
 * can flag it at the very moment it creates the situation, and it has a TTY to
 * ask. Red line kept from the hook: no silent write into the user's home —
 * consent is asked, refusal or a non-interactive terminal degrades to a clear
 * notice with the exact command.
 *
 * The comparison core is NOT duplicated: we require compareSkills from the
 * .claude payload this very package ships (templates/.claude/hooks/lib/
 * skill-freshness.js), the same tested module the session hook uses.
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

function loadComparator(templateDir) {
  return require(path.join(templateDir, '.claude', 'hooks', 'lib', 'skill-freshness.js'));
}

/**
 * Compare the project's freshly installed skills with same-named global copies.
 * Silent-safe: any failure (no global dir, unreadable comparator) yields an
 * empty result — this check must never break an install.
 *
 * @returns {Promise<{diverged: string[], checked: number}>}
 */
async function checkGlobalSkills(projectRoot, templateDir, { homeDir = os.homedir() } = {}) {
  try {
    const globalSkillsDir = path.join(homeDir, '.claude', 'skills');
    if (!await fs.pathExists(globalSkillsDir)) return { diverged: [], checked: 0 };
    const { compareSkills } = loadComparator(templateDir);
    return compareSkills({
      projectSkillsDir: path.join(projectRoot, '.claude', 'skills'),
      globalSkillsDir,
    });
  } catch {
    return { diverged: [], checked: 0 };
  }
}

/**
 * Copy the project SKILL.md over the global copy, per name. Only called after
 * explicit consent. Returns the names actually synced (a per-name failure is
 * skipped, never thrown).
 */
async function syncGlobalSkills(projectRoot, names, { homeDir = os.homedir() } = {}) {
  const synced = [];
  for (const name of names) {
    try {
      const src = path.join(projectRoot, '.claude', 'skills', name, 'SKILL.md');
      const dest = path.join(homeDir, '.claude', 'skills', name, 'SKILL.md');
      await fs.copy(src, dest, { overwrite: true });
      synced.push(name);
    } catch {
      // one bad copy must not abort the others
    }
  }
  return synced;
}

/** The exact copy-paste command shown when we do not write ourselves. */
function syncCommand(names, { homeDir = os.homedir() } = {}) {
  const globalDir = path.join(homeDir, '.claude', 'skills');
  return names
    .map((n) => `cp .claude/skills/${n}/SKILL.md ${path.join(globalDir, n, 'SKILL.md')}`)
    .join('\n');
}

/**
 * End-of-install offer.
 *
 * @param {string} projectRoot
 * @param {string} templateDir
 * @param {Object} opts
 * @param {(question: string) => Promise<boolean>} [opts.ask] - Consent
 *   collector (inquirer in the CLI). Absent (non-interactive) -> never write,
 *   notice only.
 * @param {(line: string) => void} [opts.log]
 * @returns {Promise<{diverged: string[], synced: string[]}>}
 */
async function offerGlobalSkillsSync(projectRoot, templateDir, { ask = null, homeDir = os.homedir(), log = console.log } = {}) {
  const { diverged } = await checkGlobalSkills(projectRoot, templateDir, { homeDir });
  if (diverged.length === 0) return { diverged: [], synced: [] };

  log(`  [!] ${diverged.length} skill(s) globaux divergents dans ~/.claude/skills : ${diverged.join(', ')}`);
  log('      Ces copies datent d\'avant cette installation et peuvent etre celles que la');
  log('      commande /<skill> charge — les nouveautes resteraient invisibles.');

  let synced = [];
  if (typeof ask === 'function') {
    const yes = await ask('Synchroniser ces copies globales depuis le projet (sauvegarde du contenu : aucune — elles seront ecrasees) ?');
    if (yes) {
      synced = await syncGlobalSkills(projectRoot, diverged, { homeDir });
      log(`  [OK] ${synced.length} copie(s) globale(s) synchronisee(s) depuis le projet`);
      return { diverged, synced };
    }
  }
  log('      Rien n\'a ete modifie dans ~/.claude. Pour synchroniser toi-meme :');
  for (const line of syncCommand(diverged, { homeDir }).split('\n')) log(`        ${line}`);
  return { diverged, synced };
}

module.exports = {
  checkGlobalSkills,
  syncGlobalSkills,
  syncCommand,
  offerGlobalSkillsSync,
};
