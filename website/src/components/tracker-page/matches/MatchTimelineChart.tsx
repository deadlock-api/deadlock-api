import { Skull } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { HeroImage } from "~/components/HeroImage";
import { Tooltip as HoverTooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { niceTicks } from "~/lib/chart-axis";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { OBJECTIVE_LABELS, type ObjectiveEvent, type ObjectiveEventKind } from "~/lib/tracker/objectives";
import type { SoulLead, SoulLeadPoint } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";
import { PanelTooltipContent } from "../shared/PanelTooltipContent";
import { TEAMS } from "./Scoreboard";

const ASSETS = "https://assets-bucket.deadlock-api.com/assets-api-res";
const GUARDIAN_ICON = `${ASSETS}/images/shop/images/minimap/objective_icon_t1.svg`;

/**
 * Flat game silhouettes per objective, tinted with the side's colour; bigger objectives get bigger marks. Only the
 * Guardian and Walker have minimap art, so a Base Guardian reuses the Guardian's at a larger size, a Shrine (the
 * Patron's shield generator) takes the defend ping's shield, and the Mid Boss the Rejuvenator it drops.
 */
const OBJECTIVE_ICONS: Record<Exclude<ObjectiveEventKind, "patron">, { src: string; size: number }> = {
  guardian: { src: GUARDIAN_ICON, size: 12 },
  walker: { src: `${ASSETS}/images/shop/images/minimap/objective_icon_t2.svg`, size: 14 },
  baseGuardian: { src: GUARDIAN_ICON, size: 16 },
  shrine: { src: `${ASSETS}/images/shop/images/hud/ping/ping_icon_defend.svg`, size: 14 },
  midBoss: { src: `${ASSETS}/images/shop/images/hud/icons/rejuvenator.svg`, size: 14 },
};
/** A Patron is marked with the emblem of the team it belonged to. */
const PATRON_ICONS: Record<string, string> = {
  [TEAMS[0].key]: `${ASSETS}/icons/hud/core/team1_icon.svg`,
  [TEAMS[1].key]: `${ASSETS}/icons/hud/core/team2_icon.svg`,
};
const PATRON_ICON_SIZE = 18;

function objectiveIcon(event: ObjectiveEvent): { src: string; size: number } {
  if (event.kind !== "patron") return OBJECTIVE_ICONS[event.kind];
  return { src: PATRON_ICONS[event.team] ?? PATRON_ICONS[TEAMS[0].key], size: PATRON_ICON_SIZE };
}

/** Gap between an objective mark and the plot edge it sits on. */
const OBJECTIVE_INSET_PX = 2;
const OBJECTIVE_SLOT_PX = PATRON_ICON_SIZE + 2;

function describeOutcome(event: ObjectiveEvent): string {
  if (event.kind === "midBoss") return event.own ? "Claimed by your team" : "Claimed by the enemy";
  return event.own ? "Destroyed by your team" : "Lost to the enemy";
}

/** Own gains sit along the top edge of the plot, losses along the bottom edge. */
function ObjectiveMarker({
  cx = 0,
  cy = 0,
  event,
  level,
}: {
  cx?: number;
  cy?: number;
  event: ObjectiveEvent;
  /** How many marks this one stacks in from the edge, where marks close in time would overlap. */
  level: number;
}) {
  const { src, size } = objectiveIcon(event);
  const color = event.own ? WIN_COLOR : LOSS_COLOR;
  const inset = OBJECTIVE_INSET_PX + level * OBJECTIVE_SLOT_PX;
  const top = event.own ? cy + inset : cy - inset - size;
  return (
    <HoverTooltip>
      <TooltipTrigger asChild>
        <g>
          <foreignObject x={cx - size / 2 - 2} y={top - 2} width={size + 4} height={size + 4}>
            <div
              className="m-0.5"
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                mask: `url("${src}") center / contain no-repeat`,
              }}
            />
          </foreignObject>
        </g>
      </TooltipTrigger>
      <PanelTooltipContent>
        <div className="font-medium">
          {OBJECTIVE_LABELS[event.kind]} · {formatMatchDuration(event.time)}
        </div>
        <div className={event.own ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS}>{describeOutcome(event)}</div>
      </PanelTooltipContent>
    </HoverTooltip>
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

const LEAD_AXIS_PX = 48;
const PLOT_END_PX = 8;
/** Fixed plot heights, so the chart keeps its size whichever player's chips it shows. */
const LEAD_PLOT_PX = 190;
const LEADLESS_PLOT_PX = 96;
const MIN_SCALE_PX = 60;
const X_AXIS_PX = 16;
const CHIP_PX = 20;
const CHIP_GAP_PX = 2;
const LEVEL_PX = CHIP_PX + CHIP_GAP_PX;
/** Gap between the lead line and the first chip stacked off it. */
const STEM_PX = 4;
const EDGE_PX = 4;

/** Round minute steps inside the match, zero left out as it is the plot's left edge. */
function minuteTicks(durationS: number): number[] {
  return niceTicks(0, durationS / 60, 8)
    .filter((minute) => minute > 0 && minute * 60 <= durationS)
    .map((minute) => minute * 60);
}

/** The lead at any time, straight between samples; zero without a lead line. */
function leadAt(points: SoulLeadPoint[], time: number): number {
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (time <= b.time) {
      return b.time === a.time ? b.lead : a.lead + ((b.lead - a.lead) * (time - a.time)) / (b.time - a.time);
    }
  }
  return points.length > 0 ? points[points.length - 1].lead : 0;
}

