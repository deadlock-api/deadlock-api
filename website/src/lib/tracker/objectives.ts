import type { TrackerMatchMetadata, TrackerObjectiveKind } from "~/queries/tracker-queries";

export type ObjectiveEventKind = TrackerObjectiveKind | "midBoss";

export interface ObjectiveEvent {
  /** Seconds since the match started. */
  time: number;
  kind: ObjectiveEventKind;
  /** True when the tracked team came out ahead: it destroyed the enemy objective or claimed the boss. */
  own: boolean;
  /** The team that owned and lost the objective, or claimed the mid boss. */
  team: string;
}

export const OBJECTIVE_LABELS: Record<ObjectiveEventKind, string> = {
  guardian: "Guardian",
  walker: "Walker",
  baseGuardian: "Base Guardian",
  shrine: "Shrine",
  patron: "Patron",
  midBoss: "Mid Boss",
};

/** Objective kills from the tracked team's point of view, in match order. */
export function computeObjectiveEvents(match: TrackerMatchMetadata, ownTeam: string): ObjectiveEvent[] {
  const events: ObjectiveEvent[] = match.objectives.map((objective) => ({
    time: objective.destroyed_time_s,
    kind: objective.kind,
    own: objective.team !== ownTeam,
    team: objective.team,
  }));
  for (const boss of match.mid_boss) {
    events.push({
      time: boss.destroyed_time_s,
      kind: "midBoss",
      own: boss.team_claimed === ownTeam,
      team: boss.team_claimed,
    });
  }
  return events.sort((a, b) => a.time - b.time);
}
