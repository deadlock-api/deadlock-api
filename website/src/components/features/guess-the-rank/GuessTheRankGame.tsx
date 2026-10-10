import type { Rank } from "deadlock_api_client";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScoreSummary } from "~/components/domain/minigames/ScoreSummary";
import { ShareButton } from "~/components/domain/minigames/ShareButton";
import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { rankTierLook } from "~/components/domain/rank/RankTierWinRateChart";
import { Section } from "~/components/patterns/page/Section";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Heading } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { StepMeter, StepMeterStep } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";
import { Video } from "~/components/ui/video";
import { useCountdown } from "~/lib/deadlockdle/use-countdown";
import type { DailyRound } from "~/lib/guess-the-rank/daily";
import {
  guessableTiers,
  guessShareText,
  MAX_ROUND_POINTS,
  roundPoints,
  scoreGrade,
  tierOfBadge,
} from "~/lib/guess-the-rank/scoring";

import { type ClipPhase, trackGuessTheRank, useClipAnalytics } from "./analytics";
import { GuessTheRankFeedbackNotice } from "./GuessTheRankFeedbackNotice";
import { RankPicker, type RankTier } from "./RankPicker";
import { RoundReveal } from "./RoundReveal";
import { type GuessedRound, useGuessTheRank } from "./use-guess-the-rank";

const RULES =
  "Watch the clip as often as you like, then pick the player's rank. The right tier scores 3 points, one tier off 2, " +
  "two tiers off 1.";

/** A round's clip: seek and replay freely, before and after the guess. */
function RoundClip({
  round,
  total,
  ...handlers
}: { round: DailyRound; total: number } & ReturnType<typeof useClipAnalytics>["handlers"]) {
  return (
    <Video
      src={round.videoUrl}
      poster={round.posterUrl ?? undefined}
      aria-label={`Clip ${round.round + 1} of ${total}`}
      {...handlers}
    />
  );
}

/** A clip on the day's results, still playable, its watching tracked as such. */
function SummaryClip({
  date,
  round,
  total,
  phase,
}: {
  date: string;
  round: DailyRound;
  total: number;
  phase: ClipPhase;
}) {
  const { handlers } = useClipAnalytics({ date, round: round.round, video_id: round.videoId }, phase);
  return <RoundClip round={round} total={total} {...handlers} />;
}

