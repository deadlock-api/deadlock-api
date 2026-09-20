import type { ReactNode } from "react";

import { Panel, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";

/**
 * A chart with a title strip and an optional footer. The plot inside uses `<ChartSurface variant="flush">`. It is a
 * `<section>`: an `aria-label` makes it a named region of the page.
 */
export function ChartCard({
  title,
  description,
  actions,
  footer,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Panel>, "title" | "children"> & {
  title: ReactNode;
  /** A quiet line beside the title: the date range, the sample size. */
  description?: ReactNode;
  actions?: ReactNode;
  /** How to read the chart, or what was left out of it. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel asChild className={className} {...props}>
      <section>
        <PanelHeader title={title} description={description} size="sm">
          {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </PanelHeader>
        {children}
        {footer && <PanelFooter>{footer}</PanelFooter>}
      </section>
    </Panel>
  );
}
