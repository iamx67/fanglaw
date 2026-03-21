import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureConfiguredDatabaseMigrations } from "../migrations/bootstrap.js";

export type PlayerIdentity = {
  playerId: string;
  accountType: "guest" | "account";
  name: string;
  siteUsername: string;
  tribe: string;
  gender: string;
  x: number;
  y: number;
  facing: "left" | "right";
  appearanceJson: string;
  appearanceLocked: boolean;
  skillsJson: string;
  createdAt: number;
  updatedAt: number;
};

export type PlayerSnapshot = {
  playerId: string;
  name: string;
  x: number;
  y: number;
  facing: "left" | "right";
};

export type PlayerSiteProfileInput = {
  username?: string;
  tribe?: string;
  gender?: string;
};

export interface PlayerIdentityStoreBackend {
  load(): Promise<void>;
  getProfile(playerId: string): PlayerIdentity | null;
  getOrCreateProfile(
    playerId: string,
    suggestedName?: string,
    accountType?: PlayerIdentity["accountType"],
  ): PlayerIdentity;
  getOrCreateGuestProfile(playerId: string, suggestedName?: string): PlayerIdentity;
  savePlayerSnapshot(snapshot: PlayerSnapshot): PlayerIdentity;
  saveSiteProfile(playerId: string, input: PlayerSiteProfileInput): PlayerIdentity;
  saveAppearanceOnce(playerId: string, appearance: unknown): PlayerIdentity;
  saveSkillProgress(playerId: string, skillId: string, xpDelta: number): PlayerIdentity;
  flush(): Promise<void>;
}

type StoredPlayersFile = {
  version: 1;
  players: Record<string, PlayerIdentity>;
};

const FLUSH_DEBOUNCE_MS = 750;
const MAX_APPEARANCE_JSON_BYTES = 24_000;
const MAX_SKILLS_JSON_BYTES = 24_000;
const MAX_SITE_USERNAME_CHARS = 32;
const MAX_SITE_META_CHARS = 48;

type StoredSkillEntry = {
  xp: number;
};

type StoredSkillsPayload = {
  version: 1;
  skills: Record<string, StoredSkillEntry>;
};

export class PlayerIdentityStoreError extends Error {
  constructor(
    message: string,
    readonly code: "APPEARANCE_LOCKED" | "INVALID_APPEARANCE",
  ) {
    super(message);
  }
}

class FilePlayerIdentityStore implements PlayerIdentityStoreBackend {
  private readonly profiles = new Map<string, PlayerIdentity>();
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
      const parsed = JSON.parse(raw) as Partial<StoredPlayersFile>;

      if (parsed.players && typeof parsed.players === "object") {
        for (const playerId of Object.keys(parsed.players)) {
          const profile = parsed.players[playerId];

          if (!profile || typeof profile !== "object") {
            continue;
          }

          this.profiles.set(playerId, {
            playerId,
            accountType: normalizeStoredAccountType(profile.accountType),
            name: normalizeStoredName(profile.name),
            siteUsername: normalizeStoredSiteUsername(profile.siteUsername),
            tribe: normalizeStoredTribe(profile.tribe),
            gender: normalizeStoredGender(profile.gender),
            x: normalizeStoredNumber(profile.x),
            y: normalizeStoredNumber(profile.y),
            facing: normalizeStoredFacing(profile.facing),
            appearanceJson: normalizeStoredAppearanceJson(profile.appearanceJson),
            appearanceLocked: normalizeStoredAppearanceLocked(profile.appearanceLocked),
            skillsJson: normalizeStoredSkillsJson(profile.skillsJson),
            createdAt: normalizeStoredTimestamp(profile.createdAt),
            updatedAt: normalizeStoredTimestamp(profile.updatedAt),
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
    this.markDirty();

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
    if (!this.loaded || !this.dirty) {
      return this.writeQueue;
    }

    this.dirty = false;

    const payload = JSON.stringify(serializePlayersFile(this.profiles), null, 2) + "\n";

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf8");
    }).catch((error) => {
      this.dirty = true;
      throw error;
    });

    return this.writeQueue;
  }

  private touch(profile: PlayerIdentity) {
    profile.updatedAt = Date.now();
    this.markDirty();
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

class RuntimePlayerIdentityStore implements PlayerIdentityStoreBackend {
  private backend: PlayerIdentityStoreBackend | null = null;
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
        await ensureConfiguredDatabaseMigrations(this.databaseUrl, this.databaseSsl);
        const { PostgresPlayerIdentityStore } = await import("./PostgresPlayerIdentityStore.js");
        this.backend = new PostgresPlayerIdentityStore({
          databaseUrl: this.databaseUrl,
          ssl: this.databaseSsl,
        });
        await this.backend.load();
        this.loaded = true;
        console.log(`[player-profiles] PostgreSQL backend is active (${maskDatabaseUrl(this.databaseUrl)})`);
        return;
      } catch (error) {
        if (this.databaseRequired) {
          throw error;
        }

        console.warn(
          `[player-profiles] PostgreSQL is unavailable (${maskDatabaseUrl(this.databaseUrl)}). Falling back to file storage at ${this.filePath}.`,
        );
        console.warn(error);
      }
    }

    this.backend = new FilePlayerIdentityStore(this.filePath);
    await this.backend.load();
    this.loaded = true;
    if (this.databaseUrl) {
      console.log(`[player-profiles] File fallback backend is active (${this.filePath})`);
    } else {
      console.log(`[player-profiles] File backend is active (${this.filePath})`);
    }
  }

