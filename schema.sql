CREATE TABLE IF NOT EXISTS aq_rank_history (
 day TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, rank INTEGER NOT NULL,
 first_seen TEXT NOT NULL, first_price REAL NOT NULL, last_seen TEXT NOT NULL,
 last_price REAL NOT NULL, best_rank INTEGER NOT NULL, peak_price REAL NOT NULL,
 trough_price REAL NOT NULL, cr_status TEXT NOT NULL, PRIMARY KEY(day,code)
);
CREATE INDEX IF NOT EXISTS idx_aq_rank_day ON aq_rank_history(day,best_rank);

-- V41 migration: run against the existing D1 database, retaining V40 records.
CREATE TABLE IF NOT EXISTS aq_top3_events (
 day TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
 first_top3_at TEXT NOT NULL, first_top3_price REAL NOT NULL,
 first_top3_rank INTEGER NOT NULL, PRIMARY KEY(day,code)
);
CREATE INDEX IF NOT EXISTS idx_top3_events_day ON aq_top3_events(day,first_top3_at);
