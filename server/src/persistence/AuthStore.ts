import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type AuthAccount = {
  accountId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
  updatedAt: number;
  activeCharacterId: string;
};

export type AuthCharacter = {
  characterId: string;
  accountId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type AuthSession = {
  token: string;
  accountId: string;
  characterId: string;
  createdAt: number;
  updatedAt: number;
};

export type AuthContextData = {
  accountId: string;
  characterId: string;
  email: string;
  characterName: string;
  sessionToken: string;
};

export type AuthRegistrationInput = {
  email: string;
  password: string;
  characterName: string;
};

export type AuthLoginInput = {
  email: string;
  password: string;
};

export type AuthMutationResult = {
  account: AuthAccount;
  character: AuthCharacter;
  session: AuthSession;
};

export interface AuthStoreBackend {
  load(): Promise<void>;
  register(input: AuthRegistrationInput): Promise<AuthMutationResult>;
  login(input: AuthLoginInput): Promise<AuthMutationResult>;
  getAuthBySessionToken(sessionToken: string): Promise<AuthContextData>;
  flush(): Promise<void>;
}

type StoredAuthFile = {
  version: 1;
  accounts: Record<string, AuthAccount>;
  characters: Record<string, AuthCharacter>;
  sessions: Record<string, AuthSession>;
};

const FLUSH_DEBOUNCE_MS = 750;
const PASSWORD_HASH_KEY_LENGTH = 64;

export class AuthStoreError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMAIL_TAKEN"
      | "NAME_TAKEN"
      | "INVALID_EMAIL"
      | "INVALID_PASSWORD"
      | "INVALID_NAME"
      | "AUTH_FAILED"
      | "SESSION_NOT_FOUND",
  ) {
    super(message);
  }
}

