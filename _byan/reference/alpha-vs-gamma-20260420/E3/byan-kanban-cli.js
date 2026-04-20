#!/usr/bin/env node
// E3 — byan-kanban CLI. Lists sessions, renders board + standups.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getBoard, readStandups, KANBAN_COLUMNS } from './kanban.js';

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
};

const COLUMN_COLOR = {
  todo: ANSI.dim,
  doing: ANSI.yellow,
  blocked: ANSI.red,
  review: ANSI.cyan,
  done: ANSI.green,
};

function parseArgs(argv) {
  const out = { _: [], json: false, standupsOnly: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--standups-only') out.standupsOnly = true;
    else if (a === '--root') { out.root = argv[++i]; }
    else if (a.startsWith('--root=')) { out.root = a.slice(7); }
    else out._.push(a);
  }
  return out;
}

async function listSessions(root) {
  const base = path.join(root, '_byan-output', 'party-mode-sessions');
  let entries;
  try { entries = await fs.readdir(base, { withFileTypes: true }); }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const rows = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(base, e.name);
    const hasK = await fs.access(path.join(dir, 'kanban.json')).then(() => true).catch(() => false);
    const hasS = await fs.access(path.join(dir, 'standup.jsonl')).then(() => true).catch(() => false);
    rows.push({ sessionId: e.name, hasKanban: hasK, hasStandup: hasS });
  }
  return rows;
}

function renderList(rows) {
  if (rows.length === 0) { console.log('(no party-mode sessions)'); return; }
  console.log(`${ANSI.bold}SESSION                              K S${ANSI.reset}`);
  for (const r of rows) {
    const k = r.hasKanban ? 'K' : '-';
    const s = r.hasStandup ? 'S' : '-';
    console.log(`${r.sessionId.padEnd(36)} ${k} ${s}`);
  }
}

function renderBoard(board) {
  if (!board) { console.log('(no board)'); return; }
  console.log(`${ANSI.bold}Kanban — session ${board.sessionId}${ANSI.reset}  (updated ${board.updatedAt})`);
  for (const col of KANBAN_COLUMNS) {
    const color = COLUMN_COLOR[col] || '';
    const ids = board.columns[col] || [];
    console.log(`\n${color}${ANSI.bold}[${col.toUpperCase()}] (${ids.length})${ANSI.reset}`);
    for (const id of ids) {
      const c = board.cards[id];
      if (!c) continue;
      const assignee = c.assignee ? ` @${c.assignee}` : '';
      const pri = c.priority ? ` ${c.priority}` : '';
      const blk = c.blocker_reason ? `  blocker: ${c.blocker_reason}` : '';
      console.log(`${color}  - ${c.id}${pri}${assignee}  ${c.title}${blk}${ANSI.reset}`);
    }
  }
}

function renderStandups(entries) {
  if (!entries.length) { console.log('\n(no stand-ups)'); return; }
  console.log(`\n${ANSI.bold}Last ${entries.length} stand-ups${ANSI.reset}`);
  for (const e of entries) {
    const blockerFlag = (e.blockers && e.blockers.length) ? `${ANSI.red}[BLOCKED]${ANSI.reset} ` : '';
    console.log(`  ${e.timestamp}  ${blockerFlag}${ANSI.bold}${e.agent}${ANSI.reset}`);
    if (e.did && e.did.length) console.log(`    did: ${e.did.join(' | ')}`);
    if (e.blockers && e.blockers.length) console.log(`    blockers: ${e.blockers.join(' | ')}`);
    if (e.next && e.next.length) console.log(`    next: ${e.next.join(' | ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const first = args._[0];

  if (!first || first === 'list') {
    const rows = await listSessions(root);
    if (args.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    renderList(rows);
    return;
  }

  const sessionId = first;
  const board = await getBoard({ sessionId, projectRoot: root });
  const standups = await readStandups({ sessionId, projectRoot: root, limit: 10 });

  if (args.json) {
    console.log(JSON.stringify({ board, standups }, null, 2));
    return;
  }

  if (!args.standupsOnly) renderBoard(board);
  renderStandups(standups);
}

const isMain = (() => {
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || ''); }
  catch { return false; }
})();

if (isMain) {
  main().catch((err) => { console.error('error:', err.message); process.exit(1); });
}
