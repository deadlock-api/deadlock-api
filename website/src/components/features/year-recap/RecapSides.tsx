import { GameIcon, type GameIconName } from "~/components/domain/assets/GameIcon";
import { NpcImage } from "~/components/domain/assets/NpcImage";
import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { ProgressBar } from "~/components/ui/progress-bar";
import { SplitBar } from "~/components/ui/rate-bar";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import { LANES } from "~/lib/team-builder/lanes";
import { toneOf } from "~/lib/tone";
import { TEAMS } from "~/lib/tracker/teams";
import { MIN_SAMPLE } from "~/lib/year-recap/recap";
import type { ModeRecap } from "~/lib/year-recap/types";
import type { Color } from "~/types/general";

import { Coverage, count, plural } from "./shared";

/** Each side's Patron portrait, emblem and bar color, in `TEAMS` order (0 is The Hidden King). */
const SIDE_ART = [
  { unit: "hiddenKing", emblem: "hiddenKing", color: SERIES_COLORS[1] },
  { unit: "archmother", emblem: "archmother", color: SERIES_COLORS[3] },
] as const;

/** The game's lane badge (a colored disc with the lane's letter) by lane id. */
const LANE_ICON: Record<number, GameIconName> = { 1: "laneYellow", 4: "laneBlue", 6: "laneGreen" };

/** The Hidden King against the Archmother, and the lanes (detailed matches). */
export function SidesChapter({ id, main }: { id: string; main: ModeRecap }) {
  const headingLevel = useNextHeadingLevel();
  const { totals } = main;
  const sides = TEAMS.map((team, index) => {
    const row = main.teams.find((candidate) => candidate.team === index);
    return { name: team.name, art: SIDE_ART[index], matches: row?.matches ?? 0, wins: row?.wins ?? 0 };
  });
  const [king, mother] = sides;
  const sideTotal = sides.reduce((sum, side) => sum + side.matches, 0);
  const lanes = LANES.map((lane) => {
    const row = main.lanes.find((candidate) => candidate.lane === lane.id);
    return { lane, matches: row?.matches ?? 0, wins: row?.wins ?? 0 };
  });
  const laneTotal = lanes.reduce((sum, lane) => sum + lane.matches, 0);
  const favouriteLane = lanes.reduce((best, lane) => (lane.matches > best.matches ? lane : best));
  // A side's win rate is a story only from enough matches on both.
  const better =
    king && mother && king.matches >= MIN_SAMPLE && mother.matches >= MIN_SAMPLE
      ? king.wins / king.matches >= mother.wins / mother.matches
        ? king
        : mother
      : undefined;
  return (
    <StoryChapter
      id={id}
      eyebrow="Sides and lanes"
      title={
        laneTotal > 0 ? `At home in the ${favouriteLane.lane.name.toLowerCase()} lane` : "Hidden King or Archmother?"
      }
      description={
        better && sideTotal > 0
          ? `${better.name} treated you best: ${formatPercent(better.wins / Math.max(1, better.matches))} of those matches won.`
          : undefined
      }
    >
      {laneTotal > 0 && (
        <StoryFigure
          value={formatPercent(favouriteLane.matches / laneTotal, 0)}
          unit={`of matches in ${favouriteLane.lane.name.toLowerCase()} lane`}
        />
      )}
      {sideTotal > 0 && king && mother && (
        <Stack gap={2}>
          <Heading as={headingLevel} size="sm">
            Your sides
          </Heading>
          <SplitBar
            left={king.matches}
            right={mother.matches}
            leftColor={king.art?.color}
            rightColor={mother.art?.color}
          />
          <Grid columns={{ base: 1, sm: 2 }} gap={3}>
            {sides.map((side) => (
              <Card key={side.name} tone="inset" size="sm">
                <CardContent className="flex items-center gap-4 text-start">
                  {side.art && <NpcImage unit={side.art.unit} decorative className="size-14 shrink-0" />}
                  <Stack gap={0.5} className="min-w-0">
                    <Inline gap={1.5} wrap="nowrap">
                      {side.art && <ChartSwatch color={side.art.color} />}
                      {side.art && <GameIcon name={side.art.emblem} size="sm" className="text-foreground" />}
                      <Text variant="label" wrap="truncate">
                        {side.name}
                      </Text>
                    </Inline>
                    <Text className="type-value" numeric="tabular">
                      {count(side.matches)} {plural(side.matches, "match", "matches")}
                    </Text>
                    {side.matches >= MIN_SAMPLE && (
                      <Text variant="caption" numeric="tabular" tone={toneOf(side.wins / side.matches, 0.5)}>
                        {formatPercent(side.wins / side.matches)} won
                      </Text>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Stack>
      )}
      {laneTotal > 0 && (
        <Grid columns={{ base: 1, md: 3 }} gap={3}>
          {lanes.map(({ lane, matches, wins }) => (
            <Card key={lane.id} tone="inset" size="sm" accent={lane.color}>
              <CardContent className="flex flex-col gap-2">
                <Inline gap={2} wrap="nowrap" justify="center">
                  {LANE_ICON[lane.id] && <GameIcon name={LANE_ICON[lane.id]} size="default" />}
                  <Text variant="label" className={lane.textClass}>
                    {lane.name} lane
                  </Text>
                </Inline>
                <ProgressBar variant="thin" value={matches / laneTotal} color={lane.color as Color} />
                <Text variant="caption" tone="muted">
                  {count(matches)} {plural(matches, "match", "matches")}
                  {matches >= MIN_SAMPLE && (
                    <>
                      {" · "}
                      <Text tone={toneOf(wins / matches, 0.5)}>{formatPercent(wins / matches)} won</Text>
                    </>
                  )}
                </Text>
              </CardContent>
            </Card>
          ))}
        </Grid>
      )}
      <Coverage covered={totals.detailed_matches} total={totals.matches} what="their side and lane recorded" />
    </StoryChapter>
  );
}
