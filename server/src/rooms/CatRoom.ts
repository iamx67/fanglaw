import { Room, type Client } from "colyseus";
import { CloseCode } from "@colyseus/shared-types";
import { Player, Prey, WorldState } from "./schema/WorldState.js";
import { isWalkableWorldPosition, resolveSpawnWorldPosition, snapWorldPosition, worldConfig } from "../config/worldConfig.js";
import { getPlayerSpawnPoint, getPreySearchZoneById, isWorldPositionInsidePreySearchZone, type PreySearchZone } from "../config/worldAuthoring.js";
import { getPreyProfileById, isRunnerPreyProfile, type BirdPreyProfile, type PreyProfile, type RunnerPreyProfile } from "../config/preyProfiles.js";
import {
  AuthStoreError,
  accountsService,
  charactersService,
  type AuthContextData,
  type CharacterWorldSnapshot,
  type GameAuthContextData,
} from "../services/index.js";

type JoinOptions = { sessionToken?: string };
type MoveMessage = { x: number; y: number; sprint?: boolean };
type FaceMessage = { x: number };
type SearchPreyMessage = { searchZoneId?: string };
type SprintReleaseMessage = Record<string, never>;

type GridStep = {
  x: number;
  y: number;
};

type PreySpawnMeta = {
  preyProfileId: string;
  spawnX: number;
  spawnY: number;
  spawnedByPlayerId: string;
  maxFleeDistance: number;
  expiresAt: number;
  nextBehaviorAt: number;
  perchExpiresAt: number;
  phase: "safe" | "watching";
};

