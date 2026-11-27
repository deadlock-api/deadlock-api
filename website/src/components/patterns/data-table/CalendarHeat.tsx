import { cn } from "~/lib/utils";

// A year of days as small month calendars, each day a square filled by its reading (matches played). A picture with a
// text alternative, not a widget: `label` summarises it for assistive technology and the days are hidden from it, so
// the numbers that matter must also be in the text around it (the busiest day, the active days).

/** Months side by side: three a row on a phone, four from a 32rem container, six from 48rem. */
export function CalendarHeat({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"figure">, "aria-label"> & {
  /** The summary read instead of the days: "Matches per day in 2026: 211 active days, busiest 14 March (19 matches)". */
  label: string;
}) {
  return (
    <figure data-slot="calendar-heat" className={cn("@container/calendar min-w-0", className)} {...props}>
      <figcaption className="sr-only">{label}</figcaption>
      <div
        aria-hidden="true"
        className="grid grid-cols-3 gap-x-3 gap-y-4 @lg/calendar:grid-cols-4 @3xl/calendar:grid-cols-6"
      >
        {children}
      </div>
    </figure>
  );
}

/** One month: its name and its days in weeks from Monday. `startWeekday` (0 = Monday) leaves the room before the 1st. */
export function CalendarHeatMonth({
  label,
  startWeekday = 0,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string; startWeekday?: number }) {
  return (
    <div data-slot="calendar-heat-month" className={cn("flex min-w-0 flex-col gap-1.5", className)} {...props}>
      <span className="type-caption text-muted-foreground">{label}</span>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: Math.max(0, Math.min(6, startWeekday)) }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}
        {children}
      </div>
    </div>
  );
}

/**
 * One day. `color` is the reading's fill straight from data (a ramp's CSS color); without one the day had none and
 * takes the muted track. `state` `marked` rings a day the text around the calendar names (the busiest).
 */
export function CalendarHeatDay({
  color,
  state = "default",
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"span">, "color"> & { color?: string; state?: "default" | "marked" }) {
  return (
    <span
      data-slot="calendar-heat-day"
      data-state={state}
      className={cn(
        "aspect-square min-w-0 rounded-xs bg-muted",
        state === "marked" && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
        className,
      )}
      style={color == null ? style : { backgroundColor: color, ...style }}
      {...props}
    />
  );
}
