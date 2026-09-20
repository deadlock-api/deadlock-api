import { CheckIcon, MinusIcon } from "lucide-react";
import { Children, createContext, useContext } from "react";

import { Card } from "~/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

/** The index of the highlighted plan column, and of the cell being rendered. */
const HighlightedColumnContext = createContext<number | undefined>(undefined);
const ColumnIndexContext = createContext(-1);

function useHighlighted() {
  const index = useContext(ColumnIndexContext);
  const highlightedIndex = useContext(HighlightedColumnContext);
  return index >= 0 && index === highlightedIndex;
}

function withColumnIndex(children: React.ReactNode) {
  return Children.toArray(children).map((child, index) => (
    // oxlint-disable-next-line react/no-array-index-key -- the index is the column, which is what the context carries
    <ColumnIndexContext.Provider key={index} value={index}>
      {child}
    </ColumnIndexContext.Provider>
  ));
}

const columnClass = (highlighted: boolean) =>
  cn("border-s text-center", highlighted && "border-s-primary/30 bg-primary/5");

/**
 * Features down the side, plans across the top. Compose a `ComparisonHeader` of `ComparisonColumn`s, then one
 * `ComparisonRow` of `ComparisonCell`s per feature. `highlightedColumn` tints one plan from heading to last row.
 */
export function ComparisonTable({
  highlightedColumn,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "size" | "interaction" | "asChild"> & {
  /** The plan the page is selling, counted from 0 among the `ComparisonColumn`s. */
  highlightedColumn?: number;
}) {
  return (
    <Card data-slot="comparison-table" size="flush" className={cn("@container", className)} {...props}>
      <HighlightedColumnContext.Provider value={highlightedColumn}>
        <Table className="table-fixed">{children}</Table>
      </HighlightedColumnContext.Provider>
    </Card>
  );
}

/** The heading row. Children are the `ComparisonColumn`s; the feature column gets a heading for screen readers. */
export function ComparisonHeader({ children, ...props }: React.ComponentProps<typeof TableHeader>) {
  return (
    <TableHeader tone="muted" {...props}>
      <TableRow className="hover:bg-transparent">
        <TableHead className="px-4">
          <span className="sr-only">Feature</span>
        </TableHead>
        {withColumnIndex(children)}
      </TableRow>
    </TableHeader>
  );
}

export function ComparisonColumn({ className, ...props }: React.ComponentProps<typeof TableHead>) {
  const highlighted = useHighlighted();
  return (
    <TableHead
      data-highlighted={highlighted || undefined}
      scope="col"
      className={cn(
        "w-24 @md:w-36",
        columnClass(highlighted),
        highlighted ? "font-semibold text-primary" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** One feature. `label` is the row heading; children are one `ComparisonCell` per plan, in column order. */
export function ComparisonRow({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TableRow>, "label"> & { label: React.ReactNode }) {
  return (
    <TableRow data-comparison-row className={cn("hover:bg-transparent", className)} {...props}>
      <TableHead scope="row" className="h-auto px-4 py-3 font-normal whitespace-normal">
        {label}
      </TableHead>
      {withColumnIndex(children)}
    </TableRow>
  );
}

/**
 * What one plan offers for one feature. `included` draws a check, its absence a dash, each with a text
 * alternative.
 */
export function ComparisonCell({
  included = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof TableCell>, "children"> & { included?: boolean }) {
  const highlighted = useHighlighted();
  const Icon = included ? CheckIcon : MinusIcon;
  return (
    <TableCell
      data-highlighted={highlighted || undefined}
      className={cn(
        "py-3",
        columnClass(highlighted),
        highlighted ? "text-primary" : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mx-auto size-4" />
      <span className="sr-only">{included ? "Included" : "Not included"}</span>
    </TableCell>
  );
}
