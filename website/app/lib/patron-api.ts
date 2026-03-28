/**
 * Patron API Utilities
 * Handles API calls for patron Steam account management
 */

import { isAxiosError } from "axios";
import type { PlayerCard as GeneratedPlayerCard, PlayerCardSlot as GeneratedPlayerCardSlot } from "deadlock_api_client";

import { api } from "~/lib/api";
import { ApiError, fetchApi } from "~/lib/http";

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

export type PlayerCardSlot = GeneratedPlayerCardSlot;
export type PlayerCard = GeneratedPlayerCard;

export class BotNotFriendError extends ApiError {
  invites: string[];
  constructor(invites: string[], message: string) {
    super(400, message);
    this.name = "BotNotFriendError";
    this.invites = invites;
  }
}

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

// ============================================================================
// Steam ID Conversion Utilities
// ============================================================================

const STEAM_ID_64_BASE = 76561197960265728n;

/**
 * Convert a SteamID64 to SteamID3
 * @param steamId64 - The 17-digit SteamID64
 * @returns The SteamID3 (32-bit integer)
 */
export function steamId64ToSteamId3(steamId64: string): number {
  const id3 = BigInt(steamId64) - STEAM_ID_64_BASE;
  return Number(id3);
}

/**
 * Convert a SteamID3 to SteamID64
 * @param steamId3 - The SteamID3 (32-bit integer)
 * @returns The SteamID64 as a string
 */
export function steamId3ToSteamId64(steamId3: number): string {
  return (STEAM_ID_64_BASE + BigInt(steamId3)).toString();
}

/**
 * Validate and parse a Steam ID input (accepts both SteamID64 and SteamID3)
 * @param input - The user input string
 * @returns Object with parsed steamId3 and detected format, or error message
 */
export function parseSteamIdInput(input: string): { steamId3: number; format: "id64" | "id3" } | { error: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { error: "Steam ID is required" };
  }

  // Check if it's a valid number
  if (!/^\d+$/.test(trimmed)) {
    return { error: "Steam ID must contain only digits" };
  }

  const value = BigInt(trimmed);

  // SteamID64 is 17 digits starting with 7656119
  if (trimmed.length === 17 && trimmed.startsWith("7656119")) {
    const id3 = Number(value - STEAM_ID_64_BASE);
    if (id3 < 0 || id3 > 4294967295) {
      return { error: "Invalid SteamID64" };
    }
    return { steamId3: id3, format: "id64" };
  }

  // SteamID3 is a 32-bit unsigned integer (0 to 4,294,967,295)
  const id3 = Number(value);
  if (id3 < 0 || id3 > 4294967295) {
    return {
      error: "Invalid Steam ID. Must be a valid SteamID64 (17 digits) or SteamID3 (0-4,294,967,295)",
    };
  }

  return { steamId3: id3, format: "id3" };
}

/**
 * Fetches the Steam profile card for a given account.
 * Uses the generated PlayersApi client. Public endpoint — no auth required.
 * Throws BotNotFriendError if the account hasn't friended a bot yet.
 */
export async function getPlayerCard(steamId3: number): Promise<PlayerCard> {
  try {
    const response = await api.players_api.card({ accountId: steamId3 });
    const card = response.data[0];
    if (!card) throw new ApiError(404, "Player card not found");
    return card;
  } catch (error: unknown) {
    if (isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      if (status === 400 && typeof data === "object" && data !== null) {
        const payload = data.error ?? data;
        if (typeof payload === "object" && payload !== null && Array.isArray(payload.invites)) {
          throw new BotNotFriendError(payload.invites, payload.message ?? "Not a bot friend");
        }
      }
      const message =
        typeof data === "object" && data !== null
          ? (data.message ?? data.error ?? data.detail ?? `HTTP ${status}`)
          : `HTTP ${status}`;
      throw new ApiError(status, String(message));
    }
    throw error;
  }
}

/**
 * Force-refetch the full match history for a player from Steam.
 */
export async function refetchMatchHistory(accountId: number) {
  return api.players_api.matchHistory({ accountId, forceRefetch: true });
}
