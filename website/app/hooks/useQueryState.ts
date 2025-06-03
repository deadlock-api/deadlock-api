import { useCallback, useState } from "react";

export default function useQueryState<T>(
  key: string,
  initialValue: T,
  decodeFn?: (value: string) => T,
  encodeFn?: (value: T) => string | null,
) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    const value = new URLSearchParams(window.location.search).get(key);
    if (value === null) {
      return initialValue;
    }
    if (decodeFn) {
      return decodeFn(value);
    }
    try {
      return JSON.parse(value) as T;
    } catch (e) {
      return value as T;
    }
  });

  const updateValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (encodeFn) {
          const encodedValue = encodeFn(newValue);
          if (encodedValue !== null) {
            url.searchParams.set(key, encodedValue);
          }
        } else if (typeof newValue === "string") {
          url.searchParams.set(key, newValue);
        } else {
          url.searchParams.set(key, JSON.stringify(newValue));
        }
        window.history.pushState({}, "", url);
      }
    },
    [key, encodeFn],
  );

  return [value, updateValue] as const;
}
