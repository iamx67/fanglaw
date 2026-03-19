import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

type RawWorldConfig = {
  cellSize?: number;
  worldHalfWidthCells?: number;
  worldHalfHeightCells?: number;
  wallThickness?: number;
};

type RawWorldBlockers = {
  rects?: RawWorldBlocker[];
};

type RawWorldBlocker = {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type WorldBlocker = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const DEFAULT_CELL_SIZE = 256;
const DEFAULT_WORLD_HALF_WIDTH_CELLS = 62;
const DEFAULT_WORLD_HALF_HEIGHT_CELLS = 62;
const DEFAULT_WALL_THICKNESS = 256;
const WORLD_CONFIG_FILE = fileURLToPath(new URL("../../../client/data/world_config.json", import.meta.url));
const WORLD_BLOCKERS_FILE = fileURLToPath(new URL("../../../client/data/world_blockers.json", import.meta.url));

const rawConfig = loadRawWorldConfig();

export const worldConfig = {
  gridCellSize: readPositiveNumber(rawConfig.cellSize, DEFAULT_CELL_SIZE),
  worldHalfWidthCells: readPositiveNumber(rawConfig.worldHalfWidthCells, DEFAULT_WORLD_HALF_WIDTH_CELLS),
  worldHalfHeightCells: readPositiveNumber(rawConfig.worldHalfHeightCells, DEFAULT_WORLD_HALF_HEIGHT_CELLS),
  wallThickness: readPositiveNumber(rawConfig.wallThickness, DEFAULT_WALL_THICKNESS),
};

let cachedWorldBlockers = normalizeWorldBlockers(loadRawWorldBlockers());
let cachedWorldBlockersMtimeMs = getFileMtimeMs(WORLD_BLOCKERS_FILE);

export const WORLD_MIN_X = -worldConfig.worldHalfWidthCells * worldConfig.gridCellSize;
export const WORLD_MAX_X = worldConfig.worldHalfWidthCells * worldConfig.gridCellSize;
export const WORLD_MIN_Y = -worldConfig.worldHalfHeightCells * worldConfig.gridCellSize;
export const WORLD_MAX_Y = worldConfig.worldHalfHeightCells * worldConfig.gridCellSize;

export function snapToGrid(value: number, min: number, max: number) {
  return clamp(Math.round(value / worldConfig.gridCellSize) * worldConfig.gridCellSize, min, max);
}

export function snapWorldPosition(x: number, y: number) {
  return {
    x: snapToGrid(x, WORLD_MIN_X, WORLD_MAX_X),
    y: snapToGrid(y, WORLD_MIN_Y, WORLD_MAX_Y),
  };
}

export function isWithinWorldBounds(x: number, y: number) {
  return x >= WORLD_MIN_X && x <= WORLD_MAX_X && y >= WORLD_MIN_Y && y <= WORLD_MAX_Y;
}

export function isBlockedWorldPosition(x: number, y: number) {
  return getWorldBlockers().some((blocker) => x >= blocker.left && x <= blocker.right && y >= blocker.top && y <= blocker.bottom);
}

export function isWalkableWorldPosition(x: number, y: number) {
  return isWithinWorldBounds(x, y) && !isBlockedWorldPosition(x, y);
}

export function resolveSpawnWorldPosition(x: number, y: number) {
  const origin = snapWorldPosition(x, y);
  if (isWalkableWorldPosition(origin.x, origin.y)) {
    return origin;
  }

  const maxRadius = Math.max(worldConfig.worldHalfWidthCells, worldConfig.worldHalfHeightCells);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) {
          continue;
        }

        const candidateX = origin.x + offsetX * worldConfig.gridCellSize;
        const candidateY = origin.y + offsetY * worldConfig.gridCellSize;
        if (isWalkableWorldPosition(candidateX, candidateY)) {
          return { x: candidateX, y: candidateY };
        }
      }
    }
  }

  return origin;
}

function loadRawWorldConfig(): RawWorldConfig {
  try {
    return JSON.parse(readFileSync(WORLD_CONFIG_FILE, "utf8")) as RawWorldConfig;
  } catch {
    return {};
  }
}

function loadRawWorldBlockers(): RawWorldBlockers {
  try {
    return JSON.parse(readFileSync(WORLD_BLOCKERS_FILE, "utf8")) as RawWorldBlockers;
  } catch {
    return {};
  }
}

function normalizeWorldBlockers(rawBlockers: RawWorldBlockers) {
  const rects = Array.isArray(rawBlockers.rects) ? rawBlockers.rects : [];
  const normalized: WorldBlocker[] = [];

  for (const rawBlocker of rects) {
    const width = readPositiveNumber(rawBlocker?.width, 0);
    const height = readPositiveNumber(rawBlocker?.height, 0);
    if (width <= 0 || height <= 0) {
      continue;
    }

    const x = readFiniteNumber(rawBlocker?.x, 0);
    const y = readFiniteNumber(rawBlocker?.y, 0);
    normalized.push(
      ...expandBlockerToGridCells({
        name: typeof rawBlocker?.name === "string" ? rawBlocker.name : "",
        x,
        y,
        width,
        height,
      }),
    );
  }

  return normalized;
}

function getWorldBlockers() {
  const nextMtimeMs = getFileMtimeMs(WORLD_BLOCKERS_FILE);
  if (nextMtimeMs !== cachedWorldBlockersMtimeMs) {
    cachedWorldBlockers = normalizeWorldBlockers(loadRawWorldBlockers());
    cachedWorldBlockersMtimeMs = nextMtimeMs;
  }

  return cachedWorldBlockers;
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

function expandBlockerToGridCells(rawBlocker: Pick<WorldBlocker, "name" | "x" | "y" | "width" | "height">) {
  const blockedCells: WorldBlocker[] = [];
  const size = worldConfig.gridCellSize;
  const halfCell = size / 2;
  const worldMinX = -worldConfig.worldHalfWidthCells * size;
  const worldMaxX = worldConfig.worldHalfWidthCells * size;
  const worldMinY = -worldConfig.worldHalfHeightCells * size;
  const worldMaxY = worldConfig.worldHalfHeightCells * size;
  const sourceLeft = rawBlocker.x - rawBlocker.width / 2;
  const sourceRight = rawBlocker.x + rawBlocker.width / 2;
  const sourceTop = rawBlocker.y - rawBlocker.height / 2;
  const sourceBottom = rawBlocker.y + rawBlocker.height / 2;
  const minGridX = Math.floor((sourceLeft - halfCell) / size);
  const maxGridX = Math.ceil((sourceRight + halfCell) / size);
  const minGridY = Math.floor((sourceTop - halfCell) / size);
  const maxGridY = Math.ceil((sourceBottom + halfCell) / size);

  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    const centerY = gridY * size;
    if (centerY < worldMinY || centerY > worldMaxY) {
      continue;
    }

    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      const centerX = gridX * size;
      if (centerX < worldMinX || centerX > worldMaxX) {
        continue;
      }

      const cellLeft = centerX - halfCell;
      const cellRight = centerX + halfCell;
      const cellTop = centerY - halfCell;
      const cellBottom = centerY + halfCell;
      const intersects =
        sourceLeft < cellRight &&
        sourceRight > cellLeft &&
        sourceTop < cellBottom &&
        sourceBottom > cellTop;

      if (!intersects) {
        continue;
      }

      blockedCells.push({
        name: rawBlocker.name,
        x: centerX,
        y: centerY,
        width: size,
        height: size,
        left: cellLeft,
        right: cellRight,
        top: cellTop,
        bottom: cellBottom,
      });
    }
  }

  return blockedCells;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
