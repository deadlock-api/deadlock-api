import type { MetricValues } from "deadlock_api_client";

/** A player-stats metric's distribution over single matches, with every value known. */
export type MetricDistribution = { [K in keyof MetricValues]: number };

const isComplete = (values: MetricValues): values is MetricDistribution =>
  Object.values(values).every((v) => typeof v === "number");

/**
 * The metrics of a player-stats metrics response that have a distribution. The API sends a metric's values as `null`
 * when no matching match has it (e.g. `first_permanent_buff_time_s` before build 6712); such a metric is left out, as if
 * it had not been requested.
 */
export function completeMetrics(metrics: Record<string, MetricValues>): Record<string, MetricDistribution> {
  return Object.fromEntries(
    Object.entries(metrics).filter((entry): entry is [string, MetricDistribution] => isComplete(entry[1])),
  );
}
