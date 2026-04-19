#!/usr/bin/env node
/**
 * BYAN cleanup CLI.
 *
 * Scans the current project for stale Claude Code skills and stale
 * root-level doc files, then archives them (safe default) or hard
 * deletes (with --hard).
 *
 * Flags :
 *   --dry-run   list candidates, do nothing
 *   --yes       skip confirmation (batch mode)
 *   --hard      delete instead of archive
 *   --skills-only | --docs-only   restrict scope
 *   --root <dir>  override project root (default cwd)
 */

const path = require('path');
const { findStaleSkills, findStaleDocs } = require('../lib/cleanup/detector');
const { archive, deleteHard } = require('../lib/cleanup/executor');

function parseArgs(argv) {
  const out = {
    dryRun: false,
    yes: false,
    hard: false,
    skillsOnly: false,
    docsOnly: false,
    root: process.cwd(),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--hard') out.hard = true;
    else if (a === '--skills-only') out.skillsOnly = true;
    else if (a === '--docs-only') out.docsOnly = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function usage() {
  console.log(
    [
      'byan-cleanup — scan a BYAN project for stale skills + docs',
      '',
      'Usage:',
      '  byan-cleanup [--dry-run] [--yes] [--hard] [--skills-only|--docs-only] [--root <dir>]',
      '',
      'Flags:',
      '  --dry-run      list candidates, do nothing',
      '  --yes          skip confirmation (batch mode)',
      '  --hard         delete instead of archive (default: archive)',
      '  --skills-only  scan only .claude/skills/',
      '  --docs-only    scan only root *.md / *.txt',
      '  --root <dir>   project root (default: cwd)',
      '',
      'Default behavior: archive to _byan-output/archive/<timestamp>/',
    ].join('\n')
  );
}

function fmtSize(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function printGroup(label, items) {
  if (items.length === 0) {
    console.log(`\n  ${label}: none`);
    return;
  }
  console.log(`\n  ${label} (${items.length}):`);
  for (const it of items) {
    console.log(`    - ${it.name}  ${fmtSize(it.size || 0)}`);
    for (const r of it.reasons) console.log(`        · ${r}`);
  }
}

async function confirm(prompt) {
  if (process.stdin.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(prompt, (ans) => {
        rl.close();
        resolve(/^y(es)?$/i.test((ans || '').trim()));
      });
    });
  }
  // non-TTY : refuse action unless --yes
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  const root = path.resolve(args.root);
  const skillsDir = path.join(root, '.claude', 'skills');

  const skills = args.docsOnly ? [] : findStaleSkills(skillsDir);
  const docs = args.skillsOnly ? [] : findStaleDocs(root);

  console.log(`BYAN cleanup scan — root: ${root}`);
  printGroup('Stale skills', skills);
  printGroup('Stale docs', docs);
  const total = skills.length + docs.length;
  console.log(`\n  Total candidates: ${total}`);

  if (args.dryRun) {
    console.log('\n--dry-run: no action taken.');
    process.exit(0);
  }

  if (total === 0) {
    console.log('Nothing to clean.');
    process.exit(0);
  }

  const action = args.hard ? 'HARD DELETE (irreversible)' : 'archive to _byan-output/archive/<timestamp>/';
  console.log(`\nAction: ${action}`);

  let proceed = args.yes;
  if (!proceed) {
    proceed = await confirm(`Proceed with ${total} item(s) ? (y/N): `);
  }

  if (!proceed) {
    console.log('Aborted.');
    process.exit(0);
  }

  const all = [...skills, ...docs];
  if (args.hard) {
    const r = deleteHard(all);
    console.log(`\nDeleted ${r.deleted.length} items.`);
    if (r.errors.length) console.log(`Errors: ${r.errors.length}`);
    for (const e of r.errors) console.log(`  ! ${e.path} — ${e.error}`);
  } else {
    const r = archive(all, { archiveRoot: path.join(root, '_byan-output', 'archive') });
    console.log(`\nArchived ${r.moved.length} items to ${r.archiveDir}`);
    if (r.errors.length) console.log(`Errors: ${r.errors.length}`);
    for (const e of r.errors) console.log(`  ! ${e.path} — ${e.error}`);
  }
}

main().catch((err) => {
  console.error('byan-cleanup failed:', err.message);
  process.exit(1);
});
