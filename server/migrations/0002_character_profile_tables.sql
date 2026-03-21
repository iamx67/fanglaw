-- Transitional split of legacy player_profiles into domain-specific tables.
-- Runtime still reads player_profiles until the backfill/read-path migration step.

CREATE TABLE IF NOT EXISTS character_profiles (
  character_id TEXT PRIMARY KEY REFERENCES auth_characters(character_id) ON DELETE CASCADE,
  tribe TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS character_profiles_tribe_idx
  ON character_profiles (tribe);

CREATE TABLE IF NOT EXISTS character_appearances (
  character_id TEXT PRIMARY KEY REFERENCES auth_characters(character_id) ON DELETE CASCADE,
  appearance_json TEXT NOT NULL DEFAULT '',
  appearance_locked BOOLEAN NOT NULL DEFAULT FALSE,
  appearance_version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  locked_at BIGINT
);

CREATE INDEX IF NOT EXISTS character_appearances_locked_idx
  ON character_appearances (appearance_locked);

CREATE TABLE IF NOT EXISTS character_progression (
  character_id TEXT PRIMARY KEY REFERENCES auth_characters(character_id) ON DELETE CASCADE,
  skills_json TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
