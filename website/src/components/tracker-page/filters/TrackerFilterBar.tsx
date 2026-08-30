import { Filter } from "~/components/Filter";
import { type Mode, ModeSelector } from "~/components/selectors/ModeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import type { Dayjs } from "~/dayjs";
import type { ResultFilter } from "~/lib/tracker/compute";

const RESULT_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All Results" },
  { value: "win", label: "Wins" },
  { value: "loss", label: "Losses" },
];

export function TrackerFilterBar({
  mode,
  onModeChange,
  heroId,
  onHeroChange,
  result,
  onResultChange,
  startDate,
  endDate,
  onDateChange,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
  result: ResultFilter;
  onResultChange: (result: ResultFilter) => void;
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
}) {
  return (
    <Filter.Root>
      <Filter.SeasonPatchDate startDate={startDate} endDate={endDate} onDateChange={onDateChange} />
      <ModeSelector value={mode} onChange={onModeChange} />
      <Filter.Hero value={heroId} onChange={onHeroChange} allowNull label="Hero" />
      <StringSelector
        options={RESULT_OPTIONS}
        selected={result}
        onSelect={(value) => onResultChange(value as ResultFilter)}
        label="Result"
        defaultValue="all"
      />
    </Filter.Root>
  );
}
