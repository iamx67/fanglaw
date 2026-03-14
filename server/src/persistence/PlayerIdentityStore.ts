import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type PlayerIdentity = {
  playerId: string;
  accountType: "guest";
  name: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
};

export type PlayerSnapshot = {
  playerId: string;
  name: string;
  x: number;
  y: number;
};

type StoredPlayersFile = {
  version: 1;
  players: Record<string, PlayerIdentity>;
};

const FLUSH_DEBOUNCE_MS = 750;

export class PlayerIdentityStore {
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
            accountType: "guest",
            name: normalizeStoredName(profile.name),
            x: normalizeStoredNumber(profile.x),
            y: normalizeStoredNumber(profile.y),
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

  getOrCreateGuestProfile(playerId: string, suggestedName = "") {
    const existing = this.profiles.get(playerId);
    const nextName = normalizeStoredName(suggestedName);

    if (existing) {
      if (suggestedName && existing.name !== nextName) {
        existing.name = nextName;
        this.touch(existing);
      }

      return existing;
    }

    const now = Date.now();
    const profile: PlayerIdentity = {
      playerId,
      accountType: "guest",
      name: suggestedName ? nextName : "Cat",
      x: 0,
      y: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(playerId, profile);
    this.markDirty();

    return profile;
  }

  savePlayerSnapshot(snapshot: PlayerSnapshot) {
    const profile = this.getOrCreateGuestProfile(snapshot.playerId, snapshot.name);
    let changed = false;

    if (profile.name !== snapshot.name) {
      profile.name = normalizeStoredName(snapshot.name);
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

function serializePlayersFile(players: Map<string, PlayerIdentity>): StoredPlayersFile {
  const serializedPlayers: Record<string, PlayerIdentity> = {};

  for (const [playerId, profile] of players.entries()) {
    serializedPlayers[playerId] = {
      ...profile,
      name: normalizeStoredName(profile.name),
      x: normalizeStoredNumber(profile.x),
      y: normalizeStoredNumber(profile.y),
      createdAt: normalizeStoredTimestamp(profile.createdAt),
      updatedAt: normalizeStoredTimestamp(profile.updatedAt),
    };
  }

  return {
    version: 1,
    players: serializedPlayers,
  };
}

function normalizeStoredName(value: unknown) {
  if (typeof value !== "string") {
    return "Cat";
  }

  const sanitized = value.trim().slice(0, 16);
  return sanitized || "Cat";
}

function normalizeStoredNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStoredTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

const PLAYER_DATA_FILE = fileURLToPath(new URL("../../data/players.json", import.meta.url));

export const playerIdentityStore = new PlayerIdentityStore(PLAYER_DATA_FILE);
