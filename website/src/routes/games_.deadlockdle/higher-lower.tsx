import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AssetImage } from "~/components/domain/assets/AssetImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import {
  Versus,
  VersusActions,
  VersusArt,
  versusArtImageVariants,
  VersusChoice,
  VersusDivider,
  VersusName,
  VersusSide,
  VersusSubject,
  VersusValue,
} from "~/components/domain/minigames/Versus";
import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { NextGameButton } from "~/components/features/deadlockdle/NextGameButton";
import { ScoreSummary } from "~/components/features/deadlockdle/ScoreSummary";
import { ShareButton } from "~/components/features/deadlockdle/ShareButton";
import { useGuessFeedback } from "~/components/features/deadlockdle/use-guess-feedback";
import { Card, CardContent } from "~/components/ui/card";
import { Inline, Stack } from "~/components/ui/stack";
import { StepMeter, StepMeterStep } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import {
  bestStreak,
  CATEGORY_LABEL,
  type Contender,
  correctGuess,
  currentStreak,
  formatValue,
  type Guess,
  type HigherLowerRound,
  revealSentence,
  ROUND_COUNT,
  shareGrid,
  type StatSource,
  STATS_RANKS,
  statsDateRange,
  statsWindowLabel,
} from "~/lib/deadlockdle/higher-lower";
import { puzzleLoadError, useHigherLowerRounds } from "~/lib/deadlockdle/queries";
import {
  getDayNumber,
  getTodayDate,
  puzzleShareUrl,
  resolvePuzzleDate,
  validatePuzzleDateSearch,
} from "~/lib/deadlockdle/seed";
import { gameStorageKey } from "~/lib/deadlockdle/storage";
import { useCountdown } from "~/lib/deadlockdle/use-countdown";
import { useResultsRef } from "~/lib/deadlockdle/use-results-ref";
import { isTyping } from "~/lib/keyboard";
import { pageTitle, seo } from "~/lib/seo";
import { useStoredDailyState } from "~/lib/use-stored-state";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/games_/deadlockdle/higher-lower")({
  component: HigherLower,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: pageTitle("Higher or Lower - Deadlockdle"),
      description:
        "Ten daily higher-or-lower rounds built from real Deadlock match data: hero win rates, matchups, the soul economy and ability order.",
      path: "/games/deadlockdle/higher-lower",
    }),
});

const TITLE = "Higher or Lower";

function subtitleFor(date: string): string {
  return `Is the hidden stat higher or lower? ${ROUND_COUNT} rounds, stats from ${statsWindowLabel(date)}, all ranks.`;
}

interface HigherLowerState {
  date: string;
  currentQuestion: number;
  answers: (Guess | null)[];
  score: number;
  completed: boolean;
}

function freshState(date: string): HigherLowerState {
  return {
    date,
    currentQuestion: 0,
    answers: Array.from<null>({ length: ROUND_COUNT }).fill(null),
    score: 0,
    completed: false,
  };
}

interface Choice {
  guess: Guess;
  label: string;
  icon?: LucideIcon;
  key: string;
}

/** The two answers of a round: higher or lower, or, head to head, the hero who wins (left is "lower", right "higher"). */
function choicesFor(round: HigherLowerRound): Choice[] {
  if (round.kind === "head-to-head") {
    return [
      { guess: "lower", label: `${round.left.name} wins`, key: "1" },
      { guess: "higher", label: `${round.right.name} wins`, key: "2" },
    ];
  }
  return [
    { guess: "lower", label: "Lower", icon: ArrowDown, key: "L" },
    { guess: "higher", label: "Higher", icon: ArrowUp, key: "H" },
  ];
}

const GAME_ICONS = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

/** The game's own art for each soul source: HUD and minimap icons from the assets API. */
const SOURCE_ICON: Record<string, string> = {
  "Hero kills": `${GAME_ICONS}/hud/icons/skull.svg`,
  "Lane troopers": `${GAME_ICONS}/icons/icon_lanes.svg`,
  "Jungle neutrals": `${GAME_ICONS}/minimap/neutral_large_psd.png`,
  Objectives: `${GAME_ICONS}/minimap/objective_icon_t2.svg`,
  Urn: `${GAME_ICONS}/minimap/soul_jar_marker_psd.png`,
};

