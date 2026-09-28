import { Stat, StatGroup } from "~/components/ui/stat";
import { cn } from "~/lib/utils";

const GRADE_TEXT = {
  good: "text-positive",
  fair: "text-warning",
  poor: "text-negative",
} as const;

interface ScoreSummaryProps {
  score: string;
  scoreLabel: string;
  grade: keyof typeof GRADE_TEXT;
  /** Omitted for archive puzzles, which have no next one to wait for. */
  countdown?: { label: string; value: string };
  /** `lg` draws the score in the display step of the type scale, for a result screen that is only the score. */
  size?: "default" | "lg";
}

/** The end-of-game score of the quiz modes, beside the time until the next puzzle. */
export function ScoreSummary({ score, scoreLabel, grade, countdown, size = "default" }: ScoreSummaryProps) {
  return (
    <StatGroup className={cn("font-mono", countdown ? "grid-cols-2" : "grid-cols-1")}>
      <Stat
        align="center"
        label={scoreLabel}
        value={<span className={cn(GRADE_TEXT[grade], size === "lg" && "type-display")}>{score}</span>}
      />
      {countdown && <Stat align="center" label={countdown.label} value={countdown.value} />}
    </StatGroup>
  );
}
