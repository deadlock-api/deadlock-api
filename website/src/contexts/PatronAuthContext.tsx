import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { PatronAuthContext, type PatronAuthContextValue, type PatronAuthState } from "~/contexts/patron-auth-context";
import { API_ORIGIN } from "~/lib/constants";
import type { PatronStatus } from "~/lib/patron-api";
import { usePatronStatus } from "~/queries/patron-queries";
import { queryKeys } from "~/queries/query-keys";

interface PatronAuthProviderProps {
  children: ReactNode;
}

function deriveAuthState(
  data: PatronStatus | null | undefined,
  isQueryLoading: boolean,
): Omit<PatronAuthState, "isLoggingOut" | "isResolved" | "statusError" | "isRefreshingStatus"> {
  if (isQueryLoading || !data) {
    return {
      isAuthenticated: false,
      isActive: false,
      pledgeAmountCents: null,
      totalSlots: 0,
      isLoading: isQueryLoading,
    };
  }

  return {
    isAuthenticated: true,
    isActive: data.is_active,
    pledgeAmountCents: data.pledge_amount_cents,
    totalSlots: data.total_slots,
    isLoading: false,
  };
}

export function PatronAuthProvider({ children }: PatronAuthProviderProps) {
  const queryClient = useQueryClient();
  const { data, isLoading: isQueryLoading, isFetched, isError, isFetching } = usePatronStatus();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const authState = useMemo(
    () => ({
      ...deriveAuthState(data, isQueryLoading),
      isResolved: isFetched,
      statusError: isError && !data,
      isRefreshingStatus: isFetching,
      isLoggingOut,
    }),
    [data, isQueryLoading, isFetched, isError, isFetching, isLoggingOut],
  );

  const login = useCallback(() => {
    // Signing in from the demo tracker leads to the real one.
    const { pathname } = window.location;
    // Where to come back to; storage can be blocked, and signing in must still work then (it lands on /patron).
    try {
      sessionStorage.setItem("patron_redirect_path", pathname === "/tracker/demo" ? "/tracker" : pathname);
    } catch {
      // Ignore: the callback falls back to /patron.
    }
    window.location.href = `${API_ORIGIN}/v1/auth/patreon`;
  }, []);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    // Only a confirmed logout clears the page: otherwise the session cookie survives and the next status check would
    // sign the patron back in, so they are told instead.
    const loggedOut = await fetch(`${API_ORIGIN}/v1/auth/patreon/logout`, {
      method: "POST",
      credentials: "include",
    }).then(
      (res) => res.ok,
      () => false,
    );
    setIsLoggingOut(false);
    if (!loggedOut) {
      toast.error("Could not sign out", { description: "Try again in a moment." });
      return;
    }
    queryClient.removeQueries({ queryKey: queryKeys.patron.steamAccounts() });
    queryClient.setQueryData(queryKeys.patron.status(), null);
  }, [queryClient]);

  const refreshStatus = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.patron.status() });
  }, [queryClient]);

  const contextValue: PatronAuthContextValue = useMemo(
    () => ({
      ...authState,
      login,
      logout,
      refreshStatus,
    }),
    [authState, login, logout, refreshStatus],
  );

  return <PatronAuthContext.Provider value={contextValue}>{children}</PatronAuthContext.Provider>;
}
