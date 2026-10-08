import { day } from "~/dayjs";
import { MODE_CONFIG, type Mode } from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

import type { ResolveContext, SearchValue, Selection, SelectionMode, SelectionTime, SharedFilter } from "./types";

// The filters most analytics pages share, written once: a page lists the ones it reads, and they all take the same
// URL parameters.

const MODE_BY_SELECTION: Record<SelectionMode, Mode> = {
  ranked: "normal_ranked",
  unranked: "normal_unranked",
  street_brawl: "street_brawl",
};

function range(startUnix: number, endUnix?: number): string {
  return parseAsDayjsRange.serialize([day.unix(startUnix), endUnix === undefined ? undefined : day.unix(endUnix)]);
}

function lastDays(now: number, days: number): string {
  return parseAsDayjsRange.serialize([day.unix(now).utc().startOf("day").subtract(days, "day"), undefined]);
}

/** The `date_range` a time window stands for, or `undefined` where the site knows no such window yet. */
function dateRange(time: SelectionTime, { patches, seasons, now }: ResolveContext): string | undefined {
  const at = (list: readonly { startUnix: number; endUnix?: number }[], i: number) =>
    list[i] && range(list[i].startUnix, list[i].endUnix);
  switch (time) {
    case "current_patch":
      return at(patches, 0);
    case "previous_patch":
      return at(patches, 1);
    case "current_season":
      return at(seasons, 0);
    case "previous_season":
      return at(seasons, 1);
    case "last_7_days":
      return lastDays(now, 7);
    case "last_30_days":
      return lastDays(now, 30);
  }
}

/** The URL parameters of the shared filters a page reads; a filter the selection leaves open stays out of the URL. */
export function sharedFilterParams(
  filters: readonly SharedFilter[],
  selection: Selection,
  context: ResolveContext,
): Record<string, SearchValue> {
  const params: Record<string, SearchValue> = {};
  const config = MODE_CONFIG[selection.mode ? MODE_BY_SELECTION[selection.mode] : "normal_all"];
  if (filters.includes("mode") && selection.mode) {
    params.game_mode = config.gameMode;
    params.match_mode = config.matchMode;
  }
  // Ranks only narrow a mode that has them: unranked lobbies carry no average badge.
  if (filters.includes("rank") && selection.rank && config.supportsRank) {
    params.min_rank = selection.rank.min;
    params.max_rank = selection.rank.max;
  }
  const window = filters.includes("time") && selection.time ? dateRange(selection.time, context) : undefined;
  if (window) params.date_range = window;
  return params;
}
