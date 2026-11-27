import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartDataTable } from "~/components/patterns/charts/ChartDataTable";
import { ChartGradientLegend, ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
  CHART_STACK_SEGMENT,
  CHART_X_AXIS,
  CHART_X_AXIS_CATEGORY,
  CHART_Y_AXIS,
  chartRampColor,
} from "~/components/patterns/charts/theme";
import { CalendarHeat, CalendarHeatDay, CalendarHeatMonth } from "~/components/patterns/data-table/CalendarHeat";
import { StoryChapter, StoryFigure, StoryNote } from "~/components/patterns/story/Story";
import { Grid } from "~/components/ui/grid";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import {
  chronotype,
  type Chronotype,
  dailyActivity,
  hourCounts,
  MONTH_NAMES,
  monthGrid,
  monthlyRecord,
  summarizeDays,
  WEEKDAY_NAMES,
} from "~/lib/year-recap/recap";
import type { YearRecap } from "~/lib/year-recap/types";

import { count, plural, useRecapTime } from "./shared";

/** The fewest matches start where the ramp stands 3:1 off an empty day, so one match never reads as none. */
const RAMP_FLOOR = 0.5;
const rampAt = (t: number) => {
  const [r, g, b] = chartRampColor("sequential", RAMP_FLOOR + (1 - RAMP_FLOOR) * t);
  return `rgb(${r} ${g} ${b})`;
};
const RAMP_STOPS = [0, 0.25, 0.5, 0.75, 1].map(rampAt);

const CHRONOTYPE: Record<Chronotype, { title: string; line: (share: string) => string }> = {
  "night-owl": {
    title: "A creature of the night",
    line: (share) => `${share} of your matches started between midnight and 5 am. Sleep is for the respawn timer.`,
  },
  "early-bird": {
    title: "Up with the sun",
    line: (share) => `${share} of your matches started before 11 am. Coffee in one hand, Haze in the other.`,
  },
  "after-work": {
    title: "Prime-time player",
    line: (share) => `${share} of your matches started after 5 pm: Deadlock was the evening plan.`,
  },
  daytime: {
    title: "Daylight gamer",
    line: (share) => `${share} of your matches started between 11 am and 5 pm.`,
  },
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const SHORT_MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));

