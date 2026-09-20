import { Field } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { useHydrated } from "~/hooks/useHydrated";

interface TrendIntervalFieldProps extends Omit<
  React.ComponentProps<typeof Field>,
  "label" | "onChange" | "defaultValue"
> {
  value: string;
  onValueChange?: (value: string) => void;
  label?: string;
}

/** The bucket picker of a trend toolbar; its segments are disabled until the client has hydrated. */
export function TrendIntervalField({
  value,
  onValueChange,
  label = "Group by",
  children,
  ...props
}: TrendIntervalFieldProps) {
  const hydrated = useHydrated();
  return (
    <Field label={label} orientation="horizontal" {...props}>
      <Segmented
        size="lg"
        width="hug"
        aria-label={label}
        value={value}
        onValueChange={onValueChange}
        disabled={!hydrated}
      >
        {children}
      </Segmented>
    </Field>
  );
}