/** Stack level per time-sorted event, so chips closer than a chip's width move further off the line. */
function stackLevels(times: number[], pxPerSecond: number, footprintPx = CHIP_PX): number[] {
  const levelEnds: number[] = [];
  return times.map((time) => {
    const left = time * pxPerSecond - footprintPx / 2;
    let level = levelEnds.findIndex((end) => end <= left);
    if (level === -1) level = levelEnds.length;
    levelEnds[level] = left + footprintPx + CHIP_GAP_PX;
    return level;
  });
}

/** Stack levels for the objective marks, each edge stacked on its own; `objectives` arrive sorted by time. */
function objectiveStackLevels(objectives: ObjectiveEvent[], pxPerSecond: number): number[] {
  const levels = new Array<number>(objectives.length);
  for (const own of [true, false]) {
    const indices = objectives.flatMap((event, index) => (event.own === own ? [index] : []));
    const sideLevels = stackLevels(
      indices.map((index) => objectives[index].time),
      pxPerSecond,
      OBJECTIVE_SLOT_PX,
    );
    indices.forEach((index, i) => {
      levels[index] = sideLevels[i];
    });
  }
  return levels;
}

export interface TimelineEvent {
  time: number;
  /** The hero the chip shows; null for a death no player was credited with. */
  hero: TrackerMatchPlayer | null;
  /** Gains for the tracked player's side sit above the lead line, losses below it. */
  side: "gain" | "loss";
  tooltip: ReactNode;
}

export interface DeadWindow {
  start: number;
  end: number;
}

/** A hero chip stacked off the lead line at its time, with a stem back to the line. */
function ChipMarker({
  cx = 0,
  cy = 0,
  event,
  level,
}: {
  cx?: number;
  cy?: number;
  event: TimelineEvent;
  level: number;
}) {
  const direction = event.side === "gain" ? -1 : 1;
  const center = cy + direction * (STEM_PX + CHIP_PX / 2 + level * LEVEL_PX);
  const color = event.side === "gain" ? WIN_COLOR : LOSS_COLOR;
  return (
    <g>
      <line x1={cx} y1={cy} x2={cx} y2={center - (direction * CHIP_PX) / 2} stroke={color} strokeOpacity={0.7} />
      <foreignObject x={cx - CHIP_PX / 2 - 2} y={center - CHIP_PX / 2 - 2} width={CHIP_PX + 4} height={CHIP_PX + 4}>
        <HoverTooltip>
          <TooltipTrigger asChild>
            <div className="m-0.5 size-5 rounded-full bg-card" style={{ boxShadow: `0 0 0 1.5px ${color}` }}>
              {event.hero ? (
                <HeroImage heroId={event.hero.hero_id} className="size-5 rounded-full" title="" />
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                  <Skull className="size-3 text-muted-foreground" />
                </span>
              )}
            </div>
          </TooltipTrigger>
          <PanelTooltipContent>{event.tooltip}</PanelTooltipContent>
        </HoverTooltip>
      </foreignObject>
    </g>
  );
}

/**
 * The team soul lead over the match with events as hero chips off the lead line at their times, gains above and
 * losses below, the tracked player's respawn waits shaded, and objectives marked at the lead scale's ends. Without
 * a lead, as in Street Brawl, the events sit on the zero line.
 */
