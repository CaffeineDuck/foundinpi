ALTER TABLE relics ADD COLUMN artifact_hash TEXT;
ALTER TABLE relics ADD COLUMN match_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_relics_artifact_hash
  ON relics(artifact_hash)
  WHERE artifact_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relics_match_hash
  ON relics(match_hash)
  WHERE match_hash IS NOT NULL;
