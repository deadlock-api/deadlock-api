import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/utils";

/**
 * The numbers behind a plot as a table for assistive technology: one row a point (a week, an hour, a rank step), one
 * column a series. Put it in `ChartSurface`'s `dataTable` slot on a plot whose `announce="label"` hides it from
 * screen readers, so the per-point values the hover tooltip shows are reachable without a mouse. Visually hidden: the
 * plot is what the eye reads.
 */
export function ChartDataTable({
  caption,
  head,
  rows,
  className,
  ...props
}: Omit<ComponentProps<"table">, "children"> & {
  /** Names the table: "Win rate by week". */
  caption: string;
  /** The column names, each once: what the rows are, then one a series ("Week", "Haze", "Bebop"). */
  head: readonly string[];
  /** One row a point: its name first (read as the row's header), then a value a series (a dash where it has none). */
  rows: readonly { key: string | number; cells: readonly [ReactNode, ...ReactNode[]] }[];
}) {
  return (
    <table data-slot="chart-data-table" className={cn("sr-only", className)} {...props}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, cells: [name, ...values] }) => (
          <tr key={key}>
            <th scope="row">{name}</th>
            {values.map((value, index) => (
              <td key={head[index + 1] ?? index}>{value ?? "–"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
