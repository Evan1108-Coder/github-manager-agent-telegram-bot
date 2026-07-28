const { DatabaseSync } = require('node:sqlite');
const { getConfig } = require('./config');

let db;

function openDb(dbPath = getConfig().dbPath) {
  if (db) return db;
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kind, key)
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '{}',
      output_style TEXT NOT NULL DEFAULT 'concise',
      enabled INTEGER NOT NULL DEFAULT 1,
      next_run_at TEXT,
      last_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      FOREIGN KEY(job_id) REFERENCES scheduled_jobs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      raw_json TEXT NOT NULL DEFAULT '{}',
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      action_id TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      telegram_file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      extracted_text TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      label TEXT NOT NULL,
      check_kind TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      polls_done INTEGER NOT NULL DEFAULT 0,
      max_polls INTEGER NOT NULL DEFAULT 20,
      interval_ms INTEGER NOT NULL DEFAULT 5000,
      deadline_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS bot_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id INTEGER,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bot_messages_chat_sent ON bot_messages(chat_id, sent_at DESC);

    CREATE TABLE IF NOT EXISTS digest_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      digest_date TEXT NOT NULL,
      digest_kind TEXT NOT NULL,
      position INTEGER NOT NULL,
      item_id TEXT,
      title TEXT NOT NULL,
      url TEXT,
      source TEXT,
      metric TEXT,
      summary TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_digest_items_lookup ON digest_items(chat_id, digest_date DESC, digest_kind, position);
    CREATE INDEX IF NOT EXISTS idx_digest_items_id ON digest_items(chat_id, item_id);

    -- Pending watch offers. Telegram caps callback_data at 64 BYTES, so the
    -- full watch spec cannot ride in the button payload; we store it here and
    -- put only the row id in the callback.
    CREATE TABLE IF NOT EXISTS watch_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id);
  `);
}

// Store a watch offer and return its id, which is short enough to fit in
// Telegram's 64-byte callback_data budget.
function createWatchOffer(chatId, { kind, label, params }) {
  const result = openDb().prepare(`
    INSERT INTO watch_offers (chat_id, kind, label, params_json)
    VALUES (?, ?, ?, ?)
  `).run(String(chatId), String(kind), String(label), JSON.stringify(params || {}));
  // Keep the table small — only recent offers can still be tapped.
  openDb().prepare(`
    DELETE FROM watch_offers
    WHERE id IN (SELECT id FROM watch_offers WHERE chat_id = ? ORDER BY id DESC LIMIT -1 OFFSET 50)
  `).run(String(chatId));
  return Number(result.lastInsertRowid);
}

function getWatchOffer(chatId, id) {
  const row = openDb()
    .prepare('SELECT * FROM watch_offers WHERE chat_id = ? AND id = ?')
    .get(String(chatId), Number(id));
  if (!row) return null;
  let params = {};
  try { params = JSON.parse(row.params_json); } catch {}
  return { id: row.id, kind: row.kind, label: row.label, params };
}

function recordTelemetry({ chatId = null, kind, label, status, durationMs, detail = '' }) {
  openDb().prepare(`
    INSERT INTO telemetry (chat_id, kind, label, status, duration_ms, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chatId === null ? null : String(chatId), kind, label, status, Math.round(durationMs), String(detail).slice(0, 1000));
}

function getSetting(key, fallback = null) {
  const row = openDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  openDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
}

function addConversation(chatId, role, content) {
  openDb().prepare('INSERT INTO conversations (chat_id, role, content) VALUES (?, ?, ?)').run(String(chatId), role, String(content).slice(0, 8000));
  openDb().prepare(`
    DELETE FROM conversations
    WHERE rowid IN (
      SELECT rowid FROM conversations
      WHERE chat_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT -1 OFFSET 40
    )
  `).run(String(chatId));
}

function getConversation(chatId, limit = 12) {
  return openDb().prepare(`
    SELECT role, content, created_at
    FROM conversations
    WHERE chat_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `).all(String(chatId), limit).reverse();
}

