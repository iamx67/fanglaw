import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { snapWorldPosition } from "./worldConfig.js";

type RawLocationZone = {
  name?: string;
  locationId?: string;
  displayName?: string;
  tribeId?: string;
  isNeutral?: boolean;
  preyTableId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type RawPreySearchZone = {
  name?: string;
  searchZoneId?: string;
  locationId?: string;
  preyKind?: string;
  spawnTag?: string;
  requiredSkill?: string;
  difficulty?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type RawSpawnPoint = {
  name?: string;
  spawnId?: string;
  spawnKind?: string;
  spawnTag?: string;
  weight?: number;
  x?: number;
  y?: number;
};

type RawLocationZonesFile = { zones?: RawLocationZone[] };
type RawPreySearchZonesFile = { zones?: RawPreySearchZone[] };
type RawSpawnPointsFile = { points?: RawSpawnPoint[] };

export type LocationZone = {
  name: string;
  locationId: string;
  displayName: string;
  tribeId: string;
  isNeutral: boolean;
  preyTableId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PreySearchZone = {
  name: string;
  searchZoneId: string;
  locationId: string;
  preyKind: string;
  spawnTag: string;
  requiredSkill: string;
  difficulty: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldSpawnPoint = {
  name: string;
  spawnId: string;
  spawnKind: string;
  spawnTag: string;
  weight: number;
  x: number;
  y: number;
};

const WORLD_LOCATIONS_FILE = fileURLToPath(new URL("../../../client/data/world_locations.json", import.meta.url));
const WORLD_PREY_SEARCH_ZONES_FILE = fileURLToPath(new URL("../../../client/data/world_prey_search_zones.json", import.meta.url));
const WORLD_SPAWN_POINTS_FILE = fileURLToPath(new URL("../../../client/data/world_spawn_points.json", import.meta.url));

let cachedLocationZones: LocationZone[] = [];
let cachedLocationZonesMtimeMs = -1;
let cachedPreySearchZones: PreySearchZone[] = [];
let cachedPreySearchZonesMtimeMs = -1;
let cachedSpawnPoints: WorldSpawnPoint[] = [];
let cachedSpawnPointsMtimeMs = -1;

export function getLocationZones() {
  const nextMtimeMs = getFileMtimeMs(WORLD_LOCATIONS_FILE);
  if (nextMtimeMs !== cachedLocationZonesMtimeMs) {
    cachedLocationZones = normalizeLocationZones(loadJsonFile<RawLocationZonesFile>(WORLD_LOCATIONS_FILE).zones);
    cachedLocationZonesMtimeMs = nextMtimeMs;
  }

  return cachedLocationZones;
}

export function getPreySearchZones() {
  const nextMtimeMs = getFileMtimeMs(WORLD_PREY_SEARCH_ZONES_FILE);
  if (nextMtimeMs !== cachedPreySearchZonesMtimeMs) {
    cachedPreySearchZones = normalizePreySearchZones(loadJsonFile<RawPreySearchZonesFile>(WORLD_PREY_SEARCH_ZONES_FILE).zones);
    cachedPreySearchZonesMtimeMs = nextMtimeMs;
  }

  return cachedPreySearchZones;
}

export function getPreySearchZoneById(searchZoneId: string) {
  const normalizedId = typeof searchZoneId === "string" ? searchZoneId.trim() : "";
  if (!normalizedId) {
    return null;
  }

  for (const zone of getPreySearchZones()) {
    if (zone.searchZoneId === normalizedId) {
      return zone;
    }
  }

  return null;
}

export function isWorldPositionInsidePreySearchZone(zone: PreySearchZone, x: number, y: number) {
  const left = zone.x - zone.width / 2;
  const right = zone.x + zone.width / 2;
  const top = zone.y - zone.height / 2;
  const bottom = zone.y + zone.height / 2;

  return x >= left && x <= right && y >= top && y <= bottom;
}

export function getSpawnPoints() {
  const nextMtimeMs = getFileMtimeMs(WORLD_SPAWN_POINTS_FILE);
  if (nextMtimeMs !== cachedSpawnPointsMtimeMs) {
    cachedSpawnPoints = normalizeSpawnPoints(loadJsonFile<RawSpawnPointsFile>(WORLD_SPAWN_POINTS_FILE).points);
    cachedSpawnPointsMtimeMs = nextMtimeMs;
  }

  return cachedSpawnPoints;
}

export function getPlayerSpawnPoint() {
  for (const spawnPoint of getSpawnPoints()) {
    if (spawnPoint.spawnKind === "player") {
      return snapWorldPosition(spawnPoint.x, spawnPoint.y);
    }
  }

  return null;
}

function loadJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return {} as T;
  }
}

function normalizeLocationZones(rawZones: RawLocationZone[] | undefined) {
  const normalized: LocationZone[] = [];
  const zones = Array.isArray(rawZones) ? rawZones : [];

  for (const rawZone of zones) {
    const width = readPositiveNumber(rawZone?.width, 0);
    const height = readPositiveNumber(rawZone?.height, 0);
    if (width <= 0 || height <= 0) {
      continue;
    }

    normalized.push({
      name: typeof rawZone?.name === "string" ? rawZone.name : "",
      locationId: typeof rawZone?.locationId === "string" ? rawZone.locationId.trim() : "",
      displayName: typeof rawZone?.displayName === "string" ? rawZone.displayName.trim() : "",
      tribeId: typeof rawZone?.tribeId === "string" ? rawZone.tribeId.trim() : "",
      isNeutral: Boolean(rawZone?.isNeutral),
      preyTableId: typeof rawZone?.preyTableId === "string" ? rawZone.preyTableId.trim() : "",
      x: readFiniteNumber(rawZone?.x, 0),
      y: readFiniteNumber(rawZone?.y, 0),
      width,
      height,
    });
  }

  return normalized;
}

function normalizePreySearchZones(rawZones: RawPreySearchZone[] | undefined) {
  const normalized: PreySearchZone[] = [];
  const zones = Array.isArray(rawZones) ? rawZones : [];

  for (const rawZone of zones) {
    const width = readPositiveNumber(rawZone?.width, 0);
    const height = readPositiveNumber(rawZone?.height, 0);
    if (width <= 0 || height <= 0) {
      continue;
    }

    normalized.push({
      name: typeof rawZone?.name === "string" ? rawZone.name : "",
      searchZoneId: typeof rawZone?.searchZoneId === "string" ? rawZone.searchZoneId.trim() : "",
      locationId: typeof rawZone?.locationId === "string" ? rawZone.locationId.trim() : "",
      preyKind: typeof rawZone?.preyKind === "string" ? rawZone.preyKind.trim() : "",
      spawnTag: typeof rawZone?.spawnTag === "string" ? rawZone.spawnTag.trim() : "",
      requiredSkill: typeof rawZone?.requiredSkill === "string" ? rawZone.requiredSkill.trim() : "",
      difficulty: readFiniteNumber(rawZone?.difficulty, 0),
      x: readFiniteNumber(rawZone?.x, 0),
      y: readFiniteNumber(rawZone?.y, 0),
      width,
      height,
    });
  }

  return normalized;
}

function normalizeSpawnPoints(rawPoints: RawSpawnPoint[] | undefined) {
  const normalized: WorldSpawnPoint[] = [];
  const points = Array.isArray(rawPoints) ? rawPoints : [];

  for (const rawPoint of points) {
    normalized.push({
      name: typeof rawPoint?.name === "string" ? rawPoint.name : "",
      spawnId: typeof rawPoint?.spawnId === "string" ? rawPoint.spawnId.trim() : "",
      spawnKind: typeof rawPoint?.spawnKind === "string" ? rawPoint.spawnKind.trim() : "",
      spawnTag: typeof rawPoint?.spawnTag === "string" ? rawPoint.spawnTag.trim() : "",
      weight: readPositiveNumber(rawPoint?.weight, 1),
      x: readFiniteNumber(rawPoint?.x, 0),
      y: readFiniteNumber(rawPoint?.y, 0),
    });
  }

  return normalized;
}

function getFileMtimeMs(filePath: string) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return -1;
  }
}

function readPositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
