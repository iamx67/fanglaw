CREATE TABLE IF NOT EXISTS auth_accounts (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  active_character_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_email_lower_idx
  ON auth_accounts (LOWER(email));

CREATE TABLE IF NOT EXISTS auth_characters (
  character_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(account_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_characters_name_lower_idx
  ON auth_characters (LOWER(name));

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(account_id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES auth_characters(character_id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_account_id_idx
  ON auth_sessions (account_id);

CREATE INDEX IF NOT EXISTS auth_sessions_character_id_idx
  ON auth_sessions (character_id);

CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL,
  name TEXT NOT NULL,
  site_username TEXT NOT NULL DEFAULT '',
  tribe TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  facing TEXT NOT NULL DEFAULT 'right',
  appearance_json TEXT NOT NULL DEFAULT '',
  appearance_locked BOOLEAN NOT NULL DEFAULT FALSE,
  skills_json TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS site_username TEXT NOT NULL DEFAULT '';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS tribe TEXT NOT NULL DEFAULT '';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS facing TEXT NOT NULL DEFAULT 'right';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS appearance_json TEXT NOT NULL DEFAULT '';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS appearance_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS skills_json TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS player_profiles_account_type_idx
  ON player_profiles (account_type);
