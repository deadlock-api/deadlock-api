/**
 * Patron API Utilities
 * Handles API calls for patron Steam account management
 */

import { API_ORIGIN } from "./constants";

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

export interface AddSteamAccountRequest {
  steam_id3: number;
}

export interface ReplaceSteamAccountRequest {
  steam_id3: number;
}

export interface DeleteSteamAccountResponse {
  message: string;
}

export interface PatronApiError {
  error: string;
  message: string;
}

export interface PlayerCardSlot {
  slot_id: number | null;
  hero: { id: number | null; kills: number | null; wins: number | null } | null;
  stat: { stat_id: number | null; stat_score: number | null } | null;
}

export interface PlayerCard {
  account_id: number;
  ranked_badge_level: number | null;
  ranked_rank: number | null;
  ranked_subrank: number | null;
  slots: PlayerCardSlot[];
}

export class BotNotFriendError extends Error {
  invites: string[];
  constructor(invites: string[], message: string) {
    super(message);
    Object.setPrototypeOf(this, BotNotFriendError.prototype);
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
  const response = await fetch(`${API_ORIGIN}/v1/patron/status`, {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
}

/**
 * List all Steam accounts for the current patron
 * @returns SteamAccountsResponse with accounts and summary
 */
export async function listSteamAccounts(): Promise<SteamAccountsResponse> {
  const response = await fetch(`${API_ORIGIN}/v1/patron/steam-accounts`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
}

/**
 * Add a new Steam account to the patron's prioritized list
 * @param steamId3 - The Steam ID3 (32-bit integer) to add
 * @returns The created SteamAccount
 */
export async function addSteamAccount(steamId3: number): Promise<SteamAccount> {
  const response = await fetch(`${API_ORIGIN}/v1/patron/steam-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ steam_id3: steamId3 } satisfies AddSteamAccountRequest),
  });

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
}

/**
 * Delete a Steam account (soft delete with 24-hour cooldown)
 * @param accountId - The UUID of the account to delete
 * @returns Success message
 */
export async function deleteSteamAccount(accountId: string): Promise<DeleteSteamAccountResponse> {
  const response = await fetch(`${API_ORIGIN}/v1/patron/steam-accounts/${accountId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
}

/**
 * Replace a deleted Steam account with a new Steam ID (after cooldown)
 * @param accountId - The UUID of the deleted account to replace
 * @param steamId3 - The new Steam ID3 to use
 * @returns The new SteamAccount
 */
export async function replaceSteamAccount(accountId: string, steamId3: number): Promise<SteamAccount> {
  const response = await fetch(`${API_ORIGIN}/v1/patron/steam-accounts/${accountId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ steam_id3: steamId3 } satisfies ReplaceSteamAccountRequest),
  });

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
}

/**
 * Reactivate a previously deleted Steam account
 * @param accountId - The UUID of the deleted account to reactivate
 * @returns The reactivated SteamAccount
 */
export async function reactivateSteamAccount(accountId: string): Promise<SteamAccount> {
  const response = await fetch(`${API_ORIGIN}/v1/patron/steam-accounts/${accountId}/reactivate`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData: PatronApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(errorData.message);
  }

  return response.json();
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
    return { error: "Invalid Steam ID. Must be a valid SteamID64 (17 digits) or SteamID3 (0-4,294,967,295)" };
  }

  return { steamId3: id3, format: "id3" };
}

/**
 * Fetches the Steam profile card for a given account.
 * Public endpoint — no auth required.
 * Throws BotNotFriendError if the account hasn't friended a bot yet.
 */
export async function getPlayerCard(steamId3: number): Promise<PlayerCard> {
  // No credentials — this is a public endpoint, no auth required
  const response = await fetch(`${API_ORIGIN}/v1/players/${steamId3}/card`);

  if (response.status === 400) {
    const data = await response.json().catch(() => ({}));
    if (Array.isArray(data.invites)) {
      throw new BotNotFriendError(data.invites, data.message ?? "Not a bot friend");
    }
    throw new Error(data.error ?? `HTTP 400`);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
