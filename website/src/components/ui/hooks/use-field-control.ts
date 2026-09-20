import { createContext, use } from "react";

interface FieldControl {
  describedBy?: string;
  invalid: boolean;
}

/** Provided by `Field` when it labels a native control (`htmlFor`). */
export const FieldControlContext = createContext<FieldControl | null>(null);

/**
 * The `aria-describedby` and `aria-invalid` a native control takes from the `Field` around it, so the help text and
 * the error are connected without the caller repeating ids. The control's own `aria-invalid` wins. The `id` is not
 * taken over: a Field may hold a second input, and ids must stay unique.
 */
export function useFieldControlProps(props: {
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}) {
  const field = use(FieldControlContext);
  if (!field) return {};
  return {
    "aria-describedby": [props["aria-describedby"], field.describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
