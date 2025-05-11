import { FormControl, InputLabel } from "@mui/material";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";

export default function DatePicker({
  onDateSelected,
  selectedDate,
  label,
}: { onDateSelected: (selectedDate: Dayjs | null) => void; selectedDate?: Dayjs | null; label?: string }) {
  return (
    <FormControl size="medium" variant="outlined">
      <InputLabel shrink>{label || "Start Date"}</InputLabel>
      <MuiDatePicker value={selectedDate} onChange={(date) => onDateSelected(date)} label={label || "Start Date"} />
    </FormControl>
  );
}
