import {
  PlayerIdentityStoreError,
  normalizeStoredAccountType,
  normalizeStoredAppearanceJson,
  normalizeStoredAppearanceLocked,
  normalizeStoredFacing,
  normalizeStoredName,
  normalizeStoredNumber,
  normalizeStoredTimestamp,
  serializeAppearancePayload,
  type PlayerIdentity,
  type PlayerIdentityStoreBackend,
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

const FLUSH_DEBOUNCE_MS = 750;

export const PLAYER_PROFILE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL,
  name TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  facing TEXT NOT NULL DEFAULT 'right',
  appearance_json TEXT NOT NULL DEFAULT '',
  appearance_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS facing TEXT NOT NULL DEFAULT 'right';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS appearance_json TEXT NOT NULL DEFAULT '';

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS appearance_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS player_profiles_account_type_idx
  ON player_profiles (account_type);
`;

export class PostgresPlayerIdentityStore implements PlayerIdentityStoreBackend {
  private readonly profiles = new Map<string, PlayerIdentity>();
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

    const result = await this.pool.query<DatabaseRow>(
      `SELECT
        player_id,
        account_type,
        name,
        x,
        y,
        facing,
        appearance_json,
        appearance_locked,
        created_at,
        updated_at
      FROM player_profiles`,
    );

    for (const row of result.rows) {
      const profile = mapProfileRow(row);
      this.profiles.set(profile.playerId, profile);
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
      x: 0,
      y: 0,
      facing: "right",
      appearanceJson: "",
      appearanceLocked: false,
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

          await client.query(
            `INSERT INTO player_profiles (
              player_id,
              account_type,
              name,
              x,
              y,
              facing,
              appearance_json,
              appearance_locked,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (player_id) DO UPDATE SET
              account_type = EXCLUDED.account_type,
              name = EXCLUDED.name,
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              facing = EXCLUDED.facing,
              appearance_json = EXCLUDED.appearance_json,
              appearance_locked = EXCLUDED.appearance_locked,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at`,
            [
              profile.playerId,
              profile.accountType,
              profile.name,
              profile.x,
              profile.y,
              profile.facing,
              profile.appearanceJson,
              profile.appearanceLocked,
              profile.createdAt,
              profile.updatedAt,
            ],
          );
        }

        await client.query("COMMIT");
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

function mapProfileRow(row: DatabaseRow): PlayerIdentity {
  return {
    playerId: typeof row.player_id === "string" ? row.player_id : "",
    accountType: normalizeStoredAccountType(row.account_type),
    name: normalizeStoredName(row.name),
    x: normalizeStoredNumber(row.x),
    y: normalizeStoredNumber(row.y),
    facing: normalizeStoredFacing(row.facing),
    appearanceJson: normalizeStoredAppearanceJson(row.appearance_json),
    appearanceLocked: normalizeStoredAppearanceLocked(row.appearance_locked),
    createdAt: normalizeStoredTimestamp(row.created_at),
    updatedAt: normalizeStoredTimestamp(row.updated_at),
  };
}