  getProfile(playerId: string) {
    return this.requireBackend().getProfile(playerId);
  }

  getOrCreateProfile(
    playerId: string,
    suggestedName = "",
    accountType: PlayerIdentity["accountType"] = "guest",
  ) {
    return this.requireBackend().getOrCreateProfile(playerId, suggestedName, accountType);
  }

  getOrCreateGuestProfile(playerId: string, suggestedName = "") {
    return this.requireBackend().getOrCreateGuestProfile(playerId, suggestedName);
  }

  savePlayerSnapshot(snapshot: PlayerSnapshot) {
    return this.requireBackend().savePlayerSnapshot(snapshot);
  }

  saveSiteProfile(playerId: string, input: PlayerSiteProfileInput) {
    return this.requireBackend().saveSiteProfile(playerId, input);
  }

  saveAppearanceOnce(playerId: string, appearance: unknown) {
    return this.requireBackend().saveAppearanceOnce(playerId, appearance);
  }

  saveSkillProgress(playerId: string, skillId: string, xpDelta: number) {
    return this.requireBackend().saveSkillProgress(playerId, skillId, xpDelta);
  }

  async flush() {
    await this.requireBackend().flush();
  }

  private requireBackend() {
    if (!this.backend) {
      throw new Error("Player identity store is not loaded");
    }

    return this.backend;
  }
}

function serializePlayersFile(players: Map<string, PlayerIdentity>): StoredPlayersFile {
  const serializedPlayers: Record<string, PlayerIdentity> = {};

  for (const [playerId, profile] of players.entries()) {
    serializedPlayers[playerId] = {
      playerId,
      accountType: normalizeStoredAccountType(profile.accountType),
      name: normalizeStoredName(profile.name),
      siteUsername: normalizeStoredSiteUsername(profile.siteUsername),
      tribe: normalizeStoredTribe(profile.tribe),
      gender: normalizeStoredGender(profile.gender),
      x: normalizeStoredNumber(profile.x),
      y: normalizeStoredNumber(profile.y),
      facing: normalizeStoredFacing(profile.facing),
      appearanceJson: normalizeStoredAppearanceJson(profile.appearanceJson),
      appearanceLocked: normalizeStoredAppearanceLocked(profile.appearanceLocked),
      skillsJson: normalizeStoredSkillsJson(profile.skillsJson),
      createdAt: normalizeStoredTimestamp(profile.createdAt),
      updatedAt: normalizeStoredTimestamp(profile.updatedAt),
    };
  }

  return {
    version: 1,
    players: serializedPlayers,
  };
}

export function normalizeStoredAccountType(value: unknown): PlayerIdentity["accountType"] {
  return value === "account" ? "account" : "guest";
}

export function normalizeStoredName(value: unknown) {
  if (typeof value !== "string") {
    return "Cat";
  }

  const normalized = value.trim().slice(0, 16);
  return normalized || "Cat";
}

export function normalizeStoredSiteUsername(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_SITE_USERNAME_CHARS);
}

export function normalizeStoredTribe(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_SITE_META_CHARS);
}

export function normalizeStoredGender(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_SITE_META_CHARS);
}

