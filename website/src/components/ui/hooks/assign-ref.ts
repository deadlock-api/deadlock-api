/**
 * Points a forwarded `ref` (a callback or an object ref) at `value`, for a component that also keeps the element for
 * itself. A callback ref's cleanup is returned, so a ref callback that forwards can hand it back to React.
 */
export function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") return ref(value);
  if (ref) ref.current = value;
}
