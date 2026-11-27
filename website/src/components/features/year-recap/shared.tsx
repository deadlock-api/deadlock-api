import { Link } from "@tanstack/react-router";

import { GameIcon, type GameIconName } from "~/components/domain/assets/GameIcon";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { StoryNote } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import { type TimeParts, utcParts } from "~/lib/year-recap/recap";
import type { SlimHero } from "~/queries/asset-queries";

/** Whole numbers grouped the same everywhere (the server renders in a fixed locale too). */
export const count = (value: number) => Math.round(value).toLocaleString("en-US");

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
/** 103.2M, 41.5K: for numbers too long to read at a glance. */
export const compact = (value: number) => COMPACT.format(value);

export const hours = (seconds: number) => count(seconds / 3600);

export const plural = (value: number, one: string, many = `${one}s`) => (Math.round(value) === 1 ? one : many);

const localParts = (unix: number): TimeParts => {
  const time = day.unix(unix);
  return { year: time.year(), month: time.month(), day: time.date(), hour: time.hour() };
};

/**
 * Wall-clock time for the recap: UTC on the server and through hydration, the visitor's own zone after, so the first
 * client render matches the server's HTML and then the calendar and the clock move into local time.
 */
export function useRecapTime() {
  const hydrated = useHydrated();
  return {
    local: hydrated,
    partsOf: hydrated ? localParts : utcParts,
    format: (unix: number, template: string) => (hydrated ? day.unix(unix) : day.unix(unix).utc()).format(template),
  };
}

/**
 * The honest line under numbers that only some matches carry: "Based on 291 of your 2,369 matches, the ones with full
 * match details." Left out once they cover every match. `backfill` says the rest is still being filled in.
 */
export function Coverage({
  covered,
  total,
  what = "full match details",
  backfill = true,
}: {
  covered: number;
  total: number;
  what?: string;
  backfill?: boolean;
}) {
  if (covered >= total) return null;
  return (
    <StoryNote>
      Based on {count(covered)} of your {count(total)} matches, the ones with {what}.
      {backfill && " We are still adding the details of the others."}
    </StoryNote>
  );
}

/** A hero's own color as a CSS color, for a prop built to take a data color (a chapter or card accent). */
export function heroAccent(hero: SlimHero | undefined): string | undefined {
  const color = hero?.colors?.style ?? hero?.colors?.ui;
  return color ? `rgb(${color.join(" ")})` : undefined;
}

/**
 * A chapter's big number under a piece of game art: the art says what is counted, the number how much. Above rather
 * than beside, so a long caption under the number never pushes the art away from it.
 */
export function FigureArt({ art, children }: { art: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack gap={2} align="center">
      {art}
      {children}
    </Stack>
  );
}

/** One record of the year as a card that opens its match. */
export function RecordCard({
  label,
  icon,
  value,
  heroId,
  won,
  matchId,
  startTime,
}: {
  label: string;
  /** The game's glyph for what the record counts. */
  icon?: GameIconName;
  value: string;
  heroId: number;
  won: boolean;
  matchId: number;
  startTime: number;
}) {
  const { format } = useRecapTime();
  return (
    <Card asChild size="sm" interaction="pressable">
      <Link to="/matches/$matchId" params={{ matchId: String(matchId) }} preload="intent">
        <CardContent className="flex items-center gap-3">
          <HeroImage heroId={heroId} decorative shape="circle" className="size-10 shrink-0" />
          <Stack gap={0.5} className="min-w-0">
            <Inline gap={1.5} wrap="nowrap" align="center">
              {icon && <GameIcon name={icon} size="sm" className="text-muted-foreground" />}
              <Text variant="eyebrow">{label}</Text>
            </Inline>
            <Text className="type-value" numeric="tabular">
              {value}
            </Text>
            <Text variant="caption" tone="muted" wrap="truncate">
              <HeroName heroId={heroId} /> · {format(startTime, "MMM D")} · {won ? "Won" : "Lost"}
            </Text>
          </Stack>
        </CardContent>
      </Link>
    </Card>
  );
}
