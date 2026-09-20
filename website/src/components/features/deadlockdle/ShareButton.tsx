import { CopyButton } from "~/components/ui/copy-button";
import { getDayNumber } from "~/lib/deadlockdle/seed";
import type { GameMode, GameStatus } from "~/lib/deadlockdle/types";
import { cn } from "~/lib/utils";

const MODE_LABELS: Record<GameMode, string> = {
  "guess-hero": "Hero",
  "guess-item": "Item",
  "guess-sound": "Sound",
  "guess-ability": "Ability",
  "item-stats": "Stats",
  trivia: "Trivia",
};

export function generateShareText(
  mode: GameMode,
  date: string,
  guesses: string[],
  maxAttempts: number,
  status: GameStatus,
): string {
  const dayNum = getDayNumber(date);
  const label = MODE_LABELS[mode];
  const score = status === "won" ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`;
  const grid = guesses
    .map((_, i) => (i === guesses.length - 1 && status === "won" ? "\u{1f7e9}" : "\u{1f7e5}"))
    .join("");
  return `Deadlockdle #${dayNum} - ${label} ${score}\n${grid}\nhttps://deadlock-api.com/games/deadlockdle`;
}

/** Copies a result to the clipboard, in the games' terminal voice. */
export function ShareButton({ variant = "outline", ...props }: React.ComponentProps<typeof CopyButton>) {
  return (
    <CopyButton
      display="label"
      variant={variant}
      {...props}
      className={cn("cursor-target font-mono text-xs tracking-wider uppercase", props.className)}
    />
  );
}
