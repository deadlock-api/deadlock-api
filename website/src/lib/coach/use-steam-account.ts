import { useEffect, useState } from "react";

import {
  cleanupCallbackUrl,
  extractSteamId,
  generateSteamAuthUrl,
  steamId64ToAccountId,
  validateSteamResponse,
} from "~/lib/steam-auth";

const STORAGE_KEY = "coach_steam_account_id";

interface ConnectedAccount {
  accountId: number;
  steamId64: string;
}

// Reads a freshly-returned Steam OpenID callback from the URL, or falls back
// to a previously connected account in localStorage. Runs once at mount in the
// state initializer (no setState-in-effect), so SSR returns null cleanly.
function readInitial(): ConnectedAccount | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  if (validateSteamResponse(params)) {
    const claimed = params.get("openid.claimed_id");
    const steamId64 = claimed ? extractSteamId(claimed) : null;
    const accountId = steamId64 ? steamId64ToAccountId(steamId64) : null;
    if (steamId64 && accountId) {
      const account = { accountId, steamId64 };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
      return account;
    }
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as ConnectedAccount;
    } catch {
      return null;
    }
  }

  // Dev convenience: auto-connect a known account so the gate doesn't block
  // local testing of the real coach. Never applies in production builds.
  if (import.meta.env.DEV) {
    const accountId = 74963221;
    return { accountId, steamId64: String(BigInt(accountId) + 76561197960265728n) };
  }
  return null;
}

export function useSteamAccount() {
  const [account, setAccount] = useState<ConnectedAccount | null>(readInitial);

  // Strip the OpenID params from the URL after a successful return.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("openid.claimed_id")) cleanupCallbackUrl();
  }, []);

  const connect = () => {
    window.location.href = generateSteamAuthUrl({ returnPath: "/chat" });
  };

  const disconnect = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setAccount(null);
  };

  return { account, connect, disconnect };
}
