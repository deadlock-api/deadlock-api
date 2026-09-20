import { useCallback, useState } from "react";

/**
 * State that is controlled when `value` is passed and uncontrolled otherwise, for a component that supports both
 * `value` + `onValueChange` and `defaultValue`. Which of the two it is, is decided on the first render and does not
 * change afterwards: a component that flips between them is a bug in the caller, and it is reported in development.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onValueChange,
}: {
  value?: T;
  defaultValue: T;
  onValueChange?: (value: T) => void;
}): [T, (next: T) => void] {
  const [controlled] = useState(value !== undefined);
  const [internal, setInternal] = useState(defaultValue);

  if (import.meta.env.DEV && controlled !== (value !== undefined)) {
    console.error("A component changed between controlled and uncontrolled. Pass `value` always or never.");
  }

  const current = controlled ? (value as T) : internal;
  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  return [current, setValue];
}
