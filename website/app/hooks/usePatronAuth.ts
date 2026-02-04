import { useContext } from "react";
import { PatronAuthContext, type PatronAuthContextValue } from "~/contexts/PatronAuthContext";

export function usePatronAuth(): PatronAuthContextValue {
  const context = useContext(PatronAuthContext);

  if (!context) {
    throw new Error("usePatronAuth must be used within a PatronAuthProvider");
  }

  return context;
}
