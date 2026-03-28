import { usePostHog } from "@posthog/react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useMemo, useState } from "react";

import { API_ORIGIN } from "~/lib/constants";
import type { PatronStatus } from "~/lib/patron-api";
import { usePatronStatus } from "~/queries/patron-queries";
import { queryKeys } from "~/queries/query-keys";

export interface PatronAuthState {
  isAuthenticated: boolean;
  isActive: boolean;
  pledgeAmountCents: number | null;
  totalSlots: number;
  isLoading: boolean;
  isLoggingOut: boolean;
}

export interface PatronAuthContextValue extends PatronAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const PatronAuthContext = createContext<PatronAuthContextValue | null>(null);

interface PatronAuthProviderProps {
  children: ReactNode;
}

function deriveAuthState(
  data: PatronStatus | null | undefined,
  isQueryLoading: boolean,
): Omit<PatronAuthState, "isLoggingOut"> {
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
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const { data, isLoading: isQueryLoading } = usePatronStatus();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const authState = useMemo(
    () => ({
      ...deriveAuthState(data, isQueryLoading),
      isLoggingOut,
    }),
    [data, isQueryLoading, isLoggingOut],
  );

  const login = useCallback(() => {
    sessionStorage.setItem("patron_redirect_path", window.location.pathname);
    posthog?.capture("patron_login_initiated");
    window.location.href = `${API_ORIGIN}/v1/auth/patreon`;
  }, [posthog]);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await fetch(`${API_ORIGIN}/v1/auth/patreon/logout`, {
        method: "POST",
        credentials: "include",
      });
      posthog?.capture("patron_logged_out");
      posthog?.reset();
    } catch (error) {
      console.error("Failed to logout:", error);
    } finally {
      setIsLoggingOut(false);
      queryClient.setQueryData(queryKeys.patron.status(), null);
    }
  }, [posthog, queryClient]);

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
