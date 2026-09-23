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
  /**
   * The status request failed for another reason than a missing session (401 reads as signed out). Pages must not
   * treat it as signed out: an outage would send patrons to the demo or the sign-in prompt.
   */
  statusError: boolean;
  isLoggingOut: boolean;
}

export interface PatronAuthContextValue extends PatronAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const PatronAuthContext = createContext<PatronAuthContextValue | null>(null);
