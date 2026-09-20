import { useId } from "react";

import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";

interface SwitchFieldProps extends Omit<React.ComponentProps<typeof Switch>, "children"> {
  label: React.ReactNode;
  /** A quiet line under the label; the switch is described by it. */
  description?: React.ReactNode;
  /** `end` puts the switch on the trailing edge of a full-width settings row. */
  side?: "start" | "end";
}

/**
 * A switch and its label on one row. The switch is the element this component stands for, so `ref`, `name`,
 * `aria-*` and every other prop reach it; only `className` styles the row. `size` sizes both.
 */
export function SwitchField({
  label,
  description,
  side = "start",
  size = "default",
  id,
  className,
  ...props
}: SwitchFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  return (
    <div
      data-slot="switch-field"
      data-size={size}
      data-disabled={props.disabled || undefined}
      className={cn(
        "group flex min-w-0 items-start gap-2",
        side === "end" && "w-full flex-row-reverse justify-between gap-4",
        className,
      )}
    >
      <Switch id={controlId} size={size} aria-describedby={description ? descriptionId : undefined} {...props} />
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={controlId} className={cn("leading-5", size === "sm" && "text-xs leading-4")}>
          {label}
        </Label>
        {description && (
          <p
            id={descriptionId}
            data-slot="switch-field-description"
            className="type-caption text-muted-foreground group-data-[disabled=true]:opacity-50"
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