// P1 fix: record outbound messages durably, covering all send paths (ctx.reply, bot.api.sendMessage, editMessageText).
// This replaces the volatile actionlog Map. Call this BEFORE chunking and BEFORE HTML stripping.
function recordBotMessage(chatId, { messageId = null, kind, content, metadata = null }) {
  if (!chatId || !content) return;
  const truncated = content.length > 16000;
  const meta = metadata ? { ...metadata, truncated } : (truncated ? { truncated } : null);
  openDb().prepare(`
    INSERT INTO bot_messages (chat_id, message_id, kind, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(chatId), messageId, kind, String(content).slice(0, 16000), meta ? JSON.stringify(meta) : null);
  // Prune to last 100 per chat to prevent unbounded growth.
  openDb().prepare(`
    DELETE FROM bot_messages
    WHERE rowid IN (
      SELECT rowid FROM bot_messages
      WHERE chat_id = ?
      ORDER BY sent_at DESC, rowid DESC
      LIMIT -1 OFFSET 100
    )
  `).run(String(chatId));
}

// Get recent bot messages (replacement for actionlog evidenceSummary).
function getRecentBotMessages(chatId, limit = 10) {
  return openDb().prepare(`
    SELECT kind, content, metadata, sent_at
    FROM bot_messages
    WHERE chat_id = ?
    ORDER BY sent_at DESC, rowid DESC
    LIMIT ?
  `).all(String(chatId), limit).reverse();
}

// P1 fix: persist ordered digest items (trend projects, stats repos, daily commits, audit findings).
// Enables "your second recommendation" / "tell me about #3" reference resolution.
function recordDigestItems(chatId, { digestDate, digestKind, items }) {
  if (!chatId || !items || !items.length) return;
  const stmt = openDb().prepare(`
    INSERT INTO digest_items (chat_id, digest_date, digest_kind, position, item_id, title, url, source, metric, summary, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    stmt.run(
      String(chatId),
      digestDate,
      digestKind,
      i + 1, // 1-based position
      item.id || null,
      String(item.title || item.name || 'Untitled'),
      item.url || null,
      item.source || null,
      item.metric || null,
      item.summary || item.why || item.oneLiner || null,
      JSON.stringify(item)
    );
  }
}

// Get digest items for a specific date and kind, or the most recent digest of that kind.
function getDigestItems(chatId, { digestDate = null, digestKind = null, limit = 20 } = {}) {
  let query = 'SELECT * FROM digest_items WHERE chat_id = ?';
  const params = [String(chatId)];
  if (digestDate) {
    query += ' AND digest_date = ?';
    params.push(digestDate);
  }
  if (digestKind) {
    query += ' AND digest_kind = ?';
    params.push(digestKind);
  }
  query += ' ORDER BY digest_date DESC, digest_kind, position LIMIT ?';
  params.push(limit);
  return openDb().prepare(query).all(...params);
}

// Resolve a reference like "second", "2nd", "#3", "last one" to a concrete digest item.
// Returns the most recent matching item, or null.
function resolveDigestReference(chatId, { position = null, digestKind = null, digestDate = null } = {}) {
  let query = 'SELECT * FROM digest_items WHERE chat_id = ?';
  const params = [String(chatId)];
  if (digestDate) {
    query += ' AND digest_date = ?';
    params.push(digestDate);
  } else {
    // Default to today or most recent.
    query += ' AND digest_date = (SELECT digest_date FROM digest_items WHERE chat_id = ? ORDER BY digest_date DESC LIMIT 1)';
    params.push(String(chatId));
  }
  if (digestKind) {
    query += ' AND digest_kind = ?';
    params.push(digestKind);
  }
  if (position !== null) {
    query += ' AND position = ?';
    params.push(position);
  }
  query += ' ORDER BY digest_date DESC, position LIMIT 1';
  return openDb().prepare(query).get(...params) || null;
}

module.exports = {
  openDb,
  getSetting,
  setSetting,
  addConversation,
  getConversation,
  recordTelemetry,
  recordBotMessage,
  getRecentBotMessages,
  recordDigestItems,
  getDigestItems,
  resolveDigestReference,
  createWatchOffer,
  getWatchOffer,
};
