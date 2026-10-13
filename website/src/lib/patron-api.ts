/**
 * Patron API Utilities
 * Handles API calls for patron Steam account management
 */

import type { BotFriendStatus as GeneratedBotFriendStatus } from "deadlock_api_client";

import { api } from "~/lib/api";
import { ApiError, fetchApi } from "~/lib/http";

export { steamId3ToSteamId64 } from "~/lib/steam";

// ============================================================================
// Types
// ============================================================================

export interface SteamAccountsSummary {
  active_count: number;
  cooldown_count: number;
  available_slots: number;
}

export interface PatronStatus {
  tier_id: string | null;
  pledge_amount_cents: number | null;
  total_slots: number;
  is_active: boolean;
  last_verified_at: string;
  steam_accounts_summary: SteamAccountsSummary;
}

export interface SteamAccount {
  id: string;
  steam_id3: number;
  created_at: string;
  deleted_at: string | null;
  is_in_cooldown: boolean;
}

export interface SteamAccountsListSummary {
  total_slots: number;
  used_slots: number;
  available_slots: number;
  slots_in_cooldown: number;
}

export interface SteamAccountsResponse {
  accounts: SteamAccount[];
  summary: SteamAccountsListSummary;
}

export type BotFriendStatus = GeneratedBotFriendStatus;

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get the current patron's status including slot usage
 * @returns PatronStatus or null if not authenticated
 */
export async function getPatronStatus(): Promise<PatronStatus | null> {
  try {
    return await fetchApi<PatronStatus>("/v1/patron/status");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

/**
 * List all Steam accounts for the current patron
 * @returns SteamAccountsResponse with accounts and summary
 */
export async function listSteamAccounts(): Promise<SteamAccountsResponse> {
  return fetchApi<SteamAccountsResponse>("/v1/patron/steam-accounts");
}

/**
 * Add a new Steam account to the patron's prioritized list
 * @param steamId3 - The Steam ID3 (32-bit integer) to add
 * @returns The created SteamAccount
 */
export async function addSteamAccount(steamId3: number): Promise<SteamAccount> {
  return fetchApi<SteamAccount>("/v1/patron/steam-accounts", {
    method: "POST",
    body: { steam_id3: steamId3 },
  });
}

/**
 * Delete a Steam account (soft delete with 24-hour cooldown)
 * @param accountId - The UUID of the account to delete
 */
export async function deleteSteamAccount(accountId: string): Promise<void> {
  await fetchApi(`/v1/patron/steam-accounts/${accountId}`, {
    method: "DELETE",
  });
}

/**
 * Replace a deleted Steam account with a new Steam ID (after cooldown)
 * @param accountId - The UUID of the deleted account to replace
 * @param steamId3 - The new Steam ID3 to use
 * @returns The new SteamAccount
 */
export async function replaceSteamAccount(accountId: string, steamId3: number): Promise<SteamAccount> {
  return fetchApi<SteamAccount>(`/v1/patron/steam-accounts/${accountId}`, {
    method: "PUT",
    body: { steam_id3: steamId3 },
  });
}

/**
 * Reactivate a previously deleted Steam account
 * @param accountId - The UUID of the deleted account to reactivate
 * @returns The reactivated SteamAccount
 */
export async function reactivateSteamAccount(accountId: string): Promise<SteamAccount> {
  return fetchApi<SteamAccount>(`/v1/patron/steam-accounts/${accountId}/reactivate`, {
    method: "POST",
  });
}

/**
 * Whether a prioritized account is friends with one of the bots, and otherwise the invite links to add one.
 * @param steamId3 - The Steam ID3 of one of the patron's accounts
 */
export async function getBotFriendStatus(steamId3: number): Promise<BotFriendStatus> {
  const response = await api.internal_api.botFriendStatus({ accountId: String(steamId3) }, { withCredentials: true });
  return response.data;
}

/**
 * Force-refetch the full match history for a player from Steam.
 */
export async function refetchMatchHistory(accountId: number) {
  return api.players_api.matchHistory({ accountId, forceRefetch: true });
}
