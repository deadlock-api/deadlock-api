import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";

import { GamePage } from "~/components/domain/minigames/GamePage";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { GuessTheRankGame } from "~/components/features/guess-the-rank/GuessTheRankGame";
import { day } from "~/dayjs";
import { getTodayDate } from "~/lib/daily-seed";
import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";
import { guessDayNumber, resolveGuessDate, validateGuessDateSearch } from "~/lib/guess-the-rank/daily";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/games_/guess-the-rank")({
  component: GuessTheRank,
  validateSearch: validateGuessDateSearch,
  head: () => {
    const head = seo({
      title: pageTitle("Guess the Rank - Daily Deadlock Rank Guessing Game"),
      description:
        "Watch three Deadlock gameplay clips a day and guess each player's rank, from the lowest tier to the highest. Then see how everyone else guessed.",
      path: "/games/guess-the-rank",
    });
    return { ...head, links: [...head.links, NEW_ROCKER_PRELOAD] };
  },
});

function GuessTheRank() {
  const { date: dateParam } = Route.useSearch();
  const date = resolveGuessDate(dateParam);
  const isArchive = date !== getTodayDate();

  return (
    <MotionConfig reducedMotion="user">
      <GamePage
        title="Guess the Rank"
        subtitle="Three clips a day. Watch each player, then guess their rank."
        badge={
          isArchive && (
            <TerminalBadge variant="warning" size="sm">
              Archive · Day {guessDayNumber(date)} · {day(date).format("MMM D, YYYY")}
            </TerminalBadge>
          )
        }
      >
        <GuessTheRankGame date={dateParam} />
      </GamePage>
    </MotionConfig>
  );
}
