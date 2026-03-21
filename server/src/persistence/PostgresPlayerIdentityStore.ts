import {
  addSkillXpToStoredSkillsJson,
  PlayerIdentityStoreError,
  normalizeStoredAccountType,
  normalizeStoredAppearanceJson,
  normalizeStoredAppearanceLocked,
  normalizeStoredFacing,
  normalizeStoredGender,
  normalizeStoredName,
  normalizeStoredNumber,
  normalizeStoredSiteUsername,
  normalizeStoredSkillsJson,
  normalizeStoredTimestamp,
  normalizeStoredTribe,
  serializeAppearancePayload,
  type PlayerIdentity,
  type PlayerIdentityStoreBackend,
  type PlayerSiteProfileInput,
  type PlayerSnapshot,
} from "./PlayerIdentityStore.js";

type PoolLike = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  connect(): Promise<PoolClientLike>;
};

type PoolClientLike = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
};

type DatabaseRow = Record<string, unknown>;

type PersistedProfileState = {
  profile: PlayerIdentity;
  hasCharacterProfileRow: boolean;
  hasCharacterAppearanceRow: boolean;
  hasCharacterProgressionRow: boolean;
};

const FLUSH_DEBOUNCE_MS = 750;

export const PLAYER_PROFILE_SCHEMA_SQL = `
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
`;

