import { createContext, type ReactNode, useCallback, useEffect, useState } from "react";

const API_URL = "https://api.deadlock-api.com";

export interface PatronAuthState {
  isAuthenticated: boolean;
  tier: number;
  tierName: string | null;
  rateLimit: number | null;
  email: string | null;
  expiresAt: number | null;
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
  authenticated: boolean;
  tier: number;
  tier_name: string;
  rate_limit: number;
  email: string;
  expires_at: number;
}

const initialState: PatronAuthState = {
  isAuthenticated: false,
  tier: 0,
  tierName: null,
  rateLimit: null,
  email: null,
  expiresAt: null,
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
      const response = await fetch(`${API_URL}/v1/auth/patreon/status`, {
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
        isAuthenticated: data.authenticated,
        tier: data.tier,
        tierName: data.tier_name,
        rateLimit: data.rate_limit,
        email: data.email,
        expiresAt: data.expires_at,
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
