/* eslint-disable func-names */
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(duration);
