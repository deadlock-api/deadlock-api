import { Skeleton } from "~/components/ui/skeleton";
import { Stat, StatGroup } from "~/components/ui/stat";
import type { BuildSummary } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";

const count = (value: number) => value.toLocaleString("en-US");

/** The page's headline: how many builds were played, how often, and the one that wins most reliably. */
export function BuildSummaryStats({
  summary,
  metaPending,
}: {
  summary: BuildSummary;
  /** Build names are still loading: the leader's name holds a skeleton. */
  metaPending: boolean;
}) {
  const leader = summary.mostReliable;
  return (
    <StatGroup size="sm" className="grid-cols-2 @3xl:grid-cols-5">
      <Stat label="Builds played" value={count(summary.builds)} />
      <Stat label="Matches" value={count(summary.matches)} />
      <Stat label="Avg. win rate" value={formatPercent(summary.winRate)} />
      <Stat label="Top build share" value={formatPercent(summary.topShare)} />
      <Stat
        className="col-span-2 @3xl:col-span-1"
        label="Most reliable build"
        value={
          leader &&
          (leader.meta ? (
            <span title={leader.meta.name}>{leader.meta.name}</span>
          ) : metaPending ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            `Build ${leader.hero_build_id}`
          ))
        }
        sub={leader && `${formatPercent(leader.winRate)} over ${count(leader.matches)} matches`}
      />
    </StatGroup>
  );
}
