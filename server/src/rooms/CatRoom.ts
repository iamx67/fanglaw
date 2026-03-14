import { Room, type Client } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, WorldState } from "./schema/WorldState.js";
import { playerIdentityStore } from "../persistence/PlayerIdentityStore.js";

type JoinOptions = { name?: string; playerId?: string };
type MoveMessage = { x: number; y: number };

type GridStep = {
  x: number;
  y: number;
};

const GRID_CELL_SIZE = 64;
const WORLD_MIN_X = -512;
const WORLD_MAX_X = 512;
const WORLD_MIN_Y = -256;
const WORLD_MAX_Y = 256;
const GRID_STEP_COOLDOWN_MS = 160;
const RECONNECT_WINDOW_SECONDS = 20;

export class CatRoom extends Room<{ state: WorldState }> {
  maxClients = 100;
  autoDispose = false;
  private readonly sessionToPlayerId = new Map<string, string>();
  private readonly lastMoveAt = new Map<string, number>();

  onCreate() {
    this.setState(new WorldState());

    this.onMessage("ping", (client) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId) ?? "";

      client.send("pong", {
        playerId,
        sessionId: client.sessionId,
        serverTime: Date.now(),
      });
    });

    this.onMessage("move", (client, message: MoveMessage) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);

      if (!playerId) {
        return;
      }

      const player = this.state.players.get(playerId);

      if (!player || !player.connected) {
        return;
      }

      const step = parseGridStep(message);

      if (!step) {
        return;
      }

      this.tryMovePlayer(playerId, player, step);
    });

    console.log("CatRoom created");
  }

  onJoin(client: Client, options: JoinOptions) {
    const playerId = normalizePlayerId(options?.playerId);
    const existingPlayer = this.state.players.get(playerId);

    if (existingPlayer) {
      throw new Error("Player is already connected or reconnecting");
    }

    const profile = playerIdentityStore.getOrCreateGuestProfile(playerId, getSuggestedName(options?.name));
    const spawnPosition = snapWorldPosition(profile.x, profile.y);

    const player = new Player();
    player.playerId = profile.playerId;
    player.sessionId = client.sessionId;
    player.name = profile.name;
    player.x = spawnPosition.x;
    player.y = spawnPosition.y;
    player.connected = true;

    this.state.players.set(playerId, player);
    this.sessionToPlayerId.set(client.sessionId, playerId);
    this.lastMoveAt.set(playerId, 0);

    void playerIdentityStore.flush();

    console.log(`join ${player.name} (${playerId} / ${client.sessionId})`);
  }

  async onLeave(client: Client, code?: number) {
    const playerId = this.sessionToPlayerId.get(client.sessionId);

    if (!playerId) {
      return;
    }

    const player = this.state.players.get(playerId);
    this.sessionToPlayerId.delete(client.sessionId);

    if (!player) {
      this.lastMoveAt.delete(playerId);
      return;
    }

    if (code === CloseCode.CONSENTED) {
      playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      this.state.players.delete(playerId);
      this.lastMoveAt.delete(playerId);
      await playerIdentityStore.flush();
      console.log(`leave ${player.name} (${playerId})`);
      return;
    }

    player.connected = false;

    try {
      const reconnectedClient = await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);

      this.sessionToPlayerId.set(reconnectedClient.sessionId, playerId);
      player.sessionId = reconnectedClient.sessionId;
      player.connected = true;
      this.lastMoveAt.set(playerId, 0);

      console.log(`reconnect ${player.name} (${playerId} / ${reconnectedClient.sessionId})`);
    } catch {
      playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      this.state.players.delete(playerId);
      this.lastMoveAt.delete(playerId);
      await playerIdentityStore.flush();
      console.log(`leave ${player.name} (${playerId}) after reconnect timeout`);
    }
  }

  private tryMovePlayer(playerId: string, player: Player, step: GridStep) {
    const lastMoveAt = this.lastMoveAt.get(playerId) ?? 0;
    const now = Date.now();

    if (now - lastMoveAt < GRID_STEP_COOLDOWN_MS) {
      return;
    }

    const snappedPosition = snapWorldPosition(player.x, player.y);
    const nextX = snappedPosition.x + step.x * GRID_CELL_SIZE;
    const nextY = snappedPosition.y + step.y * GRID_CELL_SIZE;

    if (!isWithinWorldBounds(nextX, nextY)) {
      return;
    }

    player.x = nextX;
    player.y = nextY;
    this.lastMoveAt.set(playerId, now);
    playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseGridStep(value: unknown): GridStep | null {
  const rawX = isRecord(value) ? value.x : undefined;
  const rawY = isRecord(value) ? value.y : undefined;

  if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY)) {
    return null;
  }

  const stepX = toAxisStep(rawX);
  const stepY = toAxisStep(rawY);

  if (stepX === 0 && stepY === 0) {
    return null;
  }

  if (stepX !== 0 && stepY !== 0) {
    return null;
  }

  return {
    x: stepX,
    y: stepY,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAxisStep(value: number) {
  if (value >= 0.5) {
    return 1;
  }

  if (value <= -0.5) {
    return -1;
  }

  return 0;
}

function snapToGrid(value: number, min: number, max: number) {
  return clamp(Math.round(value / GRID_CELL_SIZE) * GRID_CELL_SIZE, min, max);
}

function snapWorldPosition(x: number, y: number) {
  return {
    x: snapToGrid(x, WORLD_MIN_X, WORLD_MAX_X),
    y: snapToGrid(y, WORLD_MIN_Y, WORLD_MAX_Y),
  };
}

function isWithinWorldBounds(x: number, y: number) {
  return x >= WORLD_MIN_X && x <= WORLD_MAX_X && y >= WORLD_MIN_Y && y <= WORLD_MAX_Y;
}

function normalizePlayerId(value: unknown) {
  const fallback = `guest-${Math.random().toString(36).slice(2, 10)}`;

  if (typeof value !== "string") {
    return fallback;
  }

  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  return sanitized || fallback;
}

function getSuggestedName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  return normalizeName(value);
}

function normalizeName(value: unknown) {
  const fallback = "Cat";
  const raw = typeof value === "string" ? value.trim() : fallback;

  return (raw || fallback).slice(0, 16);
}

function toPlayerSnapshot(player: Player) {
  return {
    playerId: player.playerId,
    name: player.name,
    x: player.x,
    y: player.y,
  };
}
