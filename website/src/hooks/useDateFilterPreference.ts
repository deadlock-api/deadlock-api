import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { savePreferences } from "~/lib/preferences";

/** Start with the preference serialized by SSR; only explicit picks change this page. */
export function useDateFilterPreference() {
  const { preferences } = useRouteContext({ from: "__root__" });
  const [selectedPreference, setSelectedPreference] = useState<DateFilterPreference | null>(null);

  const selectPreference = (preference: DateFilterPreference) => {
    setSelectedPreference(preference);
    savePreferences({ dateFilter: preference });
  };

  return { preference: selectedPreference ?? preferences.dateFilter ?? "season", selectPreference };
}
