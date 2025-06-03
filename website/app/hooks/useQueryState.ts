import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";

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

  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchString = params?.get(key);
    if (searchString === null) {
      setValue(initialValue);
      return;
    }
    if (decodeFn) {
      setValue(decodeFn(searchString));
      return;
    }
    try {
      setValue(JSON.parse(searchString) as T);
    } catch (e) {
      setValue(searchString as T);
    }
  }, [location.search]);

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
