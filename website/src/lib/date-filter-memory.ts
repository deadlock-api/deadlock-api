import { z } from "zod";

import type { Dayjs } from "~/dayjs";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

export type DateFilterPreference = "season" | "patch";
export type DateFilterAction = DateFilterPreference | "custom" | "reset";
export type DateRange = [Dayjs | undefined, Dayjs | undefined];

export const DATE_FILTER_STORAGE_KEY = "date-filter:v1";
export const DATE_FILTER_TTL_MS = 24 * 60 * 60 * 1000;

const dateFilterMemorySchema = z.object({
  preference: z.enum(["season", "patch"]).catch("season"),
  recent: z
    .object({
      range: z.string().refine((value) => parseAsDayjsRange.parse(value) !== null),
      expiresAt: z.number(),
    })
    .optional()
    .catch(undefined),
});

export type DateFilterMemory = z.infer<typeof dateFilterMemorySchema>;

/** Restore valid settings, dropping expired selections but keeping the preference. */
export function parseDateFilterMemory(raw: string | null, now: number): DateFilterMemory {
  try {
    const saved = dateFilterMemorySchema.parse(JSON.parse(raw ?? "null"));
    if (saved.recent && saved.recent.expiresAt <= now) {
      return { preference: saved.preference };
    }
    return saved;
  } catch {
    return { preference: "season" };
  }
}