function ContenderArt({ contender }: { contender: Contender }) {
  if (contender.kind === "hero") {
    return <HeroImage heroId={contender.heroId} title="" className={versusArtImageVariants()} />;
  }
  if (contender.kind === "ability") {
    return <AbilityImage abilityId={contender.abilityId} title="" className={versusArtImageVariants()} />;
  }
  const src = SOURCE_ICON[contender.name];
  return (
    <AssetImage
      asset={src ? { png: src, alt: "" } : undefined}
      className={versusArtImageVariants({ fit: "icon" })}
      draggable={false}
    />
  );
}

/**
 * A link to the analytics page a round's numbers come from, in a new tab so the run stays open. Its filters are the
 * page's own, so the numbers there can differ a little from the round's fixed week. `plain` is the bare anchor, for a
 * TextLink around it.
 */
function StatSourceLink({
  source,
  date,
  variant = "button",
  children,
  ...props
}: Omit<React.ComponentProps<"a">, "href" | "target" | "rel"> & {
  source: StatSource;
  /** The puzzle day, whose stats window and filters the page opens with. */
  date: string;
  variant?: "button" | "plain";
}) {
  const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;
  // The filters the round's numbers were queried with: the day's window, every rank, all matchups.
  const filters = { date_range: statsDateRange(date), min_rank: STATS_RANKS.min, max_rank: STATS_RANKS.max };
  const link =
    source.page === "matchup" ? (
      <Link
        to="/analytics/heroes/matchup-details"
        search={{ ...filters, hero_id: source.heroId, same_lane: false }}
        {...newTab}
        {...props}
      >
        {children}
      </Link>
    ) : source.page === "abilities" ? (
      <Link
        to="/analytics/abilities"
        search={{ ...filters, hero_id: source.heroId, min_matches: 20 }}
        {...newTab}
        {...props}
      >
        {children}
      </Link>
    ) : (
      <Link to={SOURCE_PATH[source.page]} search={filters} {...newTab} {...props}>
        {children}
      </Link>
    );
  if (variant === "plain") return link;
  return (
    <TerminalButton asChild variant="subtle" size="touch">
      {link}
    </TerminalButton>
  );
}

const SOURCE_PATH = {
  "hero-stats": "/analytics/heroes",
  "hero-scoreboard": "/analytics/heroes/scoreboard",
  economy: "/analytics/games/economy",
} as const;

/** Head to head, which side a guess names: the left hero is "lower", the right one "higher". */
function guessOf(side: 0 | 1): Guess {
  return side === 0 ? "lower" : "higher";
}

/** What the player answered and what was right, for the results list: "You: Higher · Answer: Lower". */
function answerCaption(round: HigherLowerRound, guess: Guess | null): string {
  const correct = correctGuess(round);
  if (round.kind === "head-to-head") {
    const name = (g: Guess) => (g === "higher" ? round.right.name : round.left.name);
    return `You: ${guess ? name(guess) : "no answer"} · Winner: ${name(correct)}`;
  }
  const word = (g: Guess) => (g === "higher" ? "Higher" : "Lower");
  return `You: ${guess ? word(guess) : "no answer"} · Answer: ${word(correct)}`;
}

function scoreLabel(score: number): string {
  if (score >= 8) return "Analyst";
  if (score >= 5) return "Solid read";
  return "Keep playing";
}

