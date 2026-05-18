import { createParser, parseAsArrayOf, type SingleParser } from "nuqs";

import { day, type Dayjs } from "~/dayjs";

export const parseAsDayjs = createParser({
  parse: (value: string) => {
    if (!value) return null;
    try {
      return day(value);
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
    try {
      const start = parts[0] ? day(parts[0]) : undefined;
      const end = parts[1] ? day(parts[1]) : undefined;
      return [start, end] as [Dayjs | undefined, Dayjs | undefined];
    } catch {
      return null;
    }
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
