import type { Dayjs } from "~/dayjs";
import type { Preferences } from "~/lib/preferences";

export type DateFilterPreference = NonNullable<Preferences["dateFilter"]>;
export type DateFilterAction = DateFilterPreference | "custom" | "reset";
export type DateRange = [Dayjs | undefined, Dayjs | undefined];

/**
 * The period every date filter starts at for someone who has not picked one (a pick is kept in the preferences
 * cookie): the latest patch. The one switch for the site's default; set it to "season" when the current season is the
 * better starting point, such as right after a new season begins.
 */
export const DEFAULT_DATE_FILTER: DateFilterPreference = "patch";
