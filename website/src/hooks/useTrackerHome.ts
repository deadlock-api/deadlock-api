import { useQuery } from "@tanstack/react-query";

import { steamAccountsQueryOptions, usePatronStatus } from "~/queries/patron-queries";

export const TRACKER_DEMO_PATH = "/tracker/demo";

/**
 * Where the tracker's navigation entry leads: a signed-in patron goes straight to the first prioritized account they
 * added (usually their own), everyone else to the demo profile.
 */
export function useTrackerHome(): string {
  const { data: status } = usePatronStatus();
  // The same conditions the tracker gate opens on: a lapsed membership without slots would only see the sign-in gate.
  const hasAccounts =
    !!status && (status.is_active || status.total_slots > 0) && status.steam_accounts_summary.active_count > 0;
  const { data: accountId } = useQuery({
    ...steamAccountsQueryOptions(),
    enabled: hasAccounts,
    select: (data) =>
      data.accounts
        .filter((account) => account.deleted_at === null)
        .toSorted((a, b) => a.created_at.localeCompare(b.created_at))[0]?.steam_id3,
  });
  return hasAccounts && accountId !== undefined ? `/tracker/players/${accountId}` : TRACKER_DEMO_PATH;
}
