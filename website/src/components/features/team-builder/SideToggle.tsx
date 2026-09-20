import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import type { Side } from "~/lib/team-builder/analysis";
import { TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { TeamEmblem } from "./TeamEmblem";

export function SideToggle({ value, onValueChange }: { value: Side; onValueChange: (side: Side) => void }) {
  return (
    <Segmented aria-label="Side" value={value} onValueChange={onValueChange} width="hug" className="ms-auto">
      {(["ally", "enemy"] as const).map((option) => (
        <SegmentedItem key={option} value={option} aria-label={TEAM_NAMES[option]}>
          <TeamEmblem side={option} className={cn("size-4", option === "ally" ? "text-positive" : "text-primary")} />
          {/* Below a wide header the emblem carries the side on its own; the name stays available to
              a screen reader through `aria-label` either way. */}
          <span className="hidden @[30rem]:inline">{TEAM_NAMES[option]}</span>
        </SegmentedItem>
      ))}
    </Segmented>
  );
}
