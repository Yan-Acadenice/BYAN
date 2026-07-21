#!/usr/bin/env node
'use strict';

// SessionStart hook — stale-global-skill guard (I/O shell over
// lib/skill-freshness.js).
//
// At each session start, compare the project's .claude/skills/<n>/SKILL.md with
// the same-named ~/.claude/skills/<n>/SKILL.md. On a content divergence, inject
// one bounded factual reminder (names + exact sync command). Silent when
// everything is faithful, when there is no global copy, or when the project has
// no skills. NEVER blocks a session: exit 0 on every path, including internal
// errors. It never writes into ~/.claude — it reports, the human decides.

const os = require('os');
const path = require('path');
const freshness = require('./lib/skill-freshness');

function buildContext(projectDir, homeDir) {
  const projectSkillsDir = path.join(projectDir, '.claude', 'skills');
  const globalSkillsDir = path.join(homeDir, '.claude', 'skills');
  const { diverged } = freshness.compareSkills({ projectSkillsDir, globalSkillsDir });
  return freshness.formatReminder(diverged, {
    projectSkillsDir: '.claude/skills',
    globalSkillsDir: path.join(homeDir, '.claude', 'skills'),
  });
}

if (require.main === module) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const ctx = buildContext(projectDir, os.homedir());
    if (ctx) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: ctx,
          },
        })
      );
    }
  } catch {
    // A guard must never take a session down with it.
  }
  process.exit(0);
}

module.exports = { buildContext };
