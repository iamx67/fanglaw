import { randomBytes, randomUUID } from "node:crypto";
import {
  AuthStoreError,
  assertCharacterName,
  assertEmail,
  assertPassword,
  hashPassword,
  normalizeCharacterName,
  normalizeSessionToken,
  type AuthAccount,
  type AuthCharacter,
  type AuthContextData,
  type AuthLoginInput,
  type AuthMutationResult,
  type AuthRegistrationInput,
  type AuthSession,
  type AuthStoreBackend,
  verifyPassword,
} from "./AuthStore.js";

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

export const AUTH_SCHEMA_SQL = `
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
`;

export class PostgresAuthStore implements AuthStoreBackend {
  private pool: PoolLike | null = null;

  constructor(
    private readonly config: {
      databaseUrl: string;
      ssl: boolean;
    },
  ) {}

  async load() {
    if (this.pool) {
      return;
    }

    const pgModule = await this.importPgModule();
    this.pool = new pgModule.Pool({
      connectionString: this.config.databaseUrl,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
    }) as unknown as PoolLike;

    await this.pool.query(AUTH_SCHEMA_SQL);
  }

  async register(input: AuthRegistrationInput): Promise<AuthMutationResult> {
    const email = assertEmail(input.email);
    const password = assertPassword(input.password);
    const characterName = assertCharacterName(input.characterName);
    const now = Date.now();
    const accountId = randomUUID();
    const characterId = randomUUID();
    const passwordSalt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);
    const session = createSession(accountId, characterId, now);

    return await this.withTransaction(async (client) => {
      const existingAccount = await client.query(
        "SELECT account_id FROM auth_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email],
      );
      if ((existingAccount.rowCount ?? 0) > 0) {
        throw new AuthStoreError("Email is already registered", "EMAIL_TAKEN");
      }

      const existingCharacter = await client.query(
        "SELECT character_id FROM auth_characters WHERE LOWER(name) = LOWER($1) LIMIT 1",
        [characterName],
      );
      if ((existingCharacter.rowCount ?? 0) > 0) {
        throw new AuthStoreError("Character name is already taken", "NAME_TAKEN");
      }

      await client.query(
        `INSERT INTO auth_accounts (
          account_id, email, password_hash, password_salt, created_at, updated_at, active_character_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [accountId, email, passwordHash, passwordSalt, now, now, characterId],
      );

      await client.query(
        `INSERT INTO auth_characters (
          character_id, account_id, name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5)`,
        [characterId, accountId, characterName, now, now],
      );

      await client.query(
        `INSERT INTO auth_sessions (
          token, account_id, character_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5)`,
        [session.token, session.accountId, session.characterId, session.createdAt, session.updatedAt],
      );

      return {
        account: {
          accountId,
          email,
          passwordHash,
          passwordSalt,
          createdAt: now,
          updatedAt: now,
          activeCharacterId: characterId,
        },
        character: {
          characterId,
          accountId,
          name: characterName,
          createdAt: now,
          updatedAt: now,
        },
        session,
      };
    });
  }

  async login(input: AuthLoginInput): Promise<AuthMutationResult> {
    const email = assertEmail(input.email);
    const password = assertPassword(input.password);

    return await this.withTransaction(async (client) => {
      const accountResult = await client.query<DatabaseRow>(
        `SELECT
          account_id,
          email,
          password_hash,
          password_salt,
          created_at,
          updated_at,
          active_character_id
        FROM auth_accounts
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
        [email],
      );

      const accountRow = accountResult.rows[0];
      if (!accountRow) {
        throw new AuthStoreError("Invalid email or password", "AUTH_FAILED");
      }

      const account = mapAccountRow(accountRow);
      if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
        throw new AuthStoreError("Invalid email or password", "AUTH_FAILED");
      }

      const characterResult = await client.query<DatabaseRow>(
        `SELECT
          character_id,
          account_id,
          name,
          created_at,
          updated_at
        FROM auth_characters
        WHERE character_id = $1
        LIMIT 1`,
        [account.activeCharacterId],
      );

      const characterRow = characterResult.rows[0];
      if (!characterRow) {
        throw new AuthStoreError("Character is missing for this account", "AUTH_FAILED");
      }

      const character = mapCharacterRow(characterRow);
      const session = createSession(account.accountId, character.characterId);

      await client.query(
        `INSERT INTO auth_sessions (
          token, account_id, character_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5)`,
        [session.token, session.accountId, session.characterId, session.createdAt, session.updatedAt],
      );

      return {
        account,
        character,
        session,
      };
    });
  }

  async getAuthBySessionToken(sessionToken: string): Promise<AuthContextData> {
    const normalizedToken = normalizeSessionToken(sessionToken);
    if (!normalizedToken) {
      throw new AuthStoreError("Session token is invalid", "SESSION_NOT_FOUND");
    }

    return await this.withTransaction(async (client) => {
      const result = await client.query<DatabaseRow>(
        `SELECT
          s.token,
          a.account_id,
          a.email,
          c.character_id,
          c.name
        FROM auth_sessions s
        JOIN auth_accounts a ON a.account_id = s.account_id
        JOIN auth_characters c ON c.character_id = s.character_id
        WHERE s.token = $1
        LIMIT 1`,
        [normalizedToken],
      );

      const row = result.rows[0];
      if (!row) {
        throw new AuthStoreError("Session token is invalid", "SESSION_NOT_FOUND");
      }

      await client.query(
        "UPDATE auth_sessions SET updated_at = $2 WHERE token = $1",
        [normalizedToken, Date.now()],
      );

      return {
        accountId: stringValue(row.account_id),
        characterId: stringValue(row.character_id),
        email: stringValue(row.email),
        characterName: normalizeCharacterName(row.name),
        sessionToken: stringValue(row.token),
      };
    });
  }

  async flush() {
    return;
  }

  private async withTransaction<T>(callback: (client: PoolClientLike) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_rollbackError) {
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private requirePool() {
    if (!this.pool) {
      throw new Error("Postgres auth store is not loaded");
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

function createSession(accountId: string, characterId: string, now = Date.now()): AuthSession {
  return {
    token: randomBytes(32).toString("hex"),
    accountId,
    characterId,
    createdAt: now,
    updatedAt: now,
  };
}

function mapAccountRow(row: DatabaseRow): AuthAccount {
  return {
    accountId: stringValue(row.account_id),
    email: stringValue(row.email),
    passwordHash: stringValue(row.password_hash),
    passwordSalt: stringValue(row.password_salt),
    createdAt: numberValue(row.created_at),
    updatedAt: numberValue(row.updated_at),
    activeCharacterId: stringValue(row.active_character_id),
  };
}

function mapCharacterRow(row: DatabaseRow): AuthCharacter {
  return {
    characterId: stringValue(row.character_id),
    accountId: stringValue(row.account_id),
    name: normalizeCharacterName(row.name),
    createdAt: numberValue(row.created_at),
    updatedAt: numberValue(row.updated_at),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}
