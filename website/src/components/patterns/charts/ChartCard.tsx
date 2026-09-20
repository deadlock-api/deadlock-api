import type { ReactNode } from "react";

import { Panel, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";

/** A chart with a title strip and an optional footnote. The plot inside uses `<ChartSurface variant="flush">`. */
export function ChartCard({
  title,
  subtitle,
  actions,
  footnote,
  as,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Panel>, "title" | "children"> & {
  title: ReactNode;
  /** A quiet line beside the title: the date range, the sample size. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** How to read the chart, or what was left out of it. */
  footnote?: ReactNode;
  as?: "h2" | "h3" | "h4";
  children: ReactNode;
}) {
  return (
    <Panel className={className} {...props}>
      <PanelHeader title={title} as={as} size="sm">
        {subtitle && <span className="text-xs text-muted-foreground tabular-nums">{subtitle}</span>}
        {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </PanelHeader>
      {children}
      {footnote && <PanelFooter>{footnote}</PanelFooter>}
    </Panel>
  );
}
