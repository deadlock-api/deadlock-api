import { useState } from "react";

import {
  HeatGrid,
  HeatGridBody,
  HeatGridCell,
  HeatGridColumn,
  HeatGridHead,
  HeatGridRow,
} from "~/components/patterns/data-table/HeatGrid";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import {
  type PlaytimeCell,
  type PlaytimeHabits,
  PEAK_HOURS_WINDOW,
  PLAYTIME_BUCKET_HOURS,
} from "~/lib/tracker/compute";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const columns = 24 / PLAYTIME_BUCKET_HOURS;
const hours = Array.from({ length: columns }, (_, index) => index * PLAYTIME_BUCKET_HOURS);
const hourLabel = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;
const describeCell = (cell: PlaytimeCell) =>
  `${weekdays[cell.weekday]} ${hourLabel(cell.hour)}–${hourLabel(cell.hour + PLAYTIME_BUCKET_HOURS)} · ${cell.matches} ${cell.matches === 1 ? "match" : "matches"}${cell.matches > 0 ? ` · ${Math.round((cell.wins / cell.matches) * 100)}% wins` : ""}`;

export function PlaytimeHeatmap({ habits }: { habits: PlaytimeHabits }) {
  const [inspectedCell, setInspectedCell] = useState<number | null>(null);
  const inspected = inspectedCell == null ? null : habits.cells[inspectedCell];

  return (
    <div className="flex flex-col gap-2">
      <HeatGrid
        label="Matches by weekday and two-hour window"
        caption="Times are local."
        columns={columns}
        value={inspectedCell}
        onValueChange={setInspectedCell}
      >
        <HeatGridHead corner="Weekday">
          {hours.map((hour) => (
            <HeatGridColumn key={hour}>{hour}</HeatGridColumn>
          ))}
        </HeatGridHead>
        <HeatGridBody>
          {weekdays.map((weekday, row) => (
            <HeatGridRow key={weekday} label={weekday}>
              {habits.cells.slice(row * columns, (row + 1) * columns).map((cell, column) => (
                <HeatGridCell
                  key={cell.hour}
                  index={row * columns + column}
                  label={describeCell(cell)}
                  color={
                    cell.matches
                      ? `color-mix(in srgb, var(--positive) ${20 + (cell.matches / habits.maxMatches) * 80}%, var(--muted))`
                      : undefined
                  }
                  tooltip={
                    <>
                      <TooltipHeader
                        title={`${weekday} ${hourLabel(cell.hour)}–${hourLabel(cell.hour + PLAYTIME_BUCKET_HOURS)}`}
                        subtitle="Your local time"
                      />
                      <TooltipStats>
                        <TooltipStat label="Matches" value={cell.matches} />
                        <TooltipStat label="Wins / losses" value={`${cell.wins} / ${cell.matches - cell.wins}`} />
                        <TooltipStat
                          label="Win rate"
                          value={cell.matches > 0 ? `${Math.round((cell.wins / cell.matches) * 100)}%` : "—"}
                        />
                      </TooltipStats>
                    </>
                  }
                />
              ))}
            </HeatGridRow>
          ))}
        </HeatGridBody>
      </HeatGrid>
      <div className="flex flex-wrap justify-between gap-1 text-3xs text-muted-foreground">
        <span>
          {inspected ? (
            describeCell(inspected)
          ) : (
            <>
              {habits.favoriteWeekday ? `Most active: ${weekdays[habits.favoriteWeekday.weekday]}` : "No activity"}
              {habits.peakHourStart != null &&
                ` · Peak ${PEAK_HOURS_WINDOW}h: ${hourLabel(habits.peakHourStart)}–${hourLabel(habits.peakHourStart + PEAK_HOURS_WINDOW)}`}
            </>
          )}
        </span>
        <span>Fainter → fewer games</span>
      </div>
    </div>
  );
}
