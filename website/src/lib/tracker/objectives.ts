import type { MatchSides } from "~/lib/tracker/teams";
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
  patron: "Patron, first phase",
  patronCore: "Patron",
  midBoss: "Mid Boss",
};

/** A match seen on its own has no "your team": its events name the team that took the objective. */
export function describeObjectiveOutcome(event: ObjectiveEvent, sides: MatchSides): string {
  const verb = event.kind === "midBoss" ? "Claimed" : "Destroyed";
  if (sides.neutral) return `${verb} by ${event.own ? sides.own : sides.enemy}`;
  if (event.kind === "midBoss") return event.own ? "Claimed by your team" : "Claimed by the enemy";
  return event.own ? "Destroyed by your team" : "Lost to the enemy";
}

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
