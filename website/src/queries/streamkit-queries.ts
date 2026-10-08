import { queryOptions } from "@tanstack/react-query";
import type { VariablesResolveRegionEnum } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { api } from "~/lib/api";
import { parseSteamIdToId3 } from "~/lib/steam";

import { queryKeys } from "./query-keys";

/**
 * Resolves Stream Kit variables for one account. `extraArgs` are the variables' own arguments (`hero_name` and any the
 * API adds later); the SDK only names `hero_name`, so they travel as plain query parameters. Empty ones are dropped.
 */
export async function resolveVariables(
  region: string,
  accountId: string,
  variables: readonly string[],
  extraArgs: Readonly<Record<string, string>> = {},
): Promise<Record<string, string>> {
  const params = Object.fromEntries(Object.entries(extraArgs).filter(([, value]) => value));
  const response = await api.commands_api.variablesResolve(
    {
      // A SteamID64 in a hand-written widget URL is read exactly, not through a lossy Number().
      accountId: Number(parseSteamIdToId3(accountId)),
      region: region as VariablesResolveRegionEnum,
      variables: variables.join(","),
    },
    { params },
  );
  return response.data;
}

/** Every variable the chat commands and widgets can show, with the extra arguments each takes. */
export const availableVariablesQueryOptions = queryOptions({
  queryKey: queryKeys.streamkit.availableVariables(),
  queryFn: async () => (await api.commands_api.availableVariables()).data,
  staleTime: CACHE_DURATIONS.FOREVER,
});

/** Live variable values for a widget on stream, refetched every `refreshInterval` even while the tab is hidden. */
export function streamkitStatsQueryOptions({
  region,
  accountId,
  variables,
  extraArgs = {},
  refreshInterval = UPDATE_INTERVAL_MS,
}: {
  region: string;
  accountId: string;
  variables: readonly string[];
  extraArgs?: Readonly<Record<string, string>>;
  refreshInterval?: number;
}) {
  return queryOptions({
    queryKey: queryKeys.streamkit.stats(region, accountId, variables, extraArgs),
    queryFn: () => resolveVariables(region, accountId, variables, extraArgs),
    staleTime: refreshInterval - 10_000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });
}

/** The Steam name of the account the Stream Kit is set up for; `null` when the API has none. */
export function streamkitSteamNameQueryOptions(region: string, accountId: string) {
  return queryOptions({
    queryKey: queryKeys.steam.name(region, accountId),
    queryFn: async () => (await resolveVariables(region, accountId, ["steam_account_name"])).steam_account_name ?? null,
    enabled: region !== "" && /^\d+$/.test(accountId),
  });
}

/** What the chat bot would answer for a generated command URL. */
export function commandPreviewQueryOptions(url: string) {
  return queryOptions({
    queryKey: queryKeys.streamkit.preview(url),
    queryFn: async ({ signal }) =>
      (await api.client.get<string>(url, { responseType: "text", signal, headers: { Accept: "*/*" } })).data,
    enabled: url !== "",
    staleTime: 60 * 1000,
  });
}

/**
 * Each widget type's version. An overlay reloads itself when its type's version goes up, so it is polled every five
 * minutes, in the background too.
 */
export const widgetVersionsQueryOptions = queryOptions({
  queryKey: queryKeys.streamkit.versions(),
  queryFn: async () => (await api.commands_api.widgetVersions()).data,
  staleTime: (5 * 60 - 10) * 1000,
  refetchInterval: CACHE_DURATIONS.FIVE_MINUTES,
  refetchIntervalInBackground: true,
});
