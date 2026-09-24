import { BrainIcon, CopyIcon, CrosshairIcon, FlameIcon, PackageIcon, SwordsIcon } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { AnswerOption, type AnswerOptionState, revealedState } from "~/components/domain/minigames/AnswerOption";
import { GamePage } from "~/components/domain/minigames/GamePage";
import { GameTile } from "~/components/domain/minigames/GameTile";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { Card, CardContent } from "~/components/ui/card";

const ANSWER_STATES: AnswerOptionState[] = ["idle", "selected", "correct", "wrong", "dimmed"];
const QUIZ_OPTIONS = ["Infernus", "Seven", "Haze", "Paradox"];
const QUIZ_ANSWER = 1;

export function DomainMinigames() {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <>
      <Specimen
        name="AnswerOption"
        source="domain/minigames/AnswerOption"
        note="One answer of a quiz, in every game. row is a full-width answer with a trailing result mark; tile is one of a few short choices on a line. After the reveal, revealedState() maps each option to correct, wrong or dimmed. shortcut draws the key that picks it as a keycap in front of the text (fine pointers only) and sets aria-keyshortcuts; the game listens for the key."
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
        <Variants label="Live: which hero is Seven?" className="max-w-lg flex-col items-stretch">
          {QUIZ_OPTIONS.map((option, i) => (
            <AnswerOption
              key={option}
              state={picked === null ? "idle" : revealedState(i === QUIZ_ANSWER, i === picked)}
              onClick={() => setPicked(i)}
              disabled={picked !== null}
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
        name="GamePage"
        source="domain/minigames/GamePage"
        note="The route shell of one mini-game: a PageShell in the terminal sub-theme (square corners), the link back to the hub, the title in the game face, an optional archive badge, then the game. Framed here; on a route it is the outermost element."
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
    </>
  );
}
