import { createContext, type ReactNode, useCallback, useEffect, useState } from "react";

const API_URL = "https://api.deadlock-api.com";

export interface PatronAuthState {
  isAuthenticated: boolean;
  isActive: boolean;
  pledgeAmountCents: number | null;
  totalSlots: number;
  isLoading: boolean;
  isLoggingOut: boolean;
  isOAuthAvailable: boolean;
}

export interface PatronAuthContextValue extends PatronAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

interface PatronStatusResponse {
  tier_id: string | null;
  pledge_amount_cents: number | null;
  total_slots: number;
  is_active: boolean;
  last_verified_at: string;
  steam_accounts_summary: {
    active_count: number;
    cooldown_count: number;
    available_slots: number;
  };
}

const initialState: PatronAuthState = {
  isAuthenticated: false,
  isActive: false,
  pledgeAmountCents: null,
  totalSlots: 0,
  isLoading: true,
  isLoggingOut: false,
  isOAuthAvailable: true,
};

export const PatronAuthContext = createContext<PatronAuthContextValue | null>(null);

interface PatronAuthProviderProps {
  children: ReactNode;
}

export function PatronAuthProvider({ children }: PatronAuthProviderProps) {
  const [authState, setAuthState] = useState<PatronAuthState>(initialState);

  const clearAuth = useCallback(() => {
    setAuthState({ ...initialState, isLoading: false, isLoggingOut: false });
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/patron/status`, {
        credentials: "include",
      });

      if (response.status === 401) {
        clearAuth();
        return;
      }

      if (response.status === 503) {
        setAuthState((prev) => ({ ...prev, isLoading: false, isOAuthAvailable: false }));
        return;
      }

      if (!response.ok) {
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const data: PatronStatusResponse = await response.json();

      setAuthState((prev) => ({
        isAuthenticated: true,
        isActive: data.is_active,
        pledgeAmountCents: data.pledge_amount_cents,
        totalSlots: data.total_slots,
        isLoading: false,
        isLoggingOut: prev.isLoggingOut,
        isOAuthAvailable: true,
      }));
    } catch (error) {
      console.error("Failed to fetch patron status:", error);
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [clearAuth]);

  const login = useCallback(() => {
    // Store current path to redirect back after login
    if (typeof window !== "undefined") {
      sessionStorage.setItem("patron_redirect_path", window.location.pathname);
    }
    window.location.href = `${API_URL}/v1/auth/patreon`;
  }, []);

  const logout = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoggingOut: true }));

    try {
      await fetch(`${API_URL}/v1/auth/patreon/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Failed to logout:", error);
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  // Check auth status on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const contextValue: PatronAuthContextValue = {
    ...authState,
    login,
    logout,
    refreshStatus,
  };

  return <PatronAuthContext.Provider value={contextValue}>{children}</PatronAuthContext.Provider>;
}
