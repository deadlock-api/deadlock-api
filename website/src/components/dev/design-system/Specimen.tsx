import { type ReactNode, useContext, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { NAV_NAMES, slug } from "~/components/dev/design-system/nav";
import { SlotLayoutContext, slotStore } from "~/components/dev/design-system/slots";
import { UsageBadge } from "~/components/dev/design-system/UsageBadge";
import { Heading } from "~/components/ui/heading";
import { cn } from "~/lib/utils";

const noSlot = () => null;

/** Portals `children` into the slot the page laid out for `id`; renders nothing until that slot is mounted. */
function InSlot({ id, children }: { id: string; children: ReactNode }) {
  const slot = useSyncExternalStore(slotStore.subscribe, () => slotStore.get(id), noSlot);
  return slot ? createPortal(children, slot) : null;
}

/**
 * A chapter file: its intro and its specimens. On the showcase page the heading and the order come from nav.ts, so
 * this only hands the intro and the specimens to their slots.
 */
export function Chapter({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const slotted = useContext(SlotLayoutContext);
  if (slotted) {
    return (
      <>
        {intro && <InSlot id={`${id}-intro`}>{intro}</InSlot>}
        {children}
      </>
    );
  }
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b pb-2">
        <Heading as="h2" size="2xl" id={`${id}-title`}>
          {title}
        </Heading>
        {intro && <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

/** One component or token group: its name, where it lives, and live examples. */
export function Specimen({
  name,
  source,
  note,
  className,
  children,
}: {
  name: string;
  /** Import path, without `~/components/`. */
  source?: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const slotted = useContext(SlotLayoutContext);
  const listed = NAV_NAMES.has(name);
  if (!listed) console.warn(`Design system: add "${name}" to dev/design-system/nav.ts`);
  const inSlot = slotted && listed;
  const article = (
    <article
      // In a slot, the slot carries the id the index links to.
      id={inSlot ? undefined : slug(name)}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-hairline bg-subtle p-3 sm:p-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading>{name}</Heading>
        {source && <code className="font-mono text-2xs text-muted-foreground">{source}</code>}
        {source && <UsageBadge source={source} />}
        {note && <p className="basis-full text-xs text-muted-foreground">{note}</p>}
      </header>
      <div className={cn("flex min-w-0 flex-col gap-3", className)}>{children}</div>
    </article>
  );
  // A specimen that nav.ts does not list has no slot: it renders where it is written, at the end of the page.
  return inSlot ? <InSlot id={slug(name)}>{article}</InSlot> : article;
}

/** A labelled row of variants inside a Specimen. */
export function Variants({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="eyebrow">{label}</span>}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>{children}</div>
    </div>
  );
}
