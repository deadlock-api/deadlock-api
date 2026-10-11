import {
  ArrowDownIcon,
  ArrowUpIcon,
  BrainIcon,
  CopyIcon,
  CrosshairIcon,
  FlameIcon,
  PackageIcon,
  SkullIcon,
  SwordsIcon,
  UsersIcon,
} from "lucide-react";
import { Fragment, useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { AnswerOption, type AnswerOptionState, revealedState } from "~/components/domain/minigames/AnswerOption";
import { GamePage } from "~/components/domain/minigames/GamePage";
import { GameTile } from "~/components/domain/minigames/GameTile";
import { ScoreSummary } from "~/components/domain/minigames/ScoreSummary";
import { ShareButton } from "~/components/domain/minigames/ShareButton";
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
import { Card, CardContent } from "~/components/ui/card";

const ANSWER_STATES: AnswerOptionState[] = ["idle", "selected", "correct", "wrong", "dimmed"];
const QUIZ_OPTIONS = ["Infernus", "Seven", "Haze", "Paradox"];
const QUIZ_ANSWER = 1;
const MATCHUP = [
  { name: "Rem", value: 47.3, fit: "fill" },
  { name: "The Doorman", value: 52.7, fit: "icon" },
] as const;
const MATCHUP_WINNER = 1;

/** A share with one decimal, the format the count-up draws each frame in. */
function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

const HIGHER_LOWER = [
  { label: "Higher", icon: ArrowUpIcon, correct: true },
  { label: "Lower", icon: ArrowDownIcon, correct: false },
];

export function DomainMinigames() {
  const [picked, setPicked] = useState<number | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [matchPick, setMatchPick] = useState<number | null>(null);
  const [hlGuess, setHlGuess] = useState<string | null>(null);
  const [h2hPick, setH2hPick] = useState<number | null>(null);

  return (
    <>
      <Specimen
        name="AnswerOption"
        source="domain/minigames/AnswerOption"
        note="One answer of a quiz, in every game. row is a full-width answer with a trailing result mark; tile is one of a few short choices on a line; choice is one of two big main actions; icon is a 44px square with only an icon and an aria-label (no keycap; the result mark replaces the icon on reveal), for Higher / Lower in VersusActions; card makes a whole card the answer (see VersusChoice). row and choice reserve the slot of the mark in every state, so the reveal never changes their width, height or wrap. After the reveal, revealedState() maps each option to correct, wrong or dimmed. shortcut draws the key that picks it as a keycap in front of the text (fine pointers only) and sets aria-keyshortcuts; the game listens for the key. During a reveal the options take aria-disabled rather than disabled: they stay focusable, so focus stays on the answer just picked, and ignore clicks and Enter."
        className="theme-terminal"
      >
        <Variants label="row · idle, selected, correct, wrong, dimmed" className="max-w-lg flex-col items-stretch">
          {ANSWER_STATES.map((state) => (
            <AnswerOption key={state} state={state} disabled={state !== "idle" && state !== "selected"}>
              {state}
            </AnswerOption>
          ))}
        </Variants>
        <Variants label="row · shortcut" className="max-w-lg flex-col items-stretch">
          {["Haze", "Vindicta", "Seven"].map((name, i) => (
            <AnswerOption key={name} shortcut={String(i + 1)}>
              {name}
            </AnswerOption>
          ))}
        </Variants>
        <Variants label="tile · idle, selected, correct, wrong, dimmed" className="max-w-lg flex-nowrap">
          {ANSWER_STATES.map((state) => (
            <AnswerOption
              key={state}
              variant="tile"
              state={state}
              aria-pressed={state === "selected"}
              disabled={state !== "idle" && state !== "selected"}
            >
              {state}
            </AnswerOption>
          ))}
        </Variants>
        <Variants label="choice · idle, then revealed (with a shortcut)" className="max-w-lg flex-nowrap">
          {HIGHER_LOWER.map(({ label, icon: Icon, correct }, i) => (
            <AnswerOption
              key={label}
              variant="choice"
              shortcut={label[0]}
              state={guess === null ? "idle" : revealedState(correct, i === guess)}
              onClick={() => setGuess(i)}
              aria-disabled={guess !== null || undefined}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </AnswerOption>
          ))}
        </Variants>
        <Variants
          label="choice · long labels keep their size on reveal (the mark's slot is reserved)"
          className="max-w-lg flex-nowrap items-stretch"
        >
          {["Rem wins", "The Doorman wins"].map((label, i) => (
            <AnswerOption
              key={label}
              variant="choice"
              shortcut={String(i + 1)}
              state={matchPick === null ? "idle" : revealedState(i === 1, i === matchPick)}
              onClick={() => setMatchPick(i)}
              aria-disabled={matchPick !== null || undefined}
            >
              {label}
            </AnswerOption>
          ))}
          <TerminalButton size="sm" disabled={matchPick === null} onClick={() => setMatchPick(null)}>
            Reset
          </TerminalButton>
        </Variants>
        <Variants label="Live: which hero is Seven?" className="max-w-lg flex-col items-stretch">
          {QUIZ_OPTIONS.map((option, i) => (
            <AnswerOption
              key={option}
              state={picked === null ? "idle" : revealedState(i === QUIZ_ANSWER, i === picked)}
              onClick={() => setPicked(i)}
              aria-disabled={picked !== null || undefined}
            >
              {option}
            </AnswerOption>
          ))}
          <TerminalButton size="sm" className="self-start" disabled={picked === null} onClick={() => setPicked(null)}>
            Reset
          </TerminalButton>
        </Variants>
      </Specimen>

      <Specimen
        name="Versus"
        source="domain/minigames/Versus"
        note="Two contenders side by side for a game that compares them: VersusSide, VersusDivider, VersusSide. Each side is VersusArt, VersusName, VersusValue, or VersusActions holding the value between two icon answers (one line from a 32rem board, the answers under the value when narrower); the sides share the board's rows through CSS subgrid, so the values line up even when only one name wraps. VersusSide emphasis: none, target (the side being judged, primary tone). outcome after the reveal: higher (full contrast, an up arrow in the corner and the word Higher for screen readers), lower (muted value); once set it wins over emphasis. VersusValue state: shown, hidden (a muted placeholder, ? by default; screen readers hear Hidden), revealed (pops in). children is the formatted value in every state and is laid out invisibly under the placeholder, so the value's box has its final size before the reveal. countTo counts a revealed value up (0.6s; the final value at once under reduced motion). The art box shrinks with the board (2.5rem to 5rem); the image inside takes versusArtImageVariants({ fit }): fill, or icon (three quarters, letterboxed). The class goes on the image rather than a child selector on VersusArt, so the image's own default size is replaced by cn() instead of overridden by variant order."
        className="theme-terminal"
      >
        <Variants
          label="emphasis target · value hidden (placeholder ?)"
          className="max-w-xl flex-col flex-nowrap items-stretch"
        >
          <Versus>
            <VersusSide>
              <VersusArt>
                <SkullIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Hero kills</VersusName>
              <VersusValue>8,297</VersusValue>
            </VersusSide>
            <VersusDivider />
            <VersusSide emphasis="target">
              <VersusArt>
                <UsersIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Lane troopers</VersusName>
              <VersusValue state="hidden">19,737</VersusValue>
            </VersusSide>
          </Versus>
        </Variants>
        <Variants
          label="outcome higher · lower (after the reveal)"
          className="max-w-xl flex-col flex-nowrap items-stretch"
        >
          <Versus>
            <VersusSide outcome="lower">
              <VersusArt>
                <SkullIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Hero kills</VersusName>
              <VersusValue>8,297</VersusValue>
            </VersusSide>
            <VersusDivider />
            <VersusSide emphasis="target" outcome="higher">
              <VersusArt>
                <UsersIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Lane troopers</VersusName>
              <VersusValue>19,737</VersusValue>
            </VersusSide>
          </Versus>
        </Variants>
        <Variants
          label="art fit · fill (a portrait), icon (a glyph)"
          className="max-w-xl flex-col flex-nowrap items-stretch"
        >
          <Versus>
            <VersusSide>
              <VersusArt>
                <HeroImage heroId={1} title="" className={versusArtImageVariants({ fit: "fill" })} />
              </VersusArt>
              <VersusName>fill</VersusName>
              <VersusValue placeholder="—" state="hidden">
                51.2%
              </VersusValue>
            </VersusSide>
            <VersusDivider />
            <VersusSide>
              <VersusArt>
                <SkullIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>icon</VersusName>
              <VersusValue placeholder="—" state="hidden">
                48.8%
              </VersusValue>
            </VersusSide>
          </Versus>
        </Variants>
        <Variants
          label="Live: VersusSubject + VersusActions (Lower, value, Higher on one line), count-up on reveal"
          className="max-w-xl flex-col flex-nowrap items-stretch"
        >
          <Versus data-demo="higher-lower">
            <VersusSubject>
              <VersusArt>
                <UsersIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <div className="flex min-w-0 flex-col gap-1">
                <VersusName>Calico</VersusName>
                <span className="font-mono eyebrow">Players who max it first</span>
              </div>
            </VersusSubject>
            <VersusSide outcome={hlGuess === null ? "none" : "higher"}>
              <VersusArt>
                <FlameIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Return to Shadows</VersusName>
              <VersusValue>89.1%</VersusValue>
            </VersusSide>
            <VersusDivider>OR</VersusDivider>
            <VersusSide emphasis="target" outcome={hlGuess === null ? "none" : "lower"}>
              <VersusArt>
                <SwordsIcon className={versusArtImageVariants({ fit: "icon" })} strokeWidth={1.5} />
              </VersusArt>
              <VersusName>Ava</VersusName>
              <VersusActions>
                {[HIGHER_LOWER[1], HIGHER_LOWER[0]].map(({ label, icon: Icon, correct }, i) => (
                  <Fragment key={label}>
                    {i === 1 && (
                      <VersusValue
                        state={hlGuess === null ? "hidden" : "revealed"}
                        countTo={{ value: 0.6, format: formatPercent }}
                      >
                        {formatPercent(0.6)}
                      </VersusValue>
                    )}
                    <AnswerOption
                      variant="icon"
                      aria-label={label}
                      shortcut={label[0]}
                      state={hlGuess === null ? "idle" : revealedState(!correct, label === hlGuess)}
                      onClick={() => setHlGuess(label)}
                      aria-disabled={hlGuess !== null || undefined}
                    >
                      <Icon aria-hidden="true" />
                    </AnswerOption>
                  </Fragment>
                ))}
              </VersusActions>
            </VersusSide>
          </Versus>
          <TerminalButton size="sm" className="self-start" disabled={hlGuess === null} onClick={() => setHlGuess(null)}>
            Reset
          </TerminalButton>
        </Variants>
      </Specimen>

      <Specimen
        name="VersusChoice"
        source="domain/minigames/Versus"
        note="A side the player picks by clicking it, for a round that asks which of two contenders wins: the whole card is one button (AnswerOption variant card) and the target. state follows AnswerOption: idle, then revealedState() after the answer; correct and wrong carry a ✓ / ✗ mark with a label in the top-end corner, shortcut a keycap in the top-start corner (fine pointers only) plus aria-keyshortcuts; the game listens for the key. While revealed the cards take aria-disabled, not disabled, so focus stays on the pick. Both values are hidden until the answer, then count up; nothing changes size."
        className="theme-terminal"
      >
        <Variants
          label="Live: who wins this matchup more often?"
          className="max-w-xl flex-col flex-nowrap items-stretch"
        >
          <Versus data-demo="head-to-head">
            {MATCHUP.map(({ name, value, fit }, i) => (
              <Fragment key={name}>
                {i === 1 && <VersusDivider />}
                <VersusChoice
                  shortcut={String(i + 1)}
                  state={h2hPick === null ? "idle" : revealedState(i === MATCHUP_WINNER, i === h2hPick)}
                  onClick={() => setH2hPick(i)}
                  aria-disabled={h2hPick !== null || undefined}
                >
                  <VersusArt>
                    {fit === "fill" ? (
                      <HeroImage heroId={i + 1} title="" className={versusArtImageVariants({ fit })} />
                    ) : (
                      <SkullIcon className={versusArtImageVariants({ fit })} strokeWidth={1.5} />
                    )}
                  </VersusArt>
                  <VersusName>{name}</VersusName>
                  <VersusValue
                    state={h2hPick === null ? "hidden" : "revealed"}
                    countTo={{ value, format: formatPercent }}
                  >
                    {formatPercent(value)}
                  </VersusValue>
                </VersusChoice>
              </Fragment>
            ))}
          </Versus>
          <TerminalButton size="sm" className="self-start" disabled={h2hPick === null} onClick={() => setH2hPick(null)}>
            Reset
          </TerminalButton>
        </Variants>
      </Specimen>

      <Specimen
        name="GamePage"
        source="domain/minigames/GamePage"
        note="The route shell of one mini-game: a PageShell in the terminal sub-theme (square corners), the link back to the hub, the title in the game face, an optional archive badge (it wraps below the title on a narrow page), then the game. Framed here; on a route it is the outermost element."
      >
        <Card tone="inset" size="sm">
          <CardContent>
            <GamePage
              as="div"
              title="Trivia"
              subtitle="Ten questions about Deadlock. One try each."
              hub="/games/deadlockdle"
              badge={
                <TerminalBadge variant="warning" size="sm">
                  Archive · Day 212
                </TerminalBadge>
              }
            >
              <Card size="sm">
                <CardContent className="text-sm text-muted-foreground">The game renders here.</CardContent>
              </Card>
            </GamePage>
          </CardContent>
        </Card>
      </Specimen>

      <Specimen
        name="GameTile"
        source="domain/minigames/GameTile"
        note="A game on a hub page, linking to it. tone and badge carry the state of today's run: untouched, in progress, completed, failed, plus the mode's streak. cta is Play until the run is over, then View result."
        className="theme-terminal grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <GameTile
          to="/games/deadlockdle/trivia"
          title="Trivia"
          description="Ten questions about heroes, items and the map."
          icon={BrainIcon}
        />
        <GameTile
          to="/games/deadlockdle/guess-hero"
          title="Guess the Hero"
          description="Name the hero from its stats."
          icon={SwordsIcon}
          tone="warning"
          badge={
            <TerminalBadge variant="warning" size="sm">
              In Progress
            </TerminalBadge>
          }
        />
        <GameTile
          to="/games/deadlockdle/item-stats"
          title="Item Stats"
          description="Tier, slot and type of five items."
          icon={PackageIcon}
          tone="positive"
          cta="View result"
          badge={
            <>
              <TerminalBadge variant="positive" size="sm">
                Completed
              </TerminalBadge>
              <TerminalBadge variant="outline" size="sm">
                <FlameIcon aria-hidden="true" />3 day streak
              </TerminalBadge>
            </>
          }
        />
        <GameTile
          to="/games/deadlockdle/guess-sound"
          title="Guess the Sound"
          description="Which ability makes this sound?"
          icon={CrosshairIcon}
          tone="negative"
          cta="View result"
          badge={
            <TerminalBadge variant="negative" size="sm">
              Failed
            </TerminalBadge>
          }
        />
      </Specimen>

      <Specimen
        name="TerminalButton"
        source="domain/minigames/TerminalButton"
        note="Button in the games' monospace, uppercase voice; square inside the theme-terminal scope. soft is the main action of a screen, outline (the default) everything else. It takes every Button prop."
        className="theme-terminal"
      >
        <Variants label="Variants">
          <TerminalButton variant="soft">Submit All</TerminalButton>
          <TerminalButton>
            <CopyIcon /> Share Result
          </TerminalButton>
          <TerminalButton disabled>Disabled</TerminalButton>
        </Variants>
        <Variants label="Sizes">
          <TerminalButton size="sm">Today</TerminalButton>
          <TerminalButton>Default</TerminalButton>
          <TerminalButton variant="soft" size="lg">
            Submit All
          </TerminalButton>
          <TerminalButton variant="soft" size="touch">
            Next round
          </TerminalButton>
          <TerminalButton size="icon-sm" aria-label="Copy result">
            <CopyIcon />
          </TerminalButton>
        </Variants>
      </Specimen>

      <Specimen
        name="TerminalBadge"
        source="domain/minigames/TerminalBadge"
        note="Badge in the games' voice: square, monospace, uppercase. Run states, question categories and the archive marker. It takes every Badge prop."
        className="theme-terminal"
      >
        <Variants>
          <TerminalBadge variant="outline" size="sm">
            Heroes
          </TerminalBadge>
          <TerminalBadge variant="warning" size="sm">
            In Progress
          </TerminalBadge>
          <TerminalBadge variant="positive" size="sm">
            Completed
          </TerminalBadge>
          <TerminalBadge variant="negative" size="sm">
            Failed
          </TerminalBadge>
          <TerminalBadge variant="warning">Archive · Day 212</TerminalBadge>
        </Variants>
      </Specimen>

      <Specimen
        name="ScoreSummary"
        source="domain/minigames/ScoreSummary"
        note="The end-of-game score of a daily game beside the time to the next one. grade colors the score (good, fair, poor), which the number itself already tells; scoreLabel names it. Side by side once both fit, stacked on a phone. An archive day has no countdown. size lg sets the score in the display step for a result screen that is only the score."
        className="theme-terminal"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ScoreSummary
            score="12/15"
            scoreLabel="Score"
            grade="good"
            countdown={{ label: "Next clips", value: "07:12:45" }}
          />
          <ScoreSummary
            score="5/10"
            scoreLabel="Not Bad"
            grade="fair"
            countdown={{ label: "Next Trivia", value: "Out now" }}
          />
          <ScoreSummary score="3/15" scoreLabel="Score" grade="poor" />
          <ScoreSummary score="12" scoreLabel="Streak" grade="good" size="lg" />
        </div>
      </Specimen>

      <Specimen
        name="ShareButton"
        source="domain/minigames/ShareButton"
        note="Copies a game's share text to the clipboard in the games' voice; a CopyButton (outline by default) that confirms with a check once copied. It takes every CopyButton prop."
        className="theme-terminal"
      >
        <Variants>
          <ShareButton text={"Guess the Rank #1 12/15\n\u{1f7e9}\u{1f7e8}\u{1f7e5}"}>Share result</ShareButton>
          <ShareButton text="Deadlockdle Day 200 - Trivia 8/10" variant="soft">
            Share Result
          </ShareButton>
          <ShareButton text="disabled" disabled>
            Disabled
          </ShareButton>
        </Variants>
      </Specimen>
    </>
  );
}