function HigherLower() {
  const { date: dateParam } = Route.useSearch();
  const date = resolvePuzzleDate(dateParam);
  const subtitle = subtitleFor(date);
  const isArchive = date !== getTodayDate();
  const countdown = useCountdown(date);
  const { rounds, queries, isLoading } = useHigherLowerRounds(date);

  const [state, saveState] = useStoredDailyState(gameStorageKey("higher-lower", date), date, freshState);
  // The round just answered, shown with its values until "Next round"; the stored state has already moved on.
  const [revealing, setRevealing] = useState<number | null>(null);
  const isRevealed = revealing !== null;
  const [feedbackType, showFeedback] = useGuessFeedback();

  const shownIndex = revealing ?? state.currentQuestion;
  const round = rounds[shownIndex] ?? null;
  const picked = state.answers[shownIndex] ?? null;
  // The run of correct answers up to the round on screen: the ones before it, and this one too once it is answered.
  const streak = currentStreak(rounds, state.answers, isRevealed ? shownIndex : shownIndex - 1);

  // Focus follows the player: after an answer "Next round" takes it, then the next question once the answered one is
  // gone, so it is read before the cards. Nothing moves before the first answer.
  const answered = useRef(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The action row is always laid out, inert until the reveal; focus moves to it once it is live.
    if (isRevealed) nextButton.current?.focus({ preventScroll: true });
  }, [isRevealed]);
  const focusQuestion = useCallback((element: HTMLParagraphElement | null) => {
    if (element && answered.current && (document.activeElement === document.body || document.activeElement === null)) {
      element.focus();
    }
  }, []);

  const handleGuess = useCallback(
    (guess: Guess) => {
      const current = rounds[state.currentQuestion];
      if (state.completed || isRevealed || !current || state.answers[state.currentQuestion] != null) return;

      const correct = guess === correctGuess(current);
      setRevealing(state.currentQuestion);
      answered.current = true;
      showFeedback(correct ? "correct" : "wrong");

      const answers = [...state.answers];
      answers[state.currentQuestion] = guess;
      const isLast = state.currentQuestion >= rounds.length - 1;
      // The answer and the move to the next round are one write, so a reload mid-reveal cannot score a round twice.
      saveState({
        ...state,
        answers,
        score: state.score + (correct ? 1 : 0),
        completed: isLast,
        currentQuestion: isLast ? state.currentQuestion : state.currentQuestion + 1,
      });
    },
    [rounds, state, isRevealed, saveState, showFeedback],
  );

  const advance = useCallback(() => setRevealing(null), []);

  const choices = round ? choicesFor(round) : null;
  const acceptsKeys = !state.completed && !isRevealed && choices != null;
  useEffect(() => {
    if (!acceptsKeys || !choices) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      const match = choices.find((option) => option.key === event.key.toUpperCase());
      if (!match) return;
      event.preventDefault();
      handleGuess(match.guess);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [acceptsKeys, choices, handleGuess]);

  const best = bestStreak(rounds, state.answers);
  const shareText = useMemo(
    () =>
      [
        `Deadlockdle #${getDayNumber(date)} · Higher or Lower ${state.score}/${rounds.length}`,
        shareGrid(rounds, state.answers),
        `Best streak ${best}`,
        puzzleShareUrl(date),
      ].join("\n"),
    [date, rounds, state.score, state.answers, best],
  );

  // Reached by answering the last round, whose choices unmount: the results take focus instead of <body>.
  const resultsScrollRef = useResultsRef<HTMLDivElement>(answered);
  // The last answer is saved as completed at once; its reveal still plays before the results replace it.
  const showResults = state.completed && !isRevealed;

  // A failed query leaves no run to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(...queries);
  if (loadError.isError) {
    return (
      <GameShellError
        title={TITLE}
        subtitle={subtitle}
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || rounds.length === 0) {
    return <GameShellLoading title={TITLE} subtitle={subtitle} date={date} />;
  }

  const total = rounds.length;
  const sentence = round ? revealSentence(round) : "";
  const stepState = (r: HigherLowerRound, i: number) =>
    state.answers[i] == null ? "empty" : state.answers[i] === correctGuess(r) ? "correct" : "wrong";

  return (
    <GameShell
      title={TITLE}
      subtitle={subtitle}
      totalAttempts={0}
      usedAttempts={0}
      status={showResults ? "won" : "playing"}
      hideAttempts
      date={date}
    >
      {/* The only place the outcome is read out; nothing visible repeats it. */}
      <GuessFeedback
        type={feedbackType}
        triggerKey={shownIndex}
        message={round && feedbackType ? `${feedbackType === "correct" ? "Correct" : "Wrong"}. ${sentence}` : undefined}
      />

      <AnimatePresence mode="wait">
        {!showResults && round ? (
          <motion.div
            key={shownIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mx-auto flex w-full max-w-xl flex-col gap-5"
          >
            <Inline justify="between" wrap="nowrap">
              <Inline gap={2} wrap="nowrap">
                <Text as="p" variant="eyebrow" className="font-mono">
                  Round {shownIndex + 1}/{total}
                </Text>
                {streak >= 2 && (
                  <TerminalBadge variant="positive" size="sm">
                    {streak} in a row
                  </TerminalBadge>
                )}
              </Inline>
              <TerminalBadge variant="outline" size="sm" className="text-muted-foreground">
                {CATEGORY_LABEL[round.category]}
              </TerminalBadge>
            </Inline>

            <p ref={focusQuestion} tabIndex={-1} className="px-2 text-center text-lg font-semibold tracking-tight">
              {round.question}
            </p>

            <Stack gap={2}>
              {!round.subject && (
                <Text as="p" variant="eyebrow" align="center" className="font-mono">
                  {round.stat}
                </Text>
              )}
              {round.kind === "head-to-head" ? (
                <Versus>
                  {([round.left, round.right] as const).map((contender, i) => {
                    const guess = guessOf(i === 0 ? 0 : 1);
                    return (
                      <Fragment key={contender.name}>
                        {i === 1 && <VersusDivider />}
                        <VersusChoice
                          shortcut={String(i + 1)}
                          state={isRevealed ? revealedState(guess === correctGuess(round), guess === picked) : "idle"}
                          onClick={() => handleGuess(guess)}
                          aria-disabled={isRevealed || undefined}
                        >
                          <VersusArt>
                            <ContenderArt contender={contender} />
                          </VersusArt>
                          <VersusName>{contender.name}</VersusName>
                          <VersusValue
                            state={isRevealed ? "revealed" : "hidden"}
                            countTo={{ value: contender.value, format: (n) => formatValue(n, round.format) }}
                          >
                            {formatValue(contender.value, round.format)}
                          </VersusValue>
                        </VersusChoice>
                      </Fragment>
                    );
                  })}
                </Versus>
              ) : (
                <Versus>
                  {round.subject && (
                    <VersusSubject>
                      <VersusArt>
                        <HeroImage heroId={round.subject.heroId} title="" className={versusArtImageVariants()} />
                      </VersusArt>
                      <div className="flex min-w-0 flex-col gap-1 text-start">
                        <VersusName>{round.subject.name}</VersusName>
                        <Text variant="eyebrow" className="font-mono">
                          {round.stat}
                        </Text>
                      </div>
                    </VersusSubject>
                  )}
                  <VersusSide
                    outcome={isRevealed ? (round.left.value > round.right.value ? "higher" : "lower") : "none"}
                  >
                    <VersusArt>
                      <ContenderArt contender={round.left} />
                    </VersusArt>
                    <VersusName>{round.left.name}</VersusName>
                    <VersusValue>{formatValue(round.left.value, round.format)}</VersusValue>
                  </VersusSide>
                  <VersusDivider>{round.subject ? "OR" : "VS"}</VersusDivider>
                  <VersusSide
                    emphasis="target"
                    outcome={isRevealed ? (round.right.value > round.left.value ? "higher" : "lower") : "none"}
                  >
                    <VersusArt>
                      <ContenderArt contender={round.right} />
                    </VersusArt>
                    <VersusName>{round.right.name}</VersusName>
                    <VersusActions>
                      {choicesFor(round).map(({ guess, label, icon: Icon, key }, i) => (
                        <Fragment key={guess}>
                          {i === 1 && (
                            <VersusValue
                              state={isRevealed ? "revealed" : "hidden"}
                              countTo={{
                                value: round.right.value,
                                format: (n) => formatValue(n, round.format),
                                from: round.left.value,
                              }}
                            >
                              {formatValue(round.right.value, round.format)}
                            </VersusValue>
                          )}
                          <AnswerOption
                            variant="icon"
                            aria-label={label}
                            shortcut={key}
                            state={isRevealed ? revealedState(guess === correctGuess(round), guess === picked) : "idle"}
                            onClick={() => handleGuess(guess)}
                            aria-disabled={isRevealed || undefined}
                          >
                            {Icon && <Icon aria-hidden="true" />}
                          </AnswerOption>
                        </Fragment>
                      ))}
                    </VersusActions>
                  </VersusSide>
                </Versus>
              )}
            </Stack>

            <Inline
              justify="center"
              inert={!isRevealed}
              aria-hidden={!isRevealed || undefined}
              className={cn(!isRevealed && "invisible")}
            >
              <StatSourceLink source={round.source} date={date} aria-label="See stats (opens in a new tab)">
                See Stats
              </StatSourceLink>
              <TerminalButton ref={nextButton} variant="soft" size="touch" onClick={advance}>
                {shownIndex >= total - 1 ? "See results" : "Next round"}
              </TerminalButton>
            </Inline>

            <StepMeter label={`Round ${shownIndex + 1} of ${total}`} className="justify-center pt-2">
              {rounds.map((r, i) => (
                <StepMeterStep
                  // oxlint-disable-next-line react/no-array-index-key -- rounds are a fixed list for the day
                  key={i}
                  state={i === shownIndex && !isRevealed ? "current" : stepState(r, i)}
                />
              ))}
            </StepMeter>
          </motion.div>
        ) : showResults ? (
          <motion.div
            key="results"
            ref={resultsScrollRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="mx-auto flex w-full max-w-xl flex-col gap-6"
          >
            <Stack gap={3} align="center">
              <ScoreSummary
                size="lg"
                score={`${state.score}/${total}`}
                scoreLabel={scoreLabel(state.score)}
                grade={state.score >= 8 ? "good" : state.score >= 5 ? "fair" : "poor"}
                countdown={isArchive ? undefined : { label: "Next Run", value: countdown ?? "Out now" }}
              />
              <StepMeter variant="squares" label={`${state.score} of ${total} rounds correct`}>
                {rounds.map((r, i) => (
                  // oxlint-disable-next-line react/no-array-index-key -- rounds are a fixed list for the day
                  <StepMeterStep key={i} state={stepState(r, i)} />
                ))}
              </StepMeter>
              <Text variant="caption" tone="muted" className="font-mono">
                Best streak {best}
              </Text>
            </Stack>

            <Stack gap={3} align="center">
              <ShareButton variant="default" size="touch" text={shareText}>
                Share Result
              </ShareButton>
              <NextGameButton currentMode="higher-lower" date={date} />
            </Stack>

            <Stack asChild gap={1}>
              <ol aria-label="Your rounds">
                {rounds.map((r, i) => {
                  const correct = state.answers[i] === correctGuess(r);
                  const values = (c: Contender) => `${c.name} ${formatValue(c.value, r.format)}`;
                  return (
                    // oxlint-disable-next-line react/no-array-index-key -- rounds are a fixed list for the day
                    <li key={i}>
                      <Card size="xs">
                        <CardContent className="flex items-start gap-2">
                          <TerminalBadge variant={correct ? "positive" : "negative"} size="sm">
                            <span aria-hidden="true">{correct ? "✓" : "✗"}</span>
                            <span className="sr-only">{correct ? "Correct" : "Wrong"}</span>
                          </TerminalBadge>
                          <Stack gap={0.5} className="flex-1">
                            <Text variant="caption" numeric="tabular" className="font-mono">
                              {r.kind === "head-to-head"
                                ? `${values(r.left)} – ${values(r.right)}`
                                : `${values(r.left)} → ${values(r.right)}`}
                            </Text>
                            <Text variant="caption" tone="muted" className="font-mono">
                              {answerCaption(r, state.answers[i] ?? null)}
                            </Text>
                            <Text variant="caption" tone="muted">
                              <TextLink asChild external tone="muted" underline="always">
                                <StatSourceLink variant="plain" source={r.source} date={date}>
                                  {r.kind === "head-to-head"
                                    ? "Matchup"
                                    : r.subject
                                      ? `${r.subject.name} · ${r.stat}`
                                      : r.stat}
                                </StatSourceLink>
                              </TextLink>
                            </Text>
                          </Stack>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </Stack>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GameShell>
  );
}
