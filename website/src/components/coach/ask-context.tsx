import { createContext, useContext } from "react";

/** Lets a rendered report send a follow-up on the player's behalf (e.g. a
 * tapped suggested-question chip), without prop-drilling through every block.
 * `ask` is null when the report is read-only (shared/demo view). */
export interface AskContextValue {
  ask: ((text: string) => void) | null;
  busy: boolean;
}

const AskContext = createContext<AskContextValue>({ ask: null, busy: false });

export function AskProvider({ value, children }: { value: AskContextValue; children: React.ReactNode }) {
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk(): AskContextValue {
  return useContext(AskContext);
}
