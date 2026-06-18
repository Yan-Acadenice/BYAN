#!/usr/bin/env node
/**
 * Packages every BYAN Claude Code skill into org-publishable ZIP bundles.
 *
 * WHY a stored ZIP instead of a library: Claude.ai skill upload accepts a
 * stored (DEFLATE=0) ZIP; Node has no built-in zip, and adding archiver/jszip
 * would violate the zero-new-dep rule. A stored ZIP is trivially hand-crafted
 * with the Local File Header + Central Directory + EOCD structure.
 *
 * WHY a bundles-manifest.json: it is the committed drift ledger. The .zip
 * blobs are regenerated artifacts; the manifest is the source of truth for
 * --check mode and the pre-commit gate.
 *
 * Usage:
 *   node bin/byan-build-skill-bundles.js           # build bundles + manifest
 *   node bin/byan-build-skill-bundles.js --check   # compare live hashes vs manifest; exit 1 on drift
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../'
);
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const MANIFEST_YAML = path.join(PROJECT_ROOT, '_byan', '_config', 'manifest.yaml');
const AGENT_CSV = path.join(PROJECT_ROOT, '_byan', '_config', 'agent-manifest.csv');
const OUT_DIR = path.join(PROJECT_ROOT, 'dist', 'skill-bundles');
// The manifest is the COMMITTED drift ledger, so it must live on a TRACKED
// path — NOT under dist/ (gitignored). Only the .zip blobs go to dist/.
const BUNDLES_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  '_byan',
  'mcp',
  'byan-mcp-server',
  'skill-bundles-manifest.json'
);

// ---------------------------------------------------------------------------
// Minimal stored-ZIP writer (zero deps, DEFLATE method=0)
// ---------------------------------------------------------------------------

/**
 * CRC32 lookup table. Pre-built once; the polynomial is the standard
 * ISO 3309 / ITU-T V.42 polynomial used by ZIP/PNG/Ethernet.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(val) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(val, 0);
  return b;
}

function writeUint32LE(val) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(val >>> 0, 0);
  return b;
}

/**
 * Build a stored ZIP archive containing a single SKILL.md entry.
 *
 * The ZIP format stores:
 *   [local file header][file data] * N
 *   [central directory header] * N
 *   [end of central directory record]
 *
 * Stored (method=0) means no compression. The CRC32 and sizes are identical
 * to the raw file since there is no transformation.
 */
function buildStoredZip(entries) {
  // entries: Array<{ name: string, data: Buffer }>
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const dosDate = (() => {
    // Use a fixed date so builds are reproducible (idempotent).
    // 2024-01-01 00:00:00 -> DOS date = (2024-1980)<<9 | 1<<5 | 1 = 0x5421
    //                     -> DOS time = 0
    return { time: 0x0000, date: 0x5421 };
  })();

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = entry.data;
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header signature 0x04034b50
    const lh = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      writeUint16LE(20),                       // version needed: 2.0
      writeUint16LE(0),                        // general purpose bit flag
      writeUint16LE(0),                        // compression method: stored
      writeUint16LE(dosDate.time),             // last mod file time
      writeUint16LE(dosDate.date),             // last mod file date
      writeUint32LE(crc),                      // crc-32
      writeUint32LE(size),                     // compressed size (same as uncompressed for stored)
      writeUint32LE(size),                     // uncompressed size
      writeUint16LE(nameBuf.length),           // file name length
      writeUint16LE(0),                        // extra field length
      nameBuf,
    ]);

    localHeaders.push({ lh, dataBuf, offset, nameBuf, crc, size });
    offset += lh.length + dataBuf.length;

    // Central directory header signature 0x02014b50
    const ch = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      writeUint16LE(20),                       // version made by
      writeUint16LE(20),                       // version needed
      writeUint16LE(0),                        // general purpose bit flag
      writeUint16LE(0),                        // compression method: stored
      writeUint16LE(dosDate.time),             // last mod file time
      writeUint16LE(dosDate.date),             // last mod file date
      writeUint32LE(crc),                      // crc-32
      writeUint32LE(size),                     // compressed size
      writeUint32LE(size),                     // uncompressed size
      writeUint16LE(nameBuf.length),           // file name length
      writeUint16LE(0),                        // extra field length
      writeUint16LE(0),                        // file comment length
      writeUint16LE(0),                        // disk number start
      writeUint16LE(0),                        // internal file attributes
      writeUint32LE(0),                        // external file attributes
      writeUint32LE(localHeaders[localHeaders.length - 1].offset), // relative offset of local header
      nameBuf,
    ]);

    centralHeaders.push(ch);
  }

  const cdOffset = offset;
  const cdBuf = Buffer.concat(centralHeaders);
  const cdSize = cdBuf.length;

  // End of central directory record signature 0x06054b50
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
    writeUint16LE(0),                        // disk number
    writeUint16LE(0),                        // disk with start of central directory
    writeUint16LE(entries.length),           // entries on this disk
    writeUint16LE(entries.length),           // total entries
    writeUint32LE(cdSize),                   // size of central directory
    writeUint32LE(cdOffset),                 // offset of start of central directory
    writeUint16LE(0),                        // comment length
  ]);

  const parts = [];
  for (const { lh, dataBuf } of localHeaders) {
    parts.push(lh, dataBuf);
  }
  parts.push(cdBuf, eocd);
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Module version map (from manifest.yaml, parsed line-by-line — no yaml dep)
// ---------------------------------------------------------------------------

