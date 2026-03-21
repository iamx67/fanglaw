ALTER TABLE auth_accounts
  ALTER COLUMN active_character_id DROP NOT NULL;

ALTER TABLE auth_sessions
  ALTER COLUMN character_id DROP NOT NULL;
