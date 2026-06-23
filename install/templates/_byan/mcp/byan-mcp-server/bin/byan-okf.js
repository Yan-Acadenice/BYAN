#!/usr/bin/env node
// byan-okf — produce / validate an Open Knowledge Format bundle from BYAN's
// knowledge base (_byan/connaissance).
//
//   byan-okf build [--root <dir>] [--out <dir>]   build a bundle (non-destructive)
//   byan-okf check [<dir>] [--root <dir>]          validate every .md is OKF
//
// `build` is NON-DESTRUCTIVE: it reads _byan/connaissance and writes a normalized
// OKF bundle (frontmatter + index.md + log.md) to the OUT dir (default
// _byan-output/okf-bundle/, which is gitignored). It never mutates the source.
// The conversion logic is in lib/okf-bundle.js (pure, unit-tested).

import fs from 'node:fs';
import path from 'node:path';
import { buildBundle } from '../lib/okf-bundle.js';
import { parseFrontmatter, validateOkf, OKF_RESERVED } from '../lib/okf-format.js';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--root') a.root = argv[++i];
    else if (x === '--out') a.out = argv[++i];
    else a._.push(x);
  }
  return a;
}

function walkMd(dir, base = dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(full, base, acc);
    else if (e.isFile() && e.name.endsWith('.md')) acc.push({ relPath: path.relative(base, full), text: fs.readFileSync(full, 'utf8') });
  }
  return acc;
}

function cmdBuild(args) {
  const root = args.root || process.cwd();
  const src = path.join(root, '_byan', 'connaissance');
  const out = args.out || path.join(root, '_byan-output', 'okf-bundle');
  const files = walkMd(src);
  if (!files.length) {
    process.stdout.write(`[byan-okf] no markdown found under ${src} — nothing to build\n`);
    return 0;
  }
  const timestamp = new Date().toISOString();
  const { entries, index, log, errors } = buildBundle(files, { timestamp });
  fs.mkdirSync(out, { recursive: true });
  for (const e of entries) {
    const dest = path.join(out, e.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.serialized);
  }
  fs.writeFileSync(path.join(out, 'index.md'), index);
  fs.writeFileSync(path.join(out, 'log.md'), log);
  const warned = entries.filter((e) => e.validation.warnings.length).length;
  process.stdout.write(`[byan-okf] wrote ${entries.length} OKF entries + index.md + log.md to ${out} (${warned} with warnings, ${errors.length} invalid)\n`);
  return errors.length ? 1 : 0;
}

function cmdCheck(args) {
  const root = args.root || process.cwd();
  const dir = args._[1] || path.join(root, '_byan-output', 'okf-bundle');
  const files = walkMd(dir);
  let bad = 0;
  for (const f of files) {
    if (OKF_RESERVED.includes(path.basename(f.relPath))) continue;
    const { data } = parseFrontmatter(f.text);
    const v = validateOkf(data);
    if (!v.ok) {
      bad += 1;
      process.stderr.write(`[byan-okf] INVALID ${f.relPath}: ${v.errors.join('; ')}\n`);
    }
  }
  if (bad) {
    process.stderr.write(`[byan-okf] ${bad} invalid OKF file(s) under ${dir}\n`);
    return 1;
  }
  process.stdout.write(`[byan-okf] OK - ${files.length} markdown file(s) are valid OKF under ${dir}\n`);
  return 0;
}

const args = parseArgs(process.argv);
const cmd = args._[0] || 'build';
let code = 0;
if (cmd === 'build') code = cmdBuild(args);
else if (cmd === 'check') code = cmdCheck(args);
else {
  process.stderr.write(`[byan-okf] unknown command '${cmd}' (use: build | check)\n`);
  code = 2;
}
process.exit(code);
