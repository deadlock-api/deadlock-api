import { InlineStat } from "~/components/ui/inline-stat";
import type { BuildSummary } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";

const count = (value: number) => value.toLocaleString("en-US");

/** The list's headline on one line of its panel header: how many builds were played, how often and how they won. */
export function BuildSummaryStats({ summary }: { summary: BuildSummary }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
      <InlineStat value={count(summary.builds)} label={summary.builds === 1 ? "build" : "builds"} />
      <InlineStat value={count(summary.matches)} label="matches" />
      <InlineStat value={formatPercent(summary.winRate)} label="avg. win rate" />
      <InlineStat value={formatPercent(summary.topShare)} label="top build share" />
    </div>
  );
}
