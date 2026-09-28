import { day } from "~/dayjs";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { parseCompareIds } from "~/lib/player-compare";
import { SITE_URL } from "~/lib/seo";

/** The URL params a comparison's filters come from. */
export const COMPARE_FILTER_KEYS = ["hero", "game_mode", "match_mode", "date_range"] as const;
export type CompareFilterSearch = Partial<Record<(typeof COMPARE_FILTER_KEYS)[number], string>>;

/** The search params that define a comparison: its players and its filters. Everything else is view state. */
const SHARE_KEYS = ["players", ...COMPARE_FILTER_KEYS] as const;

/** The filter params of a search, as strings (a TanStack search holds the hero as a number). */
export function compareFilterSearch(search: Record<string, unknown> | URLSearchParams): CompareFilterSearch {
  const read = (key: string) => (search instanceof URLSearchParams ? search.get(key) : search[key]);
  return Object.fromEntries(
    COMPARE_FILTER_KEYS.flatMap((key) => {
      const value = read(key);
      return typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [];
    }),
  );
}

/**
 * A comparison's params from the page's search: a query string, or the object TanStack parsed it into (where one id
 * is a number and a list the comma string). With `range` (a link to share: the page's effective range), the dates are
 * pinned at both ends as short bare dates, today for an open end. Without it (the og:image), the URL's own dates are
 * kept, so the image URL stays stable and cacheable.
 */
export function compareShareParams(
  search: string | Record<string, unknown>,
  range?: { minUnixTimestamp?: number; maxUnixTimestamp?: number },
): URLSearchParams {
  const source = typeof search === "string" ? new URLSearchParams(search) : undefined;
  const params = new URLSearchParams();
  for (const key of SHARE_KEYS) {
    const value = source ? source.get(key) : (search as Record<string, unknown>)[key];
    if ((typeof value === "string" && value !== "") || typeof value === "number") params.set(key, String(value));
  }
  // A shared link names both ends of its dates: the page's own range where the URL has none, and now for an open end,
  // so everyone who opens it sees the same numbers, today or next month.
  if (range) {
    // Written like the page writes it: whole UTC days as bare dates, any other boundary (a patch release) as its instant.
    const { minUnixTimestamp: min, maxUnixTimestamp: max } = range;
    const end = max != null ? day.unix(max).endOf("second") : day.utc().endOf("day");
    params.set("date_range", parseAsDayjsRange.serialize([min ? day.unix(min) : undefined, end]));
  }
  return params;
}

/**
 * The params of a share card in one spelling: valid players each once, the filters in a fixed order, nothing else. The
 * card's cache key, so `utm_*` tags, a duplicated id or a reordered query all hit the same drawn card.
 */
export function canonicalCardParams(search: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  const players = parseCompareIds((search.get("players") ?? "").split(",").map(Number));
  if (players.length > 0) params.set("players", players.join(","));
  for (const key of COMPARE_FILTER_KEYS) {
    const value = search.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

function query(params: URLSearchParams): string {
  return params.size > 0 ? `?${params}` : "";
}

/** The short link to a comparison, `/compare?…`, which redirects to the page. */
export function compareShareUrl(params: URLSearchParams, origin = SITE_URL): string {
  return `${origin}/compare${query(params)}`;
}

/** Its share card, the page's og:image. */
export function compareCardUrl(params: URLSearchParams, origin = SITE_URL): string {
  return `${origin}/og/compare.png${query(params)}`;
}
