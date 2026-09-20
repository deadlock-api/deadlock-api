/** The spacing scale, in steps of 0.25rem (4px). Half steps exist for dense data UI. Nothing else is a valid space. */
export type Space = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8;

// Written out in full so Tailwind can see every class: a class name assembled at runtime is never generated.
export const GAP: Record<Space, string> = {
  0: "gap-0",
  0.5: "gap-0.5",
  1: "gap-1",
  1.5: "gap-1.5",
  2: "gap-2",
  2.5: "gap-2.5",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
};

export const PADDING_X: Record<Space, string> = {
  0: "px-0",
  0.5: "px-0.5",
  1: "px-1",
  1.5: "px-1.5",
  2: "px-2",
  2.5: "px-2.5",
  3: "px-3",
  4: "px-4",
  5: "px-5",
  6: "px-6",
  8: "px-8",
};

export const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

export const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const;
