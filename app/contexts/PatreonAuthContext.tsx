import { createContext, type ReactNode, useCallback, useEffect, useState } from "react";

const PATREON_TOKEN_KEY = "patreon_token";
const API_URL = import.meta.env.VITE_AI_ASSISTANT_API_URL || "https://ai-assistant.deadlock-api.com";

export interface PatreonAuthState {
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

export interface PatreonAuthContextValue extends PatreonAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

interface PatreonStatusResponse {
  authenticated: boolean;
  tier: number;
  tier_name: string;
  rate_limit: number;
  email: string;
  expires_at: number;
}

const initialState: PatreonAuthState = {
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

export const PatreonAuthContext = createContext<PatreonAuthContextValue | null>(null);

interface PatreonAuthProviderProps {
  children: ReactNode;
}

export function PatreonAuthProvider({ children }: PatreonAuthProviderProps) {
  const [authState, setAuthState] = useState<PatreonAuthState>(initialState);

  const clearToken = useCallback(() => {
    localStorage.removeItem(PATREON_TOKEN_KEY);
    setAuthState({ ...initialState, isLoading: false, isLoggingOut: false });
  }, []);

  const refreshStatus = useCallback(async () => {
    const token = localStorage.getItem(PATREON_TOKEN_KEY);
    if (!token) {
      setAuthState((prev) => ({ ...initialState, isLoading: false, isLoggingOut: prev.isLoggingOut }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/patreon/status`, {
        headers: {
          "X-Patreon-Token": token,
        },
      });

      if (response.status === 401) {
        clearToken();
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

      const data: PatreonStatusResponse = await response.json();

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
      console.error("Failed to fetch Patreon status:", error);
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [clearToken]);

  const login = useCallback(() => {
    window.location.href = `${API_URL}/auth/patreon`;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(PATREON_TOKEN_KEY);

    setAuthState((prev) => ({ ...prev, isLoggingOut: true }));

    try {
      if (token) {
        await fetch(`${API_URL}/auth/patreon/logout`, {
          method: "POST",
          headers: {
            "X-Patreon-Token": token,
          },
        });
      }
    } catch (error) {
      console.error("Failed to logout:", error);
    } finally {
      clearToken();
    }
  }, [clearToken]);

  // Check for existing token on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const contextValue: PatreonAuthContextValue = {
    ...authState,
    login,
    logout,
    refreshStatus,
  };

  return <PatreonAuthContext.Provider value={contextValue}>{children}</PatreonAuthContext.Provider>;
}
