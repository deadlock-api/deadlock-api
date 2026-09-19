import { useEffect, useState } from "react";

import {
  DATE_FILTER_STORAGE_KEY,
  DATE_FILTER_TTL_MS,
  type DateFilterAction,
  type DateFilterMemory,
  type DateRange,
  parseDateFilterMemory,
} from "~/lib/date-filter-memory";
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

/** Read once after hydration. Other pages and tabs never change this page's selection. */
export function useDateFilterMemory() {
  const [memory, setMemory] = useState<DateFilterMemory>({ preference: "season" });

  useEffect(() => {
    // Browser storage is external state unavailable during SSR. Restore once after
    // hydration, rather than subscribing and changing filters on an open page.
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks-js/set-state-in-effect
    setMemory(parseDateFilterMemory(readLocalStorage(DATE_FILTER_STORAGE_KEY), Date.now()));
  }, []);

  const remember = (range: DateRange, action: DateFilterAction) => {
    const next: DateFilterMemory = { preference: memory.preference };
    if (action === "season" || action === "patch") {
      next.preference = action;
    }
    // Reset keeps the preference and forgets the exact selection.
    if (action !== "reset") {
      next.recent = {
        range: parseAsDayjsRange.serialize(range),
        expiresAt: Date.now() + DATE_FILTER_TTL_MS,
      };
    }
    setMemory(next);
    writeLocalStorage(DATE_FILTER_STORAGE_KEY, JSON.stringify(next));
  };

  return { memory, remember };
}
