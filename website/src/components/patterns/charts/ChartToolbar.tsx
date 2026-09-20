import { ChartNoAxesCombined } from "lucide-react";

import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";

interface ChartToolbarProps extends Omit<React.ComponentProps<typeof FilterBar>, "variant" | "aria-label"> {
  title: string;
  /** Names the toolbar for assistive technology when the title is not drawn. */
  label?: string;
}

/** The toolbar above a chart: metric, axes, interval. */
export function ChartToolbar({
  title,
  label = "Chart controls",
  icon = ChartNoAxesCombined,
  children,
  ...props
}: ChartToolbarProps) {
  return (
    <FilterBar variant="toolbar" title={title} icon={icon} aria-label={label} {...props}>
      {children}
    </FilterBar>
  );
}
