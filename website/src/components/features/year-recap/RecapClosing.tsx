import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUp, UserSearch } from "lucide-react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Inline } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { formatPercent } from "~/lib/format";
import { badgeLabel } from "~/lib/rank-utils";
import { kda, ratio, yearTotals } from "~/lib/year-recap/recap";
import type { ModeRecap, YearRecap } from "~/lib/year-recap/types";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { RecapShare } from "./RecapShare";
import { compact, count, FigureArt, hours } from "./shared";

/** Street Brawl as its own short chapter, when the player also played normal matches. */
export function BrawlChapter({ id, brawl }: { id: string; brawl: ModeRecap }) {
  const { totals } = brawl;
  const winRate = ratio(totals.wins, totals.matches) ?? 0;
  const [top] = brawl.heroes;
  return (
    <StoryChapter
      id={id}
      eyebrow="Street Brawl"
      title={winRate >= 0.5 ? "Brawler by night" : "Just here for the chaos"}
      description={`${count(totals.matches)} rounds of the short and loud mode, ${hours(totals.seconds_played)} hours of it.`}
    >
      <FigureArt
        art={
          top && <HeroImage heroId={top.hero_id} art="portrait" decorative shape="rounded" className="w-16 shrink-0" />
        }
      >
        <StoryFigure
          value={formatPercent(winRate)}
          unit="won"
          caption={`${count(totals.wins)} wins in ${count(totals.matches)} matches.`}
        />
      </FigureArt>
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        <Stat label="Kills" value={count(totals.kills)} />
        <Stat label="KDA" value={kda(totals).toFixed(2)} />
        <Stat label="Hero damage" value={compact(totals.player_damage)} />
        {brawl.streaks.longest_win.length > 1 && (
          <Stat label="Win streak" value={`${brawl.streaks.longest_win.length} wins`} tone="positive" />
        )}
        {top && (
          <Stat
            label="Favourite brawler"
            value={<HeroCell heroId={top.hero_id} size="sm" className="inline-flex max-w-full" />}
            sub={`${count(top.matches)} matches, ${formatPercent(top.wins / top.matches)} won`}
          />
        )}
      </StatGroup>
    </StoryChapter>
  );
}

/** The closing card: the headline numbers on one surface, made to screenshot. */
export function OutroChapter({ id, recap, main }: { id: string; recap: YearRecap; main: ModeRecap }) {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const totals = yearTotals(recap);
  const winRate = ratio(totals.wins, totals.matches) ?? 0;
  const [top] = main.heroes;
  return (
    <StoryChapter
      id={id}
      size="cover"
      align="center"
      eyebrow={`Year in Deadlock ${recap.year}`}
      title={`That was your ${recap.year}`}
      description={`See you in the Cursed Apple in ${recap.year + 1}.`}
    >
      <Card tone="primary" className="w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-6">
          {top && <HeroImage heroId={top.hero_id} art="portrait" decorative shape="rounded" className="w-24" />}
          <StoryFigure
            align="center"
            size="sm"
            value={count(totals.matches)}
            unit="matches"
            caption={`${hours(totals.seconds)} hours, ${formatPercent(winRate)} won`}
          />
          <StatGroup variant="plain" overflow="wrap" className="w-full grid-cols-2 @md/story:grid-cols-4">
            <Stat
              align="center"
              label="Main"
              value={top ? <HeroName heroId={top.hero_id} className="whitespace-normal" /> : null}
            />
            <Stat align="center" label="Kills" value={compact(main.totals.kills)} />
            <Stat align="center" label="KDA" value={kda(main.totals).toFixed(2)} />
            <Stat
              align="center"
              label="Peak rank"
              value={
                main.rank ? (
                  <Inline gap={1.5} wrap="nowrap" justify="center">
                    <BadgeImage badge={main.rank.peak_badge} ranks={ranks ?? []} size="inline" alt="" />
                    {badgeLabel(ranks, main.rank.peak_badge)}
                  </Inline>
                ) : null
              }
            />
          </StatGroup>
        </CardContent>
      </Card>
      <Inline gap={2} justify="center">
        <Button asChild>
          <Link to="/tracker/players/$accountId" params={{ accountId: String(recap.account_id) }}>
            <UserSearch aria-hidden="true" />
            Open the player tracker
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href="#recap-intro">
            <ArrowUp aria-hidden="true" />
            Back to the top
          </a>
        </Button>
      </Inline>
    </StoryChapter>
  );
}

/** The last card: the share image of the year in three sizes, with what this browser can do with it. */
export function ShareChapter({ id, recap, main }: { id: string; recap: YearRecap; main: ModeRecap }) {
  return (
    <StoryChapter
      id={id}
      align="center"
      eyebrow="Share"
      title="Show off your year"
      description="A picture of your year for a story, a post or a chat."
    >
      <RecapShare recap={recap} main={main} />
    </StoryChapter>
  );
}