function parseModuleVersions() {
  // WHY manual parse: manifest.yaml uses a simple list structure; the only dep
  // available is js-yaml (in package.json), but we intentionally avoid imports
  // that might break if the yaml dep is not installed in this specific bin.
  // The file is small and stable; a line-by-line extraction is safer.
  const content = fs.readFileSync(MANIFEST_YAML, 'utf8');
  const versions = {};
  let currentModule = null;
  for (const line of content.split('\n')) {
    const mMatch = line.match(/^\s+-\s+name:\s+(\S+)/);
    const vMatch = line.match(/^\s+version:\s+(\S+)/);
    if (mMatch) currentModule = mMatch[1];
    if (vMatch && currentModule) {
      versions[currentModule] = vMatch[1];
      currentModule = null; // only take the first version after each name:
    }
  }
  return versions;
}

// ---------------------------------------------------------------------------
// CSV parser (quote-aware, same algorithm as lib/index-generator.js)
// ---------------------------------------------------------------------------

function parseManifestCsv(content) {
  const rows = [];
  const lines = content.split('\n');
  const headers = parseCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      // quoted field
      let field = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // escaped double-quote
            field += '"';
            i += 2;
          } else {
            i++; // closing quote
            break;
          }
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;
    } else {
      // unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Module assignment for skills
// ---------------------------------------------------------------------------

/**
 * WHY this routing table: skill directory names encode the module via a prefix
 * infix (byan-bmm-*, byan-bmb-*, byan-cis-*, byan-tea-*). Skills with no
 * module infix (cross-cutting, byan-byan, byan-strict, etc.) fall back to the
 * agent-manifest.csv lookup, then to 'core' as a safe default so that NO skill
 * is ever silently dropped.
 */
function buildSkillModuleMap(agentRows) {
  // name -> module from agent CSV (agent name, not skill name)
  const agentModuleByName = {};
  for (const row of agentRows) {
    if (row.name && row.module) agentModuleByName[row.name] = row.module;
  }

  // Skill dir -> agent name heuristic for cross-cutting byan-bmad-* skills.
  const BMAD_SKILL_AGENTS = {
    'byan-bmad-agent-tao': 'tao',
    'byan-bmad-master': 'bmad-master',
  };

  return function resolveModule(skillName) {
    // Direct module infix in the skill name takes priority.
    if (skillName.startsWith('byan-bmm-')) return 'bmm';
    if (skillName.startsWith('byan-bmb-')) return 'bmb';
    if (skillName.startsWith('byan-cis-')) return 'cis';
    if (skillName.startsWith('byan-tea-')) return 'tea';

    // byan-bmad-* maps through a known lookup table.
    if (BMAD_SKILL_AGENTS[skillName]) {
      const agentName = BMAD_SKILL_AGENTS[skillName];
      return agentModuleByName[agentName] || 'core';
    }

    // Cross-cutting: strip byan- prefix and look up in agent-manifest.
    const agentName = skillName.startsWith('byan-') ? skillName.slice('byan-'.length) : skillName;
    if (agentModuleByName[agentName]) return agentModuleByName[agentName];

    // Safe fallback: cross-cutting skills without an agent entry land in core.
    return 'core';
  };
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * WHY tier classification: standalone skills can be published to Claude.ai
 * org Skills immediately. connector-bound skills require the remote MCP
 * connector to be installed because they call byan_* / byan_leantime_* tools.
 */
function classifyTier(skillContent) {
  // Match tool references in allowed-tools frontmatter AND inline body calls.
  // Pattern: byan_ followed by a word character (excludes generic prose).
  return /byan_[a-z]/.test(skillContent) ? 'connector-bound' : 'standalone';
}

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// Core build logic
// ---------------------------------------------------------------------------

function collectSkills(resolveModule) {
  const skillDirs = fs.readdirSync(SKILLS_DIR).filter((d) => {
    return fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'));
  });

  const skills = [];
  for (const name of skillDirs) {
    const skillMdPath = path.join(SKILLS_DIR, name, 'SKILL.md');
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const contentBuf = Buffer.from(content, 'utf8');
    skills.push({
      name,
      module: resolveModule(name),
      tier: classifyTier(content),
      sourceHash: sha256(contentBuf),
      content,
      contentBuf,
    });
  }
  return skills;
}

function writeZips(skills) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // One ZIP per skill, shaped EXACTLY as Claude.ai org Skills requires: a single
  // top-level folder named after the skill, containing its SKILL.md. Claude's
  // validator rejects a flat SKILL.md (zero top-level folders) AND rejects a
  // multi-skill archive (more than one folder / SKILL.md) — so there is no
  // "megabundle" upload artifact: each skill is its own archive, uploaded one
  // at a time.
  for (const skill of skills) {
    const zip = buildStoredZip([{ name: `${skill.name}/SKILL.md`, data: skill.contentBuf }]);
    const dest = path.join(OUT_DIR, `${skill.name}.zip`);
    fs.writeFileSync(dest, zip);
  }
}

function writeManifest(skills) {
  const perSkill = {};
  for (const s of skills) {
    perSkill[s.name] = {
      name: s.name,
      module: s.module,
      tier: s.tier,
      sourceHash: s.sourceHash,
    };
  }

  // No generatedAt: the manifest is a COMMITTED drift ledger, so it must be
  // deterministic (content-hash driven). A wall-clock stamp would make every
  // build a noisy diff and could mask a real drift.
  const manifest = {
    skills: perSkill,
  };

  fs.writeFileSync(BUNDLES_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// ---------------------------------------------------------------------------
// --check mode
// ---------------------------------------------------------------------------

function checkMode() {
  if (!fs.existsSync(BUNDLES_MANIFEST_PATH)) {
    console.error('[byan-build-skill-bundles] --check FAIL: bundles-manifest.json not found. Run without --check first.');
    process.exit(1);
  }

  const committed = JSON.parse(fs.readFileSync(BUNDLES_MANIFEST_PATH, 'utf8'));
  const agentRows = parseManifestCsv(fs.readFileSync(AGENT_CSV, 'utf8'));
  const resolveModule = buildSkillModuleMap(agentRows);
  const live = collectSkills(resolveModule);

  const diffs = [];

  // Detect new or changed skills
  for (const s of live) {
    const committed_s = committed.skills[s.name];
    if (!committed_s) {
      diffs.push(`  NEW skill not in manifest: ${s.name}`);
    } else if (committed_s.sourceHash !== s.sourceHash) {
      diffs.push(`  CHANGED ${s.name}: hash ${committed_s.sourceHash.slice(0, 12)}... -> ${s.sourceHash.slice(0, 12)}...`);
    } else if (committed_s.module !== s.module) {
      diffs.push(`  MODULE DRIFT ${s.name}: ${committed_s.module} -> ${s.module}`);
    }
  }

  // Detect removed skills
  for (const name of Object.keys(committed.skills)) {
    if (!live.find((s) => s.name === name)) {
      diffs.push(`  REMOVED skill in manifest but gone from disk: ${name}`);
    }
  }

  if (diffs.length > 0) {
    console.error('[byan-build-skill-bundles] --check FAIL: skill bundles are out of sync. Re-run without --check to rebuild.\n');
    for (const d of diffs) console.error(d);
    process.exit(1);
  }

  console.log(`[byan-build-skill-bundles] --check OK: ${live.length} skills, all hashes match`);
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const checkModeFlag = args.includes('--check');

  if (checkModeFlag) {
    checkMode();
    return;
  }

  const agentRows = parseManifestCsv(fs.readFileSync(AGENT_CSV, 'utf8'));
  const resolveModule = buildSkillModuleMap(agentRows);

  const skills = collectSkills(resolveModule);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeZips(skills);
  writeManifest(skills);

  const standalone = skills.filter((s) => s.tier === 'standalone').length;
  const connectorBound = skills.filter((s) => s.tier === 'connector-bound').length;
  const modules = [...new Set(skills.map((s) => s.module))].sort();

  console.log(
    `[byan-build-skill-bundles] wrote ${skills.length} per-skill ZIPs (one top-level folder + SKILL.md each)`
  );
  console.log(`  standalone: ${standalone}  connector-bound: ${connectorBound}`);
  console.log(`  modules: ${modules.join(', ')}`);
  console.log(`  manifest: ${BUNDLES_MANIFEST_PATH}`);
}

main();
