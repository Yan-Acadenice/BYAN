-- Agent registry
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  module TEXT,
  source_path TEXT,
  persona TEXT,
  capabilities TEXT,
  soul_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MCP Server registry
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args TEXT,
  env TEXT,
  transport TEXT NOT NULL DEFAULT 'stdio' CHECK(transport IN ('stdio', 'sse', 'http')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active', 'inactive', 'error')),
  health_check_url TEXT,
  last_health_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-project MCP configuration
CREATE TABLE IF NOT EXISTS project_mcp (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  config TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, mcp_server_id)
);

-- Unified memory store (cross-CLI)
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  user_id TEXT,
  cli_source TEXT CHECK(cli_source IN ('copilot', 'claude', 'codex', 'api', 'manual')),
  session_id TEXT,
  layer TEXT NOT NULL DEFAULT 'working' CHECK(layer IN ('working', 'short_term', 'long_term')),
  category TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Session tracking (for cross-CLI stitching)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  cli_source TEXT NOT NULL,
  agent_name TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  summary TEXT,
  parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
);

-- MCP tool catalog (P2)
CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  input_schema TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_module ON agents(module);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);
CREATE INDEX IF NOT EXISTS idx_project_mcp_project ON project_mcp(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_node ON memories(node_id);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cli ON sessions(cli_source);
