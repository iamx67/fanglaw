import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  normalizeCharacterName,
  normalizeEmail,
  normalizeSessionToken,
  normalizeTimestamp,
  type AuthAccount,
  type AuthCharacter,
  type AuthSession,
} from "../persistence/AuthStore.js";
import { runMigrations } from "../migrations/runtime.js";
import {
  normalizeStoredAccountType,
  normalizeStoredFacing,
  normalizeStoredGender,
  normalizeStoredSiteUsername,
  normalizeStoredSkillsJson,
  normalizeStoredName,
  normalizeStoredNumber,
  normalizeStoredTimestamp,
  normalizeStoredTribe,
  type PlayerIdentity,
} from "../persistence/PlayerIdentityStore.js";

type StoredAuthFile = {
  version?: number;
  accounts?: Record<string, Partial<AuthAccount>>;
  characters?: Record<string, Partial<AuthCharacter>>;
  sessions?: Record<string, Partial<AuthSession>>;
};

type StoredPlayersFile = {
  version?: number;
  players?: Record<string, Partial<PlayerIdentity>>;
};

const AUTH_DATA_FILE = fileURLToPath(new URL("../../data/auth.json", import.meta.url));
const PLAYER_DATA_FILE = fileURLToPath(new URL("../../data/players.json", import.meta.url));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const databaseSsl = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "") === "true";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Migration requires a PostgreSQL database.");
}

