import { Room } from "colyseus";
import { Player, WorldState } from "./schema/WorldState.js";
export class CatRoom extends Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
    }
    onCreate() {
        this.setState(new WorldState());
        this.onMessage("ping", (client) => {
            client.send("pong", {
                sessionId: client.sessionId,
                serverTime: Date.now(),
            });
        });
        this.onMessage("move", (client, message) => {
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
    onJoin(client, options) {
        const player = new Player();
        player.id = client.sessionId;
        player.name = normalizeName(options?.name);
        player.x = 0;
        player.y = 0;
        this.state.players.set(client.sessionId, player);
        console.log(`join ${player.name} (${client.sessionId})`);
    }
    onLeave(client) {
        this.state.players.delete(client.sessionId);
        console.log(`leave ${client.sessionId}`);
    }
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function normalizeName(value) {
    const fallback = "Cat";
    const raw = typeof value === "string" ? value.trim() : fallback;
    return (raw || fallback).slice(0, 16);
}
//# sourceMappingURL=CatRoom.js.map