/* eslint-disable func-names */
import dayjs from "dayjs";
import type { Dayjs } from "dayjs"; // Import Dayjs type
import duration from "dayjs/plugin/duration";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(duration);

export const day = dayjs;
export type { Dayjs }; // Export Dayjs type