export function normalizeStoredNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function normalizeStoredFacing(value: unknown): PlayerIdentity["facing"] {
  return value === "left" ? "left" : "right";
}

export function normalizeStoredAppearanceJson(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return normalized.slice(0, MAX_APPEARANCE_JSON_BYTES);
}

export function normalizeStoredAppearanceLocked(value: unknown) {
  return value === true;
}

export function normalizeStoredSkillsJson(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return normalized.slice(0, MAX_SKILLS_JSON_BYTES);
}

export function normalizeStoredTimestamp(value: unknown) {
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

export function serializeAppearancePayload(appearance: unknown) {
  if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) {
    throw new PlayerIdentityStoreError("Appearance payload is invalid", "INVALID_APPEARANCE");
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(appearance);
  } catch {
    throw new PlayerIdentityStoreError("Appearance payload is invalid", "INVALID_APPEARANCE");
  }

  if (!serialized || serialized.length > MAX_APPEARANCE_JSON_BYTES) {
    throw new PlayerIdentityStoreError("Appearance payload is invalid", "INVALID_APPEARANCE");
  }

  return serialized;
}

export function parseStoredAppearanceJson(appearanceJson: string) {
  const normalized = normalizeStoredAppearanceJson(appearanceJson);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseStoredSkillsJson(skillsJson: string): StoredSkillsPayload {
  const normalized = normalizeStoredSkillsJson(skillsJson);
  if (!normalized) {
    return createEmptySkillsPayload();
  }

  try {
    const parsed = JSON.parse(normalized) as Partial<StoredSkillsPayload>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createEmptySkillsPayload();
    }

    const skills: Record<string, StoredSkillEntry> = {};
    const rawSkills = parsed.skills;
    if (rawSkills && typeof rawSkills === "object" && !Array.isArray(rawSkills)) {
      for (const [rawSkillId, rawSkillEntry] of Object.entries(rawSkills)) {
        const skillId = normalizeStoredSkillId(rawSkillId);
        if (!skillId || !rawSkillEntry || typeof rawSkillEntry !== "object" || Array.isArray(rawSkillEntry)) {
          continue;
        }

        skills[skillId] = {
          xp: Math.max(0, normalizeStoredNumber((rawSkillEntry as Partial<StoredSkillEntry>).xp)),
        };
      }
    }

    return {
      version: 1,
      skills,
    };
  } catch {
    return createEmptySkillsPayload();
  }
}

export function addSkillXpToStoredSkillsJson(skillsJson: string, skillId: string, xpDelta: number) {
  const normalizedSkillId = normalizeStoredSkillId(skillId);
  const normalizedXpDelta = Math.max(0, normalizeStoredNumber(xpDelta));
  if (!normalizedSkillId || normalizedXpDelta <= 0) {
    return normalizeStoredSkillsJson(skillsJson);
  }

  const payload = parseStoredSkillsJson(skillsJson);
  const existingEntry = payload.skills[normalizedSkillId] ?? { xp: 0 };
  payload.skills[normalizedSkillId] = {
    xp: Math.max(0, existingEntry.xp + normalizedXpDelta),
  };

  return serializeStoredSkillsPayload(payload);
}

function serializeStoredSkillsPayload(payload: StoredSkillsPayload) {
  const serialized = JSON.stringify({
    version: 1,
    skills: payload.skills,
  });
  return serialized.length > MAX_SKILLS_JSON_BYTES ? "" : serialized;
}

function createEmptySkillsPayload(): StoredSkillsPayload {
  return {
    version: 1,
    skills: {},
  };
}

function normalizeStoredSkillId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

const PLAYER_DATA_FILE = fileURLToPath(new URL("../../data/players.json", import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const DATABASE_SSL = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "") === "true";
const DATABASE_REQUIRED = (process.env.DATABASE_REQUIRED?.trim().toLowerCase() ?? "") === "true";

export const playerIdentityStore = new RuntimePlayerIdentityStore(
  PLAYER_DATA_FILE,
  DATABASE_URL,
  DATABASE_SSL,
  DATABASE_REQUIRED,
);

function maskDatabaseUrl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const authSuffix = parsed.username ? `${parsed.username}@` : "";
    const portSuffix = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${authSuffix}${parsed.hostname}${portSuffix}${parsed.pathname}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}
