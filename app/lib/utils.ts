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

export function hexToRgba(hex: string, alpha: number): string {
	let r = 0;
	let g = 0;
	let b = 0;

	// Handle #RRGGBB or #RGB
	if (hex.startsWith("#")) {
		hex = hex.slice(1);
	}

	if (hex.length === 3) {
		r = parseInt(hex[0] + hex[0], 16);
		g = parseInt(hex[1] + hex[1], 16);
		b = parseInt(hex[2] + hex[2], 16);
	} else if (hex.length === 6) {
		r = parseInt(hex.substring(0, 2), 16);
		g = parseInt(hex.substring(2, 4), 16);
		b = parseInt(hex.substring(4, 6), 16);
	} else {
		return `rgba(0, 0, 0, ${alpha})`; // Default to black with alpha if invalid hex
	}

	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
