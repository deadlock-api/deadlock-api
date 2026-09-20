import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId } from "react";

import { ControlRow } from "~/components/ui/field";
import { DISABLED_STATE, FOCUS_RING_BORDER, INVALID_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // The box is 16px; the pseudo-element extends its hit area to 24px.
        FOCUS_RING_BORDER,
        INVALID_STATE,
        DISABLED_STATE,
        "peer relative size-4 shrink-0 rounded-xs border border-input bg-input/30 shadow-xs transition-shadow after:absolute after:-inset-1 hover:border-muted-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

interface CheckboxFieldProps extends Omit<React.ComponentProps<typeof Checkbox>, "children"> {
  label: React.ReactNode;
  /** A quiet line under the label; the checkbox is described by it. */
  description?: React.ReactNode;
  size?: "default" | "sm";
}

/**
 * A checkbox and its label on one row. The checkbox is the element this component stands for, so `ref`, `name`,
 * `aria-*` and every other prop reach it; only `className` styles the row.
 */
export function CheckboxField({ label, description, size = "default", id, className, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <ControlRow
      slot="checkbox-field"
      controlId={controlId}
      label={label}
      description={description}
      size={size}
      disabled={props.disabled}
      labelClassName={cn("leading-4", size === "sm" && "text-xs")}
      className={className}
    >
      <Checkbox id={controlId} aria-describedby={description ? `${controlId}-description` : undefined} {...props} />
    </ControlRow>
  );
}
