import { Room, type Client } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, Prey, WorldState } from "./schema/WorldState.js";
import { isWalkableWorldPosition, resolveSpawnWorldPosition, snapWorldPosition, worldConfig } from "../config/worldConfig.js";
import { getPlayerSpawnPoint, getPreySearchZoneById, isWorldPositionInsidePreySearchZone, type PreySearchZone } from "../config/worldAuthoring.js";
import { AuthStoreError, authStore, type AuthContextData } from "../persistence/AuthStore.js";
import { playerIdentityStore, type PlayerSnapshot } from "../persistence/PlayerIdentityStore.js";

type JoinOptions = { sessionToken?: string };
type MoveMessage = { x: number; y: number };
type FaceMessage = { x: number };
type SearchPreyMessage = { searchZoneId?: string };

type GridStep = {
  x: number;
  y: number;
};

type PreySpawnMeta = {
  spawnX: number;
  spawnY: number;
  maxFleeDistance: number;
};

const BASE_GRID_STEP_COOLDOWN_MS = 130;
const BASE_GRID_TIMING_CELL_SIZE = 64;
const GRID_TIMING_SCALE_EXPONENT = 0.8;
const RECONNECT_WINDOW_SECONDS = 20;
const MAX_ACTIVE_PREY = 64;
const PREY_MOVE_INTERVAL_MS = 220;
const PREY_FLEE_RANGE_CELLS = 8;
const PREY_MIN_FLEE_DISTANCE_CELLS = 6;
const PREY_MAX_FLEE_DISTANCE_CELLS = 12;
const PREY_DIRECTIONS: ReadonlyArray<GridStep> = Object.freeze([
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
]);

export class CatRoom extends Room<{ state: WorldState }> {
  maxClients = 100;
  autoDispose = false;
  private readonly sessionToPlayerId = new Map<string, string>();
  private readonly lastMoveAt = new Map<string, number>();
  private readonly searchZoneToPreyId = new Map<string, string>();
  private readonly preySpawnMeta = new Map<string, PreySpawnMeta>();
  private nextPreyId = 1;

  async onAuth(_client: Client, options: JoinOptions): Promise<AuthContextData> {
    const sessionToken = normalizeSessionToken(options?.sessionToken);
    if (!sessionToken) {
      throw new Error("Authentication required");
    }

    try {
      return await authStore.getAuthBySessionToken(sessionToken);
    } catch (error) {
      if (error instanceof AuthStoreError) {
        throw new Error("Authentication failed");
      }

      throw error;
    }
  }

