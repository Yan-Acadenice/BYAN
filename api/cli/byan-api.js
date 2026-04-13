#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.BYAN_API_URL || 'http://localhost:3737';

function getToken() {
  if (process.env.BYAN_API_TOKEN) return process.env.BYAN_API_TOKEN;
  const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.byan', 'api-token');
  try { return fs.readFileSync(tokenPath, 'utf8').trim(); } catch { return null; }
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function padRight(str, len) {
  str = String(str || '');
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function printTable(rows, columns) {
  if (rows.length === 0) { console.log('(no results)'); return; }
  const header = columns.map(c => padRight(c.label, c.width)).join('  ');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const row of rows) {
    console.log(columns.map(c => padRight(c.get(row), c.width)).join('  '));
  }
}

const jsonOutput = process.argv.includes('--json');

function output(result) {
  if (jsonOutput) {
    console.log(JSON.stringify(result.data, null, 2));
  }
  return result;
}

async function cmdStatus() {
  try {
    const res = await request('GET', '/api/health');
    if (jsonOutput) return output(res);
    console.log(`API Status: ${res.data.status || 'unknown'}`);
    console.log(`Version:    ${res.data.version || 'unknown'}`);
    console.log(`URL:        ${API_URL}`);
  } catch (err) {
    console.error(`Cannot connect to API at ${API_URL}`);
    console.error(err.message);
    process.exit(1);
  }
}

async function cmdProjects() {
  const res = await request('GET', '/api/projects');
  if (jsonOutput) return output(res);
  const items = res.data.data || [];
  printTable(items, [
    { label: 'ID', width: 36, get: r => r.id },
    { label: 'Name', width: 30, get: r => r.name },
    { label: 'Type', width: 10, get: r => r.type },
    { label: 'Created', width: 20, get: r => r.created_at }
  ]);
}

async function cmdImport(projectPath) {
  if (!projectPath) { console.error('Usage: byan api import <path>'); process.exit(1); }
  const name = path.basename(path.resolve(projectPath));
  const res = await request('POST', '/api/projects', {
    name,
    type: 'dev',
    description: `Imported from ${projectPath}`
  });
  if (jsonOutput) return output(res);
  if (res.status >= 400) { console.error(`Error: ${res.data.error}`); process.exit(1); }
  console.log(`Project created: ${res.data.data.id}`);
}

async function cmdMemoryRecall() {
  const args = parseFlags(['projectId', 'category', 'layer', 'limit']);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) { if (v) params.set(k, v); }
  const qs = params.toString();
  const res = await request('GET', `/api/memory${qs ? '?' + qs : ''}`);
  if (jsonOutput) return output(res);
  const items = res.data.data || [];
  printTable(items, [
    { label: 'ID', width: 36, get: r => r.id },
    { label: 'Layer', width: 12, get: r => r.layer },
    { label: 'Category', width: 12, get: r => r.category },
    { label: 'Content', width: 50, get: r => (r.content || '').substring(0, 50) },
    { label: 'Pinned', width: 6, get: r => r.pinned ? 'yes' : 'no' }
  ]);
}

async function cmdMemoryStore() {
  const args = parseFlags(['content', 'category', 'cliSource', 'projectId']);
  if (!args.content) { console.error('--content is required'); process.exit(1); }
  const res = await request('POST', '/api/memory', {
    content: args.content,
    category: args.category || 'fact',
    cliSource: args.cliSource || 'manual',
    projectId: args.projectId || undefined
  });
  if (jsonOutput) return output(res);
  if (res.status >= 400) { console.error(`Error: ${res.data.error}`); process.exit(1); }
  console.log(`Memory stored: ${res.data.data.id} (layer: ${res.data.data.layer})`);
}

