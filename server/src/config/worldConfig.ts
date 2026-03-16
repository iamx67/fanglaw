import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type RawWorldConfig = {
  cellSize?: number;
  worldHalfWidthCells?: number;
  worldHalfHeightCells?: number;
  wallThickness?: number;
};

const DEFAULT_CELL_SIZE = 64;
const DEFAULT_WORLD_HALF_WIDTH_CELLS = 667;
const DEFAULT_WORLD_HALF_HEIGHT_CELLS = 667;
const DEFAULT_WALL_THICKNESS = 256;
const WORLD_CONFIG_FILE = fileURLToPath(new URL("../../../client/data/world_config.json", import.meta.url));

const rawConfig = loadRawWorldConfig();

export const worldConfig = {
  gridCellSize: readPositiveNumber(rawConfig.cellSize, DEFAULT_CELL_SIZE),
  worldHalfWidthCells: readPositiveNumber(rawConfig.worldHalfWidthCells, DEFAULT_WORLD_HALF_WIDTH_CELLS),
  worldHalfHeightCells: readPositiveNumber(rawConfig.worldHalfHeightCells, DEFAULT_WORLD_HALF_HEIGHT_CELLS),
  wallThickness: readPositiveNumber(rawConfig.wallThickness, DEFAULT_WALL_THICKNESS),
};

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

function loadRawWorldConfig(): RawWorldConfig {
  try {
    return JSON.parse(readFileSync(WORLD_CONFIG_FILE, "utf8")) as RawWorldConfig;
  } catch {
    return {};
  }
}

function readPositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