  onCreate() {
    this.setState(new WorldState());
    this.setSimulationInterval(() => {
      this.updatePreyMovement();
    }, PREY_MOVE_INTERVAL_MS);

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

    this.onMessage("face", (client, message: FaceMessage) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);
      if (!playerId) {
        return;
      }

      const player = this.state.players.get(playerId);
      if (!player || !player.connected) {
        return;
      }

      const horizontalFacing = parseHorizontalFacing(message);
      if (!horizontalFacing) {
        return;
      }

      if (this.updatePlayerFacing(player, horizontalFacing)) {
        playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      }
    });

    this.onMessage("search-prey", (client, message: SearchPreyMessage) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);
      if (!playerId) {
        return;
      }

      const player = this.state.players.get(playerId);
      if (!player || !player.connected) {
        return;
      }

      this.trySearchPrey(client, player, message);
    });

    console.log("CatRoom created");
  }

  onJoin(client: Client, _options: JoinOptions, auth?: AuthContextData) {
    const authData = (client.auth ?? auth) as AuthContextData | undefined;
    if (!authData) {
      throw new Error("Authentication required");
    }

    const playerId = authData.characterId;
    const existingPlayer = this.state.players.get(playerId);

    if (existingPlayer) {
      throw new Error("Player is already connected or reconnecting");
    }

    const profile = playerIdentityStore.getOrCreateProfile(playerId, authData.characterName, "account");
    const prefersAuthoringSpawn = profile.x === 0 && profile.y === 0 && profile.createdAt === profile.updatedAt;
    const authoringSpawnPoint = prefersAuthoringSpawn ? getPlayerSpawnPoint() : null;
    const spawnPosition = authoringSpawnPoint != null
      ? resolveSpawnWorldPosition(authoringSpawnPoint.x, authoringSpawnPoint.y)
      : resolveSpawnWorldPosition(profile.x, profile.y);

    const player = new Player();
    player.playerId = authData.characterId;
    player.sessionId = client.sessionId;
    player.name = authData.characterName;
    player.x = spawnPosition.x;
    player.y = spawnPosition.y;
    player.facing = profile.facing;
    player.connected = true;

    this.state.players.set(playerId, player);
    this.sessionToPlayerId.set(client.sessionId, playerId);
    this.lastMoveAt.set(playerId, 0);

    void playerIdentityStore.flush();
    void authStore.flush();

    console.log(`join ${player.name} (${playerId} / ${client.sessionId}) account=${authData.accountId}`);
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
    let changed = false;
    if (this.updatePlayerFacing(player, step.x)) {
      changed = true;
    }

    const lastMoveAt = this.lastMoveAt.get(playerId) ?? 0;
    const now = Date.now();
    const gridTimingScale = Math.pow(
      Math.max(worldConfig.gridCellSize / BASE_GRID_TIMING_CELL_SIZE, 0.001),
      GRID_TIMING_SCALE_EXPONENT,
    );
    const gridStepCooldownMs = Math.max(
      1,
      Math.round(BASE_GRID_STEP_COOLDOWN_MS * gridTimingScale),
    );

    if (now - lastMoveAt < gridStepCooldownMs) {
      if (changed) {
        playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      }
      return;
    }

    const snappedPosition = snapWorldPosition(player.x, player.y);
    const nextX = snappedPosition.x + step.x * worldConfig.gridCellSize;
    const nextY = snappedPosition.y + step.y * worldConfig.gridCellSize;

    if (!isWalkableWorldPosition(nextX, nextY)) {
      if (changed) {
        playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
      }
      return;
    }

    player.x = nextX;
    player.y = nextY;
    this.lastMoveAt.set(playerId, now);
    playerIdentityStore.savePlayerSnapshot(toPlayerSnapshot(player));
    this.resolvePreyInteractionAt(playerId, player);
  }

  private trySearchPrey(client: Client, player: Player, message: SearchPreyMessage) {
    const searchZoneId = normalizeSearchZoneId(message?.searchZoneId);
    if (!searchZoneId) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "Search zone is required",
      });
      return;
    }

    const zone = getPreySearchZoneById(searchZoneId);
    if (!zone) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "Search zone not found",
      });
      return;
    }

    if (!isWorldPositionInsidePreySearchZone(zone, player.x, player.y)) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "Player is not inside the search zone",
      });
      return;
    }

    const existingPreyId = this.searchZoneToPreyId.get(searchZoneId);
    if (existingPreyId && this.state.prey.has(existingPreyId)) {
      this.removePrey(existingPreyId);
    } else if (existingPreyId) {
      this.searchZoneToPreyId.delete(searchZoneId);
    }

    if (this.state.prey.size >= MAX_ACTIVE_PREY) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "Too many active prey in the world",
      });
      return;
    }

    const successChance = getSearchSuccessChance(zone);
    if (Math.random() > successChance) {
      client.send("search-prey-result", {
        ok: true,
        spawned: false,
        searchZoneId,
        successChance,
      });
      return;
    }

    const spawnPosition = findPreySpawnPosition(player, zone);
    if (!spawnPosition) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "No valid spawn point inside the zone",
      });
      return;
    }

    const preyId = `prey_${this.nextPreyId++}`;
    const prey = new Prey();
    prey.preyId = preyId;
    prey.kind = zone.preyKind || "mouse";
    prey.state = "alive";
    prey.searchZoneId = searchZoneId;
    prey.x = spawnPosition.x;
    prey.y = spawnPosition.y;

    this.state.prey.set(preyId, prey);
    this.searchZoneToPreyId.set(searchZoneId, preyId);
    this.preySpawnMeta.set(preyId, {
      spawnX: spawnPosition.x,
      spawnY: spawnPosition.y,
      maxFleeDistance: randomInteger(PREY_MIN_FLEE_DISTANCE_CELLS, PREY_MAX_FLEE_DISTANCE_CELLS) * worldConfig.gridCellSize,
    });

    client.send("search-prey-result", {
      ok: true,
      spawned: true,
      preyId,
      kind: prey.kind,
      searchZoneId,
      x: prey.x,
      y: prey.y,
      successChance,
    });
  }

  private updatePreyMovement() {
    if (this.state.prey.size === 0 || this.state.players.size === 0) {
      return;
    }

    for (const [preyId, prey] of this.state.prey.entries()) {
      if (prey.state !== "alive") {
        continue;
      }

      const spawnMeta = this.preySpawnMeta.get(preyId);
      if (!spawnMeta) {
        continue;
      }

      const nearestPlayer = this.findNearestConnectedPlayer(prey.x, prey.y);
      if (!nearestPlayer) {
        continue;
      }

      const fleeRadius = PREY_FLEE_RANGE_CELLS * worldConfig.gridCellSize;
      const currentDistance = distanceBetween(prey.x, prey.y, nearestPlayer.x, nearestPlayer.y);
      if (currentDistance > fleeRadius) {
        continue;
      }

      const nextStep = this.findBestPreyFleeStep(preyId, prey, spawnMeta, nearestPlayer.x, nearestPlayer.y);
      if (!nextStep) {
        continue;
      }

      prey.x = nextStep.x;
      prey.y = nextStep.y;
    }
  }

  private findNearestConnectedPlayer(x: number, y: number) {
    let nearestPlayer: Player | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const player of this.state.players.values()) {
      if (!player.connected) {
        continue;
      }

      const distance = distanceBetween(x, y, player.x, player.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }

    return nearestPlayer;
  }

  private findBestPreyFleeStep(preyId: string, prey: Prey, spawnMeta: PreySpawnMeta, playerX: number, playerY: number) {
    let bestCandidate: { x: number; y: number; distance: number } | null = null;
    let fallbackCandidate: { x: number; y: number; distance: number } | null = null;
    const currentDistance = distanceBetween(prey.x, prey.y, playerX, playerY);

    for (const direction of PREY_DIRECTIONS) {
      const candidateX = prey.x + direction.x * worldConfig.gridCellSize;
      const candidateY = prey.y + direction.y * worldConfig.gridCellSize;

      if (!isWalkableWorldPosition(candidateX, candidateY)) {
        continue;
      }

      if (distanceBetween(candidateX, candidateY, spawnMeta.spawnX, spawnMeta.spawnY) > spawnMeta.maxFleeDistance) {
        continue;
      }

      if (this.isOccupiedByOtherPrey(preyId, candidateX, candidateY)) {
        continue;
      }

      const candidateDistance = distanceBetween(candidateX, candidateY, playerX, playerY);
      if (fallbackCandidate == null || candidateDistance > fallbackCandidate.distance) {
        fallbackCandidate = {
          x: candidateX,
          y: candidateY,
          distance: candidateDistance,
        };
      }

      if (candidateDistance <= currentDistance) {
        continue;
      }

      if (bestCandidate == null || candidateDistance > bestCandidate.distance) {
        bestCandidate = {
          x: candidateX,
          y: candidateY,
          distance: candidateDistance,
        };
      }
    }

    return bestCandidate ?? fallbackCandidate;
  }

  private isOccupiedByOtherPrey(preyId: string, x: number, y: number) {
    for (const [otherPreyId, otherPrey] of this.state.prey.entries()) {
      if (otherPreyId === preyId) {
        continue;
      }

      if (otherPrey.state !== "alive") {
        continue;
      }

      if (otherPrey.x === x && otherPrey.y === y) {
        return true;
      }
    }

    return false;
  }

  private removePrey(preyId: string) {
    const prey = this.state.prey.get(preyId);
    if (prey) {
      const mappedPreyId = this.searchZoneToPreyId.get(prey.searchZoneId);
      if (mappedPreyId === preyId) {
        this.searchZoneToPreyId.delete(prey.searchZoneId);
      }
    }

    this.state.prey.delete(preyId);
    this.preySpawnMeta.delete(preyId);
  }

  private resolvePreyInteractionAt(playerId: string, player: Player) {
    for (const [preyId, prey] of this.state.prey.entries()) {
      if (prey.x !== player.x || prey.y !== player.y) {
        continue;
      }

      if (prey.state === "alive") {
        prey.state = "carcass";
        const mappedPreyId = this.searchZoneToPreyId.get(prey.searchZoneId);
        if (mappedPreyId === preyId) {
          this.searchZoneToPreyId.delete(prey.searchZoneId);
        }

        this.broadcast("prey-captured", {
          preyId,
          playerId,
          kind: prey.kind,
          x: prey.x,
          y: prey.y,
          // TODO: when progression is implemented, award hunting skill progress here.
        });
        return;
      }

      if (prey.state === "carcass") {
        this.removePrey(preyId);
        this.broadcast("prey-picked-up", {
          preyId,
          playerId,
          kind: prey.kind,
          // TODO: when inventory is implemented, convert carcass pickup into an inventory item instead of deletion.
        });
        return;
      }
    }
  }

  private updatePlayerFacing(player: Player, horizontalStep: number) {
    if (horizontalStep === 0) {
      return false;
    }

    const nextFacing = horizontalStep < 0 ? "left" : "right";
    if (player.facing === nextFacing) {
      return false;
    }

    player.facing = nextFacing;
    return true;
  }
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

function normalizeSessionToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeSearchZoneId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseHorizontalFacing(value: unknown) {
  const rawX = isRecord(value) ? value.x : undefined;
  if (!isFiniteNumber(rawX)) {
    return 0;
  }

  return toAxisStep(rawX);
}

function getSearchSuccessChance(zone: PreySearchZone) {
  const difficultyPenalty = Math.max(0, zone.difficulty) / 100;
  return clamp(1 - difficultyPenalty, 0.1, 1);
}

function findPreySpawnPosition(player: Player, zone: PreySearchZone) {
  const size = worldConfig.gridCellSize;
  const left = zone.x - zone.width / 2;
  const right = zone.x + zone.width / 2;
  const top = zone.y - zone.height / 2;
  const bottom = zone.y + zone.height / 2;
  const minGridX = Math.ceil(left / size);
  const maxGridX = Math.floor(right / size);
  const minGridY = Math.ceil(top / size);
  const maxGridY = Math.floor(bottom / size);
  const candidates: Array<{ x: number; y: number; distance: number }> = [];

  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      const x = gridX * size;
      const y = gridY * size;
      if (x === player.x && y === player.y) {
        continue;
      }

      if (!isWalkableWorldPosition(x, y)) {
        continue;
      }

      if (!isWorldPositionInsidePreySearchZone(zone, x, y)) {
        continue;
      }

      const distance = Math.abs(x - player.x) + Math.abs(y - player.y);
      candidates.push({ x, y, distance });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const nearestCandidates = candidates.filter((candidate) => candidate.distance <= candidates[0].distance + size * 2);
  const chosen = nearestCandidates[Math.floor(Math.random() * nearestCandidates.length)];
  return chosen ?? candidates[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distanceBetween(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toPlayerSnapshot(player: Player): PlayerSnapshot {
  return {
    playerId: player.playerId,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing === "left" ? "left" : "right",
  };
}
