#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildHandoff,
  latestHandoff,
  parseMarkdown,
  renderMarkdown,
  renderResumePrompt,
  writeHandoff,
} = require('../lib/project-handoff');

function usage() {
  return [
    'byan-handoff export [--from claude|codex] [--to codex|claude] [--task <text>] [--summary <text>] [--next <text>] [--out <file>] [--root <dir>] [--stdout]',
    'byan-handoff import <file> [--prompt] [--json] [--root <dir>]',
    'byan-handoff latest [--from claude|codex] [--prompt] [--json] [--root <dir>]',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    cmd: argv[2] || 'export',
    root: process.cwd(),
    from: null,
    to: null,
    task: null,
    summary: null,
    out: null,
    stdout: false,
    prompt: false,
    json: false,
    next: [],
    decisions: [],
    blockers: [],
    commands: [],
    notes: [],
    file: null,
  };

  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--task') args.task = argv[++i];
    else if (a === '--summary') args.summary = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--stdout') args.stdout = true;
    else if (a === '--prompt') args.prompt = true;
    else if (a === '--json') args.json = true;
    else if (a === '--next') args.next.push(argv[++i]);
    else if (a === '--decision') args.decisions.push(argv[++i]);
    else if (a === '--blocker') args.blockers.push(argv[++i]);
    else if (a === '--command') args.commands.push(argv[++i]);
    else if (a === '--note') args.notes.push(argv[++i]);
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!args.file) args.file = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return args;
}

function readHandoffFile(file) {
  return parseMarkdown(fs.readFileSync(file, 'utf8'));
}

function printImported(handoff, args) {
  if (args.json) {
    process.stdout.write(JSON.stringify(handoff, null, 2) + '\n');
  } else if (args.prompt) {
    process.stdout.write(renderResumePrompt(handoff) + '\n');
  } else {
    process.stdout.write(renderMarkdown(handoff) + '\n');
  }
}

function main() {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      console.log(usage());
      return;
    }

    const root = path.resolve(args.root);
    if (args.cmd === 'export') {
      const handoff = buildHandoff({
        root,
        from: args.from,
        to: args.to,
        task: args.task,
        summary: args.summary,
        nextActions: args.next,
        decisions: args.decisions,
        blockers: args.blockers,
        commands: args.commands,
        notes: args.notes,
      });
      if (args.stdout) {
        process.stdout.write(renderMarkdown(handoff) + '\n');
        return;
      }
      const result = writeHandoff(root, handoff, { outPath: args.out });
      process.stdout.write(`${result.path}\n`);
      return;
    }

    if (args.cmd === 'import') {
      if (!args.file) throw new Error('Missing handoff file');
      printImported(readHandoffFile(path.resolve(root, args.file)), args);
      return;
    }

    if (args.cmd === 'latest') {
      const file = latestHandoff(root, { from: args.from });
      if (!file) {
        const suffix = args.from ? ` from ${args.from}` : '';
        throw new Error(`No handoff${suffix} found under _byan-output/handoffs`);
      }
      if (!args.prompt && !args.json) {
        process.stdout.write(`${file}\n`);
        return;
      }
      printImported(readHandoffFile(file), args);
      return;
    }

    throw new Error(`Unknown command: ${args.cmd}`);
  } catch (err) {
    process.stderr.write(`byan-handoff: ${err.message}\n`);
    process.stderr.write(usage() + '\n');
    process.exit(1);
  }
}

main();
