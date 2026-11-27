import { Fragment } from "react";

import { StoryDeck, StoryProgress, StoryProgressItem } from "~/components/patterns/story/Story";
import { useActiveAnchor } from "~/components/ui/hooks/use-active-anchor";
import { chapterAnchor, type RecapChapterId, recapChapters } from "~/lib/year-recap/chapters";
import { brawlMode, mainMode } from "~/lib/year-recap/recap";
import type { YearRecap } from "~/lib/year-recap/types";

import { BrawlChapter, OutroChapter, ShareChapter } from "./RecapClosing";
import { RecordsChapter, CombatChapter, StyleChapter } from "./RecapCombat";
import { ShopChapter, SoulsChapter } from "./RecapEconomy";
import { FriendsChapter, useRecapFriends } from "./RecapFriends";
import { HeroesChapter } from "./RecapHeroes";
import { GamesChapter, IntroChapter } from "./RecapOpening";
import { RankChapter } from "./RecapRank";
import { RivalsChapter } from "./RecapRivals";
import { SidesChapter } from "./RecapSides";
import { SurvivalChapter, TeamworkChapter } from "./RecapSurvival";
import { TimeChapter } from "./RecapTime";

/** The whole recap: every chapter the player has data for, in order, with the chapter index beside it on wide screens. */
export function RecapStory({ recap }: { recap: YearRecap }) {
  const friends = useRecapFriends(recap);
  const chapters = recapChapters(recap, { hasFriends: friends.topMates.length > 0 || friends.rival != null });
  const active = useActiveAnchor(chapters.map((chapter) => chapterAnchor(chapter.id)));
  const main = mainMode(recap);
  const brawl = brawlMode(recap);
  if (!main) return null;

  const render = (id: RecapChapterId) => {
    const anchor = chapterAnchor(id);
    switch (id) {
      case "intro":
        return <IntroChapter id={anchor} recap={recap} />;
      case "games":
        return <GamesChapter id={anchor} recap={recap} main={main} />;
      case "time":
        return <TimeChapter id={anchor} recap={recap} />;
      case "rank":
        return main.rank ? <RankChapter id={anchor} recap={recap} rank={main.rank} /> : null;
      case "heroes":
        return <HeroesChapter id={anchor} main={main} />;
      case "combat":
        return <CombatChapter id={anchor} main={main} />;
      case "records":
        return <RecordsChapter id={anchor} main={main} />;
      case "style":
        return <StyleChapter id={anchor} main={main} />;
      case "rivals":
        return <RivalsChapter id={anchor} main={main} />;
      case "souls":
        return <SoulsChapter id={anchor} main={main} />;
      case "survival":
        return <SurvivalChapter id={anchor} main={main} />;
      case "teamwork":
        return <TeamworkChapter id={anchor} main={main} />;
      case "sides":
        return <SidesChapter id={anchor} main={main} />;
      case "shop":
        return <ShopChapter id={anchor} main={main} />;
      case "friends":
        return <FriendsChapter id={anchor} recap={recap} />;
      case "brawl":
        return brawl ? <BrawlChapter id={anchor} brawl={brawl} /> : null;
      case "outro":
        return <OutroChapter id={anchor} recap={recap} main={main} />;
      case "share":
        return <ShareChapter id={anchor} recap={recap} main={main} />;
    }
  };

  return (
    <StoryDeck
      layout="deck"
      progress={
        <StoryProgress label={`Chapters of your ${recap.year}`}>
          {chapters.map((chapter) => (
            <StoryProgressItem
              key={chapter.id}
              href={`#${chapterAnchor(chapter.id)}`}
              current={active === chapterAnchor(chapter.id)}
            >
              {chapter.label}
            </StoryProgressItem>
          ))}
        </StoryProgress>
      }
    >
      {chapters.map((chapter) => (
        <Fragment key={chapter.id}>{render(chapter.id)}</Fragment>
      ))}
    </StoryDeck>
  );
}
