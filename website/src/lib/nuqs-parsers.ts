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

export const parseAsDayjsRange = createParser<[Dayjs | undefined, Dayjs | undefined]>({
  parse: (value: string) => {
    if (!value) return null;
    const parts = value.split("_");
    if (parts.length !== 2) return null;
    const start = parts[0] ? parseAsDayjs.parse(parts[0]) : undefined;
    const end = parts[1] ? parseAsDayjs.parse(parts[1]) : undefined;
    if (start === null || end === null) return null;
    if (start && end && start.isAfter(end)) return null;
    return [start, end];
  },
  serialize: (value: [Dayjs | undefined, Dayjs | undefined]) => {
    const start = value[0]?.toISOString() ?? "";
    const end = value[1]?.toISOString() ?? "";
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
  });
}
