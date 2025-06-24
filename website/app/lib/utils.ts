import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function randomColorHex(seed: number) {
  const random = Math.sin(seed) * 10000;
  return `#${Math.floor((random * random * 16777215) % 16777215)
    .toString(16)
    .padStart(6, "0")}`;
}
