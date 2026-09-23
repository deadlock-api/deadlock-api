import { createContext } from "react";

export interface PatronAuthState {
  isAuthenticated: boolean;
  isActive: boolean;
  pledgeAmountCents: number | null;
  totalSlots: number;
  isLoading: boolean;
  /**
   * The status request has answered (or failed) at least once. `isLoading` stays false before that, because the
   * status query starts from `null`; anything that acts on "signed out", such as a redirect, waits for this.
   */
  isResolved: boolean;
  isLoggingOut: boolean;
}

export interface PatronAuthContextValue extends PatronAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const PatronAuthContext = createContext<PatronAuthContextValue | null>(null);
