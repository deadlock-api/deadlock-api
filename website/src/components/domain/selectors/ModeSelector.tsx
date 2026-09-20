import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import type { MatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SegmentedItem } from "~/components/ui/segmented";

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data.
 */
export const MODE_CONFIG = {
  normal_all: {
    label: "All",
    gameMode: "normal",
    matchMode: "ranked,unranked",
    supportsRank: true,
  },
  normal_ranked: {
    label: "Ranked",
    gameMode: "normal",
    matchMode: "ranked",
    supportsRank: true,
  },
  normal_unranked: {
    label: "Unranked",
    gameMode: "normal",
    matchMode: "unranked",
    supportsRank: true,
  },
  street_brawl: {
    label: "Brawl",
    gameMode: "street_brawl",
    matchMode: "unranked",
    supportsRank: false,
  },
} satisfies Record<string, { label: string; gameMode: GameMode; matchMode: MatchMode; supportsRank: boolean }>;

export type Mode = keyof typeof MODE_CONFIG;

export const DEFAULT_MODE: Mode = "normal_all";

const MODES = Object.keys(MODE_CONFIG) as Mode[];

export function ModeSelector({
  value: valueProp,
  defaultValue = DEFAULT_MODE,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell<Mode>>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: Mode;
  /** The mode it starts in when uncontrolled, and the one the reset returns to. */
  defaultValue?: Mode;
  onValueChange?: (mode: Mode) => void;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <FilterToggleCell
      label="Mode"
      value={value}
      onValueChange={setValue}
      active={value !== defaultValue}
      onReset={() => setValue(defaultValue)}
      {...props}
    >
      {MODES.map((mode) => (
        <SegmentedItem key={mode} value={mode}>
          {MODE_CONFIG[mode].label}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
