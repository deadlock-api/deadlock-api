import type { Dayjs } from "~/dayjs";
import type { Preferences } from "~/lib/preferences";

export type DateFilterPreference = NonNullable<Preferences["dateFilter"]>;
export type DateFilterAction = DateFilterPreference | "custom" | "reset";
export type DateRange = [Dayjs | undefined, Dayjs | undefined];

/**
 * The period every date filter starts at for someone who has not picked one (a pick is kept in the preferences
 * cookie): the current season. The one switch for the site's default; set it to "patch" when the latest patch is the
 * better starting point.
 */
export const DEFAULT_DATE_FILTER: DateFilterPreference = "season";
