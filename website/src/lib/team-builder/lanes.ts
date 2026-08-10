export interface LaneInfo {
  /** `assigned_lane` as reported by the game. Indexes the `lane_info` array of the generic-data asset. */
  id: number;
  name: string;
  color: string;
}

/** The three duo lanes of the current map. Ids 1/4/6 are the only non-zero `assigned_lane` values in play. */
export const LANES: readonly LaneInfo[] = [
  { id: 1, name: "Yellow", color: "#facc15" },
  { id: 4, name: "Blue", color: "#22d3ee" },
  { id: 6, name: "Purple", color: "#a78bfa" },
];

export const SLOTS_PER_LANE = 2;
export const TEAM_SIZE = LANES.length * SLOTS_PER_LANE;

/** Slot position *is* the lane assignment: slots 0-1 lane together, 2-3, then 4-5. */
export function laneOfSlot(slot: number): LaneInfo {
  return LANES[Math.floor(slot / SLOTS_PER_LANE)];
}

export function slotsOfLane(laneIndex: number): number[] {
  return Array.from({ length: SLOTS_PER_LANE }, (_, i) => laneIndex * SLOTS_PER_LANE + i);
}

/**
 * The faction each side plays for. Renamed in the Old Gods, New Blood update: what the game called
 * The Amber Hand and The Sapphire Flame are now The Hidden King and The Archmother.
 * See <https://deadlock.wiki/Teams>.
 */
export const TEAM_NAMES = { ally: "The Hidden King", enemy: "The Archmother" } as const;
