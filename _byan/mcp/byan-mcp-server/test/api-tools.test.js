import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');

const API_TOOLS = [
  'byan_api_projects_get',
  'byan_api_projects_create',
  'byan_api_workflows_list',
  'byan_api_workflows_get',
  'byan_api_workflows_run',
  'byan_api_workflow_runs_list',
  'byan_api_workflow_runs_get',
  'byan_api_knowledge_list',
  'byan_api_knowledge_get',
  'byan_api_memory_list',
  'byan_api_memory_search',
  'byan_api_custom_agents_list',
  'byan_api_custom_agents_get',
  'byan_api_custom_agents_clone_system',
  'byan_api_sessions_list',
  'byan_api_sessions_get',
  'byan_api_sessions_history',
  'byan_api_chat_conversations_list',
  'byan_api_chat_messages_list',
  'byan_api_chat_send',
  'byan_api_search',
  'byan_api_import_scan',
  'byan_api_import_dry_run',
];

test('all 23 byan_api_* tools declare a schema entry', () => {
  for (const name of API_TOOLS) {
    assert.ok(
      serverSrc.includes(`name: '${name}'`),
      `missing schema entry for ${name}`
    );
  }
});

test('all 23 byan_api_* tools have a handler branch', () => {
  for (const name of API_TOOLS) {
    assert.ok(
      serverSrc.includes(`if (name === '${name}')`),
      `missing handler branch for ${name}`
    );
  }
});

test('exactly 23 byan_api_* schema entries registered', () => {
  const matches = serverSrc.match(/name: 'byan_api_[a-z_]+'/g) || [];
  assert.equal(matches.length, 23);
});
