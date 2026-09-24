import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Card } from "~/components/ui/card";
import { IconTile } from "~/components/ui/icon-tile";
import { SplitBar } from "~/components/ui/rate-bar";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { type LaneRow, mean, type Side, type SoulCurves, type StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale, formatCount, formatRate, NO_DATA } from "~/lib/team-builder/format";
import { SIDE_RING } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { LaneSoulCurve } from "./LaneSoulCurve";
import { MatchupGrid } from "./MatchupGrid";
import { HeroTooltip } from "./StatTooltip";

function LaneSide({ heroes, side, index }: { heroes: number[]; side: Side; index: StatsIndex }) {
  return (
    <div className={cn("flex min-w-0 flex-1 gap-1.5", side === "enemy" && "justify-end")}>
      {/* Keyed by slot position, not by occupant: hero ids and slot indices overlap, so a lane
          holding hero 1 next to an empty slot would otherwise render two children keyed "1". */}
      {[0, 1].map((i) =>
        heroes[i] === undefined ? (
          <IconTile key={`slot-${i}`} shape="circle" className="size-8 2xl:size-9.5" />
        ) : (
          <HeroTooltip key={`slot-${i}`} heroId={heroes[i]} index={index}>
            <HeroImage
              heroId={heroes[i]}
              shape="circle"
              ring={SIDE_RING[side]}
              className="size-8 shrink-0 2xl:size-9.5"
            />
          </HeroTooltip>
        ),
      )}
    </div>
  );
}

/** Points of win rate that fill a half-track. Real lane matchups land within a few points of even. */
const LANE_BAR_SCALE = 10;

/** The ally half of a track whose halves meet at even and reach the edge at `LANE_BAR_SCALE` points. */
const allyTrack = (share: number) => 0.5 + Math.max(-0.5, Math.min(0.5, ((share - 0.5) * 100) / LANE_BAR_SCALE / 2));

function LaneMatchupMatrix({ row, index }: { row: LaneRow; index: StatsIndex }) {
  // These edges are measured against an even lane rather than against each hero's own baseline, so
  // the column hero's view really is the negation of the ally's.
  const columnAverages = row.duel[0].map((_, column) => {
    const allyView = mean(row.duel.map((cells) => cells[column].edge));
    return allyView === undefined ? undefined : -allyView;
  });

  return (
    <MatchupGrid
      cells={row.duel}
      index={index}
      scale={autoScale(
        row.duel.flat().map((cell) => cell.edge),
        3,
      )}
      columnMargins={columnAverages}
      variant="duel"
    />
  );
}

/**
 * What the lane's rate rests on. The two sources count different things: the duos' own games are the
 * direct measure, while the 1v1 fallback reports its thinnest matchup, a number that is usually far
 * larger and says much less about this exact lane. Each is worded so the count cannot be misread.
 */
function LaneSampleLabel({ row }: { row: LaneRow }) {
  const count = formatCount(row.matches);
  return row.source === "duo" ? (
    <span
      className="text-3xs text-muted-foreground tabular-nums"
      title={`${count} games with these two duos laning against each other`}
    >
      {count} lane games
    </span>
  ) : (
    <span
      className="truncate text-3xs text-muted-foreground tabular-nums"
      title={`Too few games of these two duos against each other, so this is the average of the four 1v1 lane matchups. The thinnest of them has ${count} games.`}
    >
      Estimate from 1v1s (min {count})
    </span>
  );
}

export function LaneCards({
  lanes,
  index,
  loading,
  soulCurves,
  curveLoading,
}: {
  lanes: LaneRow[];
  index: StatsIndex;
  loading: boolean;
  soulCurves: SoulCurves;
  /** Tracked apart from `loading`: the curve is a separate request and lands after the rest. */
  curveLoading: boolean;
}) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-3">
      {lanes.map((row) => {
        const pending = loading || !row.complete || row.winRate === undefined;
        const share = row.winRate ?? 0.5;
        const curve = row.complete ? soulCurves.get(row.lane.id, row.ally, row.enemy) : undefined;
        return (
          <Card
            key={row.lane.id}
            size="sm"
            tone={pending ? "muted" : "card"}
            accent={row.lane.color}
            className="gap-0 p-3.5 text-start"
          >
            <Stack gap={2}>
              {/* Named in text, not only by the coloured top border, which is not an identity cue a
                  reader who does not separate these hues can use. */}
              <Inline align="baseline" justify="between" wrap="nowrap">
                <span className={cn("text-2xs font-semibold", row.lane.textClass)}>{row.lane.name} lane</span>
                {!loading && row.matches > 0 && <LaneSampleLabel row={row} />}
              </Inline>

              <div className="flex items-center gap-2">
                <LaneSide heroes={row.ally} side="ally" index={index} />
                {/* The lane's numbers sit where the "vs" would be: they belong to the matchup, not a side. */}
                <Stack gap={1.5} className="min-w-28 text-center 2xl:min-w-44">
                  {loading ? (
                    <Skeleton className="mx-auto h-8 w-28" />
                  ) : (
                    <>
                      <Inline
                        gap={0.5}
                        justify="center"
                        wrap="nowrap"
                        className="text-lg leading-tight font-bold whitespace-nowrap tabular-nums"
                      >
                        {row.winRate === undefined ? (
                          NO_DATA
                        ) : (
                          <>
                            <span className="text-positive">{formatRate(row.winRate)}</span>
                            <span className="text-muted-foreground">:</span>
                            <span className="text-primary">{formatRate(1 - row.winRate)}</span>
                          </>
                        )}
                      </Inline>
                      <div title={`Each half is one duo's share, full at ±${LANE_BAR_SCALE} points`}>
                        <SplitBar
                          left={allyTrack(share)}
                          right={1 - allyTrack(share)}
                          leftColor="var(--positive)"
                          rightColor="var(--primary)"
                        />
                      </div>
                    </>
                  )}
                </Stack>
                <LaneSide heroes={row.enemy} side="enemy" index={index} />
              </div>
            </Stack>

            {!pending && (
              <Stack gap={3} className="pt-3.5">
                <Separator />
                <div className="flex items-stretch gap-3">
                  <Stack gap={1} className="w-40 shrink-0">
                    <div className="text-2xs font-semibold">Matchups</div>
                    <LaneMatchupMatrix row={row} index={index} />
                  </Stack>
                  {/* Always laid out, even with nothing to draw yet: the curve resolves after the rest
                    of the card, and leaving the column out until then shifted the matrix sideways. */}
                  <Stack gap={1} className="flex-1">
                    <div className="text-2xs font-semibold">Soul lead</div>
                    <div className="min-h-0 flex-1">
                      {curve && curve.length > 1 ? (
                        <LaneSoulCurve points={curve} />
                      ) : curveLoading ? (
                        <Skeleton className="h-full min-h-16 w-full" />
                      ) : (
                        <Card
                          tone="outline"
                          size="xs"
                          radius="md"
                          className="h-full min-h-16 items-center justify-center px-2 text-center text-3xs text-muted-foreground"
                        >
                          No souls recorded for this pairing
                        </Card>
                      )}
                    </div>
                  </Stack>
                </div>
              </Stack>
            )}
          </Card>
        );
      })}
    </div>
  );
}