async function cmdAgents() {
  const args = parseFlags(['module']);
  const params = new URLSearchParams();
  if (args.module) params.set('module', args.module);
  const qs = params.toString();
  const res = await request('GET', `/api/agents${qs ? '?' + qs : ''}`);
  if (jsonOutput) return output(res);
  const items = res.data.data || [];
  printTable(items, [
    { label: 'ID', width: 30, get: r => r.id },
    { label: 'Name', width: 25, get: r => r.display_name || r.name },
    { label: 'Module', width: 10, get: r => r.module },
    { label: 'Active', width: 8, get: r => r.active ? 'yes' : 'no' }
  ]);
}

async function cmdAgentsScan() {
  const res = await request('POST', '/api/agents/scan');
  if (jsonOutput) return output(res);
  if (res.status >= 400) { console.error(`Error: ${res.data.error}`); process.exit(1); }
  const d = res.data.data;
  console.log(`Scanned: ${d.scanned}, Registered: ${d.registered}, Updated: ${d.updated}`);
}

async function cmdMcpList() {
  const res = await request('GET', '/api/mcp/servers');
  if (jsonOutput) return output(res);
  const items = res.data.data || [];
  printTable(items, [
    { label: 'ID', width: 36, get: r => r.id },
    { label: 'Name', width: 25, get: r => r.name },
    { label: 'Transport', width: 10, get: r => r.transport },
    { label: 'Status', width: 10, get: r => r.status },
    { label: 'Command', width: 30, get: r => r.command }
  ]);
}

async function cmdSessions() {
  const args = parseFlags(['projectId', 'userId', 'cliSource']);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) { if (v) params.set(k, v); }
  const qs = params.toString();
  const res = await request('GET', `/api/sessions${qs ? '?' + qs : ''}`);
  if (jsonOutput) return output(res);
  const items = res.data.data || [];
  printTable(items, [
    { label: 'ID', width: 36, get: r => r.id },
    { label: 'CLI', width: 10, get: r => r.cli_source },
    { label: 'Agent', width: 20, get: r => r.agent_name || '-' },
    { label: 'Started', width: 20, get: r => r.started_at }
  ]);
}

function parseFlags(names) {
  const result = {};
  const args = process.argv.slice(2);
  for (const name of names) {
    const flag = `--${name}`;
    const idx = args.indexOf(flag);
    if (idx >= 0 && idx + 1 < args.length) {
      result[name] = args[idx + 1];
    }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));

  const commands = {
    'status':         cmdStatus,
    'projects':       cmdProjects,
    'import':         () => cmdImport(args[1]),
    'memory recall':  cmdMemoryRecall,
    'memory store':   cmdMemoryStore,
    'memory':         cmdMemoryRecall,
    'agents':         cmdAgents,
    'agents scan':    cmdAgentsScan,
    'mcp list':       cmdMcpList,
    'mcp':            cmdMcpList,
    'sessions':       cmdSessions
  };

  const twoWord = `${args[0] || ''} ${args[1] || ''}`.trim();
  const oneWord = args[0] || '';

  const handler = commands[twoWord] || commands[oneWord];

  if (!handler) {
    console.log('BYAN API CLI');
    console.log('');
    console.log('Usage: node byan-api.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  status            Check API health');
    console.log('  projects          List projects');
    console.log('  import <path>     Import a project');
    console.log('  memory recall     Recall memories (--projectId, --category, --layer, --limit)');
    console.log('  memory store      Store a memory (--content, --category, --cliSource, --projectId)');
    console.log('  agents            List agents (--module)');
    console.log('  agents scan       Scan and register agents from BMAD dirs');
    console.log('  mcp list          List MCP servers');
    console.log('  sessions          List sessions (--projectId, --userId, --cliSource)');
    console.log('');
    console.log('Options:');
    console.log('  --json            Machine-readable JSON output');
    console.log('');
    console.log('Environment:');
    console.log('  BYAN_API_URL      API base URL (default: http://localhost:3737)');
    console.log('  BYAN_API_TOKEN    Authentication token');
    process.exit(0);
  }

  try {
    await handler();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
