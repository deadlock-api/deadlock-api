import { WandSparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import type { BuildFocus, BuildGoal } from "~/lib/build-completer";

const FOCUS_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "weapon", label: "Gun" },
  { value: "spirit", label: "Spirit" },
  { value: "vitality", label: "Vitality" },
] as const;
const GOAL_OPTIONS = [
  { value: "popular", label: "Most bought" },
  { value: "winning", label: "Win rate" },
  // The least the win rate may be by its 95% interval: a perfect record from a few games does not win the pick.
  { value: "confident", label: "Confident" },
] as const;

/** "Complete build": fills the build's open stages to their souls and slots, leaning toward a category and goal. */
export function BuildCompleter({
  disabled = false,
  busy = false,
  onComplete,
}: {
  /** While the souls the stages can spend are unknown (the soul curve loading, Street Brawl). */
  disabled?: boolean;
  /** While a completion runs: the button shows it and takes no second press. */
  busy?: boolean;
  onComplete: (focus: BuildFocus, goal: BuildGoal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<BuildFocus>("balanced");
  const [goal, setGoal] = useState<BuildGoal>("popular");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="subtle" size="sm" disabled={disabled} loading={busy}>
          {!busy && <WandSparkles />}
          {busy ? "Completing…" : "Complete build"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Complete build" className="flex w-80 flex-col gap-3">
        <Field label="Focus">
          <Segmented value={focus} onValueChange={setFocus}>
            {FOCUS_OPTIONS.map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        <Field label="Pick by">
          <Segmented value={goal} onValueChange={setGoal}>
            {GOAL_OPTIONS.map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        <Button
          onClick={() => {
            onComplete(focus, goal);
            setOpen(false);
          }}
        >
          Complete
        </Button>
      </PopoverContent>
    </Popover>
  );
}
