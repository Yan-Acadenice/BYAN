-- LoadBalancer SharedStateStore — Initial Schema
-- Tracks conversations, switchover events, and rate limit history

CREATE TABLE IF NOT EXISTS lb_conversations (
    id TEXT PRIMARY KEY,
    active_provider TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    context_json TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'transferred'))
);

CREATE TABLE IF NOT EXISTS lb_switchovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    from_provider TEXT NOT NULL,
    to_provider TEXT NOT NULL,
    reason TEXT NOT NULL,
    context_snapshot TEXT,
    context_fidelity_pct INTEGER,
    switched_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES lb_conversations(id)
);

CREATE TABLE IF NOT EXISTS lb_rate_limit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('429', 'header_warning', 'retry_after', 'recovery')),
    state_before TEXT NOT NULL,
    state_after TEXT NOT NULL,
    meta_json TEXT,
    logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lb_provider_stats (
    provider TEXT PRIMARY KEY,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_429s INTEGER NOT NULL DEFAULT 0,
    total_switchovers_from INTEGER NOT NULL DEFAULT 0,
    total_switchovers_to INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms REAL NOT NULL DEFAULT 0,
    last_used_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_switchovers_conversation ON lb_switchovers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_switchovers_time ON lb_switchovers(switched_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_provider ON lb_rate_limit_log(provider, logged_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON lb_conversations(status);
