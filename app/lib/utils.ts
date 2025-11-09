import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function range(start: number, stop: number, step: number = 0): number[] {
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
