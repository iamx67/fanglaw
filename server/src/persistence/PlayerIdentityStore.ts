import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type PlayerIdentity = {
  playerId: string;
  accountType: "guest" | "account";
  name: string;
  x: number;
  y: number;
  facing: "left" | "right";
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

export interface PlayerIdentityStoreBackend {
  load(): Promise<void>;
  getOrCreateProfile(
    playerId: string,
    suggestedName?: string,
    accountType?: PlayerIdentity["accountType"],
  ): PlayerIdentity;
  getOrCreateGuestProfile(playerId: string, suggestedName?: string): PlayerIdentity;
  savePlayerSnapshot(snapshot: PlayerSnapshot): PlayerIdentity;
  flush(): Promise<void>;
}

type StoredPlayersFile = {
  version: 1;
  players: Record<string, PlayerIdentity>;
};

const FLUSH_DEBOUNCE_MS = 750;

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
            x: normalizeStoredNumber(profile.x),
            y: normalizeStoredNumber(profile.y),
            facing: normalizeStoredFacing(profile.facing),
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
      ...profile,
      accountType: normalizeStoredAccountType(profile.accountType),
      name: normalizeStoredName(profile.name),
      x: normalizeStoredNumber(profile.x),
      y: normalizeStoredNumber(profile.y),
      facing: normalizeStoredFacing(profile.facing),
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

  const sanitized = value.trim().slice(0, 16);
  return sanitized || "Cat";
}

export function normalizeStoredNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeStoredFacing(value: unknown): PlayerIdentity["facing"] {
  return value === "left" ? "left" : "right";
}

export function normalizeStoredTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
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
    const url = new URL(databaseUrl);
    if (url.password) {
      url.password = "****";
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}
