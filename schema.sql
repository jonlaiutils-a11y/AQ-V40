CREATE TABLE IF NOT EXISTS aq_rank_history (
 day TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, rank INTEGER NOT NULL,
 first_seen TEXT NOT NULL, first_price REAL NOT NULL, last_seen TEXT NOT NULL,
 last_price REAL NOT NULL, best_rank INTEGER NOT NULL, peak_price REAL NOT NULL,
 trough_price REAL NOT NULL, cr_status TEXT NOT NULL, PRIMARY KEY(day,code)
);
CREATE INDEX IF NOT EXISTS idx_aq_rank_day ON aq_rank_history(day,best_rank);
