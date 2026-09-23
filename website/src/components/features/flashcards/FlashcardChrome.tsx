import { Check, RotateCcw, X } from "lucide-react";

import { GamePage } from "~/components/domain/minigames/GamePage";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { IconTile } from "~/components/ui/icon-tile";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";

export interface FlashcardStats {
  correct: number;
  seen: number;
  streak: number;
  bestStreak: number;
}

export const EMPTY_FLASHCARD_STATS: FlashcardStats = { correct: 0, seen: 0, streak: 0, bestStreak: 0 };

function accuracyOf(stats: FlashcardStats): number {
  return stats.seen > 0 ? Math.round((stats.correct / stats.seen) * 100) : 0;
}

export function FlashcardPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GamePage title={title} subtitle={subtitle} hub="/games/flashcards" width="prose">
      {children}
    </GamePage>
  );
}

export function FlashcardStatStrip({ stats, onReset }: { stats: FlashcardStats; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatGroup variant="joined" size="sm" className="flex-1 grid-cols-2 font-mono sm:grid-cols-4">
        <Stat label="Correct" value={`${stats.correct}/${stats.seen}`} />
        <Stat label="Accuracy" value={`${accuracyOf(stats)}%`} />
        <Stat label="Streak" value={stats.streak} tone={stats.streak >= 3 ? "positive" : undefined} />
        <Stat label="Best" value={stats.bestStreak} />
      </StatGroup>
      <Button variant="ghost" size="sm" onClick={onReset} disabled={stats.seen === 0}>
        <RotateCcw />
        Reset
      </Button>
    </div>
  );
}

export function NoRepeatsToggle({
  id,
  checked,
  onCheckedChange,
  mastered,
  total,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  mastered: number;
  total: number;
}) {
  return (
    <CheckboxField
      id={id}
      size="sm"
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className="items-center"
      label={
        <>
          No repeats
          {checked && (
            <span className="text-muted-foreground normal-case">
              ({mastered}/{total} mastered)
            </span>
          )}
        </>
      }
    />
  );
}

export function FlashcardMastered({
  label,
  stats,
  onReset,
}: {
  label: string;
  stats: FlashcardStats;
  onReset: () => void;
}) {
  return (
    <Card tone="positive">
      <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
        <IconTile tone="positive" shape="circle" size="lg">
          <Check />
        </IconTile>
        <Stack gap={1}>
          <p className="font-game text-xl tracking-tight text-foreground uppercase">{label}</p>
          <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
            You got {stats.correct}/{stats.seen} correct ({accuracyOf(stats)}%)
          </p>
        </Stack>
        <Button onClick={onReset} variant="outline">
          <RotateCcw />
          Play again
        </Button>
      </CardContent>
    </Card>
  );
}

/** The verdict stamped on the prompt once an answer is picked. */
export function ResultMark({ correct, className }: { correct: boolean; className?: string }) {
  return (
    <IconTile tone={correct ? "positive" : "negative"} shape="circle" size="sm" className={className}>
      {correct ? <Check /> : <X />}
    </IconTile>
  );
}

const VERDICT_TONE = { correct: "positive", wrong: "negative" } as const;

/** The frame of the prompt, tinted by the verdict once there is one. */
export function PromptFrame({
  verdict,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "tone" | "size"> & { verdict: "correct" | "wrong" | null }) {
  return <Card tone={verdict ? VERDICT_TONE[verdict] : "card"} size="flush" className={className} {...props} />;
}
