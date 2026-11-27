import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { useHeroById } from "~/hooks/useAssetById";
import { formatPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { bestWinRateHero, MIN_SAMPLE } from "~/lib/year-recap/recap";
import type { ModeRecap, RecapHero } from "~/lib/year-recap/types";

import { count, heroAccent, plural, useRecapTime } from "./shared";

const SHOWN = 5;

/** One of the most played heroes: the hero card art framed in the hero's own color, with its year in three numbers. */
function TopHeroCard({ rank, row }: { rank: number; row: RecapHero }) {
  const { hero, isLoading } = useHeroById(row.hero_id);
  const winRate = row.wins / Math.max(1, row.matches);
  return (
    <Card tone="inset" size="sm" accent={heroAccent(hero)}>
      {/* A row on a phone (the cards stack), a column from three cards across. */}
      <CardContent className="flex items-center gap-3 text-start @md/story:flex-col @md/story:gap-2 @md/story:text-center">
        <Text variant="eyebrow">#{rank}</Text>
        <HeroImage
          hero={hero}
          loading={isLoading}
          art="portrait"
          decorative
          shape="rounded"
          className="w-10 shrink-0 @md/story:w-16 @2xl/story:w-20"
        />
        <Stack gap={0.5} className="max-w-full min-w-0 flex-1 items-start @md/story:flex-none @md/story:items-center">
          <Text variant="label" wrap="truncate">
            <HeroName hero={hero} loading={isLoading} />
          </Text>
          <Text variant="caption" tone="muted" numeric="tabular">
            {count(row.matches)} {plural(row.matches, "match", "matches")}
          </Text>
        </Stack>
        <Inline
          gap={2}
          className="flex-col items-end gap-0.5 @md/story:flex-row @md/story:justify-center @md/story:gap-2"
        >
          <Text variant="caption" numeric="tabular" tone={toneOf(winRate, 0.5)}>
            {formatPercent(winRate)} won
          </Text>
          <Text variant="caption" numeric="tabular" tone="muted">
            KDA {((row.kills + row.assists) / Math.max(1, row.deaths)).toFixed(2)}
          </Text>
        </Inline>
      </CardContent>
    </Card>
  );
}

/** The main and the rest of the pool: matches, win rate and KDA of the most played heroes. */
export function HeroesChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { format } = useRecapTime();
  const [top] = main.heroes;
  const { hero } = useHeroById(top?.hero_id ?? 0);
  if (!top) return null;
  const share = top.matches / Math.max(1, main.totals.matches);
  const pool = main.heroes.length;
  const best = bestWinRateHero(main.heroes);
  const newest = main.heroes.reduce((latest, row) => (row.first_played > latest.first_played ? row : latest), top);
  const oneTrick = share >= 0.5;
  return (
    <StoryChapter
      id={id}
      eyebrow="Heroes"
      // The hero's own color tints the chapter: a data color, passed to the prop built for it.
      accent={heroAccent(hero)}
      title={
        <>
          {oneTrick ? "One hero to rule them all: " : "Your main: "}
          <HeroName heroId={top.hero_id} />
        </>
      }
      description={
        pool === 1
          ? "One hero, all year. That is commitment."
          : `You played ${pool} different heroes, but ${hero?.name ?? "one"} got the most of your time.`
      }
    >
      <StoryFigure
        value={count(top.matches)}
        unit={plural(top.matches, "match", "matches")}
        caption={`${formatPercent(share)} of your games, ${formatPercent(top.wins / top.matches)} of them won.`}
      />
      <Grid columns={{ base: 1, md: 3, lg: 5 }} gap={3}>
        {main.heroes.slice(0, SHOWN).map((row, index) => (
          <TopHeroCard key={row.hero_id} rank={index + 1} row={row} />
        ))}
      </Grid>
      <StatGroup size="sm" overflow="wrap" className="grid-cols-1 @md/story:grid-cols-3">
        <Stat label="Heroes played" value={count(pool)} sub={pool >= 20 ? "A true flex player" : "A focused pool"} />
        {best && (
          <Stat
            label="Best win rate"
            value={<HeroCell heroId={best.hero_id} size="sm" className="inline-flex max-w-full" />}
            sub={`${formatPercent(best.wins / best.matches)} in ${count(best.matches)} matches`}
          />
        )}
        {!best && <Stat label="Best win rate" value={null} sub={`No hero with ${MIN_SAMPLE}+ matches yet`} />}
        <Stat
          label="Newest pick"
          value={<HeroCell heroId={newest.hero_id} size="sm" className="inline-flex max-w-full" />}
          sub={`First played on ${format(newest.first_played, "MMMM D")}`}
        />
      </StatGroup>
    </StoryChapter>
  );
}
