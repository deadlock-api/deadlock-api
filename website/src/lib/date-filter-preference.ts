import type { Dayjs } from "~/dayjs";
import type { Preferences } from "~/lib/preferences";

export type DateFilterPreference = NonNullable<Preferences["dateFilter"]>;
export type DateFilterAction = DateFilterPreference | "custom" | "reset";
export type DateRange = [Dayjs | undefined, Dayjs | undefined];
