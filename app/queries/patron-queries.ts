/**
 * React Query hooks for patron data and Steam account management
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addSteamAccount,
  deleteSteamAccount,
  getPatronStatus,
  getPlayerCard,
  listSteamAccounts,
  reactivateSteamAccount,
  replaceSteamAccount,
} from "~/lib/patron-api";
import { api } from "~/lib/api";

// ============================================================================
// Query Keys
// ============================================================================

export const patronQueryKeys = {
  all: ["patron"] as const,
  status: () => [...patronQueryKeys.all, "status"] as const,
  steamAccounts: () => [...patronQueryKeys.all, "steam-accounts"] as const,
  playerCard: (steamId3: number) => [...patronQueryKeys.all, "player-card", steamId3] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch the current patron's status including slot usage
 * Returns null if not authenticated
 */
export function usePatronStatus() {
  return useQuery({
    queryKey: patronQueryKeys.status(),
    queryFn: getPatronStatus,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch the list of Steam accounts for the current patron
 */
export function useSteamAccounts() {
  return useQuery({
    queryKey: patronQueryKeys.steamAccounts(),
    queryFn: listSteamAccounts,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch the Steam profile card for a prioritized account.
 * Returns ranked badge level and display slots.
 * Throws BotNotFriendError if the account hasn't friended a bot yet.
 * Only runs when enabled=true (pass false for inactive/deleted accounts).
 */
export function usePlayerCard(steamId3: number, enabled = true) {
  return useQuery({
    queryKey: patronQueryKeys.playerCard(steamId3),
    queryFn: () => getPlayerCard(steamId3),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min — matches server-side cache
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to add a new Steam account
 * Invalidates both steam accounts and patron status queries on success
 */
export function useAddSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (steamId3: number) => addSteamAccount(steamId3),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.steamAccounts() });
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.status() });
    },
  });
}

/**
 * Hook to delete a Steam account (soft delete with 24-hour cooldown)
 * Invalidates both steam accounts and patron status queries on success
 */
export function useDeleteSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => deleteSteamAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.steamAccounts() });
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.status() });
    },
  });
}

/**
 * Hook to replace a deleted Steam account with a new Steam ID
 * Invalidates both steam accounts and patron status queries on success
 */
export function useReplaceSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, steamId3 }: { accountId: string; steamId3: number }) =>
      replaceSteamAccount(accountId, steamId3),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.steamAccounts() });
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.status() });
    },
  });
}

/**
 * Hook to reactivate a previously deleted Steam account
 * Invalidates both steam accounts and patron status queries on success
 */
export function useReactivateSteamAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => reactivateSteamAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.steamAccounts() });
      queryClient.invalidateQueries({ queryKey: patronQueryKeys.status() });
    },
  });
}

/**
 * Hook to force-refetch the full match history for a player from Steam.
 * Calls the PlayersApi match-history endpoint with force_refetch=true.
 */
export function useRefetchMatchHistory() {
  return useMutation({
    mutationFn: (accountId: number) =>
      api.players_api.matchHistory({ accountId, forceRefetch: true }),
  });
}
