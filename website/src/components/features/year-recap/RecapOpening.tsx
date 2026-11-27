import { useQuery } from "@tanstack/react-query";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import { formatClock } from "~/lib/stat-format";
import { toneOf } from "~/lib/tone";
import { mainMode, ratio, roughCount, timeComparison, yearTotals } from "~/lib/year-recap/recap";
import type { ModeRecap, YearRecap } from "~/lib/year-recap/types";
import { steamProfileQueryOptions } from "~/queries/steam-queries";

import { count, hours, plural, useRecapTime } from "./shared";

const INTRO_HEROES = 5;

/** [1, 2, 3, 4, 5] as [4, 2, 1, 3, 5]: the first in the middle, the next ones alternating outwards. */
function centreFirst<T>(rows: readonly T[]): T[] {
  const line: T[] = [];
  for (const [index, row] of rows.entries()) {
    if (index % 2 === 1) line.unshift(row);
    else line.push(row);
  }
  return line;
}

/** The cover: who this is about and the year in one line. Holds the page's h1. */
export function IntroChapter({ id, recap }: { id: string; recap: YearRecap }) {
  const { data: profile, isLoading } = useQuery(steamProfileQueryOptions(recap.account_id));
  const totals = yearTotals(recap);
  const heroes = new Set(recap.matches.map((match) => match.hero_id)).size;
  const topHeroes = (mainMode(recap)?.heroes ?? []).slice(0, INTRO_HEROES);
  return (
    <StoryChapter
      id={id}
      as="h1"
      size="cover"
      align="center"
      eyebrow={`Year in Deadlock ${recap.year}`}
      title={`Your ${recap.year} in Deadlock`}
      description={`${count(totals.matches)} ${plural(totals.matches, "match", "matches")}, ${heroes} ${plural(heroes, "hero", "heroes")} and ${hours(totals.seconds)} hours. Here is how your year went.`}
    >
      <Stack align="center" gap={2}>
        <SteamAvatar src={profile?.avatarfull ?? profile?.avatar} loading={isLoading} size="lg" shape="rounded" />
        <Text variant="label">{profile?.personaname ?? `Player ${recap.account_id}`}</Text>
      </Stack>
      {topHeroes.length > 0 && (
        // The heroes of the year on their cards, the main in the middle and tallest. Each is named by its alt text: the
        // lead above counts them but does not name them.
        <Inline gap={2} wrap="nowrap" align="end" justify="center">
          {centreFirst(topHeroes).map((row) => (
            <HeroImage
              key={row.hero_id}
              heroId={row.hero_id}
              art="portrait"
              shape="rounded"
              className={
                row === topHeroes[0]
                  ? "w-20 @2xl/story:w-32"
                  : row === topHeroes[1] || row === topHeroes[2]
                    ? "w-14 @2xl/story:w-24"
                    : "hidden w-16 @md/story:block @2xl/story:w-20"
              }
            />
          ))}
        </Inline>
      )}
    </StoryChapter>
  );
}

/** How much they played: hours as the big number, matches, wins and streaks around it. */
export function GamesChapter({ id, recap, main }: { id: string; recap: YearRecap; main: ModeRecap }) {
  const { format } = useRecapTime();
  const totals = yearTotals(recap);
  const winRate = ratio(totals.wins, totals.matches) ?? 0;
  const comparison = timeComparison(totals.seconds);
  const ranked = main.by_match_mode.find((mode) => mode.match_mode === "ranked");
  const { longest_win: winStreak, longest_loss: lossStreak } = main.streaks;
  const few = totals.matches < 20;
  return (
    <StoryChapter
      id={id}
      eyebrow="Games played"
      title={few ? "Quality over quantity" : `${count(totals.matches)} matches later`}
      description={
        few
          ? `Just ${count(totals.matches)} ${plural(totals.matches, "match", "matches")} this year. Every one of them counted.`
          : winRate >= 0.5
            ? `More wins than losses: ${count(totals.wins)} of them went your way.`
            : `${count(totals.wins)} wins, and every loss was a lesson.`
      }
    >
      <StoryFigure
        size="lg"
        value={hours(totals.seconds)}
        unit="hours played"
        caption={
          comparison.unit === "minutes"
            ? `That is ${roughCount(comparison.count)} minutes in the Cursed Apple.`
            : `That is ${roughCount(comparison.count)} ${comparison.unit}.`
        }
      />
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        <Stat label="Wins" value={count(totals.wins)} sub={`of ${count(totals.matches)} matches`} />
        <Stat
          label="Win rate"
          value={formatPercent(winRate)}
          tone={toneOf(winRate, 0.5)}
          sub={winRate >= 0.5 ? "above even" : "below even"}
        />
        <Stat
          label="Ranked matches"
          value={count(ranked?.matches ?? 0)}
          sub={ranked && ranked.matches > 0 ? `${formatPercent(ranked.wins / ranked.matches)} won` : "none this year"}
        />
        <Stat label="Average match" value={formatClock(totals.seconds / Math.max(1, totals.matches))} sub="minutes" />
        {winStreak.length > 1 && (
          <Stat
            label="Win streak"
            value={`${winStreak.length} wins`}
            tone="positive"
            sub={`${format(winStreak.from, "MMM D")} to ${format(winStreak.to, "MMM D")}`}
          />
        )}
        {lossStreak.length > 1 && (
          <Stat
            label="Losing streak"
            value={`${lossStreak.length} losses`}
            tone="negative"
            sub={
              lossStreak.length >= 8
                ? "We don't talk about it"
                : `${format(lossStreak.from, "MMM D")} to ${format(lossStreak.to, "MMM D")}`
            }
          />
        )}
      </StatGroup>
    </StoryChapter>
  );
}
