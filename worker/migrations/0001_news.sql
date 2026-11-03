CREATE TABLE IF NOT EXISTS news_posts (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 excerpt TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, category TEXT NOT NULL,
 image TEXT, status TEXT NOT NULL CHECK(status IN ('draft','published')),
 source TEXT NOT NULL CHECK(source IN ('manual','discord')), source_id TEXT,
 channel_id TEXT, guild_id TEXT, author TEXT NOT NULL,
 published_at TEXT, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 hidden INTEGER NOT NULL DEFAULT 0, source_event_id TEXT,
 UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS news_public_date ON news_posts(status, hidden, published_at DESC);
CREATE TABLE IF NOT EXISTS news_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS news_discord_versions (
 message_id TEXT PRIMARY KEY, event_time INTEGER NOT NULL, event_id TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS news_events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
