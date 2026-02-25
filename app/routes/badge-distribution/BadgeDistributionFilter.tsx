import type { AnalyticsApiBadgeDistributionRequest } from "deadlock_api_client/api";
import { useCallback } from "react";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { TimeRangeFilter } from "~/components/primitives/TimeRangeFilter";
import type { Dayjs } from "~/dayjs";
import { day } from "~/dayjs";
import { MAX_GAME_DURATION_S, MIN_GAME_DURATION_S, PATCHES } from "~/lib/constants";

export interface BadgeDistributionFilterProps {
  value: AnalyticsApiBadgeDistributionRequest;
  onChange: (filter: AnalyticsApiBadgeDistributionRequest) => void;
}

export default function BadgeDistributionFilter({ value, onChange }: BadgeDistributionFilterProps) {
  const handleDurationRangeChange = useCallback(
    (range: [number, number]) =>
      onChange({
        ...value,
        minDurationS: range[0],
        maxDurationS: range[1],
      }),
    [onChange, value],
  );

  const handleDateChange = useCallback(
    ({ startDate, endDate }: { startDate?: Dayjs; endDate?: Dayjs }) =>
      onChange({
        ...value,
        minUnixTimestamp: startDate ? startDate.unix() : undefined,
        maxUnixTimestamp: endDate ? endDate.unix() : undefined,
      }),
    [onChange, value],
  );

  return (
    <div className="flex flex-wrap justify-center items-center w-full gap-8">
      <TimeRangeFilter
        value={[value.minDurationS ?? MIN_GAME_DURATION_S, value.maxDurationS ?? MAX_GAME_DURATION_S]}
        min={MIN_GAME_DURATION_S}
        max={MAX_GAME_DURATION_S}
        onRangeChange={handleDurationRangeChange}
        labelText="Match Duration"
      />
      <PatchOrDatePicker
        patchDates={PATCHES}
        value={{
          startDate: value.minUnixTimestamp ? day.unix(value.minUnixTimestamp) : undefined,
          endDate: value.maxUnixTimestamp ? day.unix(value.maxUnixTimestamp) : undefined,
        }}
        onValueChange={handleDateChange}
      />
    </div>
  );
}
