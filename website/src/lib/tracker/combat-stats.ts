export interface CombatMetric {
  label: string;
  share: number;
  detail: string;
}

export interface CombatStats {
  sampledAt: number;
  metrics: CombatMetric[];
}

interface StatSample {
  time_stamp_s?: number | null;
  custom_user_stats?: unknown;
}

/** REST stores match-local ids; GraphQL resolves those ids to the same names. */
export function resolveCustomStats(raw: unknown, names: Map<number, string>): Record<string, number> {
  if (!Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const name = names.get(entry.id);
    if (name && typeof entry.value === "number" && Number.isFinite(entry.value)) result[name] = entry.value;
  }
  return result;
}

/** The custom stats of the latest snapshot that has a time, and that time; null when there is none. */
export function latestCustomStats(
  samples: readonly StatSample[] | null | undefined,
): { time: number; stats: Record<string, unknown> } | null {
  let latest: StatSample | undefined;
  let latestTime = 0;
  for (const sample of samples ?? []) {
    const time = sample.time_stamp_s;
    if (time == null || !Number.isFinite(time) || time < 0) continue;
    if (!latest || time >= latestTime) {
      latest = sample;
      latestTime = time;
    }
  }
  const raw = latest?.custom_user_stats;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { time: latestTime, stats: raw as Record<string, unknown> };
}

/** A custom stat of the latest snapshot as a count, or null when the snapshot lacks it. */
export function latestCustomCount(samples: readonly StatSample[] | null | undefined, name: string): number | null {
  const value = latestCustomStats(samples)?.stats[name];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Ratios can fall during a match, so use one latest snapshot, never maxima or summed samples. */
export function combatStats(samples: readonly StatSample[] | null | undefined): CombatStats | null {
  const latest = latestCustomStats(samples);
  if (!latest) return null;
  const { stats, time: latestTime } = latest;
  const count = (key: string): number | null => {
    const value = stats[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  };
  const metrics: CombatMetric[] = [];
  const ratio = (label: string, hits: number | null, total: number | null, unit: string) => {
    if (hits == null || total == null || total <= 0 || hits > total) return;
    metrics.push({
      label,
      share: hits / total,
      detail: `${hits.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} ${unit}`,
    });
  };
  ratio("Hero accuracy", count("Enemy Hero Accuracy##Hits"), count("Enemy Hero Accuracy##Shots"), "shots hit");
  ratio(
    "Headshot rate",
    count("Enemy Hero Accuracy##Headshots"),
    count("Enemy Hero Accuracy##Hits"),
    "hits to the head",
  );
  const noFalloff = count("Enemy Hero Falloff##No Falloff");
  const partialFalloff = count("Enemy Hero Falloff##Partial Falloff");
  const maxFalloff = count("Enemy Hero Falloff##Max Falloff");
  ratio(
    "Hits without falloff",
    noFalloff,
    noFalloff != null && partialFalloff != null && maxFalloff != null ? noFalloff + partialFalloff + maxFalloff : null,
    "hits without range penalty",
  );
  ratio(
    "Incoming accuracy",
    count("Enemy Hero Accuracy - Incoming##Hits"),
    count("Enemy Hero Accuracy - Incoming##Shots"),
    "incoming shots hit",
  );
  return metrics.length > 0 ? { sampledAt: latestTime, metrics } : null;
}