/** One round: the clip, which stays playable throughout, the rank picker and, once guessed, the answer. */
function RoundView({
  date,
  round,
  total,
  guessed,
  tiers,
  ranks,
  game,
  onActivity,
}: {
  date: string;
  round: DailyRound;
  total: number;
  guessed: GuessedRound | null;
  tiers: readonly RankTier[];
  ranks: readonly Rank[];
  game: ReturnType<typeof useGuessTheRank>;
  /** The round got under way: its clip played or a tier was picked. */
  onActivity: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const isLast = round.round === total - 1;
  const clip = useClipAnalytics(
    { date, round: round.round, video_id: round.videoId },
    guessed ? "after_guess" : "before_guess",
  );
  const startedAt = useRef<number | null>(null);
  const tierChanges = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const focusNext = useCallback((element: HTMLButtonElement | null) => element?.focus({ preventScroll: true }), []);

  return (
    <Stack gap={5}>
      <RoundClip
        round={round}
        total={total}
        {...clip.handlers}
        onPlay={(event) => {
          onActivity();
          clip.handlers.onPlay(event);
        }}
      />

      {guessed ? (
        <>
          <RankPicker
            tiers={tiers}
            value={guessed.guess}
            onValueChange={() => {}}
            answer={tierOfBadge(guessed.badge)}
          />
          <RoundReveal date={date} round={round} guessed={guessed} ranks={ranks} tiers={tiers} />
          <div className="flex justify-center">
            <TerminalButton ref={focusNext} variant="soft" size="touch" onClick={game.advance}>
              {isLast ? "See results" : "Next clip"}
            </TerminalButton>
          </div>
        </>
      ) : (
        <Stack gap={3}>
          <Heading as="h2" size="sm" className="font-mono uppercase">
            What rank is this player?
          </Heading>
          <Text variant="caption" tone="muted">
            {RULES}
          </Text>
          <RankPicker
            tiers={tiers}
            value={selected}
            onValueChange={(tier) => {
              if (tier === selected) return;
              tierChanges.current += 1;
              trackGuessTheRank("tier_selected", {
                date,
                round: round.round,
                video_id: round.videoId,
                tier,
                previous_tier: selected,
                change: tierChanges.current,
              });
              setSelected(tier);
              onActivity();
              game.resetSubmitError();
            }}
            disabled={game.submitting}
          />
          {game.submitError && (
            <ErrorState
              variant="inline"
              title="Your guess did not go through"
              description="Nothing was counted. Try again."
            />
          )}
          <div className="flex justify-center">
            <TerminalButton
              variant="soft"
              size="touch"
              disabled={selected === null}
              loading={game.submitting}
              loadingLabel="Sending your guess"
              onClick={() => {
                if (selected === null) return;
                game.guess(selected, {
                  ...clip.stats(),
                  ms_since_round_start: startedAt.current === null ? 0 : Date.now() - startedAt.current,
                  tier_changes: tierChanges.current,
                });
              }}
            >
              Lock in guess
            </TerminalButton>
          </div>
        </Stack>
      )}
    </Stack>
  );
}

function DaySummary({
  date,
  isArchive,
  rounds,
  guessed,
  tiers,
  ranks,
}: {
  date: string;
  isArchive: boolean;
  rounds: readonly DailyRound[];
  guessed: readonly GuessedRound[];
  tiers: readonly RankTier[];
  ranks: readonly Rank[];
}) {
  const countdown = useCountdown(date);
  const scored = guessed.map((entry) => ({ guess: entry.guess, actual: tierOfBadge(entry.badge) }));
  const points = scored.reduce((sum, { guess, actual }) => sum + roundPoints(guess, actual), 0);
  const max = scored.length * MAX_ROUND_POINTS;
  const grade = scoreGrade(points, max);

  return (
    <Stack gap={6}>
      <ScoreSummary
        score={`${points}/${max}`}
        scoreLabel={grade === "good" ? "Rank Reader" : grade === "fair" ? "Not Bad" : "Keep Watching"}
        grade={grade}
        countdown={isArchive ? undefined : { label: "Next clips", value: countdown ?? "Out now" }}
      />
      <div className="flex flex-col items-center gap-2">
        <ShareButton
          text={guessShareText(date, scored)}
          onClick={() =>
            trackGuessTheRank("share_clicked", { date, is_archive: isArchive, total_points: points, max_points: max })
          }
        >
          Share result
        </ShareButton>
        {!isArchive && (
          <Text variant="caption" tone="muted" align="center">
            Come back tomorrow for three new clips.
          </Text>
        )}
      </div>
      {rounds.map((round, i) => (
        <Section key={round.videoId} title={`Clip ${i + 1}`} size="sm">
          <Stack gap={4}>
            <SummaryClip date={date} round={round} total={rounds.length} phase="summary" />
            <RoundReveal date={date} round={round} guessed={guessed[i]} ranks={ranks} tiers={tiers} />
          </Stack>
        </Section>
      ))}
    </Stack>
  );
}

/** Guess the Rank: three clips a day, the same for everyone; guess each player's rank, then see how everyone guessed. */
export function GuessTheRankGame({ date: dateParam }: { date?: string }) {
  const game = useGuessTheRank(dateParam);
  const { roundsQuery, ranksQuery, rounds, guessed, shownRound, date } = game;
  const ranks = ranksQuery.data;
  const tiers = useMemo(() => {
    if (!ranks) return [];
    const byTier = new Map(ranks.map((rank) => [rank.tier, rank]));
    return guessableTiers(ranks).map((tier) => rankTierLook(tier, byTier.get(tier)));
  }, [ranks]);

  // One view per day and page load, once the page knows what it holds: how many clips, how far this visitor got.
  const viewed = useRef<string | null>(null);
  const ready = roundsQuery.isSuccess && game.loaded;
  useEffect(() => {
    if (!ready || viewed.current === date) return;
    viewed.current = date;
    const played = guessed.filter((entry) => entry !== null).length;
    trackGuessTheRank("game_viewed", {
      date,
      is_archive: game.isArchive,
      rounds_available: rounds.length,
      rounds_already_played: played,
    });
    if (game.isArchive) trackGuessTheRank("archive_opened", { date, rounds_available: rounds.length });
  }, [ready, date, guessed, rounds.length, game.isArchive]);
  useEffect(() => {
    if (roundsQuery.isError)
      trackGuessTheRank("error", { date, kind: "rounds_load", message: roundsQuery.error.message });
  }, [roundsQuery.isError, roundsQuery.error, date]);

  // The feedback notice waits for a pause: never while a clip of an unguessed round is being watched or its tier
  // picked. A fresh round counts as a pause until it gets under way, so a first visit still sees it right away.
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const current = shownRound === null ? null : rounds[shownRound];
  const midRound = current != null && !guessed[current.round] && activeVideo === current.videoId;
  const notice = <GuessTheRankFeedbackNotice ready={ready && !midRound} />;

  if (roundsQuery.isError || ranksQuery.isError) {
    return (
      <ErrorState
        title="Could not load today's clips"
        description="Your progress is saved. Try loading the clips again."
        retrying={roundsQuery.isFetching || ranksQuery.isFetching}
        onRetry={() => {
          if (roundsQuery.isError) void roundsQuery.refetch();
          if (ranksQuery.isError) void ranksQuery.refetch();
        }}
      />
    );
  }
  if (roundsQuery.isPending || !ranks || !game.loaded) return <LoadingState label="clips" />;
  if (rounds.length === 0) {
    return (
      <>
        {notice}
        <EmptyState
          icon={Clapperboard}
          title="No clips for this day yet"
          description="No clips are scheduled for this day yet. Check back tomorrow."
        />
      </>
    );
  }

  const shown = current;

  return (
    <Stack gap={5}>
      {notice}
      <StepMeter label={`Clip ${(shownRound ?? rounds.length - 1) + 1} of ${rounds.length}`} className="justify-center">
        {rounds.map((round, i) => {
          const entry = guessed[i];
          const state = i === shownRound && !game.revealing ? "current" : entry ? "done" : "empty";
          return <StepMeterStep key={round.videoId} state={state} />;
        })}
      </StepMeter>

      <AnimatePresence mode="wait">
        <motion.div
          key={shown ? shown.videoId : "results"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {shown ? (
            <RoundView
              date={date}
              round={shown}
              total={rounds.length}
              guessed={guessed[shown.round]}
              tiers={tiers}
              ranks={ranks}
              game={game}
              onActivity={() => setActiveVideo(shown.videoId)}
            />
          ) : (
            <DaySummary
              date={date}
              isArchive={game.isArchive}
              rounds={rounds}
              guessed={guessed.filter((entry): entry is GuessedRound => entry !== null)}
              tiers={tiers}
              ranks={ranks}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Stack>
  );
}
