import { useState } from "react";

import { parseSteamIdInput } from "~/lib/steam";

/**
 * A field for a Steam ID (SteamID64, account ID or profile link), checked as it is typed: an empty field shows no
 * error, anything else that does not read as a Steam ID shows why.
 */
export function useSteamIdInput() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = (next: string) => {
    setValue(next);
    const result = next.trim() ? parseSteamIdInput(next) : null;
    setError(result && "error" in result ? result.error : null);
  };

  /** The account ID typed, or null with the reason shown under the field. */
  const parse = (): number | null => {
    const result = parseSteamIdInput(value);
    if ("error" in result) {
      setError(result.error);
      return null;
    }
    return result.steamId3;
  };

  const reset = () => {
    setValue("");
    setError(null);
  };

  return { value, error, setError, change, parse, reset, valid: value.trim() !== "" && error === null };
}
