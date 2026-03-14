import { Room, type Client } from "colyseus";
import { Player, WorldState } from "./schema/WorldState.js";

type JoinOptions = { name?: string };
type MoveMessage = { x: number; y: number };

export class CatRoom extends Room<{ state: WorldState }> {
  maxClients = 100;

  onCreate() {
    this.setState(new WorldState());

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

      if (!isFiniteNumber(message?.x) || !isFiniteNumber(message?.y)) {
        return;
      }

      player.x = clamp(message.x, -10_000, 10_000);
      player.y = clamp(message.y, -10_000, 10_000);
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

    console.log(`join ${player.name} (${client.sessionId})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`leave ${client.sessionId}`);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeName(value: unknown) {
  const fallback = "Cat";
  const raw = typeof value === "string" ? value.trim() : fallback;

  return (raw || fallback).slice(0, 16);
}
