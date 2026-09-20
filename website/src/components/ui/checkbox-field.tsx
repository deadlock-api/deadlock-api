import { useId } from "react";

import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

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
