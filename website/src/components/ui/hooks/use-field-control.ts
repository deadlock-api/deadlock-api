import { createContext, use } from "react";

interface FieldControl {
  describedBy?: string;
  invalid: boolean;
}

/** Provided by `Field` when it labels a native control (`htmlFor`). */
export const FieldControlContext = createContext<FieldControl | null>(null);

/**
 * The id of a `Field`'s label when the Field labels a group rather than a native control. A widget that is not a
 * labelable element (a Radix select trigger) names itself with it, since the group's name is not the control's.
 */
export const FieldLabelContext = createContext<string | null>(null);

/** `aria-labelledby` for a non-native control inside a `Field`: the label, then the control's own text (its value). */
export function useFieldLabelledBy(controlId: string, props: { "aria-label"?: string; "aria-labelledby"?: string }) {
  const labelId = use(FieldLabelContext);
  if (!labelId || props["aria-label"] || props["aria-labelledby"]) return undefined;
  return `${labelId} ${controlId}`;
}

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
