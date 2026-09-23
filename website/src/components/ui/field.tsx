import { TriangleAlertIcon } from "lucide-react";
import { useId } from "react";

import { FieldControlContext, FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

interface FieldProps extends React.ComponentProps<"div"> {
  label: React.ReactNode;
  /** `vertical` puts an eyebrow label above the control; `horizontal` puts a quiet label to its left, for toolbars. */
  orientation?: "vertical" | "horizontal";
  /**
   * The control's id, when it is a native input. Other controls are labelled through the group, and a `SelectTrigger`
   * also names itself with the label (see `useFieldLabelledBy`).
   */
  htmlFor?: string;
  /** `hidden` keeps the label for assistive technology but does not draw it. */
  labelDisplay?: "visible" | "hidden";
  /** A decorative icon before the label text. */
  icon?: React.ReactNode;
  /** Help under the control, which is described by it. */
  description?: React.ReactNode;
  /**
   * What is wrong with the value, announced when it appears; it replaces the description. `Input` and `Textarea`
   * take `aria-describedby` and `aria-invalid` from the Field; any other native control sets
   * `aria-invalid` and `aria-describedby="<htmlFor>-error"` itself.
   */
  error?: React.ReactNode;
  /** A count on the trailing edge under the control: "42 / 280". */
  counter?: React.ReactNode;
}

/** A label tied to its control. Every labelled control outside a FilterBar goes through this. */
export function Field({
  label,
  orientation = "vertical",
  htmlFor,
  labelDisplay = "visible",
  icon,
  description,
  error,
  counter,
  className,
  children,
  ...props
}: FieldProps) {
  const labelId = useId();
  const LabelTag = htmlFor ? "label" : "span";
  const hasError = error != null && error !== false && error !== "";
  const message = hasError ? error : description;
  const hasFooter = Boolean(message || counter);
  const messageId = `${htmlFor ?? labelId}-${hasError ? "error" : "description"}`;
  const control = htmlFor ? { describedBy: message ? messageId : undefined, invalid: hasError } : null;
  return (
    <FieldControlContext value={control}>
      <FieldLabelContext value={htmlFor ? null : labelId}>
        <div
          data-slot="field"
          data-orientation={orientation}
          data-invalid={hasError || undefined}
          role={htmlFor ? undefined : "group"}
          aria-labelledby={htmlFor ? undefined : labelId}
          aria-describedby={!htmlFor && message ? messageId : undefined}
          className={cn(
            "flex min-w-0",
            orientation === "vertical" ? "flex-col gap-1.5" : "items-center gap-2",
            orientation === "horizontal" && hasFooter && "flex-wrap",
            className,
          )}
          {...props}
        >
          <LabelTag
            id={labelId}
            htmlFor={htmlFor}
            data-slot="field-label"
            className={cn(
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
              labelDisplay === "hidden"
                ? "sr-only"
                : orientation === "vertical"
                  ? "flex items-center gap-1.5 eyebrow"
                  : "flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground",
            )}
          >
            {icon}
            {label}
          </LabelTag>
          {children}
          {hasFooter && (
            <div
              data-slot="field-footer"
              className="flex min-w-0 basis-full items-start justify-between gap-3 type-caption"
            >
              <p
                id={messageId}
                role={hasError ? "alert" : undefined}
                data-slot={hasError ? "field-error" : "field-description"}
                className={cn(
                  "min-w-0",
                  hasError
                    ? "flex items-start gap-1 text-destructive [&_svg]:size-3.5 [&_svg]:shrink-0"
                    : "text-muted-foreground",
                )}
              >
                {hasError && <TriangleAlertIcon aria-hidden="true" />}
                {message}
              </p>
              {counter && (
                <span data-slot="field-counter" className="shrink-0 text-muted-foreground tabular-nums">
                  {counter}
                </span>
              )}
            </div>
          )}
        </div>
      </FieldLabelContext>
    </FieldControlContext>
  );
}

interface ControlRowProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The `data-slot` of the row; the description's slot is derived from it. */
  slot: string;
  /** The id of the control, which the label points at. The description's id is `<controlId>-description`. */
  controlId: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  size?: "default" | "sm";
  disabled?: boolean;
  labelClassName?: string;
  /** The control itself. */
  children: React.ReactNode;
}

/** The row `CheckboxField` and `SwitchField` are built on: the control, then its label over a quiet description. */
export function ControlRow({
  slot,
  controlId,
  label,
  description,
  size = "default",
  disabled = false,
  labelClassName,
  className,
  children,
  ...props
}: ControlRowProps) {
  return (
    <div
      data-slot={slot}
      data-size={size}
      data-disabled={disabled || undefined}
      className={cn("group flex min-w-0 items-start gap-2", className)}
      {...props}
    >
      {children}
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={controlId} className={labelClassName}>
          {label}
        </Label>
        {description && (
          <p
            id={`${controlId}-description`}
            data-slot={`${slot}-description`}
            className="type-caption text-muted-foreground group-data-[disabled=true]:opacity-50"
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
