import { Room, type Client } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, WorldState } from "./schema/WorldState.js";
import { playerIdentityStore } from "../persistence/PlayerIdentityStore.js";

type JoinOptions = { name?: string; playerId?: string };
type MoveMessage = { x: number; y: number };

type MoveInput = {
  x: number;
  y: number;
};

const PLAYER_SPEED = 180;
const WORLD_MIN_X = -520;
const WORLD_MAX_X = 520;
const WORLD_MIN_Y = -220;
const WORLD_MAX_Y = 220;
const SIMULATION_INTERVAL_MS = 1000 / 20;
const RECONNECT_WINDOW_SECONDS = 20;

export class CatRoom extends Room<{ state: WorldState }> {
  maxClients = 100;
  autoDispose = false;
  private readonly movementInputs = new Map<string, MoveInput>();
  private readonly sessionToPlayerId = new Map<string, string>();

  onCreate() {
    this.setState(new WorldState());
    this.setSimulationInterval((deltaTime) => {
      this.updateMovement(deltaTime);
    }, SIMULATION_INTERVAL_MS);

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

      const input = parseMoveInput(message);

      if (!input) {
        return;
      }

      this.movementInputs.set(playerId, input);
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

    const player = new Player();
    player.playerId = profile.playerId;
    player.sessionId = client.sessionId;
    player.name = profile.name;
    player.x = profile.x;
    player.y = profile.y;
    player.connected = true;

    this.state.players.set(playerId, player);
    this.sessionToPlayerId.set(client.sessionId, playerId);
    this.movementInputs.set(playerId, { x: 0, y: 0 });

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
      this.movementInputs.delete(playerId);
      return;
    }

    this.movementInputs.set(playerId, { x: 0, y: 0 });

    if (code === CloseCode.CONSENTED) {
      playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      this.state.players.delete(playerId);
      this.movementInputs.delete(playerId);
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
      this.movementInputs.set(playerId, { x: 0, y: 0 });

      console.log(`reconnect ${player.name} (${playerId} / ${reconnectedClient.sessionId})`);
    } catch {
      playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      this.state.players.delete(playerId);
      this.movementInputs.delete(playerId);
      await playerIdentityStore.flush();
      console.log(`leave ${player.name} (${playerId}) after reconnect timeout`);
    }
  }

  private updateMovement(deltaTime: number) {
    if (deltaTime <= 0) {
      return;
    }

    const stepSeconds = deltaTime / 1000;

    this.state.players.forEach((player, playerId) => {
      const input = this.movementInputs.get(playerId);

      if (!player.connected || !input || (input.x === 0 && input.y === 0)) {
        return;
      }

      const nextX = player.x + input.x * PLAYER_SPEED * stepSeconds;
      const nextY = player.y + input.y * PLAYER_SPEED * stepSeconds;

      player.x = clamp(nextX, WORLD_MIN_X, WORLD_MAX_X);
      player.y = clamp(nextY, WORLD_MIN_Y, WORLD_MAX_Y);
      playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
    });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMoveInput(value: unknown): MoveInput | null {
  const rawX = isRecord(value) ? value.x : undefined;
  const rawY = isRecord(value) ? value.y : undefined;

  if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY)) {
    return null;
  }

  const clampedX = clamp(rawX, -1, 1);
  const clampedY = clamp(rawY, -1, 1);
  const length = Math.hypot(clampedX, clampedY);

  if (length <= 0.0001) {
    return { x: 0, y: 0 };
  }

  if (length > 1) {
    return {
      x: clampedX / length,
      y: clampedY / length,
    };
  }

  return {
    x: clampedX,
    y: clampedY,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
