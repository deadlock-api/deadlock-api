import { InlineStat } from "~/components/ui/inline-stat";
import type { BuildSummary } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";

const count = (value: number) => value.toLocaleString("en-US");

/**
 * The list's headline on one line of its panel header: how many builds were played, how the hero won with or without
 * one, and the top build's share. Their matches and win rate together are the list's sticky footer.
 */
export function BuildSummaryStats({
  summary,
  heroWinRate,
}: {
  summary: BuildSummary;
  /** The win rate of every player of the hero in the same matches, builds or not; undefined while it loads. */
  heroWinRate?: number;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
      <InlineStat value={count(summary.builds)} label={summary.builds === 1 ? "build" : "builds"} />
      {/* There from the first paint, a placeholder until it loads, so the strip does not reflow. */}
      <InlineStat value={heroWinRate === undefined ? null : formatPercent(heroWinRate)} label="hero win rate" />
      <InlineStat value={formatPercent(summary.topShare)} label="on top build" />
    </div>
  );
}
