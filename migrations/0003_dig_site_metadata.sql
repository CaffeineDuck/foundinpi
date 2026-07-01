ALTER TABLE relics ADD COLUMN index_version TEXT;
ALTER TABLE relics ADD COLUMN index_checksum TEXT;
ALTER TABLE relics ADD COLUMN searched_digits INTEGER;
ALTER TABLE relics ADD COLUMN indexed_fragments INTEGER;

UPDATE relics
SET
  dig_site = 'Dig Site II: first 10,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments',
  index_version = 'pi32-10m-v1',
  index_checksum = 'ea6785ba281de9ae879fa730ba70662d729d1dd5600d12de7d1734315b0f5359',
  searched_digits = 10000000,
  indexed_fragments = 1428567
WHERE dig_site = 'Dig Site I: first 10,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments';

UPDATE relics
SET
  index_version = COALESCE(index_version, 'pi32-1m-v1'),
  index_checksum = COALESCE(index_checksum, '555ee7260f240b7a6808aafcaac31d1ace809b3d8e55da4245f6a92c3974fe66'),
  searched_digits = COALESCE(searched_digits, 1000000),
  indexed_fragments = COALESCE(indexed_fragments, 142853)
WHERE dig_site = 'Dig Site I: first 1,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments';

CREATE INDEX IF NOT EXISTS idx_relics_dig_site_version
  ON relics(dig_site, index_version);
