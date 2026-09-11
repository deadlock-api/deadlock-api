import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  PEAK_HOURS_WINDOW,
  PLAYTIME_BUCKET_HOURS,
  type PlaytimeCell,
  type PlaytimeHabits,
} from "~/lib/tracker/compute";

import { RANK_LINE_COLOR } from "../shared/colors";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const BUCKETS_PER_DAY = 24 / PLAYTIME_BUCKET_HOURS;
const LEGEND_STEPS = [0.2, 0.4, 0.6, 0.8, 1];

function formatHour(hour: number): string {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

function cellTitle(cell: PlaytimeCell): string {
  const when = `${WEEKDAY_NAMES[cell.weekday]} ${formatHour(cell.hour)}–${formatHour(cell.hour + PLAYTIME_BUCKET_HOURS)}`;
  if (cell.matches === 0) return `${when} · no matches`;
  const winrate = Math.round((cell.wins / cell.matches) * 100);
  return `${when} · ${cell.matches} ${cell.matches === 1 ? "match" : "matches"} · ${winrate}% win rate`;
}

function HabitChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">
        {value}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

export function PlaytimeHeatmap({ habits }: { habits: PlaytimeHabits }) {
  const { cells, maxMatches, favoriteWeekday, peakHourStart } = habits;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Playing habits</CardTitle>
        <CardDescription>Matches by weekday and time of day, in your local time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {maxMatches === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            No matches in the selected range.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {favoriteWeekday && (
                <HabitChip
                  label="Favorite day"
                  value={WEEKDAY_NAMES[favoriteWeekday.weekday]}
                  sub={`${favoriteWeekday.matches.toLocaleString("en-US")} matches`}
                />
              )}
              {peakHourStart != null && (
                <HabitChip
                  label="Peak hours"
                  value={`${formatHour(peakHourStart)}–${formatHour(peakHourStart + PEAK_HOURS_WINDOW)}`}
                />
              )}
            </div>

            <div
              className="grid gap-0.5 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: `auto repeat(${BUCKETS_PER_DAY}, minmax(0, 1fr))` }}
            >
              <div />
              {Array.from({ length: BUCKETS_PER_DAY }, (_, bucket) => {
                const hour = bucket * PLAYTIME_BUCKET_HOURS;
                return (
                  <div key={hour} className="h-4 whitespace-nowrap tabular-nums">
                    {hour % 6 === 0 ? formatHour(hour) : null}
                  </div>
                );
              })}
              {WEEKDAY_LABELS.map((label, weekday) => (
                <div key={label} className="contents">
                  <div className="flex items-center pr-2 leading-none">{label}</div>
                  {cells.slice(weekday * BUCKETS_PER_DAY, (weekday + 1) * BUCKETS_PER_DAY).map((cell) => (
                    <div
                      key={cell.hour}
                      className="aspect-square rounded-[2px]"
                      style={{
                        backgroundColor: cell.matches === 0 ? "var(--muted)" : RANK_LINE_COLOR,
                        opacity: cell.matches === 0 ? 1 : 0.2 + 0.8 * (cell.matches / maxMatches),
                      }}
                      title={cellTitle(cell)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <span className="mr-0.5">Less</span>
              {LEGEND_STEPS.map((step) => (
                <span
                  key={step}
                  className="size-2.5 rounded-[2px]"
                  style={{ backgroundColor: RANK_LINE_COLOR, opacity: step }}
                />
              ))}
              <span className="ml-0.5">More</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
