import { createContext } from "react";

export interface PatronAuthState {
  isAuthenticated: boolean;
  isActive: boolean;
  pledgeAmountCents: number | null;
  totalSlots: number;
  /** The status request has not answered yet: neither signed in nor signed out is known. */
  isLoading: boolean;
  /**
   * The status request failed for another reason than a missing session (401 reads as signed out). Pages must not
   * treat it as signed out: an outage would send patrons to the demo or the sign-in prompt.
   */
  statusError: boolean;
  /** The status is being requested again, e.g. after `refreshStatus`. */
  isRefreshingStatus: boolean;
  isLoggingOut: boolean;
}

export interface PatronAuthContextValue extends PatronAuthState {
  login: () => void;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const PatronAuthContext = createContext<PatronAuthContextValue | null>(null);