class FileAuthStore implements AuthStoreBackend {
  private readonly accounts = new Map<string, AuthAccount>();
  private readonly characters = new Map<string, AuthCharacter>();
  private readonly sessions = new Map<string, AuthSession>();
  private loaded = false;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load() {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredAuthFile>;

      if (parsed.accounts && typeof parsed.accounts === "object") {
        for (const accountId of Object.keys(parsed.accounts)) {
          const account = parsed.accounts[accountId];
          if (!account) {
            continue;
          }

          this.accounts.set(accountId, {
            accountId,
            email: normalizeEmail(account.email),
            passwordHash: typeof account.passwordHash === "string" ? account.passwordHash : "",
            passwordSalt: typeof account.passwordSalt === "string" ? account.passwordSalt : "",
            createdAt: normalizeTimestamp(account.createdAt),
            updatedAt: normalizeTimestamp(account.updatedAt),
            activeCharacterId: typeof account.activeCharacterId === "string" ? account.activeCharacterId : "",
          });
        }
      }

      if (parsed.characters && typeof parsed.characters === "object") {
        for (const characterId of Object.keys(parsed.characters)) {
          const character = parsed.characters[characterId];
          if (!character) {
            continue;
          }

          this.characters.set(characterId, {
            characterId,
            accountId: typeof character.accountId === "string" ? character.accountId : "",
            name: normalizeCharacterName(character.name),
            createdAt: normalizeTimestamp(character.createdAt),
            updatedAt: normalizeTimestamp(character.updatedAt),
          });
        }
      }

      if (parsed.sessions && typeof parsed.sessions === "object") {
        for (const token of Object.keys(parsed.sessions)) {
          const session = parsed.sessions[token];
          if (!session) {
            continue;
          }

          this.sessions.set(token, {
            token,
            accountId: typeof session.accountId === "string" ? session.accountId : "",
            characterId: typeof session.characterId === "string" ? session.characterId : "",
            createdAt: normalizeTimestamp(session.createdAt),
            updatedAt: normalizeTimestamp(session.updatedAt),
          });
        }
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    this.loaded = true;
  }

  async register(input: AuthRegistrationInput) {
    const email = assertEmail(input.email);
    const password = assertPassword(input.password);
    const characterName = assertCharacterName(input.characterName);

    if (this.findAccountByEmail(email)) {
      throw new AuthStoreError("Email is already registered", "EMAIL_TAKEN");
    }

    if (this.findCharacterByName(characterName)) {
      throw new AuthStoreError("Character name is already taken", "NAME_TAKEN");
    }

    const now = Date.now();
    const accountId = randomUUID();
    const characterId = randomUUID();
    const passwordSalt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);

    const account: AuthAccount = {
      accountId,
      email,
      passwordHash,
      passwordSalt,
      createdAt: now,
      updatedAt: now,
      activeCharacterId: characterId,
    };

    const character: AuthCharacter = {
      characterId,
      accountId,
      name: characterName,
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(accountId, account);
    this.characters.set(characterId, character);
    this.markDirty();

    const session = this.createSession(accountId, characterId);
    return {
      account,
      character,
      session,
    };
  }

  async login(input: AuthLoginInput) {
    const email = assertEmail(input.email);
    const password = assertPassword(input.password);
    const account = this.findAccountByEmail(email);

    if (!account || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      throw new AuthStoreError("Invalid email or password", "AUTH_FAILED");
    }

    const character = this.characters.get(account.activeCharacterId);
    if (!character) {
      throw new AuthStoreError("Character is missing for this account", "AUTH_FAILED");
    }

    const session = this.createSession(account.accountId, character.characterId);
    return {
      account,
      character,
      session,
    };
  }

  async getAuthBySessionToken(sessionToken: string): Promise<AuthContextData> {
    const normalizedToken = normalizeSessionToken(sessionToken);
    const session = this.sessions.get(normalizedToken);

    if (!session) {
      throw new AuthStoreError("Session token is invalid", "SESSION_NOT_FOUND");
    }

    const account = this.accounts.get(session.accountId);
    const character = this.characters.get(session.characterId);

    if (!account || !character) {
      throw new AuthStoreError("Session token is invalid", "SESSION_NOT_FOUND");
    }

    session.updatedAt = Date.now();
    this.markDirty();

    return {
      accountId: account.accountId,
      characterId: character.characterId,
      email: account.email,
      characterName: character.name,
      sessionToken: session.token,
    };
  }

  async flush() {
    if (!this.loaded || !this.dirty) {
      return this.writeQueue;
    }

    this.dirty = false;
    const payload = JSON.stringify(serializeAuthFile(this.accounts, this.characters, this.sessions), null, 2) + "\n";

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf8");
    }).catch((error) => {
      this.dirty = true;
      throw error;
    });

    return this.writeQueue;
  }

  private createSession(accountId: string, characterId: string) {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const session: AuthSession = {
      token,
      accountId,
      characterId,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(token, session);
    this.markDirty();
    return session;
  }

  private findAccountByEmail(email: string) {
    for (const account of this.accounts.values()) {
      if (account.email === email) {
        return account;
      }
    }

    return undefined;
  }

  private findCharacterByName(name: string) {
    const normalizedName = normalizeCharacterName(name).toLowerCase();

    for (const character of this.characters.values()) {
      if (character.name.toLowerCase() === normalizedName) {
        return character;
      }
    }

    return undefined;
  }

  private markDirty() {
    this.dirty = true;

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }
}

