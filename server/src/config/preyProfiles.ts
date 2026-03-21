export type PreyBehaviorType = "runner" | "bird" | "combat";

type BasePreyProfile = {
  id: string;
  kind: string;
  behaviorType: PreyBehaviorType;
  xpReward: number;
  searchSuccessChance: number;
};

export type RunnerPreyProfile = BasePreyProfile & {
  behaviorType: "runner";
  moveIntervalMs: number;
  fleeRangeCells: number;
  minFleeDistanceCells: number;
  maxFleeDistanceCells: number;
};

export type BirdPreyProfile = BasePreyProfile & {
  behaviorType: "bird";
  watchDurationMs: number;
  safeDurationMs: number;
  spawnMinDistanceCells: number;
  spawnMaxDistanceCells: number;
  teleportRadiusCells: number;
  perchTimeoutMs: number;
};

export type CombatPreyProfile = BasePreyProfile & {
  behaviorType: "combat";
};

export type PreyProfile = RunnerPreyProfile | BirdPreyProfile | CombatPreyProfile;

const PREY_PROFILES_BY_ID: Record<string, PreyProfile> = Object.freeze({
  mouse: {
    id: "mouse",
    kind: "mouse",
    behaviorType: "runner",
    xpReward: 1,
    searchSuccessChance: 1.0,
    moveIntervalMs: 500,
    fleeRangeCells: 8,
    minFleeDistanceCells: 6,
    maxFleeDistanceCells: 12,
  },
  lizard: {
    id: "lizard",
    kind: "lizard",
    behaviorType: "runner",
    xpReward: 1,
    searchSuccessChance: 1.0,
    moveIntervalMs: 340,
    fleeRangeCells: 8,
    minFleeDistanceCells: 6,
    maxFleeDistanceCells: 12,
  },
  rabbit: {
    id: "rabbit",
    kind: "rabbit",
    behaviorType: "runner",
    xpReward: 2,
    searchSuccessChance: 1.0,
    moveIntervalMs: 460,
    fleeRangeCells: 10,
    minFleeDistanceCells: 8,
    maxFleeDistanceCells: 12,
  },
  hare: {
    id: "hare",
    kind: "hare",
    behaviorType: "runner",
    xpReward: 2,
    searchSuccessChance: 1.0,
    moveIntervalMs: 230,
    fleeRangeCells: 10,
    minFleeDistanceCells: 8,
    maxFleeDistanceCells: 18,
  },
  bird: {
    id: "bird",
    kind: "bird",
    behaviorType: "bird",
    xpReward: 3,
    searchSuccessChance: 1.0,
    watchDurationMs: 1800,
    safeDurationMs: 1000,
    spawnMinDistanceCells: 4,
    spawnMaxDistanceCells: 5,
    teleportRadiusCells: 12,
    perchTimeoutMs: 8000,
  },
  large_prey: {
    id: "large_prey",
    kind: "large_prey",
    behaviorType: "combat",
    xpReward: 0,
    searchSuccessChance: 1.0,
  },
});

const DEFAULT_PREY_PROFILE_ID = "mouse";

export function getPreyProfileById(preyProfileId: string | null | undefined): PreyProfile {
  const normalizedId = normalizePreyProfileId(preyProfileId);
  if (normalizedId && PREY_PROFILES_BY_ID[normalizedId]) {
    return PREY_PROFILES_BY_ID[normalizedId];
  }

  return PREY_PROFILES_BY_ID[DEFAULT_PREY_PROFILE_ID];
}

export function getAllPreyProfiles() {
  return Object.values(PREY_PROFILES_BY_ID);
}

export function isRunnerPreyProfile(profile: PreyProfile): profile is RunnerPreyProfile {
  return profile.behaviorType === "runner";
}

export function isBirdPreyProfile(profile: PreyProfile): profile is BirdPreyProfile {
  return profile.behaviorType === "bird";
}

export function isCombatPreyProfile(profile: PreyProfile): profile is CombatPreyProfile {
  return profile.behaviorType === "combat";
}

export function normalizePreyProfileId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}
