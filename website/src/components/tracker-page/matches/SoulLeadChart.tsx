import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { niceTicks } from "~/lib/chart-axis";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { OBJECTIVE_LABELS, type ObjectiveEvent, type ObjectiveEventKind } from "~/lib/tracker/objectives";
import type { SoulLead, SoulLeadPoint } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";

/** Marker length in pixels; bigger objectives get longer ticks. */
const MARKER_HEIGHTS: Record<ObjectiveEventKind, number> = {
  guardian: 6,
  walker: 9,
  baseGuardian: 12,
  shrine: 12,
  patron: 16,
  midBoss: 10,
};

function describeEvent(event: ObjectiveEvent): string {
  const at = `at ${formatMatchDuration(event.time)}`;
  if (event.kind === "midBoss") return `${event.own ? "Claimed" : "Enemy claimed"} the Mid Boss ${at}`;
  const label = OBJECTIVE_LABELS[event.kind];
  return event.own ? `Destroyed an enemy ${label} ${at}` : `Lost a ${label} ${at}`;
}

/** Own gains hang from the top edge of the plot, losses rise from the bottom edge; mid bosses are diamonds. */
function ObjectiveMarker({ cx = 0, cy = 0, event }: { cx?: number; cy?: number; event: ObjectiveEvent }) {
  const height = MARKER_HEIGHTS[event.kind];
  const direction = event.own ? 1 : -1;
  return (
    <g fill={event.own ? WIN_COLOR : LOSS_COLOR}>
      <title>{describeEvent(event)}</title>
      {event.kind === "midBoss" ? (
        <path d={`M${cx} ${cy}l4 ${4 * direction}l-4 ${4 * direction}l-4 ${-4 * direction}Z`} />
      ) : (
        <rect x={cx - 1} y={event.own ? cy : cy - height} width={2} height={height} rx={1} />
      )}
    </g>
  );
}

export function formatLead(lead: number): string {
  if (Math.abs(lead) < 1000) return `${lead < 0 ? "−" : "+"}${Math.abs(lead)}`;
  const thousands = Math.abs(lead) / 1000;
  const magnitude = thousands >= 10 || Number.isInteger(thousands) ? Math.round(thousands) : thousands.toFixed(1);
  return `${lead < 0 ? "−" : "+"}${magnitude}k`;
}

const TICK_STEPS = [1000, 2000, 5000, 10000, 20000, 50000];
const MAX_TICK_STEP = 100000;
const MAX_TICKS = 5;

/** Round tick steps that always include zero, so the axis reads as a lead scale. */
function leadTicks(min: number, max: number): number[] {
  const step = TICK_STEPS.find((candidate) => (max - min) / candidate <= MAX_TICKS - 1) ?? MAX_TICK_STEP;
  const ticks: number[] = [];
  for (let tick = Math.floor(min / step) * step; tick <= Math.ceil(max / step) * step; tick += step) ticks.push(tick);
  return ticks;
}

function LeadTooltipContent({ active, payload }: { active?: boolean; payload?: { payload: SoulLeadPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div
        className={cn(
          "text-sm font-semibold",
          point.lead > 0 ? WIN_TEXT_CLASS : point.lead < 0 ? LOSS_TEXT_CLASS : "text-popover-foreground",
        )}
      >
        {point.lead === 0
          ? "Even"
          : `${point.lead > 0 ? "Ahead" : "Behind"} by ${Math.abs(point.lead).toLocaleString("en-US")}`}
      </div>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {point.own.toLocaleString("en-US")} vs {point.enemy.toLocaleString("en-US")} souls
      </div>
      <div className="text-muted-foreground tabular-nums">{formatMatchDuration(point.time)}</div>
    </div>
  );
}

/** Width of the lead axis; the rest of the match timeline indents by it to share the chart's time axis. */
export const TIMELINE_GUTTER_PX = 48;
/** Right margin of the chart's plot area, matched by the rest of the match timeline. */
export const TIMELINE_END_PX = 4;

/** Round minute steps inside the match, zero left out as it is the plot's left edge. */
export function timelineTicks(durationS: number): number[] {
  return niceTicks(0, durationS / 60, 8)
    .filter((minute) => minute > 0 && minute * 60 <= durationS)
    .map((minute) => minute * 60);
}

/** The team soul lead over `[0, durationS]`, with gridlines on `timeTicks` and the time labels left to the caller. */
export function SoulLeadChart({
  lead,
  events,
  durationS,
  timeTicks,
}: {
  lead: SoulLead;
  events: ObjectiveEvent[];
  durationS: number;
  timeTicks: number[];
}) {
  const gradientId = useId();
  const max = Math.max(0, lead.peak.lead);
  const min = Math.min(0, lead.trough.lead);
  const zeroOffset = max === min ? 0 : max / (max - min);
  const ticks = leadTicks(min, max);

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={lead.points} margin={{ top: 6, right: TIMELINE_END_PX, bottom: 6, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroOffset} stopColor={WIN_COLOR} />
            <stop offset={zeroOffset} stopColor={LOSS_COLOR} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeWidth={1} />
        <XAxis
          dataKey="time"
          type="number"
          domain={[0, durationS]}
          ticks={timeTicks}
          tick={false}
          tickLine={false}
          axisLine={false}
          height={0}
        />
        <YAxis
          dataKey="lead"
          type="number"
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
          // The default interval drops the bottom label, which overhangs the plot now the time axis sits below the timeline.
          interval={0}
          tickFormatter={(value: number) => (value === 0 ? "0" : formatLead(value))}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={TIMELINE_GUTTER_PX}
        />
        <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<LeadTooltipContent />} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
        {events.map((event, index) => (
          <ReferenceDot
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            x={event.time}
            y={event.own ? ticks[ticks.length - 1] : ticks[0]}
            r={0}
            shape={(props) => <ObjectiveMarker cx={props.cx} cy={props.cy} event={event} />}
          />
        ))}
        <Area
          type="monotone"
          dataKey="lead"
          baseValue={0}
          stroke={`url(#${gradientId})`}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          fillOpacity={0.2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--foreground)" }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
