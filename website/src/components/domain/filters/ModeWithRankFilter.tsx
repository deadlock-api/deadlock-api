import { ModeSelector } from "~/components/domain/selectors/ModeSelector";
import { type RankRange, RankRangeSelector } from "~/components/domain/selectors/RankRangeSelector";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { DEFAULT_MODE, type Mode, MODE_CONFIG } from "~/lib/game-mode";

export interface ModeWithRank {
  mode: Mode;
  rank: RankRange;
}

const DEFAULT_VALUE: ModeWithRank = { mode: DEFAULT_MODE, rank: [0, 116] };

export function ModeWithRankFilter({
  value: valueProp,
  defaultValue,
  onValueChange,
  hideRankRange,
  ...props
}: Omit<React.ComponentProps<typeof ModeSelector>, "value" | "defaultValue" | "onValueChange"> & {
  value?: ModeWithRank;
  /** What it starts at when uncontrolled, and what the resets return to. */
  defaultValue?: ModeWithRank;
  onValueChange?: (value: ModeWithRank) => void;
  hideRankRange?: boolean;
}) {
  const resetValue = defaultValue ?? DEFAULT_VALUE;
  const [value, setValue] = useControllableState<ModeWithRank>({
    value: valueProp,
    defaultValue: resetValue,
    onValueChange,
  });

  return (
    <>
      {/* The rank cell is conditional, so the mode cell is the one stable root: it takes the caller's props. */}
      <ModeSelector
        value={value.mode}
        defaultValue={resetValue.mode}
        onValueChange={(mode) => setValue({ ...value, mode })}
        {...props}
      />
      {!hideRankRange && MODE_CONFIG[value.mode].supportsRank && (
        <RankRangeSelector
          value={value.rank}
          defaultValue={resetValue.rank}
          onValueChange={(rank) => setValue({ ...value, rank })}
        />
      )}
    </>
  );
}
