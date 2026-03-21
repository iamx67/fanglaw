-- Backfill domain-specific character tables from legacy player_profiles.
-- Only authenticated characters are migrated because the new tables reference auth_characters.

INSERT INTO character_profiles (
  character_id,
  tribe,
  gender,
  bio,
  created_at,
  updated_at
)
SELECT
  c.character_id,
  COALESCE(p.tribe, ''),
  COALESCE(p.gender, ''),
  '',
  COALESCE(p.created_at, c.created_at),
  COALESCE(p.updated_at, c.updated_at)
FROM auth_characters AS c
JOIN player_profiles AS p
  ON p.player_id = c.character_id
ON CONFLICT (character_id) DO UPDATE SET
  tribe = EXCLUDED.tribe,
  gender = EXCLUDED.gender,
  updated_at = GREATEST(character_profiles.updated_at, EXCLUDED.updated_at);

INSERT INTO character_appearances (
  character_id,
  appearance_json,
  appearance_locked,
  appearance_version,
  created_at,
  updated_at,
  locked_at
)
SELECT
  c.character_id,
  COALESCE(p.appearance_json, ''),
  COALESCE(p.appearance_locked, FALSE),
  1,
  COALESCE(p.created_at, c.created_at),
  COALESCE(p.updated_at, c.updated_at),
  CASE
    WHEN COALESCE(p.appearance_locked, FALSE) THEN COALESCE(p.updated_at, c.updated_at)
    ELSE NULL
  END
FROM auth_characters AS c
JOIN player_profiles AS p
  ON p.player_id = c.character_id
ON CONFLICT (character_id) DO UPDATE SET
  appearance_json = EXCLUDED.appearance_json,
  appearance_locked = EXCLUDED.appearance_locked,
  updated_at = GREATEST(character_appearances.updated_at, EXCLUDED.updated_at),
  locked_at = COALESCE(character_appearances.locked_at, EXCLUDED.locked_at);

INSERT INTO character_progression (
  character_id,
  skills_json,
  created_at,
  updated_at
)
SELECT
  c.character_id,
  COALESCE(p.skills_json, ''),
  COALESCE(p.created_at, c.created_at),
  COALESCE(p.updated_at, c.updated_at)
FROM auth_characters AS c
JOIN player_profiles AS p
  ON p.player_id = c.character_id
ON CONFLICT (character_id) DO UPDATE SET
  skills_json = EXCLUDED.skills_json,
  updated_at = GREATEST(character_progression.updated_at, EXCLUDED.updated_at);
