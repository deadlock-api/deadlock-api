import { createParser, parseAsArrayOf, type SingleParser } from "nuqs";

import { day, type Dayjs } from "~/dayjs";

export const parseAsDayjs = createParser({
  parse: (value: string) => {
    if (!value) return null;
    try {
      const parsed = day(value);
      return parsed.isValid() ? parsed : null;
    } catch {
      return null;
    }
  },
  serialize: (value: Dayjs) => value.toISOString(),
});

/** A bare `YYYY-MM-DD`, the short form of a whole UTC day in a range. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** One end of a range: a bare date is that UTC day, from its first millisecond (start) or to its last (end). */
function parseRangeEnd(value: string, edge: "start" | "end"): Dayjs | null {
  if (!DATE_ONLY.test(value)) return parseAsDayjs.parse(value);
  const date = day.utc(value);
  if (!date.isValid() || date.format("YYYY-MM-DD") !== value) return null;
  return edge === "start" ? date : date.endOf("day");
}

/** One end written back: a whole UTC day as its bare date, anything else as the exact instant. */
function serializeRangeEnd(value: Dayjs, edge: "start" | "end"): string {
  const utc = value.utc();
  const boundary = edge === "start" ? utc.startOf("day") : utc.endOf("day");
  return boundary.valueOf() === value.valueOf() ? utc.format("YYYY-MM-DD") : value.toISOString();
}

/**
 * A date range as `start_end`, either end optional. An end is an ISO instant or, shorter, a bare `YYYY-MM-DD` for a
 * whole UTC day (the start from its first millisecond, the end to its last); ranges on day boundaries are written back
 * in the short form.
 */
export const parseAsDayjsRange = createParser<[Dayjs | undefined, Dayjs | undefined]>({
  parse: (value: string) => {
    if (!value) return null;
    const parts = value.split("_");
    if (parts.length !== 2) return null;
    const start = parts[0] ? parseRangeEnd(parts[0], "start") : undefined;
    const end = parts[1] ? parseRangeEnd(parts[1], "end") : undefined;
    if (start === null || end === null) return null;
    if (start && end && start.isAfter(end)) return null;
    return [start, end];
  },
  serialize: (value: [Dayjs | undefined, Dayjs | undefined]) => {
    const start = value[0] ? serializeRangeEnd(value[0], "start") : "";
    const end = value[1] ? serializeRangeEnd(value[1], "end") : "";
    return `${start}_${end}`;
  },
});

export function parseAsSetOf<T>(parser: SingleParser<T>) {
  const arrayParser = parseAsArrayOf(parser);
  return createParser<Set<T>>({
    parse: (value: string) => {
      const array = arrayParser.parse(value);
      return array ? new Set(array) : null;
    },
    serialize: (value: Set<T>) => {
      return arrayParser.serialize(Array.from(value));
    },
    // By members, not identity: an emptied set then equals its `new Set()` default and leaves the URL, instead of
    // staying behind as `?include_items=`.
    eq: (a: Set<T>, b: Set<T>) => a.size === b.size && [...a].every((member) => b.has(member)),
  });
}
