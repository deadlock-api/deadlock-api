import { type KeyboardEvent, useId, useRef, useState } from "react";

import { HeatCell } from "~/components/ui/heat-cell";
import { PanelTooltipContent, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
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

/** One tab stop for the heatmap; each cell can also be inspected by touch. */
export function PlaytimeHeatmap({ habits }: { habits: PlaytimeHabits }) {
  const captionId = useId();
  const [activeCell, setActiveCell] = useState(0);
  const [inspectedCell, setInspectedCell] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const inspected = inspectedCell == null ? null : habits.cells[inspectedCell];

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey) return;
    const column = index % columns;
    let next = index;
    switch (event.key) {
      case "Escape":
        setInspectedCell(null);
        return;
      case "ArrowRight":
        next = column < columns - 1 ? index + 1 : index;
        break;
      case "ArrowLeft":
        next = column > 0 ? index - 1 : index;
        break;
      case "ArrowDown":
        next = Math.min(index + columns, habits.cells.length - columns + column);
        break;
      case "ArrowUp":
        next = Math.max(index - columns, column);
        break;
      case "Home":
        next = event.ctrlKey || event.metaKey ? 0 : index - column;
        break;
      case "End":
        next = event.ctrlKey || event.metaKey ? habits.cells.length - 1 : index - column + columns - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    buttons.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <Table
        role="grid"
        aria-label="Matches by weekday and two-hour window"
        aria-describedby={captionId}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setInspectedCell(null);
        }}
        className="table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5"
      >
        <TableCaption id={captionId} className="sr-only">
          Tap a cell to inspect it. Use arrow keys to move between cells, Home and End within a row, and Control Home or
          End for the first or last cell. Escape restores the summary. Times are local.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="h-4 w-7 p-0">
              <span className="sr-only">Weekday</span>
            </TableHead>
            {hours.map((hour) => (
              <TableHead key={hour} scope="col" className="h-4 p-0 text-center text-4xs">
                {hour}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {weekdays.map((weekday, row) => (
            <TableRow key={weekday}>
              <TableHead scope="row" className="h-4 p-0 text-4xs">
                {weekday}
              </TableHead>
              {habits.cells.slice(row * columns, (row + 1) * columns).map((cell, column) => {
                const index = row * columns + column;
                const description = describeCell(cell);
                return (
                  <TableCell key={cell.hour} className="p-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HeatCell
                          ref={(button) => {
                            buttons.current[index] = button;
                          }}
                          tabIndex={activeCell === index ? 0 : -1}
                          label={description}
                          // The cell already has a rich Tooltip; the native one would double it.
                          title={undefined}
                          selected={inspectedCell === index}
                          color={
                            cell.matches
                              ? `color-mix(in srgb, var(--positive) ${20 + (cell.matches / habits.maxMatches) * 80}%, var(--muted))`
                              : undefined
                          }
                          onFocus={() => {
                            setActiveCell(index);
                            setInspectedCell(index);
                          }}
                          onClick={() => setInspectedCell(index)}
                          onKeyDown={(event) => navigate(event, index)}
                          className="block aspect-auto h-6 w-full"
                        />
                      </TooltipTrigger>
                      <PanelTooltipContent>
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
                      </PanelTooltipContent>
                    </Tooltip>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
