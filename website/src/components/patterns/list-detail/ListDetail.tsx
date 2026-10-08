import { cloneElement, isValidElement } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * A list of things beside the one picked (a match history, a patch list): on a wide container the list sits on the
 * start side, as tall as the details, and scrolls inside that height; on a narrow one it follows them in a short
 * scrolling box. Children are a
 * `ListDetailMain` and a `ListDetailAside`.
 */
function ListDetail({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="list-detail" className={cn("@container/list-detail", className)} {...props}>
      <div className="grid gap-4 @3xl/list-detail:grid-cols-[15rem_minmax(0,1fr)] @5xl/list-detail:grid-cols-[17rem_minmax(0,1fr)] @7xl/list-detail:grid-cols-[19rem_minmax(0,1fr)]">
        {children}
      </div>
    </div>
  );
}

/** The details of the picked entry. */
function ListDetailMain({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="list-detail-main" className={cn("flex min-w-0 flex-col gap-4", className)} {...props} />;
}

/**
 * The list: a `nav` named by `label` on an inset card, with an optional `header` (a count, a sort) above its
 * `ListDetailItem`s. It scrolls on its own once it holds more than its height.
 */
function ListDetailAside({
  label,
  header,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"aside">, "aria-label"> & {
  /** The list's accessible name: "Patches", "Match history". */
  label: string;
  header?: React.ReactNode;
}) {
  return (
    <aside
      data-slot="list-detail-aside"
      className={cn(
        // The card is out of flow, so beside the details the list takes their height instead of setting it, and
        // scrolls inside it. Under them on a narrow container it is a short scrolling box.
        "relative h-104 min-w-0 @3xl/list-detail:order-first @3xl/list-detail:h-auto @3xl/list-detail:min-h-96",
        className,
      )}
      {...props}
    >
      <Card tone="inset" size="flush" className="absolute inset-0">
        {header != null && (
          <>
            <div className="px-3 py-2">{header}</div>
            <Separator />
          </>
        )}
        <nav aria-label={label} className={cn(SCROLLBAR_THIN, "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
          {/* Clear of the card's rounded corners, which would clip the first and last rows. */}
          <ol className="py-1.5">{children}</ol>
        </nav>
      </Card>
    </aside>
  );
}

/**
 * One entry of the list: a title with an optional `aside` on its line (a score, a date) and a `meta` line under it.
 * `current` marks the entry the details show. With `asChild` the child element (a router link) is the row.
 */
function ListDetailItem({
  title,
  aside,
  meta,
  current = false,
  asChild = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "title"> & {
  title: React.ReactNode;
  aside?: React.ReactNode;
  meta?: React.ReactNode;
  current?: boolean;
  asChild?: boolean;
}) {
  const body = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-baseline gap-2">
        <Text as="span" variant="label" wrap="truncate" className={cn("flex-1", current && "font-semibold")}>
          {title}
        </Text>
        {aside != null && (
          <Text as="span" variant="caption" tone="muted" numeric="tabular" className="shrink-0">
            {aside}
          </Text>
        )}
      </span>
      {meta != null && (
        <Text as="span" variant="caption" tone="muted" numeric="tabular" wrap="truncate">
          {meta}
        </Text>
      )}
    </span>
  );
  const link = asChild && isValidElement(children) ? children : null;
  return (
    <li>
      <Button
        data-slot="list-detail-item"
        variant="row"
        aria-current={current ? "page" : undefined}
        asChild={link !== null}
        className={cn(
          // The mark on the start edge: thin on every row, wider on the current one.
          "relative gap-2.5 py-1.5 ps-3.5 pe-3 before:absolute before:inset-y-0 before:inset-s-0 before:w-0.5 before:bg-hairline aria-[current]:before:w-1 aria-[current]:before:bg-primary",
          className,
        )}
        {...props}
      >
        {link ? cloneElement(link, undefined, body) : body}
      </Button>
    </li>
  );
}

export { ListDetail, ListDetailAside, ListDetailItem, ListDetailMain };
