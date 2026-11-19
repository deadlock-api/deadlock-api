import { formatPercent } from "~/lib/format";
import type { EdgeMinute, MapPlace } from "~/lib/live-requests/feed";
import type { LiveStats } from "~/lib/live-requests/useLiveRequests";

import { formatCompact, formatMs } from "./format";

/** What the map's probe says about a mark: its name, and its traffic as label and value pairs. */
export interface MarkReading {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string }[];
}

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** A country's name from its ISO code; the code itself when it names none (Cloudflare's `T1` is Tor). */
export function countryName(code: string): string {
  try {
    return REGIONS.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Most data centers see well under a request a second, so their rates read per minute. */
const perMinute = (perSecond: number) => `${formatCompact(perSecond * 60)}/min`;

/**
 * The card of a mark of the live map. Our server: its requests, what it is working on, how fast and how well it
 * answers. A Cloudflare data center: the requests it passed to our server for the players who reached it, the ones it
 * handed over as the data center next to our server, the ones it answered itself, and where its players are. Our server
 * is named by its role, never its address. `stats` is null before the first batch; then only the name shows.
 */
export function markReading(place: MapPlace, stats: LiveStats | null, edge: EdgeMinute | null): MarkReading {
  if (place.kind === "origin") {
    const rows: MarkReading["rows"] = [];
    if (stats?.queue) {
      rows.push(
        { label: "Requests", value: `${formatCompact(stats.perSecond)}/s` },
        { label: "In progress", value: formatCompact(stats.queue.inFlight) },
      );
      if (stats.latency) rows.push({ label: "Median time", value: formatMs(stats.latency.p50) });
      if (stats.errorShare !== null) rows.push({ label: "Errors (5xx)", value: formatPercent(stats.errorShare) });
      rows.push({
        label: "Database queries",
        value: `${stats.queue.dbRunning} running, ${stats.queue.dbWaiting} waiting`,
      });
    }
    return { title: "API server", rows };
  }

  const rows: MarkReading["rows"] = [];
  const countries = new Map<string, number>();
  const traffic = stats?.colos.get(place.code);
  if (stats?.queue) {
    rows.push({ label: "To our server", value: perMinute(traffic?.entered ?? 0) });
    if (traffic?.handed) rows.push({ label: "Handed to our server", value: perMinute(traffic.handed) });
    for (const [country, rate] of traffic?.countries ?? []) countries.set(country, rate);
  }
  if (edge) {
    let answered = 0;
    for (const group of edge.groups) {
      if (group.colo !== place.code) continue;
      answered += group.count / 60;
      countries.set(group.country, (countries.get(group.country) ?? 0) + group.count / 60);
    }
    rows.push({ label: "Answered by Cloudflare", value: perMinute(answered) });
  }
  let top: [string, number] | null = null;
  let total = 0;
  for (const entry of countries) {
    // Cloudflare's XX is a client it could not place.
    if (!entry[0] || entry[0] === "XX") continue;
    total += entry[1];
    if (!top || entry[1] > top[1]) top = entry;
  }
  if (top && total > 0) {
    rows.push({ label: "Top country", value: `${countryName(top[0])} · ${formatPercent(top[1] / total, 0)}` });
  }
  return { title: place.city, subtitle: `Cloudflare edge · ${place.code}`, rows };
}