const authData = await loadJsonFile<StoredAuthFile>(AUTH_DATA_FILE, {});
const playerData = await loadJsonFile<StoredPlayersFile>(PLAYER_DATA_FILE, {});
const normalized = normalizeInputData(authData, playerData);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  await runMigrations(pool);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const account of normalized.accounts) {
      await client.query(
        `INSERT INTO auth_accounts (
        account_id,
        email,
        password_hash,
        password_salt,
        created_at,
        updated_at,
        active_character_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (account_id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        active_character_id = EXCLUDED.active_character_id`,
      [
        account.accountId,
        account.email,
        account.passwordHash,
        account.passwordSalt,
        account.createdAt,
        account.updatedAt,
        account.activeCharacterId,
        ],
      );
    }

    for (const character of normalized.characters) {
      await client.query(
        `INSERT INTO auth_characters (
        character_id,
        account_id,
        name,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (character_id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        name = EXCLUDED.name,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        character.characterId,
        character.accountId,
        character.name,
        character.createdAt,
        character.updatedAt,
        ],
      );
    }

    let migratedSessions = 0;
    let skippedSessions = 0;

    for (const session of normalized.sessions) {
      if (!normalized.accountIds.has(session.accountId) || (session.characterId && !normalized.characterIds.has(session.characterId))) {
        skippedSessions += 1;
        continue;
      }

      await client.query(
        `INSERT INTO auth_sessions (
        token,
        account_id,
        character_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (token) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        character_id = EXCLUDED.character_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        session.token,
        session.accountId,
        session.characterId,
        session.createdAt,
        session.updatedAt,
        ],
      );

      migratedSessions += 1;
    }

    for (const profile of normalized.playerProfiles.values()) {
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

      if (!normalized.characterIds.has(profile.playerId)) {
        continue;
      }

      await client.query(
        `INSERT INTO character_profiles (
        character_id,
        tribe,
        gender,
        bio,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
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

      await client.query(
        `INSERT INTO character_appearances (
        character_id,
        appearance_json,
        appearance_locked,
        appearance_version,
        created_at,
        updated_at,
        locked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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

      await client.query(
        `INSERT INTO character_progression (
        character_id,
        skills_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4)
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

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          source: {
            authFile: AUTH_DATA_FILE,
            playersFile: PLAYER_DATA_FILE,
          },
          migrated: {
            accounts: normalized.accounts.length,
            characters: normalized.characters.length,
            sessions: migratedSessions,
            playerProfiles: normalized.playerProfiles.size,
            characterProfiles: normalized.characters.length,
            characterAppearances: normalized.characters.length,
            characterProgression: normalized.characters.length,
          },
          skipped: {
            sessions: skippedSessions,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  throw error;
} finally {
  await pool.end();
}

function normalizeInputData(authFile: StoredAuthFile, playersFile: StoredPlayersFile) {
  const accounts: AuthAccount[] = [];
  const characters: AuthCharacter[] = [];
  const sessions: AuthSession[] = [];
  const accountIds = new Set<string>();
  const characterIds = new Set<string>();
  const playerProfiles = new Map<string, PlayerIdentity>();

  for (const [accountId, account] of Object.entries(authFile.accounts ?? {})) {
    if (!accountId) {
      continue;
    }

    const normalizedAccount: AuthAccount = {
      accountId,
      email: normalizeEmail(account.email),
      passwordHash: typeof account.passwordHash === "string" ? account.passwordHash : "",
      passwordSalt: typeof account.passwordSalt === "string" ? account.passwordSalt : "",
      createdAt: normalizeTimestamp(account.createdAt),
      updatedAt: normalizeTimestamp(account.updatedAt),
      activeCharacterId: typeof account.activeCharacterId === "string" && account.activeCharacterId.trim()
        ? account.activeCharacterId
        : null,
    };

    if (!normalizedAccount.email || !normalizedAccount.passwordHash || !normalizedAccount.passwordSalt) {
      continue;
    }

    accounts.push(normalizedAccount);
    accountIds.add(accountId);
  }

  for (const [characterId, character] of Object.entries(authFile.characters ?? {})) {
    if (!characterId) {
      continue;
    }

    const normalizedCharacter: AuthCharacter = {
      characterId,
      accountId: typeof character.accountId === "string" ? character.accountId : "",
      name: normalizeCharacterName(character.name),
      createdAt: normalizeTimestamp(character.createdAt),
      updatedAt: normalizeTimestamp(character.updatedAt),
    };

    if (!normalizedCharacter.accountId || !normalizedCharacter.name) {
      continue;
    }

    characters.push(normalizedCharacter);
    characterIds.add(characterId);
  }

  for (const [token, session] of Object.entries(authFile.sessions ?? {})) {
    const normalizedToken = normalizeSessionToken(token || session.token);
    const accountId = typeof session.accountId === "string" ? session.accountId : "";
    const characterId = typeof session.characterId === "string" && session.characterId.trim()
      ? session.characterId
      : null;

    if (!normalizedToken || !accountId) {
      continue;
    }

    sessions.push({
      token: normalizedToken,
      accountId,
      characterId,
      createdAt: normalizeTimestamp(session.createdAt),
      updatedAt: normalizeTimestamp(session.updatedAt),
    });
  }

  for (const [playerId, profile] of Object.entries(playersFile.players ?? {})) {
    if (!playerId) {
      continue;
    }

    playerProfiles.set(playerId, {
      playerId,
      accountType: normalizeStoredAccountType(profile.accountType),
      name: normalizeStoredName(profile.name),
      siteUsername: normalizeStoredSiteUsername(profile.siteUsername),
      tribe: normalizeStoredTribe(profile.tribe),
      gender: normalizeStoredGender(profile.gender),
      x: normalizeStoredNumber(profile.x),
      y: normalizeStoredNumber(profile.y),
      facing: normalizeStoredFacing(profile.facing),
      appearanceJson: typeof profile.appearanceJson === "string" ? profile.appearanceJson : "",
      appearanceLocked: profile.appearanceLocked === true,
      skillsJson: normalizeStoredSkillsJson(profile.skillsJson),
      createdAt: normalizeStoredTimestamp(profile.createdAt),
      updatedAt: normalizeStoredTimestamp(profile.updatedAt),
    });
  }

  for (const character of characters) {
    const existing = playerProfiles.get(character.characterId);
    if (!existing) {
      playerProfiles.set(character.characterId, {
        playerId: character.characterId,
        accountType: "account",
        name: character.name,
        siteUsername: "",
        tribe: "",
        gender: "",
        x: 0,
        y: 0,
        facing: "right",
        appearanceJson: "",
        appearanceLocked: false,
        skillsJson: "",
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      });
      continue;
    }

    existing.accountType = "account";
    existing.name = character.name;
    existing.createdAt = Math.min(existing.createdAt, character.createdAt);
    existing.updatedAt = Math.max(existing.updatedAt, character.updatedAt);
  }

  return {
    accounts,
    accountIds,
    characters,
    characterIds,
    sessions,
    playerProfiles,
  };
}

async function loadJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return fallback;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
