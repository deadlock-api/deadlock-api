import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { DatabaseZap, Trophy } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_MARGIN_SM, CHART_Y_AXIS_SM, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { LiveList, LiveListItem } from "~/components/patterns/live-list/LiveList";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { day } from "~/dayjs";
import { formatShare } from "~/lib/format";
import { regionName, WORLD_AREA_LABEL, WORLD_AREAS } from "~/lib/live-requests/server-regions";
import type { IngestFeed, ShownMatch } from "~/lib/live-requests/useIngestFeed";
import { formatClock } from "~/lib/stat-format";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { LiveRing, type LiveRingSlice } from "./LiveRing";

interface LiveIngestPanelProps extends React.ComponentProps<typeof Panel> {
  /** The matches being written, from `useIngestFeed`. Empty until the first flush arrives. */
  feed?: IngestFeed;
}

const EMPTY_FEED: IngestFeed = {
  matches: [],
  flushes: [],
  perMinute: null,
  counted: 0,
  areas: { europe: 0, northAmerica: 0, southAmerica: 0, asia: 0, oceania: 0, middleEast: 0, africa: 0, unknown: 0 },
  freshShare: null,
  now: null,
};

const FLUSH_COLOR = CHART_COLOR.primary;

/** Valve's match modes; Street Brawl is a game mode and names itself. */
function modeLabel(match: ShownMatch): string {
  if (match.gameMode === 4) return "Street Brawl";
  switch (match.matchMode) {
    case 1:
      return "Unranked";
    case 2:
      return "Private lobby";
    case 3:
      return "Bot match";
    case 4:
      return "Ranked";
    case 7:
      return "Hero Labs";
    case 8:
      return "Placement";
    default:
      return "Match";
  }
}

function areaSlices(areas: IngestFeed["areas"]): LiveRingSlice[] {
  const slices: LiveRingSlice[] = WORLD_AREAS.map((area, i) => ({
    key: area,
    label: WORLD_AREA_LABEL[area],
    color: SERIES_COLORS[i],
    value: areas[area],
  }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
  if (areas.unknown > 0) {
    slices.push({ key: "unknown", label: "Unknown", color: CHART_COLOR.neutral, value: areas.unknown });
  }
  return slices;
}

/** One team's heroes in slot order, the winners marked with a trophy and a ring. */
function Team({ heroes, won, side }: { heroes: number[]; won: boolean; side: "start" | "end" }) {
  return (
    <Inline gap={0.5} wrap="nowrap" className={side === "end" ? "flex-row-reverse" : undefined}>
      {won && (
        <>
          <Trophy aria-hidden className="size-3.5 shrink-0 text-positive" />
          <span className="sr-only">Won:</span>
        </>
      )}
      {heroes.map((heroId) => (
        <HeroImage
          // A hero is picked once per team.
          key={heroId}
          heroId={heroId}
          shape="circle"
          ring={won ? "positive" : "border"}
          className="size-6"
        />
      ))}
    </Inline>
  );
}

function MatchRow({ match, now, ranks }: { match: ShownMatch; now: number; ranks: Rank[] }) {
  return (
    <Stack gap={1}>
      <Inline gap={2} wrap="nowrap" justify="between">
        <Team heroes={match.teams[0]} won={match.winner === 0} side="start" />
        <Text variant="meta" tone="muted" aria-hidden>
          vs
        </Text>
        <Team heroes={match.teams[1]} won={match.winner === 1} side="end" />
      </Inline>
      <Inline gap={1.5} wrap="nowrap">
        {match.badge !== null && <BadgeImage badge={match.badge} ranks={ranks} size="inline" />}
        <Text variant="meta" wrap="truncate" className="flex-1">
          {modeLabel(match)}
          {match.region && ` · ${regionName(match.region)}`}
          {` · ${formatClock(match.durationS)}`}
        </Text>
        <Text variant="meta" tone="muted" numeric="tabular" className="shrink-0">
          {day(match.endedAt).from(now)}
        </Text>
        <TextLink asChild tone="muted" size="sm" className="shrink-0">
          <Link to="/matches/$matchId" params={{ matchId: String(match.matchId) }}>
            {match.matchId}
          </Link>
        </TextLink>
      </Inline>
    </Stack>
  );
}

/**
 * The matches being written to the database, as they are: the rate, a ring of where they were played, the size of
 * every flush in the last half hour, and the matches themselves streaming in.
 */
export function LiveIngestPanel({ feed = EMPTY_FEED, ...props }: LiveIngestPanelProps) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const { matches, flushes, perMinute, counted, freshShare, now } = feed;
  const slices = areaSlices(feed.areas);
  const largest = flushes.reduce((most, flush) => Math.max(most, flush.total), 0);
  return (
    <Panel {...props}>
      <PanelHeader title="Matches coming in" icon={DatabaseZap} description="Written to the database" size="sm" />
      <PanelBody size="sm" className="flex min-h-0 flex-1 flex-col">
        <Stack gap={3} className="@container min-h-0 flex-1">
          <StatGroup size="xs" variant="plain" className="grid-cols-3">
            <Stat
              label="Per minute"
              value={perMinute === null ? undefined : Math.round(perMinute).toLocaleString("en-US")}
              sub={flushes.length > 1 ? "Last 30 min" : "Measuring"}
            />
            <Stat
              label="While you watch"
              value={now === null ? undefined : Math.round(counted).toLocaleString("en-US")}
              sub="Matches written"
            />
            <Stat
              label="Played today"
              value={freshShare === null ? undefined : formatShare(freshShare)}
              sub="Rest: old uploads"
            />
          </StatGroup>
          <div className="grid items-center gap-3 @sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ChartSurface
              label={
                flushes.length
                  ? `Matches written per flush over the last ${flushes.length} flushes, at most ${largest.toLocaleString("en-US")}`
                  : "Matches written per flush, once the first one arrives"
              }
              announce="label"
              size="xs"
              variant="bare"
            >
              <BarChart data={flushes} margin={CHART_MARGIN_SM}>
                <XAxis
                  dataKey="at"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  hide
                  padding={{ left: 6, right: 6 }}
                />
                <YAxis {...CHART_Y_AXIS_SM} allowDecimals={false} domain={[0, "auto"]} />
                <Bar dataKey="total" fill={FLUSH_COLOR} isAnimationActive={false} maxBarSize={10} radius={2} />
              </BarChart>
            </ChartSurface>
            <LiveRing label="Matches by server region" slices={slices} unit="" />
          </div>
          {matches.length && now !== null ? (
            <LiveList label="Matches just written to the database" className="min-h-0 flex-1">
              {matches.map((match) => (
                <LiveListItem key={match.key}>
                  <MatchRow match={match} now={now} ranks={ranks} />
                </LiveListItem>
              ))}
            </LiveList>
          ) : (
            <LoadingState size="sm" text="Waiting for the next matches to be written" />
          )}
        </Stack>
      </PanelBody>
    </Panel>
  );
}
