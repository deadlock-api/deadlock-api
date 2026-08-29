import { createContext } from "react";

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