export class PostgresPlayerIdentityStore implements PlayerIdentityStoreBackend {
  private readonly profiles = new Map<string, PlayerIdentity>();
  private readonly persistedProfiles = new Map<string, PersistedProfileState>();
  private readonly dirtyPlayerIds = new Set<string>();
  private pool: PoolLike | null = null;
  private loaded = false;
  private flushTimer: NodeJS.Timeout | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: {
      databaseUrl: string;
      ssl: boolean;
    },
  ) {}

  async load() {
    if (this.loaded) {
      return;
    }

    const pgModule = await this.importPgModule();
    this.pool = new pgModule.Pool({
      connectionString: this.config.databaseUrl,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
    }) as unknown as PoolLike;

    await this.pool.query(PLAYER_PROFILE_SCHEMA_SQL);

    const [legacyOnlyProfiles, accountProfiles] = await Promise.all([
      this.pool.query<DatabaseRow>(
        `SELECT
          p.player_id,
          p.account_type,
          p.name,
          p.site_username,
          p.tribe,
          p.gender,
          p.x,
          p.y,
          p.facing,
          p.appearance_json,
          p.appearance_locked,
          p.skills_json,
          p.created_at,
          p.updated_at
        FROM player_profiles AS p
        LEFT JOIN auth_characters AS c
          ON c.character_id = p.player_id
        WHERE c.character_id IS NULL`,
      ),
      this.pool.query<DatabaseRow>(
        `SELECT
          c.character_id,
          c.name AS character_name,
          c.created_at AS character_created_at,
          c.updated_at AS character_updated_at,
          p.player_id AS legacy_player_id,
          p.account_type AS legacy_account_type,
          p.name AS legacy_name,
          p.site_username AS legacy_site_username,
          p.tribe AS legacy_tribe,
          p.gender AS legacy_gender,
          p.x AS legacy_x,
          p.y AS legacy_y,
          p.facing AS legacy_facing,
          p.appearance_json AS legacy_appearance_json,
          p.appearance_locked AS legacy_appearance_locked,
          p.skills_json AS legacy_skills_json,
          p.created_at AS legacy_created_at,
          p.updated_at AS legacy_updated_at,
          cp.character_id AS profile_character_id,
          cp.tribe AS profile_tribe,
          cp.gender AS profile_gender,
          cp.bio AS profile_bio,
          cp.created_at AS profile_created_at,
          cp.updated_at AS profile_updated_at,
          ca.character_id AS appearance_character_id,
          ca.appearance_json,
          ca.appearance_locked,
          ca.appearance_version,
          ca.created_at AS appearance_created_at,
          ca.updated_at AS appearance_updated_at,
          ca.locked_at AS appearance_locked_at,
          prog.character_id AS progression_character_id,
          prog.skills_json AS progression_skills_json,
          prog.created_at AS progression_created_at,
          prog.updated_at AS progression_updated_at
        FROM auth_characters AS c
        LEFT JOIN player_profiles AS p
          ON p.player_id = c.character_id
        LEFT JOIN character_profiles AS cp
          ON cp.character_id = c.character_id
        LEFT JOIN character_appearances AS ca
          ON ca.character_id = c.character_id
        LEFT JOIN character_progression AS prog
          ON prog.character_id = c.character_id`,
      ),
    ]);

    for (const row of legacyOnlyProfiles.rows) {
      const profile = mapLegacyProfileRow(row);
      this.profiles.set(profile.playerId, profile);
      this.persistedProfiles.set(profile.playerId, {
        profile: cloneProfile(profile),
        hasCharacterProfileRow: false,
        hasCharacterAppearanceRow: false,
        hasCharacterProgressionRow: false,
      });
    }

    for (const row of accountProfiles.rows) {
      const persisted = mapAccountCharacterRow(row);
      this.profiles.set(persisted.profile.playerId, persisted.profile);
      this.persistedProfiles.set(persisted.profile.playerId, {
        profile: cloneProfile(persisted.profile),
        hasCharacterProfileRow: persisted.hasCharacterProfileRow,
        hasCharacterAppearanceRow: persisted.hasCharacterAppearanceRow,
        hasCharacterProgressionRow: persisted.hasCharacterProgressionRow,
      });
    }

    this.loaded = true;
  }

  getProfile(playerId: string) {
    return this.profiles.get(playerId) ?? null;
  }

  getOrCreateProfile(
    playerId: string,
    suggestedName = "",
    accountType: PlayerIdentity["accountType"] = "guest",
  ) {
    const existing = this.profiles.get(playerId);
    const nextName = normalizeStoredName(suggestedName);

    if (existing) {
      let changed = false;

      if (existing.accountType !== accountType) {
        existing.accountType = accountType;
        changed = true;
      }

      if (suggestedName && existing.name !== nextName) {
        existing.name = nextName;
        changed = true;
      }

      if (changed) {
        this.touch(existing);
      }

      return existing;
    }

    const now = Date.now();
    const profile: PlayerIdentity = {
      playerId,
      accountType,
      name: suggestedName ? nextName : "Cat",
      siteUsername: "",
      tribe: "",
      gender: "",
      x: 0,
      y: 0,
      facing: "right",
      appearanceJson: "",
      appearanceLocked: false,
      skillsJson: "",
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(playerId, profile);
    this.markDirty(playerId);

    return profile;
  }

  getOrCreateGuestProfile(playerId: string, suggestedName = "") {
    return this.getOrCreateProfile(playerId, suggestedName, "guest");
  }

  savePlayerSnapshot(snapshot: PlayerSnapshot) {
    const existing = this.profiles.get(snapshot.playerId);
    const profile = this.getOrCreateProfile(
      snapshot.playerId,
      snapshot.name,
      existing?.accountType ?? "guest",
    );
    let changed = false;
    const nextName = normalizeStoredName(snapshot.name);

    if (profile.name !== nextName) {
      profile.name = nextName;
      changed = true;
    }

    if (profile.x !== snapshot.x) {
      profile.x = snapshot.x;
      changed = true;
    }

    if (profile.y !== snapshot.y) {
      profile.y = snapshot.y;
      changed = true;
    }

    if (profile.facing !== snapshot.facing) {
      profile.facing = normalizeStoredFacing(snapshot.facing);
      changed = true;
    }

    if (changed) {
      this.touch(profile);
    }

    return profile;
  }

  saveSiteProfile(playerId: string, input: PlayerSiteProfileInput) {
    const profile = this.getOrCreateProfile(playerId, "", "account");
    const nextSiteUsername = normalizeStoredSiteUsername(input.username);
    const nextTribe = normalizeStoredTribe(input.tribe);
    const nextGender = normalizeStoredGender(input.gender);
    let changed = false;

    if (profile.siteUsername !== nextSiteUsername) {
      profile.siteUsername = nextSiteUsername;
      changed = true;
    }

    if (profile.tribe !== nextTribe) {
      profile.tribe = nextTribe;
      changed = true;
    }

    if (profile.gender !== nextGender) {
      profile.gender = nextGender;
      changed = true;
    }

    if (changed) {
      this.touch(profile);
    }

    return profile;
  }

  saveAppearanceOnce(playerId: string, appearance: unknown) {
    const profile = this.getOrCreateProfile(playerId, "", "account");
    if (profile.appearanceLocked || profile.appearanceJson) {
      throw new PlayerIdentityStoreError("Appearance is already locked", "APPEARANCE_LOCKED");
    }

    profile.appearanceJson = serializeAppearancePayload(appearance);
    profile.appearanceLocked = true;
    this.touch(profile);
    return profile;
  }

  saveSkillProgress(playerId: string, skillId: string, xpDelta: number) {
    const profile = this.getOrCreateProfile(playerId, "", "account");
    const nextSkillsJson = addSkillXpToStoredSkillsJson(profile.skillsJson, skillId, xpDelta);
    if (profile.skillsJson === nextSkillsJson) {
      return profile;
    }

    profile.skillsJson = nextSkillsJson;
    this.touch(profile);
    return profile;
  }

  async flush() {
    if (!this.loaded || this.dirtyPlayerIds.size === 0) {
      return this.writeQueue;
    }

    const dirtyPlayerIds = Array.from(this.dirtyPlayerIds);
    this.dirtyPlayerIds.clear();

    this.writeQueue = this.writeQueue.then(async () => {
      const client = await this.requirePool().connect();
      try {
        await client.query("BEGIN");

        for (const playerId of dirtyPlayerIds) {
          const profile = this.profiles.get(playerId);
          if (!profile) {
            continue;
          }

          const persisted = this.persistedProfiles.get(playerId) ?? null;
          const shouldWriteCharacterProfile = profile.accountType === "account" && (
            !persisted?.hasCharacterProfileRow
            || persisted.profile.accountType !== "account"
            || profile.tribe !== persisted.profile.tribe
            || profile.gender !== persisted.profile.gender
          );
          const shouldWriteCharacterAppearance = profile.accountType === "account" && (
            !persisted?.hasCharacterAppearanceRow
            || persisted.profile.accountType !== "account"
            || profile.appearanceJson !== persisted.profile.appearanceJson
            || profile.appearanceLocked !== persisted.profile.appearanceLocked
          );
          const shouldWriteCharacterProgression = profile.accountType === "account" && (
            !persisted?.hasCharacterProgressionRow
            || persisted.profile.accountType !== "account"
            || profile.skillsJson !== persisted.profile.skillsJson
          );

          await client.query(
            `INSERT INTO player_profiles (
              player_id,
              account_type,
              name,
              site_username,
              tribe,
              gender,
              x,
              y,
              facing,
              appearance_json,
              appearance_locked,
              skills_json,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (player_id) DO UPDATE SET
              account_type = EXCLUDED.account_type,
              name = EXCLUDED.name,
              site_username = EXCLUDED.site_username,
              tribe = EXCLUDED.tribe,
              gender = EXCLUDED.gender,
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              facing = EXCLUDED.facing,
              appearance_json = EXCLUDED.appearance_json,
              appearance_locked = EXCLUDED.appearance_locked,
              skills_json = EXCLUDED.skills_json,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at`,
            [
              profile.playerId,
              profile.accountType,
              profile.name,
              profile.siteUsername,
              profile.tribe,
              profile.gender,
              profile.x,
              profile.y,
              profile.facing,
              profile.appearanceJson,
              profile.appearanceLocked,
              profile.skillsJson,
              profile.createdAt,
              profile.updatedAt,
            ],
          );

          if (shouldWriteCharacterProfile) {
            await client.query(
              `INSERT INTO character_profiles (
                character_id,
                tribe,
                gender,
                bio,
                created_at,
                updated_at
              )
              SELECT $1, $2, $3, $4, $5, $6
              WHERE EXISTS (
                SELECT 1
                FROM auth_characters
                WHERE character_id = $1
              )
              ON CONFLICT (character_id) DO UPDATE SET
                tribe = EXCLUDED.tribe,
                gender = EXCLUDED.gender,
                bio = EXCLUDED.bio,
                created_at = LEAST(character_profiles.created_at, EXCLUDED.created_at),
                updated_at = GREATEST(character_profiles.updated_at, EXCLUDED.updated_at)`,
              [
                profile.playerId,
                profile.tribe,
                profile.gender,
                "",
                profile.createdAt,
                profile.updatedAt,
              ],
            );
          }

          if (shouldWriteCharacterAppearance) {
            await client.query(
              `INSERT INTO character_appearances (
                character_id,
                appearance_json,
                appearance_locked,
                appearance_version,
                created_at,
                updated_at,
                locked_at
              )
              SELECT $1, $2, $3, $4, $5, $6, $7
              WHERE EXISTS (
                SELECT 1
                FROM auth_characters
                WHERE character_id = $1
              )
              ON CONFLICT (character_id) DO UPDATE SET
                appearance_json = EXCLUDED.appearance_json,
                appearance_locked = EXCLUDED.appearance_locked,
                appearance_version = GREATEST(character_appearances.appearance_version, EXCLUDED.appearance_version),
                created_at = LEAST(character_appearances.created_at, EXCLUDED.created_at),
                updated_at = GREATEST(character_appearances.updated_at, EXCLUDED.updated_at),
                locked_at = CASE
                  WHEN EXCLUDED.appearance_locked THEN COALESCE(character_appearances.locked_at, EXCLUDED.locked_at)
                  ELSE NULL
                END`,
              [
                profile.playerId,
                profile.appearanceJson,
                profile.appearanceLocked,
                1,
                profile.createdAt,
                profile.updatedAt,
                profile.appearanceLocked ? profile.updatedAt : null,
              ],
            );
          }

          if (shouldWriteCharacterProgression) {
            await client.query(
              `INSERT INTO character_progression (
                character_id,
                skills_json,
                created_at,
                updated_at
              )
              SELECT $1, $2, $3, $4
              WHERE EXISTS (
                SELECT 1
                FROM auth_characters
                WHERE character_id = $1
              )
              ON CONFLICT (character_id) DO UPDATE SET
                skills_json = EXCLUDED.skills_json,
                created_at = LEAST(character_progression.created_at, EXCLUDED.created_at),
                updated_at = GREATEST(character_progression.updated_at, EXCLUDED.updated_at)`,
              [
                profile.playerId,
                profile.skillsJson,
                profile.createdAt,
                profile.updatedAt,
              ],
            );
          }
        }

        await client.query("COMMIT");

        for (const playerId of dirtyPlayerIds) {
          const profile = this.profiles.get(playerId);
          if (!profile) {
            continue;
          }

          const persisted = this.persistedProfiles.get(playerId);
          this.persistedProfiles.set(playerId, {
            profile: cloneProfile(profile),
            hasCharacterProfileRow: profile.accountType === "account"
              ? (persisted?.hasCharacterProfileRow ?? false) || shouldProfileTableExist(profile, persisted)
              : persisted?.hasCharacterProfileRow ?? false,
            hasCharacterAppearanceRow: profile.accountType === "account"
              ? (persisted?.hasCharacterAppearanceRow ?? false) || shouldAppearanceTableExist(profile, persisted)
              : persisted?.hasCharacterAppearanceRow ?? false,
            hasCharacterProgressionRow: profile.accountType === "account"
              ? (persisted?.hasCharacterProgressionRow ?? false) || shouldProgressionTableExist(profile, persisted)
              : persisted?.hasCharacterProgressionRow ?? false,
          });
        }
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        for (const playerId of dirtyPlayerIds) {
          this.dirtyPlayerIds.add(playerId);
        }
        throw error;
      } finally {
        client.release();
      }
    });

    return this.writeQueue;
  }

  private touch(profile: PlayerIdentity) {
    profile.updatedAt = Date.now();
    this.markDirty(profile.playerId);
  }

  private markDirty(playerId: string) {
    this.dirtyPlayerIds.add(playerId);

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private requirePool() {
    if (!this.pool) {
      throw new Error("Postgres player identity store is not loaded");
    }

    return this.pool;
  }

  private async importPgModule() {
    try {
      return await import("pg");
    } catch (error) {
      throw new Error(
        "DATABASE_URL is set, but package 'pg' is not installed. Run 'npm install' in server/ before starting the backend.",
        { cause: error },
      );
    }
  }
}

function mapLegacyProfileRow(row: DatabaseRow): PlayerIdentity {
  return {
    playerId: typeof row.player_id === "string" ? row.player_id : "",
    accountType: normalizeStoredAccountType(row.account_type),
    name: normalizeStoredName(row.name),
    siteUsername: normalizeStoredSiteUsername(row.site_username),
    tribe: normalizeStoredTribe(row.tribe),
    gender: normalizeStoredGender(row.gender),
    x: normalizeStoredNumber(row.x),
    y: normalizeStoredNumber(row.y),
    facing: normalizeStoredFacing(row.facing),
    appearanceJson: normalizeStoredAppearanceJson(row.appearance_json),
    appearanceLocked: normalizeStoredAppearanceLocked(row.appearance_locked),
    skillsJson: normalizeStoredSkillsJson(row.skills_json),
    createdAt: normalizeStoredTimestamp(row.created_at),
    updatedAt: normalizeStoredTimestamp(row.updated_at),
  };
}

function mapAccountCharacterRow(row: DatabaseRow): PersistedProfileState {
  const hasCharacterProfileRow = hasJoinedRow(row.profile_character_id);
  const hasCharacterAppearanceRow = hasJoinedRow(row.appearance_character_id);
  const hasCharacterProgressionRow = hasJoinedRow(row.progression_character_id);
  const legacyCreatedAt = readOptionalTimestamp(row.legacy_created_at);
  const legacyUpdatedAt = readOptionalTimestamp(row.legacy_updated_at);
  const characterCreatedAt = readOptionalTimestamp(row.character_created_at);
  const characterUpdatedAt = readOptionalTimestamp(row.character_updated_at);
  const createdAt = legacyCreatedAt ?? characterCreatedAt ?? Date.now();
  const updatedAt = legacyUpdatedAt ?? characterUpdatedAt ?? createdAt;

  return {
    profile: {
      playerId: typeof row.character_id === "string" ? row.character_id : "",
      accountType: "account",
      name: normalizeStoredName(
        typeof row.character_name === "string" && row.character_name.trim()
          ? row.character_name
          : row.legacy_name,
      ),
      siteUsername: normalizeStoredSiteUsername(row.legacy_site_username),
      tribe: normalizeStoredTribe(hasCharacterProfileRow ? row.profile_tribe : row.legacy_tribe),
      gender: normalizeStoredGender(hasCharacterProfileRow ? row.profile_gender : row.legacy_gender),
      x: normalizeStoredNumber(row.legacy_x),
      y: normalizeStoredNumber(row.legacy_y),
      facing: normalizeStoredFacing(row.legacy_facing),
      appearanceJson: normalizeStoredAppearanceJson(
        hasCharacterAppearanceRow ? row.appearance_json : row.legacy_appearance_json,
      ),
      appearanceLocked: normalizeStoredAppearanceLocked(
        hasCharacterAppearanceRow ? row.appearance_locked : row.legacy_appearance_locked,
      ),
      skillsJson: normalizeStoredSkillsJson(
        hasCharacterProgressionRow ? row.progression_skills_json : row.legacy_skills_json,
      ),
      createdAt,
      updatedAt: Math.max(createdAt, updatedAt),
    },
    hasCharacterProfileRow,
    hasCharacterAppearanceRow,
    hasCharacterProgressionRow,
  };
}

function cloneProfile(profile: PlayerIdentity): PlayerIdentity {
  return {
    playerId: profile.playerId,
    accountType: profile.accountType,
    name: profile.name,
    siteUsername: profile.siteUsername,
    tribe: profile.tribe,
    gender: profile.gender,
    x: profile.x,
    y: profile.y,
    facing: profile.facing,
    appearanceJson: profile.appearanceJson,
    appearanceLocked: profile.appearanceLocked,
    skillsJson: profile.skillsJson,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function hasJoinedRow(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function readOptionalTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function shouldProfileTableExist(profile: PlayerIdentity, persisted: PersistedProfileState | null | undefined) {
  return !persisted?.hasCharacterProfileRow
    || persisted.profile.accountType !== "account"
    || profile.tribe !== persisted.profile.tribe
    || profile.gender !== persisted.profile.gender;
}

function shouldAppearanceTableExist(profile: PlayerIdentity, persisted: PersistedProfileState | null | undefined) {
  return !persisted?.hasCharacterAppearanceRow
    || persisted.profile.accountType !== "account"
    || profile.appearanceJson !== persisted.profile.appearanceJson
    || profile.appearanceLocked !== persisted.profile.appearanceLocked;
}

function shouldProgressionTableExist(profile: PlayerIdentity, persisted: PersistedProfileState | null | undefined) {
  return !persisted?.hasCharacterProgressionRow
    || persisted.profile.accountType !== "account"
    || profile.skillsJson !== persisted.profile.skillsJson;
}
