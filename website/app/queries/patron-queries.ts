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

export function patronStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.patron.status(),
    queryFn: getPatronStatus,
    refetchOnWindowFocus: true,
  });
}

export function steamAccountsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.patron.steamAccounts(),
    queryFn: listSteamAccounts,
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

export function useAddSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addSteamAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patron.all });
    },
  });
}

export function useDeleteSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSteamAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patron.all });
    },
  });
}

export function useReplaceSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, steamId3 }: { accountId: string; steamId3: number }) =>
      replaceSteamAccount(accountId, steamId3),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patron.all });
    },
  });
}

export function useReactivateSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reactivateSteamAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patron.all });
    },
  });
}

export function useRefetchMatchHistory() {
  return useMutation({
    mutationFn: refetchMatchHistory,
  });
}
