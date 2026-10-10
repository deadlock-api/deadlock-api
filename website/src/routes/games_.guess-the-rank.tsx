import { createFileRoute, Link } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";

import { GamePage } from "~/components/domain/minigames/GamePage";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { GuessTheRankGame } from "~/components/features/guess-the-rank/GuessTheRankGame";
import { Section } from "~/components/patterns/page/Section";
import { Stack } from "~/components/ui/stack";
import { TextLink } from "~/components/ui/text-link";
import { day } from "~/dayjs";
import { getTodayDate } from "~/lib/daily-seed";
import { NEW_ROCKER_PRELOAD } from "~/lib/fonts";
import { guessDayNumber, resolveGuessDate, validateGuessDateSearch } from "~/lib/guess-the-rank/daily";
import { ORGANIZATION, pageTitle, SITE_URL, seo } from "~/lib/seo";

export const Route = createFileRoute("/games_/guess-the-rank")({
  component: GuessTheRank,
  validateSearch: validateGuessDateSearch,
  head: () => {
    // An archive day (?date=) is the same page: its canonical is the game itself, as with Deadlockdle.
    const head = seo({
      title: pageTitle("Guess the Rank: Daily Deadlock Rank Guessing Game"),
      description:
        "Can you tell a Deadlock player's rank from their gameplay? Three new clips every day: guess each rank, then " +
        "see how the community guessed.",
      path: "/games/guess-the-rank",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Guess the Rank",
        description:
          "A daily Deadlock game: watch gameplay clips, guess each player's rank, and compare your guess with the community's.",
        url: `${SITE_URL}/games/guess-the-rank`,
        image: `${SITE_URL}/og/v2/guess-the-rank.png`,
        applicationCategory: "GameApplication",
        genre: "Quiz",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        creator: ORGANIZATION,
      },
    });
    return { ...head, links: [...head.links, NEW_ROCKER_PRELOAD] };
  },
});

/** The rules as plain, server-rendered text under the game: what search engines and screen readers read first. */
function HowToPlay() {
  return (
    <Section title="How to play Guess the Rank" size="sm">
      <Stack gap={3} className="max-w-prose text-sm text-muted-foreground">
        <p>
          Every day brings three new clips from real ranked Deadlock matches, the same for every player. Watch each one
          as often as you like, skip around in it, then guess which rank tier the player was in when the match started.
        </p>
        <p>
          A guess of the right tier scores 3 points, one tier off scores 2 and two tiers off scores 1, for up to 9
          points a day. After each guess you see the player's actual rank and how everyone else guessed. Guesses are
          anonymous and count once per clip.
        </p>
        <p>
          To see how players are spread over the ranks, look at the{" "}
          <TextLink asChild>
            <Link to="/community/badge-distribution">rank distribution</Link>
          </TextLink>
          . For more daily puzzles, play{" "}
          <TextLink asChild>
            <Link to="/games/deadlockdle">Deadlockdle</Link>
          </TextLink>
          .
        </p>
      </Stack>
    </Section>
  );
}

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
        <HowToPlay />
      </GamePage>
    </MotionConfig>
  );
}
