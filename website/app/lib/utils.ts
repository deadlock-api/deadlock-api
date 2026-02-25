import { type ClassValue, clsx } from "clsx";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useDebouncedState<S>(initialState: S, delay: number): [S, S, (state: S) => void] {
  const [state, setState] = useState(initialState);
  const [debouncedState, setDebouncedState] = useState(initialState);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(state), delay);
    return () => clearTimeout(timer);
  }, [state, delay]);

  return [state, debouncedState, setState];
}

export function snakeToPretty(str: string): string {
  if (!str) return str;
  return str
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function randomColorHex(seed: number) {
  const random = Math.sin(seed) * 10000;
  return `#${Math.floor((random * random * 16777215) % 16777215)
    .toString(16)
    .padStart(6, "0")}`;
}