/** When they played, in the visitor's own time zone: the calendar, the hour of day, the months. */
export function TimeChapter({ id, recap }: { id: string; recap: YearRecap }) {
  const { partsOf, local } = useRecapTime();
  const headingLevel = useNextHeadingLevel();
  const { year } = recap;
  const days = dailyActivity(recap.matches, year, partsOf);
  const summary = summarizeDays(year, days);
  const hours = hourCounts(recap.matches, partsOf);
  const months = monthlyRecord(recap.matches, year, partsOf);
  const type = chronotype(hours);
  const peakHour = hours.reduce((best, value, hour) => (value > (hours[best] ?? 0) ? hour : best), 0);
  const busiestMonth = months.reduce((best, month) =>
    month.wins + month.losses > best.wins + best.losses ? month : best,
  );
  const dateOf = (month: number, day: number) => `${MONTH_NAMES[month]} ${day}`;
  const describe = type ? CHRONOTYPE[type.type] : null;
  const streak = summary.longestStreak;

  const calendarLabel = `Matches per day in ${year}: ${summary.activeDays} days with at least one match${
    summary.busiest
      ? `, the most on ${dateOf(summary.busiest.month, summary.busiest.day)} (${summary.busiest.matches})`
      : ""
  }.`;

  return (
    <StoryChapter
      id={id}
      eyebrow="When you played"
      title={describe?.title ?? "When you played"}
      description={type && describe ? describe.line(`${Math.round(type.share * 100)}%`) : undefined}
    >
      <StoryFigure
        value={count(summary.activeDays)}
        unit={`${plural(summary.activeDays, "day")} with Deadlock`}
        caption={
          streak && streak.length > 1
            ? `Your longest run: ${streak.length} days in a row, ${dateOf(streak.from.month, streak.from.day)} to ${dateOf(streak.to.month, streak.to.day)}.`
            : `Out of ${days.length}. You took plenty of breaks, and that is healthy.`
        }
      />
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        {summary.busiest && (
          <Stat
            label="Busiest day"
            value={`${SHORT_MONTHS[summary.busiest.month]} ${summary.busiest.day}`}
            sub={`${summary.busiest.matches} matches, ${summary.busiest.wins} won`}
          />
        )}
        <Stat
          label="Busiest month"
          value={MONTH_NAMES[busiestMonth.month]}
          sub={`${count(busiestMonth.wins + busiestMonth.losses)} matches`}
        />
        {summary.favoriteWeekday && (
          <Stat
            label="Favourite day"
            value={`${WEEKDAY_NAMES[summary.favoriteWeekday.weekday]}s`}
            sub={`${count(summary.favoriteWeekday.matches)} matches`}
          />
        )}
        <Stat
          label="Peak hour"
          value={hourLabel(peakHour)}
          sub={`${count(hours[peakHour] ?? 0)} matches started then`}
        />
      </StatGroup>

      <Stack gap={3}>
        <Heading as={headingLevel} size="sm">
          Your year, day by day
        </Heading>
        <CalendarHeat label={calendarLabel}>
          {MONTH_NAMES.map((name, month) => {
            const grid = monthGrid(year, month);
            const first = days.findIndex((day) => day.month === month);
            return (
              <CalendarHeatMonth key={name} label={name.slice(0, 3)} startWeekday={grid.offset}>
                {days.slice(first, first + grid.days).map((day) => (
                  <CalendarHeatDay
                    key={day.index}
                    color={
                      day.matches > 0 ? rampAt((day.matches - 1) / Math.max(1, summary.maxMatches - 1)) : undefined
                    }
                    state={summary.busiest?.index === day.index ? "marked" : "default"}
                  />
                ))}
              </CalendarHeatMonth>
            );
          })}
        </CalendarHeat>
        {summary.maxMatches > 0 && (
          <ChartGradientLegend stops={RAMP_STOPS} label="Matches a day" min="1" max={count(summary.maxMatches)} />
        )}
      </Stack>

      <Grid columns={{ base: 1, lg: 2 }} gap={6}>
        <Stack gap={2}>
          <Heading as={headingLevel} size="sm">
            Matches by hour of day
          </Heading>
          <ChartSurface
            label={`Matches by the hour they started. Most at ${hourLabel(peakHour)}.`}
            announce="label"
            size="md"
            variant="flush"
            dataTable={
              <ChartDataTable
                caption="Matches by starting hour"
                head={["Hour", "Matches"]}
                rows={hours.map((value, hour) => ({ key: hour, cells: [hourLabel(hour), count(value)] }))}
              />
            }
          >
            <BarChart
              data={hours.map((matches, hour) => ({ hour, matches }))}
              margin={CHART_MARGIN}
              accessibilityLayer={false}
            >
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                {...CHART_X_AXIS}
                dataKey="hour"
                type="number"
                domain={[-0.5, 23.5]}
                ticks={[0, 6, 12, 18]}
                tickFormatter={hourLabel}
              />
              <YAxis {...CHART_Y_AXIS} allowDecimals={false} />
              <Tooltip
                cursor={CHART_CURSOR_BAND}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as { hour: number; matches: number } | undefined;
                  if (!active || !row) return null;
                  return (
                    <ChartReadings
                      title={`${hourLabel(row.hour)} to ${hourLabel((row.hour + 1) % 24)}`}
                      label="Matches this hour"
                    >
                      <ChartReading label="Matches" color={CHART_COLOR.primary}>
                        {count(row.matches)}
                      </ChartReading>
                    </ChartReadings>
                  );
                }}
              />
              <Bar dataKey="matches" fill={CHART_COLOR.primary} radius={2} isAnimationActive={false} />
            </BarChart>
          </ChartSurface>
        </Stack>
        <Stack gap={2}>
          <Heading as={headingLevel} size="sm">
            Wins and losses by month
          </Heading>
          <ChartSurface
            label={`Wins and losses per month. Busiest: ${MONTH_NAMES[busiestMonth.month]}.`}
            announce="label"
            size="md"
            variant="flush"
            dataTable={
              <ChartDataTable
                caption="Wins and losses per month"
                head={["Month", "Wins", "Losses"]}
                rows={months.map((month) => ({
                  key: month.month,
                  cells: [MONTH_NAMES[month.month], count(month.wins), count(month.losses)],
                }))}
              />
            }
          >
            <BarChart
              data={months.map(({ month, wins, losses }) => ({ month, wins, losses, label: SHORT_MONTHS[month] }))}
              margin={CHART_MARGIN}
              accessibilityLayer={false}
            >
              <CartesianGrid {...CHART_GRID} />
              <XAxis {...CHART_X_AXIS_CATEGORY} dataKey="label" tickFormatter={(label: string) => label.slice(0, 1)} />
              <YAxis {...CHART_Y_AXIS} allowDecimals={false} />
              <Tooltip
                cursor={CHART_CURSOR_BAND}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as { month: number; wins: number; losses: number } | undefined;
                  if (!active || !row) return null;
                  return (
                    <ChartReadings title={MONTH_NAMES[row.month]} label="Matches this month">
                      <ChartReading label="Wins" color={CHART_COLOR.positive}>
                        {count(row.wins)}
                      </ChartReading>
                      <ChartReading label="Losses" color={CHART_COLOR.negative}>
                        {count(row.losses)}
                      </ChartReading>
                    </ChartReadings>
                  );
                }}
              />
              <Bar
                dataKey="wins"
                stackId="result"
                fill={CHART_COLOR.positive}
                {...CHART_STACK_SEGMENT}
                isAnimationActive={false}
              />
              <Bar
                dataKey="losses"
                stackId="result"
                fill={CHART_COLOR.negative}
                {...CHART_STACK_SEGMENT}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartSurface>
          <ChartLegend label="Results">
            <ChartLegendItem color={CHART_COLOR.positive} shape="square">
              Wins
            </ChartLegendItem>
            <ChartLegendItem color={CHART_COLOR.negative} shape="square">
              Losses
            </ChartLegendItem>
          </ChartLegend>
        </Stack>
      </Grid>
      <StoryNote>
        {local
          ? "Days and hours are in your time zone."
          : "Days and hours are in UTC until the page has loaded, then in your time zone."}
      </StoryNote>
    </StoryChapter>
  );
}
