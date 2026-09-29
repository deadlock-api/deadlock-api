import { type Dayjs, day } from "~/dayjs";
import type { DateRange } from "~/lib/date-filter-preference";

/**
 * The map layouts kill and death positions were recorded on. The "City Never Sleeps" update (build 6711/6712) rebuilt
 * the whole map: same ±10752 world bounds, new streets, so positions from one layout land in the other's buildings.
 */
export type MapEra = "legacy" | "city-never-sleeps";

/**
 * When the rebuilt map went live; matches that started from then on were played on it. A page filtering by it
 * registers it with `registerExactBoundaries`, so a range starting here is not floored to midnight, which would pull
 * the last old-layout matches of the day back in.
 */
export const MAP_REWORK_START: Dayjs = day.utc("2026-09-29T20:50:00Z").local();
const MAP_REWORK_UNIX = MAP_REWORK_START.unix();

/**
 * The `client_version` to ask `/v1/assets/map` for, so the images match the positions. `undefined` is the latest build.
 * The API only knows exact builds; 6701 is the last one before the rework it has map data for.
 */
export const MAP_CLIENT_VERSION: Record<MapEra, number | undefined> = {
  legacy: 6701,
  "city-never-sleeps": undefined,
};

/**
 * How the map's `mid` image is drawn. `painted`: a finished image (streets light, buildings dark), drawn as it is.
 * `silhouette`: a black mask whose opaque pixels are the streets, which needs a base and a street color to be read.
 */
export type MapArt = "painted" | "silhouette";

export const MAP_ART: Record<MapEra, MapArt> = {
  legacy: "painted",
  "city-never-sleeps": "silhouette",
};

/**
 * The layout a query's time range was played on, by the query's unix bounds. A range that spans the rework is drawn
 * on the newer layout and flagged, since its older positions will not line up with it.
 */
export function mapEraOf(
  minUnixTimestamp: number | undefined,
  maxUnixTimestamp: number | undefined,
): { era: MapEra; spansRework: boolean } {
  if (maxUnixTimestamp != null && maxUnixTimestamp <= MAP_REWORK_UNIX) return { era: "legacy", spansRework: false };
  return { era: "city-never-sleeps", spansRework: (minUnixTimestamp ?? 0) < MAP_REWORK_UNIX };
}

/** A default range that reaches across the rework, trimmed to start at it; ranges on one side are returned as they are. */
export function trimToCurrentLayout(range: DateRange): DateRange {
  const [start, end] = range;
  const startsBefore = !start || start.unix() < MAP_REWORK_UNIX;
  const endsAfter = !end || end.unix() > MAP_REWORK_UNIX;
  return startsBefore && endsAfter ? [MAP_REWORK_START, end] : range;
}