export function MatchTimelineChart({
  lead,
  objectives,
  events,
  deadWindows,
  durationS,
}: {
  lead: SoulLead | null;
  objectives: ObjectiveEvent[];
  /** Sorted by time. */
  events: TimelineEvent[];
  deadWindows: DeadWindow[];
  durationS: number;
}) {
  const gradientId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const points = lead?.points ?? [];
  const data = lead
    ? points
    : [
        { time: 0, own: 0, enemy: 0, lead: 0 },
        { time: durationS, own: 0, enemy: 0, lead: 0 },
      ];
  const max = Math.max(0, lead?.peak.lead ?? 0);
  const min = Math.min(0, lead?.trough.lead ?? 0);
  const ticks = lead ? leadTicks(min, max) : [0];
  const [lo, hi] = lead ? [ticks[0], ticks[ticks.length - 1]] : [-1, 1];
  const plotPx = lead ? LEAD_PLOT_PX : LEADLESS_PLOT_PX;

  const pxPerSecond = width > LEAD_AXIS_PX + PLOT_END_PX ? (width - LEAD_AXIS_PX - PLOT_END_PX) / durationS : 0;
  const objectiveLevels = objectiveStackLevels(objectives, pxPerSecond);
  const gains = events.filter((event) => event.side === "gain");
  const losses = events.filter((event) => event.side === "loss");
  const gainLevels = stackLevels(
    gains.map((event) => event.time),
    pxPerSecond,
  );
  const lossLevels = stackLevels(
    losses.map((event) => event.time),
    pxPerSecond,
  );
  const placed = [
    ...gains.map((event, index) => ({ event, level: gainLevels[index] })),
    ...losses.map((event, index) => ({ event, level: lossLevels[index] })),
  ];
  // The lead scale shrinks inside the fixed plot to leave room for as far as the stacks reach past its ends, which
  // keeps the chips inside the plot and clear of the time axis. The room depends on the scale, so a few passes
  // settle it.
  const reach = (level: number) => STEM_PX + (level + 1) * LEVEL_PX;
  let scalePx = plotPx;
  let roomAbovePx = 0;
  let roomBelowPx = 0;
  for (let pass = 0; pass < 3; pass++) {
    const lineY = (time: number) => ((hi - leadAt(points, time)) / (hi - lo)) * scalePx;
    roomAbovePx = Math.max(
      0,
      ...placed.map(({ event, level }) => (event.side === "gain" ? reach(level) - lineY(event.time) : 0)),
    );
    roomBelowPx = Math.max(
      0,
      ...placed.map(({ event, level }) => (event.side === "loss" ? lineY(event.time) + reach(level) - scalePx : 0)),
    );
    scalePx = Math.max(MIN_SCALE_PX, plotPx - roomAbovePx - roomBelowPx);
  }
  const valuePerPx = (hi - lo) / scalePx;
  const domain: [number, number] = [lo - roomBelowPx * valuePerPx, hi + roomAbovePx * valuePerPx];
  // The gradient spans the area's own bounding box, which runs from the lowest to the highest lead with zero included.
  const zeroOffset = max === min ? 0 : max / (max - min);

  return (
    <div ref={wrapperRef}>
      <ResponsiveContainer width="100%" height={plotPx + 2 * EDGE_PX + X_AXIS_PX}>
        <AreaChart data={data} margin={{ top: EDGE_PX, right: PLOT_END_PX, bottom: EDGE_PX, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroOffset} stopColor={WIN_COLOR} />
              <stop offset={zeroOffset} stopColor={LOSS_COLOR} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeWidth={1} horizontal={lead != null} />
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, durationS]}
            ticks={minuteTicks(durationS)}
            tickFormatter={(value: number) => `${Math.round(value / 60)}m`}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            height={X_AXIS_PX}
          />
          <YAxis
            dataKey="lead"
            type="number"
            domain={domain}
            ticks={ticks}
            interval={0}
            tickFormatter={(value: number) => (value === 0 ? "0" : formatLead(value))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            width={LEAD_AXIS_PX}
          />
          {deadWindows.map((window) => (
            <ReferenceArea
              key={window.start}
              x1={window.start}
              x2={Math.min(window.end, durationS)}
              fill={LOSS_COLOR}
              fillOpacity={0.07}
              ifOverflow="hidden"
            />
          ))}
          {lead && <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<LeadTooltipContent />} />}
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
          {lead &&
            objectives.map((event, index) => (
              <ReferenceDot
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                x={event.time}
                y={event.own ? hi : lo}
                r={0}
                shape={(props) => (
                  <ObjectiveMarker cx={props.cx} cy={props.cy} event={event} level={objectiveLevels[index]} />
                )}
              />
            ))}
          {lead && (
            <Area
              type="linear"
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
          )}
          {pxPerSecond > 0 &&
            placed.map(({ event, level }, index) => (
              <ReferenceDot
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                x={event.time}
                y={leadAt(points, event.time)}
                r={0}
                ifOverflow="visible"
                shape={(props) => <ChipMarker cx={props.cx} cy={props.cy} event={event} level={level} />}
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
