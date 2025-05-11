import { FormControl, InputLabel } from "@mui/material";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";

export default function DatePicker({
  onDateSelected,
  selectedDate,
  label,
}: { onDateSelected: (selectedDate: Dayjs | null) => void; selectedDate?: Dayjs | null; label?: string }) {
  return (
    <FormControl
      size="medium"
      variant="outlined"
      sx={{
        maxWidth: 170,
        "& .MuiPickersOutlinedInput-notchedOutline": {
          borderColor: "#475569",
        },
        ".MuiPickersOutlinedInput-root:hover .MuiPickersOutlinedInput-notchedOutline": {
          borderColor: "#334155",
        },
      }}
    >
      <InputLabel shrink sx={{ color: "white" }}>
        {label || "Start Date"}
      </InputLabel>
      <MuiDatePicker
        value={selectedDate}
        onChange={(date) => onDateSelected(date)}
        slotProps={{
          textField: {
            InputProps: { sx: { color: "white" } },
            sx: { color: "white" },
          },
          openPickerIcon: {
            sx: { color: "white" },
          },
        }}
      />
    </FormControl>
  );
}
