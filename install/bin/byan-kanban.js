#!/usr/bin/env node
/**
 * BYAN kanban CLI — view a party-mode-session board and stand-up feed.
 *
 * Usage :
 *   byan-kanban <session-id>           # show board + recent stand-ups
 *   byan-kanban <session-id> --json
 *   byan-kanban <session-id> --standups-only
 *   byan-kanban list                   # list known sessions with boards
 *   byan-kanban <session-id> --root <dir>
 */

const fs = require('fs');
const path = require('path');

const COLORS = { todo: 90, doing: 33, blocked: 31, review: 36, done: 32, dim: 2, reset: 0 };
const FG = (n, s) => `\x1b[${n}m${s}\x1b[0m`;

function parseArgs(argv) {
  const out = { json: false, standupsOnly: false, root: process.cwd(), sessionId: null, list: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--standups-only') out.standupsOnly = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === 'list') out.list = true;
    else if (!out.sessionId) out.sessionId = a;
  }
  return out;
}

function sessionsRoot(root) {
  return path.join(root, '_byan-output', 'party-mode-sessions');
}

function listSessions(root) {
  const dir = sessionsRoot(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const kanban = path.join(dir, e.name, 'kanban.json');
      const standup = path.join(dir, e.name, 'standup.jsonl');
      return {
        session_id: e.name,
        has_kanban: fs.existsSync(kanban),
        has_standup: fs.existsSync(standup),
      };
    })
    .sort((a, b) => (a.session_id < b.session_id ? 1 : -1));
}

function renderBoard(board) {
  if (!board) return '(no kanban for this session)';
  const cols = board.columns || ['todo', 'doing', 'blocked', 'review', 'done'];
  const rows = cols.map((c) => {
    const cards = Object.values(board.cards || {}).filter((card) => card.column === c);
    return { col: c, cards };
  });

  const lines = [];
  lines.push(FG(COLORS.dim, `session ${board.session_id} — updated ${board.updated_at}`));
  lines.push('');
  for (const r of rows) {
    const color = COLORS[r.col] || 0;
    lines.push(FG(color, `[${r.col.toUpperCase()}] (${r.cards.length})`));
    if (r.cards.length === 0) {
      lines.push(FG(COLORS.dim, '  (empty)'));
    } else {
      for (const c of r.cards) {
        const assignee = c.assignee ? ` @${c.assignee}` : '';
        const blocker = c.column === 'blocked' && c.blocker_reason ? ` — blocked: ${c.blocker_reason}` : '';
        lines.push(`  - [${c.priority}] ${c.id} ${c.title}${assignee}${blocker}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderStandups(entries) {
  if (entries.length === 0) return FG(COLORS.dim, '(no stand-ups yet)');
  return entries
    .map((e) => {
      const blockers = e.blockers && e.blockers.length > 0
        ? FG(COLORS.blocked, ` blockers=${e.blockers.join('|')}`)
        : '';
      return `${e.timestamp} ${e.agent}: ${e.did || '-'}${blockers} → ${e.next || '-'}`;
    })
    .join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root);

  if (args.list || !args.sessionId) {
    const sessions = listSessions(root);
    if (args.json) {
      process.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
      return;
    }
    if (sessions.length === 0) {
      console.log('(no party-mode sessions found)');
      return;
    }
    console.log('sessions :');
    for (const s of sessions) {
      const flags =
        (s.has_kanban ? 'K' : '-') + (s.has_standup ? 'S' : '-');
      console.log(`  [${flags}] ${s.session_id}`);
    }
    console.log('\npass a session id to view its board.');
    return;
  }

  const sessionDir = path.join(sessionsRoot(root), args.sessionId);
  const kanbanPath = path.join(sessionDir, 'kanban.json');
  const standupPath = path.join(sessionDir, 'standup.jsonl');

  let board = null;
  if (fs.existsSync(kanbanPath)) {
    try {
      board = JSON.parse(fs.readFileSync(kanbanPath, 'utf8'));
    } catch {
      board = null;
    }
  }

  let standups = [];
  if (fs.existsSync(standupPath)) {
    standups = fs
      .readFileSync(standupPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ board, standups }, null, 2) + '\n');
    return;
  }

  if (!args.standupsOnly) {
    console.log(renderBoard(board));
  }
  console.log('stand-ups :');
  console.log(renderStandups(standups.slice(-10)));
}

main();
