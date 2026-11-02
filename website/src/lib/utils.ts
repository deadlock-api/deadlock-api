import { type ClassValue, clsx } from "clsx";
import { useEffect, useState } from "react";
import { extendTailwindMerge } from "tailwind-merge";

// The type sizes tokens.css adds to Tailwind's scale. Unknown to tailwind-merge, `text-caps` read as a color and was
// dropped next to `text-muted-foreground`; named here, they merge as font sizes.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["caps", "nav-current"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useDebouncedState<S>(initialState: S, delay: number): [S, S, (state: S) => void] {
  const [state, setState] = useState(initialState);
  return [state, useDebouncedValue(state, delay), setState];
}

/** `value`, once it has stopped changing for `delay` ms. It starts at the first value, so a value from the URL applies at once. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function snakeToPretty(str: string): string {
  if (!str) return str;
  return str
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function range(start: number, stop: number, step = 0): number[] {
  const result: number[] = [];
  if (step === 0) {
    step = start < stop ? 1 : -1;
  }
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i > stop; i += step) {
      result.push(i);
    }
  }
  return result;
}
