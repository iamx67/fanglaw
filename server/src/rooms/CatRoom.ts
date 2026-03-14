import { Room, type Client } from "colyseus";
import { Player, WorldState } from "./schema/WorldState.js";

type JoinOptions = { name?: string };
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

export class CatRoom extends Room<{ state: WorldState }> {
  maxClients = 100;
  private readonly movementInputs = new Map<string, MoveInput>();

  onCreate() {
    this.setState(new WorldState());
    this.setSimulationInterval((deltaTime) => {
      this.updateMovement(deltaTime);
    }, SIMULATION_INTERVAL_MS);

    this.onMessage("ping", (client) => {
      client.send("pong", {
        sessionId: client.sessionId,
        serverTime: Date.now(),
      });
    });

    this.onMessage("move", (client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);

      if (!player) {
        return;
      }

      const input = parseMoveInput(message);

      if (!input) {
        return;
      }

      this.movementInputs.set(client.sessionId, input);
    });

    console.log("CatRoom created");
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = normalizeName(options?.name);
    player.x = 0;
    player.y = 0;

    this.state.players.set(client.sessionId, player);
    this.movementInputs.set(client.sessionId, { x: 0, y: 0 });

    console.log(`join ${player.name} (${client.sessionId})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.movementInputs.delete(client.sessionId);
    console.log(`leave ${client.sessionId}`);
  }

  private updateMovement(deltaTime: number) {
    if (deltaTime <= 0) {
      return;
    }

    const stepSeconds = deltaTime / 1000;

    this.state.players.forEach((player, sessionId) => {
      const input = this.movementInputs.get(sessionId);

      if (!input || (input.x === 0 && input.y === 0)) {
        return;
      }

      const nextX = player.x + input.x * PLAYER_SPEED * stepSeconds;
      const nextY = player.y + input.y * PLAYER_SPEED * stepSeconds;

      player.x = clamp(nextX, WORLD_MIN_X, WORLD_MAX_X);
      player.y = clamp(nextY, WORLD_MIN_Y, WORLD_MAX_Y);
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

function normalizeName(value: unknown) {
  const fallback = "Cat";
  const raw = typeof value === "string" ? value.trim() : fallback;

  return (raw || fallback).slice(0, 16);
}
