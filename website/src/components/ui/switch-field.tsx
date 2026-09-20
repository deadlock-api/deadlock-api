import { useId } from "react";

import { ControlRow } from "~/components/ui/field";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";

interface SwitchFieldProps extends Omit<React.ComponentProps<typeof Switch>, "children"> {
  label: React.ReactNode;
  /** A quiet line under the label; the switch is described by it. */
  description?: React.ReactNode;
}

/**
 * A switch and its label on one row. The switch is the element this component stands for, so `ref`, `name`,
 * `aria-*` and every other prop reach it; only `className` styles the row. `size` sizes both.
 */
export function SwitchField({ label, description, size = "default", id, className, ...props }: SwitchFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <ControlRow
      slot="switch-field"
      controlId={controlId}
      label={label}
      description={description}
      size={size}
      disabled={props.disabled}
      labelClassName={cn("leading-5", size === "sm" && "text-xs leading-4")}
      className={className}
    >
      <Switch
        id={controlId}
        size={size}
        aria-describedby={description ? `${controlId}-description` : undefined}
        {...props}
      />
    </ControlRow>
  );
}
