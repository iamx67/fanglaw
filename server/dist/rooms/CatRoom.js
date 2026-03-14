import { Room } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, WorldState } from "./schema/WorldState.js";
import { playerIdentityStore } from "../persistence/PlayerIdentityStore.js";
const GRID_CELL_SIZE = 64;
const WORLD_MIN_X = -512;
const WORLD_MAX_X = 512;
const WORLD_MIN_Y = -256;
const WORLD_MAX_Y = 256;
const GRID_STEP_COOLDOWN_MS = 160;
const RECONNECT_WINDOW_SECONDS = 20;
export class CatRoom extends Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
        this.autoDispose = false;
        this.sessionToPlayerId = new Map();
        this.lastMoveAt = new Map();
    }
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
        this.onMessage("move", (client, message) => {
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
    onJoin(client, options) {
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
    async onLeave(client, code) {
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
        }
        catch {
            playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
            this.state.players.delete(playerId);
            this.lastMoveAt.delete(playerId);
            await playerIdentityStore.flush();
            console.log(`leave ${player.name} (${playerId}) after reconnect timeout`);
        }
    }
    tryMovePlayer(playerId, player, step) {
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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function parseGridStep(value) {
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
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function toAxisStep(value) {
    if (value >= 0.5) {
        return 1;
    }
    if (value <= -0.5) {
        return -1;
    }
    return 0;
}
function snapToGrid(value, min, max) {
    return clamp(Math.round(value / GRID_CELL_SIZE) * GRID_CELL_SIZE, min, max);
}
function snapWorldPosition(x, y) {
    return {
        x: snapToGrid(x, WORLD_MIN_X, WORLD_MAX_X),
        y: snapToGrid(y, WORLD_MIN_Y, WORLD_MAX_Y),
    };
}
function isWithinWorldBounds(x, y) {
    return x >= WORLD_MIN_X && x <= WORLD_MAX_X && y >= WORLD_MIN_Y && y <= WORLD_MAX_Y;
}
function normalizePlayerId(value) {
    const fallback = `guest-${Math.random().toString(36).slice(2, 10)}`;
    if (typeof value !== "string") {
        return fallback;
    }
    const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    return sanitized || fallback;
}
function getSuggestedName(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return "";
    }
    return normalizeName(value);
}
function normalizeName(value) {
    const fallback = "Cat";
    const raw = typeof value === "string" ? value.trim() : fallback;
    return (raw || fallback).slice(0, 16);
}
function toPlayerSnapshot(player) {
    return {
        playerId: player.playerId,
        name: player.name,
        x: player.x,
        y: player.y,
    };
}
//# sourceMappingURL=CatRoom.js.map