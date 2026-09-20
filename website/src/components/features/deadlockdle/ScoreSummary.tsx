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
}

/** The end-of-game score of the quiz modes, beside the time until the next puzzle. */
export function ScoreSummary({ score, scoreLabel, grade, countdown }: ScoreSummaryProps) {
  return (
    <StatGroup className={cn("font-mono", countdown ? "grid-cols-2" : "grid-cols-1")}>
      <Stat align="center" label={scoreLabel} value={<span className={GRADE_TEXT[grade]}>{score}</span>} />
      {countdown && <Stat align="center" label={countdown.label} value={countdown.value} />}
    </StatGroup>
  );
}