const BASE_GRID_STEP_COOLDOWN_MS = 130;
const BASE_SPRINT_GRID_STEP_COOLDOWN_MS = 90;
const BASE_GRID_TIMING_CELL_SIZE = 64;
const GRID_TIMING_SCALE_EXPONENT = 0.8;
const MAX_STAMINA = 100;
const MIN_STAMINA_TO_SPRINT = 5;
const SPRINT_STAMINA_COST = 5;
const STAMINA_RECOVERY_PER_SECOND = 12;
const STAMINA_RECOVERY_DELAY_MS = 900;
const RECONNECT_WINDOW_SECONDS = 20;
const MAX_ACTIVE_PREY = 64;
const PREY_BEHAVIOR_TICK_MS = 120;
const PREY_ACTIVE_LIFETIME_MS = 90_000;
const PREY_CAPTURED_ZONE_COOLDOWN_MS = 60_000;
const PREY_ESCAPED_ZONE_COOLDOWN_MS = 30_000;
const PREY_SEARCH_COOLDOWN_MESSAGE = "Здесь пока нет дичи, нужно подождать";
const HUNTING_SKILL_ID = "hunting";
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
  private readonly nextMoveAllowedAt = new Map<string, number>();
  private readonly lastSprintAt = new Map<string, number>();
  private readonly lastStaminaTickAt = new Map<string, number>();
  private readonly sprintRequiresRepress = new Map<string, boolean>();
  private readonly playerZoneToPreyId = new Map<string, string>();
  private readonly playerZoneCooldownUntil = new Map<string, number>();
  private readonly preySpawnMeta = new Map<string, PreySpawnMeta>();
  private nextPreyId = 1;

  async onAuth(_client: Client, options: JoinOptions): Promise<GameAuthContextData> {
    const sessionToken = normalizeSessionToken(options?.sessionToken);
    if (!sessionToken) {
      throw new Error("Authentication required");
    }

    try {
      return await accountsService.requireGameSessionContext(sessionToken);
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
      this.updatePlayerStamina();
      this.updatePreyMovement();
    }, PREY_BEHAVIOR_TICK_MS);

    this.onMessage("ping", (client) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId) ?? "";
      const player = playerId ? this.state.players.get(playerId) : null;
      if (player) {
        const character = charactersService.ensureAccountCharacter(playerId, player.name);
        if (player.appearanceJson !== character.appearanceJson) {
          player.appearanceJson = character.appearanceJson;
        }
        if (player.skillsJson !== character.skillsJson) {
          player.skillsJson = character.skillsJson;
        }
      }

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

      this.tryMovePlayer(playerId, player, step, isSprintRequested(message));
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
        charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
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

      this.trySearchPrey(client, playerId, player, message);
    });

    this.onMessage("sprint-release", (client, _message: SprintReleaseMessage) => {
      const playerId = this.sessionToPlayerId.get(client.sessionId);
      if (!playerId) {
        return;
      }

      this.sprintRequiresRepress.set(playerId, false);
    });

    console.log("CatRoom created");
  }

  onJoin(client: Client, _options: JoinOptions, auth?: AuthContextData) {
    const authData = requireGameAuthContext((client.auth ?? auth) as AuthContextData | GameAuthContextData | undefined);

    const playerId = authData.characterId;
    const existingPlayer = this.state.players.get(playerId);

    if (existingPlayer) {
      throw new Error("Player is already connected or reconnecting");
    }

    const character = charactersService.ensureAccountCharacter(playerId, authData.characterName);
    const prefersAuthoringSpawn = character.world.x === 0 && character.world.y === 0 && character.createdAt === character.updatedAt;
    const authoringSpawnPoint = prefersAuthoringSpawn ? getPlayerSpawnPoint() : null;
    const spawnPosition = authoringSpawnPoint != null
      ? resolveSpawnWorldPosition(authoringSpawnPoint.x, authoringSpawnPoint.y)
      : resolveSpawnWorldPosition(character.world.x, character.world.y);

    const player = new Player();
    player.playerId = authData.characterId;
    player.sessionId = client.sessionId;
    player.name = authData.characterName;
    player.x = spawnPosition.x;
    player.y = spawnPosition.y;
    player.facing = character.world.facing;
    player.appearanceJson = character.appearanceJson;
    player.skillsJson = character.skillsJson;
    player.stamina = MAX_STAMINA;
    player.sprinting = false;
    player.connected = true;

    this.state.players.set(playerId, player);
    this.sessionToPlayerId.set(client.sessionId, playerId);
    this.nextMoveAllowedAt.set(playerId, 0);
    this.lastSprintAt.set(playerId, 0);
    this.lastStaminaTickAt.set(playerId, Date.now());
    this.sprintRequiresRepress.set(playerId, false);

    void charactersService.flush();
    void accountsService.flush();

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
      this.nextMoveAllowedAt.delete(playerId);
      this.lastSprintAt.delete(playerId);
      this.lastStaminaTickAt.delete(playerId);
      this.sprintRequiresRepress.delete(playerId);
      return;
    }

    if (code === CloseCode.CONSENTED) {
      charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
      this.state.players.delete(playerId);
      this.nextMoveAllowedAt.delete(playerId);
      this.lastSprintAt.delete(playerId);
      this.lastStaminaTickAt.delete(playerId);
      this.sprintRequiresRepress.delete(playerId);
      await charactersService.flush();
      console.log(`leave ${player.name} (${playerId})`);
      return;
    }

    player.connected = false;

    try {
      const reconnectedClient = await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);

      this.sessionToPlayerId.set(reconnectedClient.sessionId, playerId);
      player.sessionId = reconnectedClient.sessionId;
      player.connected = true;
      this.nextMoveAllowedAt.set(playerId, 0);
      this.lastStaminaTickAt.set(playerId, Date.now());
      this.sprintRequiresRepress.set(playerId, false);

      console.log(`reconnect ${player.name} (${playerId} / ${reconnectedClient.sessionId})`);
    } catch {
      charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
      this.state.players.delete(playerId);
      this.nextMoveAllowedAt.delete(playerId);
      this.lastSprintAt.delete(playerId);
      this.lastStaminaTickAt.delete(playerId);
      this.sprintRequiresRepress.delete(playerId);
      await charactersService.flush();
      console.log(`leave ${player.name} (${playerId}) after reconnect timeout`);
    }
  }

  private tryMovePlayer(playerId: string, player: Player, step: GridStep, sprintRequested: boolean) {
    let changed = false;
    if (this.updatePlayerFacing(player, step.x)) {
      changed = true;
    }

    const nextMoveAllowedAt = this.nextMoveAllowedAt.get(playerId) ?? 0;
    const now = Date.now();
    const gridTimingScale = Math.pow(
      Math.max(worldConfig.gridCellSize / BASE_GRID_TIMING_CELL_SIZE, 0.001),
      GRID_TIMING_SCALE_EXPONENT,
    );
    const sprintLocked = this.sprintRequiresRepress.get(playerId) === true;
    const canSprint = !sprintLocked && sprintRequested && player.stamina >= MIN_STAMINA_TO_SPRINT;
    const gridStepCooldownMs = Math.max(
      1,
      Math.round((canSprint ? BASE_SPRINT_GRID_STEP_COOLDOWN_MS : BASE_GRID_STEP_COOLDOWN_MS) * gridTimingScale),
    );

    if (now < nextMoveAllowedAt) {
      if (changed) {
        charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
      }
      return;
    }

    const snappedPosition = snapWorldPosition(player.x, player.y);
    const nextX = snappedPosition.x + step.x * worldConfig.gridCellSize;
    const nextY = snappedPosition.y + step.y * worldConfig.gridCellSize;

    if (!isWalkableWorldPosition(nextX, nextY)) {
      if (changed) {
        charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
      }
      return;
    }

    player.x = nextX;
    player.y = nextY;
    if (canSprint) {
      player.stamina = clamp(player.stamina - SPRINT_STAMINA_COST, 0, MAX_STAMINA);
      player.sprinting = true;
      this.lastSprintAt.set(playerId, now);
      if (player.stamina < MIN_STAMINA_TO_SPRINT) {
        this.sprintRequiresRepress.set(playerId, true);
      }
    } else {
      player.sprinting = false;
    }
    this.nextMoveAllowedAt.set(playerId, now + gridStepCooldownMs);
    this.lastStaminaTickAt.set(playerId, now);
    this.resolveBirdDetectionForPlayerMovement(player, now);
    charactersService.saveWorldSnapshot(toCharacterWorldSnapshot(player));
    this.resolvePreyInteractionAt(playerId, player);
  }

  private updatePlayerStamina() {
    const now = Date.now();

    for (const [playerId, player] of this.state.players.entries()) {
      const lastTickAt = this.lastStaminaTickAt.get(playerId) ?? now;
      const elapsedSeconds = Math.max(0, (now - lastTickAt) / 1000);
      this.lastStaminaTickAt.set(playerId, now);

      const nextMoveAllowedAt = this.nextMoveAllowedAt.get(playerId) ?? 0;
      if (player.sprinting && now >= nextMoveAllowedAt) {
        player.sprinting = false;
      }

      const lastSprintAt = this.lastSprintAt.get(playerId) ?? 0;
      if (now - lastSprintAt < STAMINA_RECOVERY_DELAY_MS) {
        continue;
      }

      if (player.stamina >= MAX_STAMINA) {
        player.stamina = MAX_STAMINA;
        continue;
      }

      player.stamina = clamp(player.stamina + STAMINA_RECOVERY_PER_SECOND * elapsedSeconds, 0, MAX_STAMINA);
    }
  }

  private trySearchPrey(client: Client, playerId: string, player: Player, message: SearchPreyMessage) {
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

    const now = Date.now();
    const unavailableUntil = this.getSearchZoneUnavailableUntil(playerId, searchZoneId, now);
    if (unavailableUntil > now) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: PREY_SEARCH_COOLDOWN_MESSAGE,
        searchZoneId,
        retryAfterMs: unavailableUntil - now,
      });
      return;
    }

    const playerZoneKey = buildPlayerSearchZoneKey(playerId, searchZoneId);
    const existingPreyId = this.playerZoneToPreyId.get(playerZoneKey);
    if (existingPreyId && !this.state.prey.has(existingPreyId)) {
      this.playerZoneToPreyId.delete(playerZoneKey);
    }

    if (this.state.prey.size >= MAX_ACTIVE_PREY) {
      client.send("search-prey-result", {
        ok: false,
        spawned: false,
        error: "Too many active prey in the world",
      });
      return;
    }

    const preyProfile = getPreyProfileForSearchZone(zone);
    const successChance = getSearchSuccessChance(zone, preyProfile);

    const spawnPosition = findPreySpawnPosition(player, zone, preyProfile, this.state.prey, this.getConnectedPlayers());
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
    prey.kind = preyProfile.kind;
    prey.visualId = (zone.preyVisualId || preyProfile.kind || "").trim();
    prey.behaviorType = preyProfile.behaviorType;
    prey.state = "alive";
    prey.watching = false;
    prey.searchZoneId = searchZoneId;
    prey.x = spawnPosition.x;
    prey.y = spawnPosition.y;

    this.state.prey.set(preyId, prey);
    this.playerZoneToPreyId.set(playerZoneKey, preyId);
    this.preySpawnMeta.set(preyId, {
      preyProfileId: preyProfile.id,
      spawnX: spawnPosition.x,
      spawnY: spawnPosition.y,
      spawnedByPlayerId: playerId,
      maxFleeDistance: isRunnerPreyProfile(preyProfile)
        ? randomInteger(preyProfile.minFleeDistanceCells, preyProfile.maxFleeDistanceCells) * worldConfig.gridCellSize
        : 0,
      expiresAt: now + PREY_ACTIVE_LIFETIME_MS,
      nextBehaviorAt: now + getPreyBehaviorIntervalMs(preyProfile),
      perchExpiresAt: now + getPreyPerchTimeoutMs(preyProfile),
      phase: "safe",
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
    if (this.state.prey.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [preyId, prey] of this.state.prey.entries()) {
      if (prey.state !== "alive") {
        continue;
      }

      const spawnMeta = this.preySpawnMeta.get(preyId);
      if (!spawnMeta) {
        continue;
      }

      if (now >= spawnMeta.expiresAt) {
        this.removePrey(preyId);
        this.setSearchZoneCooldown(spawnMeta.spawnedByPlayerId, prey.searchZoneId, PREY_ESCAPED_ZONE_COOLDOWN_MS, now);
        continue;
      }

      const preyProfile = getPreyProfileById(spawnMeta.preyProfileId || prey.kind);
      if (isRunnerPreyProfile(preyProfile)) {
        this.updateRunnerPrey(preyId, prey, preyProfile, spawnMeta, now);
        continue;
      }

      if (preyProfile.behaviorType === "bird") {
        this.updateBirdPrey(prey, preyProfile, spawnMeta, now);
      }
    }
  }

  private updateRunnerPrey(
    preyId: string,
    prey: Prey,
    preyProfile: RunnerPreyProfile,
    spawnMeta: PreySpawnMeta,
    now: number,
  ) {
    if (now < spawnMeta.nextBehaviorAt) {
      return;
    }
    spawnMeta.nextBehaviorAt = now + preyProfile.moveIntervalMs;

    const nearestPlayer = this.findNearestConnectedPlayer(prey.x, prey.y);
    if (!nearestPlayer) {
      return;
    }

    const fleeRadius = preyProfile.fleeRangeCells * worldConfig.gridCellSize;
    const currentDistance = distanceBetween(prey.x, prey.y, nearestPlayer.x, nearestPlayer.y);
    if (currentDistance > fleeRadius) {
      return;
    }

    const nextStep = this.findBestPreyFleeStep(preyId, prey, preyProfile, spawnMeta, nearestPlayer.x, nearestPlayer.y);
    if (!nextStep) {
      return;
    }

    prey.x = nextStep.x;
    prey.y = nextStep.y;
  }

  private updateBirdPrey(prey: Prey, preyProfile: PreyProfile, spawnMeta: PreySpawnMeta, now: number) {
    if (preyProfile.behaviorType !== "bird") {
      return;
    }

    if (spawnMeta.perchExpiresAt > 0 && now >= spawnMeta.perchExpiresAt) {
      const { nearbyPlayers, targetPlayer } = this.getBirdRelevantPlayers(prey, preyProfile, spawnMeta);
      this.teleportBirdPrey("", prey, preyProfile, spawnMeta, targetPlayer, this.getConnectedPlayers(), now);
      return;
    }

    if (now < spawnMeta.nextBehaviorAt) {
      return;
    }

    if (spawnMeta.phase === "watching") {
      spawnMeta.phase = "safe";
      prey.watching = false;
      spawnMeta.nextBehaviorAt = now + preyProfile.safeDurationMs;
      return;
    }

    spawnMeta.phase = "watching";
    prey.watching = true;
    spawnMeta.nextBehaviorAt = now + preyProfile.watchDurationMs;
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

  private getConnectedPlayers() {
    const connectedPlayers: Player[] = [];

    for (const player of this.state.players.values()) {
      if (!player.connected) {
        continue;
      }

      connectedPlayers.push(player);
    }

    return connectedPlayers;
  }

  private findNearestPlayerFromList(players: readonly Player[], x: number, y: number) {
    let nearestPlayer: Player | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const player of players) {
      const distance = distanceBetween(x, y, player.x, player.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }

    return nearestPlayer;
  }

  private findConnectedPlayersWithinRadius(x: number, y: number, radius: number) {
    const players: Player[] = [];

    for (const player of this.state.players.values()) {
      if (!player.connected) {
        continue;
      }

      if (distanceBetween(x, y, player.x, player.y) > radius) {
        continue;
      }

      players.push(player);
    }

    return players;
  }

  private findConnectedPlayerById(playerId: string) {
    if (!playerId) {
      return null;
    }

    const player = this.state.players.get(playerId);
    if (!player || !player.connected) {
      return null;
    }

    return player;
  }

  private getBirdRelevantPlayers(
    prey: Prey,
    preyProfile: BirdPreyProfile,
    spawnMeta: PreySpawnMeta,
    triggeringPlayer: Player | null = null,
  ) {
    const radius = Math.max(1, preyProfile.teleportRadiusCells) * worldConfig.gridCellSize;
    const nearbyPlayers = this.findConnectedPlayersWithinRadius(prey.x, prey.y, radius);
    const targetPlayer = this.getBirdTargetPlayer(prey, spawnMeta, radius, nearbyPlayers, triggeringPlayer);
    return { nearbyPlayers, targetPlayer };
  }

  private getBirdTargetPlayer(
    prey: Prey,
    spawnMeta: PreySpawnMeta,
    relevanceRadius: number,
    nearbyPlayers: readonly Player[],
    triggeringPlayer: Player | null,
  ) {
    const preferredPlayerId = typeof spawnMeta.spawnedByPlayerId === "string" ? spawnMeta.spawnedByPlayerId.trim() : "";
    const preferredPlayer = this.findConnectedPlayerById(preferredPlayerId);
    if (preferredPlayer && distanceBetween(prey.x, prey.y, preferredPlayer.x, preferredPlayer.y) <= relevanceRadius) {
      return preferredPlayer;
    }

    if (triggeringPlayer != null) {
      for (const player of nearbyPlayers) {
        if (player.playerId === triggeringPlayer.playerId) {
          return triggeringPlayer;
        }
      }
    }

    return this.findNearestPlayerFromList(nearbyPlayers, prey.x, prey.y);
  }

  private findBestPreyFleeStep(
    preyId: string,
    prey: Prey,
    _preyProfile: RunnerPreyProfile,
    spawnMeta: PreySpawnMeta,
    playerX: number,
    playerY: number,
  ) {
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

  private getSearchZoneUnavailableUntil(playerId: string, searchZoneId: string, now: number) {
    const playerZoneKey = buildPlayerSearchZoneKey(playerId, searchZoneId);
    let unavailableUntil = this.playerZoneCooldownUntil.get(playerZoneKey) ?? 0;
    if (unavailableUntil <= now && this.playerZoneCooldownUntil.has(playerZoneKey)) {
      this.playerZoneCooldownUntil.delete(playerZoneKey);
      unavailableUntil = 0;
    }

    const activePreyId = this.playerZoneToPreyId.get(playerZoneKey);
    if (!activePreyId) {
      return unavailableUntil;
    }

    const activePrey = this.state.prey.get(activePreyId);
    if (!activePrey || activePrey.state !== "alive") {
      this.playerZoneToPreyId.delete(playerZoneKey);
      return unavailableUntil;
    }

    const spawnMeta = this.preySpawnMeta.get(activePreyId);
    if (!spawnMeta) {
      this.playerZoneToPreyId.delete(playerZoneKey);
      return unavailableUntil;
    }

    return Math.max(unavailableUntil, spawnMeta.expiresAt);
  }

  private setSearchZoneCooldown(playerId: string, searchZoneId: string, durationMs: number, now: number) {
    if (!playerId || !searchZoneId) {
      return;
    }

    this.playerZoneCooldownUntil.set(buildPlayerSearchZoneKey(playerId, searchZoneId), now + Math.max(0, durationMs));
  }

  private removePrey(preyId: string) {
    const prey = this.state.prey.get(preyId);
    const spawnMeta = this.preySpawnMeta.get(preyId);
    if (prey && spawnMeta) {
      const playerZoneKey = buildPlayerSearchZoneKey(spawnMeta.spawnedByPlayerId, prey.searchZoneId);
      const mappedPreyId = this.playerZoneToPreyId.get(playerZoneKey);
      if (mappedPreyId === preyId) {
        this.playerZoneToPreyId.delete(playerZoneKey);
      }
    }

    this.state.prey.delete(preyId);
    this.preySpawnMeta.delete(preyId);
  }

  private resolveBirdDetectionForPlayerMovement(player: Player, now: number) {
    for (const [preyId, prey] of this.state.prey.entries()) {
      if (prey.state !== "alive" || !prey.watching) {
        continue;
      }

      const spawnMeta = this.preySpawnMeta.get(preyId);
      if (!spawnMeta) {
        continue;
      }

      const preyProfile = getPreyProfileById(spawnMeta.preyProfileId || prey.kind);
      if (preyProfile.behaviorType !== "bird") {
        continue;
      }

      const { nearbyPlayers, targetPlayer } = this.getBirdRelevantPlayers(prey, preyProfile, spawnMeta, player);
      if (!nearbyPlayers.some((candidate) => candidate.playerId === player.playerId)) {
        continue;
      }

      this.teleportBirdPrey(preyId, prey, preyProfile, spawnMeta, targetPlayer, this.getConnectedPlayers(), now);
    }
  }

  private teleportBirdPrey(
    preyId: string,
    prey: Prey,
    preyProfile: PreyProfile,
    spawnMeta: PreySpawnMeta,
    targetPlayer: Player | null,
    connectedPlayers: readonly Player[],
    now: number,
  ) {
    if (preyProfile.behaviorType !== "bird") {
      return;
    }

    const zone = getPreySearchZoneById(prey.searchZoneId);
    if (!zone) {
      prey.watching = false;
      spawnMeta.phase = "safe";
      spawnMeta.nextBehaviorAt = now + preyProfile.safeDurationMs;
      spawnMeta.perchExpiresAt = now + preyProfile.perchTimeoutMs;
      return;
    }

    const nextPosition = findBirdPerchPosition(
      zone,
      preyProfile,
      this.state.prey,
      preyId,
      targetPlayer,
      connectedPlayers,
    );
    if (nextPosition) {
      prey.x = nextPosition.x;
      prey.y = nextPosition.y;
    }

    prey.watching = false;
    spawnMeta.phase = "safe";
    spawnMeta.nextBehaviorAt = now + preyProfile.safeDurationMs;
    spawnMeta.perchExpiresAt = now + preyProfile.perchTimeoutMs;
  }

  private resolvePreyInteractionAt(playerId: string, player: Player) {
    for (const [preyId, prey] of this.state.prey.entries()) {
      if (prey.x !== player.x || prey.y !== player.y) {
        continue;
      }

      if (prey.state === "alive") {
        prey.state = "carcass";
        prey.watching = false;
        const spawnMeta = this.preySpawnMeta.get(preyId);
        if (spawnMeta) {
          const playerZoneKey = buildPlayerSearchZoneKey(spawnMeta.spawnedByPlayerId, prey.searchZoneId);
          const mappedPreyId = this.playerZoneToPreyId.get(playerZoneKey);
          if (mappedPreyId === preyId) {
            this.playerZoneToPreyId.delete(playerZoneKey);
          }
          this.setSearchZoneCooldown(spawnMeta.spawnedByPlayerId, prey.searchZoneId, PREY_CAPTURED_ZONE_COOLDOWN_MS, Date.now());
        }

        const preyProfile = getPreyProfileById(spawnMeta?.preyProfileId || prey.kind);
        const updatedCharacter = charactersService.addSkillXp(
          playerId,
          player.name,
          HUNTING_SKILL_ID,
          Math.max(0, preyProfile.xpReward),
        );
        player.skillsJson = updatedCharacter.skillsJson;

        this.broadcast("prey-captured", {
          preyId,
          playerId,
          kind: prey.kind,
          x: prey.x,
          y: prey.y,
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

function isSprintRequested(value: unknown) {
  return isRecord(value) && value.sprint === true;
}

function getSearchSuccessChance(zone: PreySearchZone, preyProfile: PreyProfile) {
  void zone;
  void preyProfile;
  return 1;
}

function getPreyProfileForSearchZone(zone: PreySearchZone) {
  return getPreyProfileById(zone.preyProfileId || zone.preyKind);
}

function getPreyBehaviorIntervalMs(preyProfile: PreyProfile) {
  if (isRunnerPreyProfile(preyProfile)) {
    return preyProfile.moveIntervalMs;
  }

  if (preyProfile.behaviorType === "bird") {
    return preyProfile.safeDurationMs;
  }

  return PREY_BEHAVIOR_TICK_MS;
}

function getPreyPerchTimeoutMs(preyProfile: PreyProfile) {
  if (preyProfile.behaviorType === "bird") {
    return preyProfile.perchTimeoutMs;
  }

  return 0;
}

function findPreySpawnPosition(
  player: Player,
  zone: PreySearchZone,
  preyProfile: PreyProfile,
  preyMap: WorldState["prey"],
  connectedPlayers: readonly Player[],
) {
  if (preyProfile.behaviorType === "bird") {
    return findBirdSpawnPosition(player, zone, preyProfile, preyMap, connectedPlayers);
  }

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

function findBirdSpawnPosition(
  player: Player,
  zone: PreySearchZone,
  preyProfile: BirdPreyProfile,
  preyMap: WorldState["prey"],
  connectedPlayers: readonly Player[],
) {
  const size = worldConfig.gridCellSize;
  const minRadius = Math.max(1, preyProfile.spawnMinDistanceCells) * size;
  const maxRadius = Math.max(preyProfile.spawnMinDistanceCells, preyProfile.spawnMaxDistanceCells) * size;
  const leashRadius = Math.max(1, preyProfile.teleportRadiusCells) * size;
  const expandedBounds = getExpandedPreySearchZoneBounds(zone, leashRadius);
  const minGridX = Math.ceil(expandedBounds.left / size);
  const maxGridX = Math.floor(expandedBounds.right / size);
  const minGridY = Math.ceil(expandedBounds.top / size);
  const maxGridY = Math.floor(expandedBounds.bottom / size);
  const candidates: Array<{
    x: number;
    y: number;
    targetDistanceDelta: number;
    tooCloseCount: number;
    nearestOtherDistance: number;
  }> = [];

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

      if (!isWorldPositionInsideExpandedPreySearchZone(zone, x, y, leashRadius)) {
        continue;
      }

      const distance = distanceBetween(x, y, player.x, player.y);
      if (distance < minRadius || distance > maxRadius) {
        continue;
      }

      let occupied = false;
      for (const otherPrey of preyMap.values()) {
        if (otherPrey.state !== "alive") {
          continue;
        }
        if (otherPrey.x === x && otherPrey.y === y) {
          occupied = true;
          break;
        }
      }
      if (occupied) {
        continue;
      }

      let tooCloseCount = 0;
      let nearestOtherDistance = Number.POSITIVE_INFINITY;
      for (const otherPlayer of connectedPlayers) {
        if (otherPlayer.playerId === player.playerId) {
          continue;
        }

        const otherDistance = distanceBetween(x, y, otherPlayer.x, otherPlayer.y);
        nearestOtherDistance = Math.min(nearestOtherDistance, otherDistance);
        if (otherDistance < minRadius) {
          tooCloseCount += 1;
        }
      }

      candidates.push({
        x,
        y,
        targetDistanceDelta: Math.abs(distance - ((minRadius + maxRadius) * 0.5)),
        tooCloseCount,
        nearestOtherDistance,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.tooCloseCount !== b.tooCloseCount) {
      return a.tooCloseCount - b.tooCloseCount;
    }

    if (a.targetDistanceDelta !== b.targetDistanceDelta) {
      return a.targetDistanceDelta - b.targetDistanceDelta;
    }

    return b.nearestOtherDistance - a.nearestOtherDistance;
  });

  const bestTooCloseCount = candidates[0]?.tooCloseCount ?? Number.POSITIVE_INFINITY;
  const bestCandidates = candidates.filter((candidate) => candidate.tooCloseCount === bestTooCloseCount);
  const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
  return chosen ?? candidates[0];
}

function findBirdPerchPosition(
  zone: PreySearchZone,
  preyProfile: BirdPreyProfile,
  preyMap: WorldState["prey"],
  ignoredPreyId: string,
  targetPlayer: Player | null,
  connectedPlayers: readonly Player[],
) {
  const size = worldConfig.gridCellSize;
  const leashRadius = Math.max(1, preyProfile.teleportRadiusCells) * size;
  const expandedBounds = getExpandedPreySearchZoneBounds(zone, leashRadius);
  const minGridX = Math.ceil(expandedBounds.left / size);
  const maxGridX = Math.floor(expandedBounds.right / size);
  const minGridY = Math.ceil(expandedBounds.top / size);
  const maxGridY = Math.floor(expandedBounds.bottom / size);
  const idealMinDistance = Math.max(1, preyProfile.spawnMinDistanceCells) * size;
  const idealMaxDistance = Math.max(preyProfile.spawnMinDistanceCells, preyProfile.spawnMaxDistanceCells) * size;
  const candidates: Array<{
    x: number;
    y: number;
    targetDistanceDelta: number;
    tooCloseCount: number;
    nearestOtherDistance: number;
  }> = [];

  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      const x = gridX * size;
      const y = gridY * size;

      if (!isWalkableWorldPosition(x, y)) {
        continue;
      }

      if (!isWorldPositionInsideExpandedPreySearchZone(zone, x, y, leashRadius)) {
        continue;
      }

      let occupied = false;
      for (const [otherPreyId, otherPrey] of preyMap.entries()) {
        if (otherPreyId === ignoredPreyId) {
          continue;
        }
        if (otherPrey.state !== "alive") {
          continue;
        }
        if (otherPrey.x === x && otherPrey.y === y) {
          occupied = true;
          break;
        }
      }
      if (occupied) {
        continue;
      }

      const targetDistance = targetPlayer ? distanceBetween(x, y, targetPlayer.x, targetPlayer.y) : Number.POSITIVE_INFINITY;
      if (targetPlayer != null && (targetDistance < idealMinDistance || targetDistance > idealMaxDistance)) {
        continue;
      }

      let tooCloseCount = 0;
      let nearestOtherDistance = Number.POSITIVE_INFINITY;
      for (const connectedPlayer of connectedPlayers) {
        if (targetPlayer != null && connectedPlayer.playerId === targetPlayer.playerId) {
          continue;
        }

        const otherDistance = distanceBetween(x, y, connectedPlayer.x, connectedPlayer.y);
        nearestOtherDistance = Math.min(nearestOtherDistance, otherDistance);
        if (otherDistance < idealMinDistance) {
          tooCloseCount += 1;
        }
      }

      candidates.push({
        x,
        y,
        targetDistanceDelta: targetPlayer == null ? 0 : Math.abs(targetDistance - ((idealMinDistance + idealMaxDistance) * 0.5)),
        tooCloseCount,
        nearestOtherDistance,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(compareBirdPerchCandidates);
  return candidates[0] ?? null;
}

function compareBirdPerchCandidates(
  left: {
    targetDistanceDelta: number;
    tooCloseCount: number;
    nearestOtherDistance: number;
  },
  right: {
    targetDistanceDelta: number;
    tooCloseCount: number;
    nearestOtherDistance: number;
  },
) {
  if (left.tooCloseCount !== right.tooCloseCount) {
    return left.tooCloseCount - right.tooCloseCount;
  }

  if (left.targetDistanceDelta !== right.targetDistanceDelta) {
    return left.targetDistanceDelta - right.targetDistanceDelta;
  }

  return right.nearestOtherDistance - left.nearestOtherDistance;
}

function buildPlayerSearchZoneKey(playerId: string, searchZoneId: string) {
  return `${playerId.trim()}::${searchZoneId.trim()}`;
}

function getExpandedPreySearchZoneBounds(zone: PreySearchZone, margin: number) {
  return {
    left: zone.x - zone.width / 2 - margin,
    right: zone.x + zone.width / 2 + margin,
    top: zone.y - zone.height / 2 - margin,
    bottom: zone.y + zone.height / 2 + margin,
  };
}

function isWorldPositionInsideExpandedPreySearchZone(zone: PreySearchZone, x: number, y: number, margin: number) {
  const bounds = getExpandedPreySearchZoneBounds(zone, margin);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
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

function toCharacterWorldSnapshot(player: Player): CharacterWorldSnapshot {
  return {
    characterId: player.playerId,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing === "left" ? "left" : "right",
  };
}

function requireGameAuthContext(auth: AuthContextData | GameAuthContextData | undefined): GameAuthContextData {
  if (!auth || !auth.characterId || !auth.characterName) {
    throw new Error("Authentication required");
  }

  return {
    ...auth,
    characterId: auth.characterId,
    characterName: auth.characterName,
  };
}
