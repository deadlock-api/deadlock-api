/**
 * React Query options and hooks for patron data and Steam account management.
 * Uses queryOptions() factories for composability (loaders, prefetching, etc.).
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import {
  addSteamAccount,
  deleteSteamAccount,
  getPatronStatus,
  getPlayerCard,
  listSteamAccounts,
  reactivateSteamAccount,
  refetchMatchHistory,
  replaceSteamAccount,
} from "~/lib/patron-api";

import { queryKeys } from "./query-keys";

// ============================================================================
// Query Options Factories
// ============================================================================

/**
 * The patron status and accounts are read by the auth provider and again by each page and gate below it; a short
 * freshness window keeps one navigation to one request. Logins, logouts and mutations update the cache themselves,
 * and a window focus still refetches once the window has passed.
 */
const PATRON_STALE_TIME = 30 * 1000;

export function patronStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.patron.status(),
    queryFn: getPatronStatus,
    staleTime: PATRON_STALE_TIME,
    refetchOnWindowFocus: true,
    // Avoids isLoading: true → false transition on every mount (which re-renders the
    // entire PatronAuthProvider subtree). The fetch still fires; once resolved the
    // auth state updates normally.
    initialData: null,
    initialDataUpdatedAt: 0,
  });
}

export function steamAccountsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.patron.steamAccounts(),
    queryFn: listSteamAccounts,
    staleTime: PATRON_STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function playerCardQueryOptions(steamId3: number) {
  return queryOptions({
    queryKey: queryKeys.patron.playerCard(steamId3),
    queryFn: () => getPlayerCard(steamId3),
    retry: false,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

// ============================================================================
// Query Hooks (thin wrappers for convenience)
// ============================================================================

export function usePatronStatus() {
  return useQuery(patronStatusQueryOptions());
}

export function useSteamAccounts() {
  return useQuery(steamAccountsQueryOptions());
}

export function usePlayerCard(steamId3: number, enabled = true) {
  return useQuery({ ...playerCardQueryOptions(steamId3), enabled });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/** A mutation of the patron's accounts: every patron query is refetched once it lands. */
function usePatronMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.patron.all });
    },
  });
}

export function useAddSteamAccount() {
  return usePatronMutation(addSteamAccount);
}

export function useDeleteSteamAccount() {
  return usePatronMutation(deleteSteamAccount);
}

export function useReplaceSteamAccount() {
  return usePatronMutation(({ accountId, steamId3 }: { accountId: string; steamId3: number }) =>
    replaceSteamAccount(accountId, steamId3),
  );
}

export function useReactivateSteamAccount() {
  return usePatronMutation(reactivateSteamAccount);
}

export function useRefetchMatchHistory() {
  return useMutation({
    mutationFn: refetchMatchHistory,
  });
}
