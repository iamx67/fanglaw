import { Room } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, WorldState } from "./schema/WorldState.js";
import { isWithinWorldBounds, snapWorldPosition, worldConfig } from "../config/worldConfig.js";
import { AuthStoreError, authStore } from "../persistence/AuthStore.js";
import { playerIdentityStore } from "../persistence/PlayerIdentityStore.js";
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
    async onAuth(_client, options) {
        const sessionToken = normalizeSessionToken(options?.sessionToken);
        if (!sessionToken) {
            throw new Error("Authentication required");
        }
        try {
            return await authStore.getAuthBySessionToken(sessionToken);
        }
        catch (error) {
            if (error instanceof AuthStoreError) {
                throw new Error("Authentication failed");
            }
            throw error;
        }
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
    onJoin(client, _options, auth) {
        const authData = (client.auth ?? auth);
        if (!authData) {
            throw new Error("Authentication required");
        }
        const playerId = authData.characterId;
        const existingPlayer = this.state.players.get(playerId);
        if (existingPlayer) {
            throw new Error("Player is already connected or reconnecting");
        }
        const profile = playerIdentityStore.getOrCreateProfile(playerId, authData.characterName, "account");
        const spawnPosition = snapWorldPosition(profile.x, profile.y);
        const player = new Player();
        player.playerId = authData.characterId;
        player.sessionId = client.sessionId;
        player.name = authData.characterName;
        player.x = spawnPosition.x;
        player.y = spawnPosition.y;
        player.connected = true;
        this.state.players.set(playerId, player);
        this.sessionToPlayerId.set(client.sessionId, playerId);
        this.lastMoveAt.set(playerId, 0);
        void playerIdentityStore.flush();
        void authStore.flush();
        console.log(`join ${player.name} (${playerId} / ${client.sessionId}) account=${authData.accountId}`);
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
        const nextX = snappedPosition.x + step.x * worldConfig.gridCellSize;
        const nextY = snappedPosition.y + step.y * worldConfig.gridCellSize;
        if (!isWithinWorldBounds(nextX, nextY)) {
            return;
        }
        player.x = nextX;
        player.y = nextY;
        this.lastMoveAt.set(playerId, now);
        playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
    }
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
function normalizeSessionToken(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
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