class RuntimeAuthStore implements AuthStoreBackend {
  private backend: AuthStoreBackend | null = null;
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly databaseUrl: string,
    private readonly databaseSsl: boolean,
    private readonly databaseRequired: boolean,
  ) {}

  async load() {
    if (this.loaded) {
      return;
    }

    if (this.databaseUrl) {
      try {
        const { PostgresAuthStore } = await import("./PostgresAuthStore.js");
        this.backend = new PostgresAuthStore({
          databaseUrl: this.databaseUrl,
          ssl: this.databaseSsl,
        });
        await this.backend.load();
        this.loaded = true;
        console.log(`[auth] PostgreSQL backend is active (${maskDatabaseUrl(this.databaseUrl)})`);
        return;
      } catch (error) {
        if (this.databaseRequired) {
          throw error;
        }

        console.warn(
          `[auth] PostgreSQL is unavailable (${maskDatabaseUrl(this.databaseUrl)}). Falling back to file storage at ${this.filePath}.`,
        );
        console.warn(error);
      }
    }

    this.backend = new FileAuthStore(this.filePath);
    await this.backend.load();
    this.loaded = true;
    if (this.databaseUrl) {
      console.log(`[auth] File fallback backend is active (${this.filePath})`);
    } else {
      console.log(`[auth] File backend is active (${this.filePath})`);
    }
  }

  async register(input: AuthRegistrationInput) {
    return await this.requireBackend().register(input);
  }

  async login(input: AuthLoginInput) {
    return await this.requireBackend().login(input);
  }

  async getAuthBySessionToken(sessionToken: string) {
    return await this.requireBackend().getAuthBySessionToken(sessionToken);
  }

  async flush() {
    await this.requireBackend().flush();
  }

  private requireBackend() {
    if (!this.backend) {
      throw new Error("Auth store is not loaded");
    }

    return this.backend;
  }
}

function serializeAuthFile(
  accounts: Map<string, AuthAccount>,
  characters: Map<string, AuthCharacter>,
  sessions: Map<string, AuthSession>,
): StoredAuthFile {
  const serializedAccounts: Record<string, AuthAccount> = {};
  const serializedCharacters: Record<string, AuthCharacter> = {};
  const serializedSessions: Record<string, AuthSession> = {};

  for (const [accountId, account] of accounts.entries()) {
    serializedAccounts[accountId] = {
      ...account,
      email: normalizeEmail(account.email),
      createdAt: normalizeTimestamp(account.createdAt),
      updatedAt: normalizeTimestamp(account.updatedAt),
    };
  }

  for (const [characterId, character] of characters.entries()) {
    serializedCharacters[characterId] = {
      ...character,
      name: normalizeCharacterName(character.name),
      createdAt: normalizeTimestamp(character.createdAt),
      updatedAt: normalizeTimestamp(character.updatedAt),
    };
  }

  for (const [token, session] of sessions.entries()) {
    serializedSessions[token] = {
      ...session,
      createdAt: normalizeTimestamp(session.createdAt),
      updatedAt: normalizeTimestamp(session.updatedAt),
    };
  }

  return {
    version: 1,
    accounts: serializedAccounts,
    characters: serializedCharacters,
    sessions: serializedSessions,
  };
}

export function assertEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new AuthStoreError("Email is invalid", "INVALID_EMAIL");
  }
  return email;
}

export function assertPassword(value: string) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 6) {
    throw new AuthStoreError("Password must contain at least 6 characters", "INVALID_PASSWORD");
  }
  return password;
}

export function assertCharacterName(value: string) {
  const name = normalizeCharacterName(value);
  if (name.length < 2) {
    throw new AuthStoreError("Character name is too short", "INVALID_NAME");
  }
  return name;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 120);
}

export function normalizeCharacterName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 16);
}

export function normalizeSessionToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

export function normalizeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

export function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH).toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const receivedHash = Buffer.from(hashPassword(password, salt), "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (receivedHash.length !== expectedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    new Uint8Array(receivedHash),
    new Uint8Array(expectedHashBuffer),
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

const AUTH_DATA_FILE = fileURLToPath(new URL("../../data/auth.json", import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const DATABASE_SSL = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "") === "true";
const DATABASE_REQUIRED = (process.env.DATABASE_REQUIRED?.trim().toLowerCase() ?? "") === "true";

export const authStore = new RuntimeAuthStore(AUTH_DATA_FILE, DATABASE_URL, DATABASE_SSL, DATABASE_REQUIRED);

function maskDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    if (url.password) {
      url.password = "****";
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}
