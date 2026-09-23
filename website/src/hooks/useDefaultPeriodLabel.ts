import { useRouteContext } from "@tanstack/react-router";

import { useSeasons } from "~/hooks/useSeasons";
import { defaultPeriodLabel } from "~/lib/seasons";

/**
 * The period the default date range covers, as copy: "this season" or "the current patch". Follows the visitor's
 * date filter preference, which is what the detail pages query, so the text never names a period the numbers are not
 * from.
 */
export function useDefaultPeriodLabel() {
  const { preferences } = useRouteContext({ from: "__root__" });
  const { seasons } = useSeasons();
  return defaultPeriodLabel(seasons, preferences.dateFilter);
}
