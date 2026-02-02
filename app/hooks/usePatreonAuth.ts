import { useContext } from "react";
import { PatreonAuthContext, type PatreonAuthContextValue } from "~/contexts/PatreonAuthContext";

export function usePatreonAuth(): PatreonAuthContextValue {
  const context = useContext(PatreonAuthContext);

  if (!context) {
    throw new Error("usePatreonAuth must be used within a PatreonAuthProvider");
  }

  return context;
}
