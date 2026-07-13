import { Fragment } from "react";

import { cn } from "~/lib/utils";

export interface BreadcrumbItem {
  label: string;
  /** Absolute path; omit for the current (last) item. */
  href?: string;
}

/**
 * Visible breadcrumb trail. Renders real anchors so the links are crawlable in
 * SSR output. Pair with a BreadcrumbList JSON-LD block for rich-result eligibility.
 */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={item.href ?? item.label}>
              <li>
                {item.href && !isLast ? (
                  <a href={item.href} className="hover:text-foreground">
                    {item.label}
                  </a>
                ) : (
                  <span aria-current={isLast ? "page" : undefined} className={cn(isLast && "text-foreground")}>
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && <li aria-hidden="true">/</li>}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
