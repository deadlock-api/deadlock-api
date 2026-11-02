import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { Swords } from "lucide-react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { Grid } from "~/components/ui/grid";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { formatPercent } from "~/lib/format";
import { DEFAULT_BADGES, DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

/** How many heroes each half of the panel lists. */
const SHOWN = 6;

interface UnixRange {
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
}

/**
 * The hero win rates the overall hero table opens on (ranked, the default ranks, the default period), in its exact
 * query, so the two pages share one cache entry and agree on every number.
 */
export function heroWinRateLeadersQueries(range: UnixRange, prevRange: UnixRange) {
  const common = {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    ...DEFAULT_BADGES,
    gameMode: "normal" as const,
    matchMode: DEFAULT_MATCH_MODE,
  };
  return {
    current: heroStatsQueryOptions({ ...common, ...range }),
    previous: heroStatsQueryOptions({ ...common, ...prevRange }),
  };
}

interface Leader {
  heroId: number;
  winRate: number;
  matches: number;
  /** The change in win rate since the previous period, as a fraction. */
  delta?: number;
}

/** Heroes with enough matches for their win rate to mean something, best first. */
function rankByWinRate(stats: readonly AnalyticsHeroStats[], previous: readonly AnalyticsHeroStats[] | undefined) {
  const total = stats.reduce((sum, row) => sum + row.matches, 0);
  const floor = Math.max(100, total * 0.005);
  const before = new Map(
    (previous ?? []).filter((row) => row.matches >= 100).map((row) => [row.hero_id, row.wins / row.matches]),
  );
  return stats
    .filter((row) => row.matches >= floor)
    .map((row): Leader => {
      const winRate = row.wins / row.matches;
      const prev = before.get(row.hero_id);
      return {
        heroId: row.hero_id,
        winRate,
        matches: row.matches,
        delta: prev === undefined ? undefined : winRate - prev,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);
}

function LeaderTable({ label, leaders }: { label: string; leaders: Leader[] }) {
  return (
    <Table aria-label={label} className="tabular-nums">
      <TableHeader tone="muted">
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-end">Win rate</TableHead>
          <TableHead className="text-end">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leaders.map((leader) => (
          <TableRow key={leader.heroId}>
            <TableCell>
              <HeroCell
                heroId={leader.heroId}
                linkToDetail
                size="sm"
                meta={`${leader.matches.toLocaleString("en-US")} matches`}
              />
            </TableCell>
            <TableCell className="text-end font-medium">{formatPercent(leader.winRate)}</TableCell>
            <TableCell className="text-end">
              {leader.delta === undefined ? null : <Delta value={leader.delta} className="text-xs" />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The heroes winning the most and the least right now, six of each, with how their win rate moved since the previous
 * period: the question most visitors of a stats site arrive with, answered on its front page. Each hero links to its
 * page, the header to the full table. The route prefetches both queries, so the panel renders with the page.
 */
export function HeroWinRateLeaders({
  range,
  prevRange,
  period,
  className,
}: {
  range: UnixRange;
  prevRange: UnixRange;
  /** The period in words, as the hero table names it ("the current patch"): part of the title. */
  period: string;
  className?: string;
}) {
  const queries = heroWinRateLeadersQueries(range, prevRange);
  const { data: stats } = useQuery(queries.current);
  const { data: previous } = useQuery(queries.previous);
  const ranked = stats ? rankByWinRate(stats, previous) : [];
  if (ranked.length === 0) return null;
  const highest = ranked.slice(0, SHOWN);
  const lowest = ranked.slice(-SHOWN).reverse();
  return (
    <Panel className={className}>
      <PanelHeader title={`Hero win rates in ${period}`} icon={Swords} size="sm">
        <TextLink asChild underline="always" size="sm">
          <SmartLink href="/analytics/heroes">All heroes</SmartLink>
        </TextLink>
      </PanelHeader>
      <PanelBody size="sm">
        <Grid columns={{ base: 1, md: 2 }} gap={4}>
          <LeaderTable label="Highest" leaders={highest} />
          <LeaderTable label="Lowest" leaders={lowest} />
        </Grid>
      </PanelBody>
    </Panel>
  );
}
