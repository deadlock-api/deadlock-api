import { type ClassValue, clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useDelayedState<T>(initialState: T): [T, (newState: T, delay?: number) => void, () => void] {
  const [state, setState] = useState<T>(initialState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStateAfter = (newState: T, delay = 0) => {
    if (delay === 0 || delay === undefined) {
      setState(newState);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setState(newState);
        timeoutRef.current = null;
      }, delay);
    }
  };

  const cancelSetState = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [state, setStateAfter, cancelSetState];
}
