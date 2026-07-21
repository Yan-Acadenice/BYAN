'use strict';

// skill-freshness — the pure core of the stale-global-skill guard.
//
// The trap this closes (observed 2026-07-21): a manual copy of a skill under
// ~/.claude/skills/<name>/SKILL.md drifts silently, and the slash command can
// load THAT copy instead of the project's .claude/skills/<name>/SKILL.md — so a
// feature shipped in the project skill stays invisible (the 2.53.0 auto-dispatch
// rail did not fire because of a June 30 global copy). The official Claude Code
// docs do not clearly settle the name-collision priority between the two levels
// (checked 2026-07-21), so this guard flags the FACT — the two files differ —
// and hands the human the exact sync command; it does not claim a loading rule
// and it never writes into ~/.claude itself (a user-level variant may be
// deliberate; the human decides).
//
// Pure: comparison + decision + message. The I/O shell (SessionStart hook)
// feeds it directories and prints the reminder.

const fs = require('fs');
const path = require('path');

// Compare the project's skills with same-named global copies, by CONTENT.
// A newer mtime does not mean "up to date"; byte equality means "faithful".
// Returns { diverged: [name...], checked: <count> }; every fs error on one
// skill is swallowed (that skill is simply not compared) so a permission oddity
// can never break the caller.
function compareSkills({ projectSkillsDir, globalSkillsDir }) {
  const out = { diverged: [], checked: 0 };
  let names;
  try {
    names = fs.readdirSync(projectSkillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return out; // project has no skills dir -> nothing to compare
  }
  for (const name of names) {
    try {
      const proj = path.join(projectSkillsDir, name, 'SKILL.md');
      const glob = path.join(globalSkillsDir, name, 'SKILL.md');
      if (!fs.existsSync(glob)) continue; // no global twin -> no masking risk
      const a = fs.readFileSync(proj);
      const b = fs.readFileSync(glob);
      out.checked += 1;
      if (!a.equals(b)) out.diverged.push(name);
    } catch {
      // unreadable pair -> skip silently (never block a session start)
    }
  }
  return out;
}

// Bounded, factual reminder. Empty string when nothing diverged (the hook then
// prints nothing at all). Names are capped so a badly drifted machine does not
// flood the context; the sync command is exact and copy-pastable.
const MAX_NAMES = 6;

// A skill dir name lands verbatim in the injected context and in the suggested
// cp command. Legit names are kebab-case; strip control chars and whitespace
// runs from anything else so a crafted dir name cannot shape the reminder.
function cleanName(n) {
  return String(n).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatReminder(diverged, { projectSkillsDir = '.claude/skills', globalSkillsDir = '~/.claude/skills' } = {}) {
  if (!Array.isArray(diverged) || diverged.length === 0) return '';
  const names = diverged.map(cleanName);
  const shown = names.slice(0, MAX_NAMES).join(', ');
  const more = names.length > MAX_NAMES ? ` (+${names.length - MAX_NAMES} autres)` : '';
  const one = names[0];
  return [
    `Skills globaux divergents detectes : ${shown}${more}.`,
    `La copie ${globalSkillsDir}/<nom>/SKILL.md differe du skill projet — elle peut etre celle que la commande /<nom> charge (constate sur ce piege le 2026-07-21).`,
    `Synchronise depuis le projet (ex: cp ${projectSkillsDir}/${one}/SKILL.md ${globalSkillsDir}/${one}/SKILL.md) ou supprime la copie globale si elle n'est pas voulue.`,
    `Rien n'est modifie automatiquement : une variante user-level peut etre deliberee.`,
  ].join(' ');
}

module.exports = {
  compareSkills,
  formatReminder,
  MAX_NAMES,
};
