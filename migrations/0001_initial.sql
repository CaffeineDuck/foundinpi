CREATE TABLE IF NOT EXISTS relics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  rarity TEXT NOT NULL,
  score REAL NOT NULL,
  pi_native REAL NOT NULL,
  exact_pct REAL NOT NULL,
  near_pct REAL NOT NULL,
  lossy_pct REAL NOT NULL,
  earth_pct REAL NOT NULL,
  longest_fossil INTEGER NOT NULL,
  dig_site TEXT NOT NULL,
  share_grid TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  card_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'public',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relics_public_rank
  ON relics(status, views DESC, score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relics_created
  ON relics(created_at DESC);

