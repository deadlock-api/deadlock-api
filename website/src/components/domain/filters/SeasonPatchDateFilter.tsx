import {
  SeasonPatchDatePicker,
  type SeasonPatchDatePickerProps,
} from "~/components/domain/selectors/SeasonPatchDatePicker";
import { PATCHES } from "~/lib/constants";

export function SeasonPatchDateFilter({
  value,
  onValueChange,
  ...props
}: Omit<SeasonPatchDatePickerProps, "patchDates" | "value" | "onValueChange" | "className"> &
  Partial<Pick<SeasonPatchDatePickerProps, "value" | "onValueChange">>) {
  return <SeasonPatchDatePicker patchDates={PATCHES} value={value} onValueChange={onValueChange} {...props} />;
}
