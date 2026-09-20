import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId } from "react";

import { Label } from "~/components/ui/label";
import { FOCUS_RING_BORDER, INVALID_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // The box is 16px; the pseudo-element extends its hit area to 24px.
        FOCUS_RING_BORDER,
        INVALID_STATE,
        "peer relative size-4 shrink-0 rounded-xs border border-input bg-input/30 shadow-xs transition-shadow after:absolute after:-inset-1 hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
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
  const descriptionId = `${controlId}-description`;
  return (
    <div
      data-slot="checkbox-field"
      data-size={size}
      data-disabled={props.disabled || undefined}
      className={cn("group flex min-w-0 items-start gap-2", className)}
    >
      <Checkbox id={controlId} aria-describedby={description ? descriptionId : undefined} {...props} />
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={controlId} className={cn("leading-4", size === "sm" && "text-xs")}>
          {label}
        </Label>
        {description && (
          <p
            id={descriptionId}
            data-slot="checkbox-field-description"
            className="type-caption text-muted-foreground group-data-[disabled=true]:opacity-50"
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
