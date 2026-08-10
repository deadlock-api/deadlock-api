import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { Side } from "~/lib/team-builder/analysis";
import { TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { TeamEmblem } from "./TeamEmblem";

export function SideToggle({ side, onChange }: { side: Side; onChange: (side: Side) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={side}
      onValueChange={(next) => next && onChange(next as Side)}
      className="ml-auto"
    >
      {(["ally", "enemy"] as const).map((option) => (
        <ToggleGroupItem key={option} value={option} aria-label={TEAM_NAMES[option]} className="h-7 gap-1.5 px-2">
          <TeamEmblem side={option} className={cn("size-4", option === "ally" ? "text-green-400" : "text-primary")} />
          {/* Below a wide header the emblem carries the side on its own; the name stays available to
              a screen reader through `aria-label` either way. */}
          <span className="hidden text-xs whitespace-nowrap @[30rem]:inline">{TEAM_NAMES[option]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
