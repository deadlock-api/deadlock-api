import { Slot } from "radix-ui";

import { GAP, type Space } from "~/components/ui/layout-props";
import { cn } from "~/lib/utils";

type Columns = 1 | 2 | 3 | 4 | 5 | 6 | 12;
/** Column counts by the width of the grid's own container, not of the viewport. */
type ResponsiveColumns = { base?: Columns; sm?: Columns; md?: Columns; lg?: Columns; xl?: Columns };

// Written out in full so Tailwind can see every class.
const COLUMNS: Record<keyof ResponsiveColumns, Record<Columns, string>> = {
  base: {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
    12: "grid-cols-12",
  },
  sm: {
    1: "@sm:grid-cols-1",
    2: "@sm:grid-cols-2",
    3: "@sm:grid-cols-3",
    4: "@sm:grid-cols-4",
    5: "@sm:grid-cols-5",
    6: "@sm:grid-cols-6",
    12: "@sm:grid-cols-12",
  },
  md: {
    1: "@md:grid-cols-1",
    2: "@md:grid-cols-2",
    3: "@md:grid-cols-3",
    4: "@md:grid-cols-4",
    5: "@md:grid-cols-5",
    6: "@md:grid-cols-6",
    12: "@md:grid-cols-12",
  },
  lg: {
    1: "@2xl:grid-cols-1",
    2: "@2xl:grid-cols-2",
    3: "@2xl:grid-cols-3",
    4: "@2xl:grid-cols-4",
    5: "@2xl:grid-cols-5",
    6: "@2xl:grid-cols-6",
    12: "@2xl:grid-cols-12",
  },
  xl: {
    1: "@4xl:grid-cols-1",
    2: "@4xl:grid-cols-2",
    3: "@4xl:grid-cols-3",
    4: "@4xl:grid-cols-4",
    5: "@4xl:grid-cols-5",
    6: "@4xl:grid-cols-6",
    12: "@4xl:grid-cols-12",
  },
};

interface GridProps extends React.ComponentProps<"div"> {
  /** A number, or a count per container width: `{ base: 2, md: 4 }`. */
  columns?: Columns | ResponsiveColumns;
  gap?: Space;
  asChild?: boolean;
}

/** Children in equal columns that step with the container's width. The wrapper is the query container. */
export function Grid({ columns = 1, gap = 3, asChild = false, className, children, ...props }: GridProps) {
  const Comp = asChild ? Slot.Root : "div";
  const responsive: ResponsiveColumns = typeof columns === "number" ? { base: columns } : columns;
  return (
    <div data-slot="grid" className="@container min-w-0">
      <Comp
        className={cn(
          "grid min-w-0",
          GAP[gap],
          (Object.keys(responsive) as (keyof ResponsiveColumns)[]).map((at) => COLUMNS[at][responsive[at] as Columns]),
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    </div>
  );
}
