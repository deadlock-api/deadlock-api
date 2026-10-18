import { type ComponentProps, useRef } from "react";

import { Input } from "~/components/ui/input";

interface JumpInputProps extends Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  /** A whole number typed and committed: Enter, or leaving a field whose number changed. */
  onCommit: (value: number) => void;
}

/**
 * A number field that jumps somewhere (a rank, a row) once the number is complete, not on every keystroke: typing
 * "126" never visits rank 1 and 12 on the way. It commits on Enter and on blur when the number changed since the last
 * commit, so tabbing past it does nothing. Uncontrolled: its text is the draft; give it a `key` to clear it when what
 * it jumps through changes (another board).
 */
export function JumpInput({ onCommit, onKeyDown, onBlur, min, max, ...props }: JumpInputProps) {
  const committed = useRef<number | null>(null);
  const commit = (text: string, force: boolean) => {
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value)) return;
    if (min != null && value < Number(min)) return;
    if (max != null && value > Number(max)) return;
    if (!force && value === committed.current) return;
    committed.current = value;
    onCommit(value);
  };
  return (
    <Input
      type="number"
      inputMode="numeric"
      enterKeyHint="go"
      data-slot="jump-input"
      min={min}
      max={max}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter") commit(event.currentTarget.value, true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        commit(event.currentTarget.value, false);
      }}
      {...props}
    />
  );
}
