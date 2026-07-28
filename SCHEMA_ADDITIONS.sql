-- P1 fix schema additions for GitHub Manager
-- These go into src/db.js migrate() after the watches table

-- bot_messages: durable replacement for the volatile actionlog Map.
-- Records every outbound message (ctx.reply, bot.api.sendMessage, editMessageText)
-- BEFORE chunking and BEFORE HTML stripping, with enough metadata to reconstruct context.
CREATE TABLE IF NOT EXISTS bot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id INTEGER,  -- Telegram message_id when available
  kind TEXT NOT NULL,  -- 'reply' | 'scheduled_job' | 'watch' | 'approval' | 'staged_final' | 'command' | 'error'
  content TEXT NOT NULL,  -- pre-chunk, pre-strip payload (up to 16000 chars to cover 4x Telegram limit)
  metadata TEXT,  -- JSON: {job_kind, watch_id, approval_id, command_name, parse_mode, truncated}
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bot_messages_chat_sent ON bot_messages(chat_id, sent_at DESC);

-- digest_items: ordered structured items from trend/stats/daily/audit digests.
-- Enables "your second recommendation" / "tell me about project #3" reference resolution.
CREATE TABLE IF NOT EXISTS digest_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  digest_date TEXT NOT NULL,  -- YYYY-MM-DD (user's timezone if tracked, else UTC)
  digest_kind TEXT NOT NULL,  -- 'trend' | 'stats' | 'daily_summary' | 'audit' | 'scan'
  position INTEGER NOT NULL,  -- 1-based rank/order within that digest
  item_id TEXT,  -- stable id when available (e.g. 'gh1', repo full_name, market slug)
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,  -- 'github_trending' | 'hackernews' | 'reddit' | 'producthunt' | 'devto' | 'github_repo' | ...
  metric TEXT,  -- stringified number or label (e.g. '1234 stars today', '+5 stars', '234 points')
  summary TEXT,  -- LLM oneLiner / why / description when available
  raw_json TEXT,  -- full source object for deep inspection
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_digest_items_lookup ON digest_items(chat_id, digest_date DESC, digest_kind, position);
CREATE INDEX IF NOT EXISTS idx_digest_items_id ON digest_items(chat_id, item_id);
