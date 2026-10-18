import { useEffect, useRef } from "react";

import { Inline } from "~/components/ui/stack";
import { cn } from "~/lib/utils";

interface RevealActionsProps extends React.ComponentProps<typeof Inline> {
  /** Off: the row keeps its place but is invisible, inert and hidden from screen readers. */
  revealed?: boolean;
}

/**
 * The actions that follow an answer ("Next round", "See stats"). The row is always laid out, so revealing it moves
 * nothing below it; until `revealed` it is invisible and inert. When it goes live, focus moves to the control marked
 * `data-autofocus` (else the first one), without scrolling.
 */
export function RevealActions({
  revealed = false,
  justify = "center",
  className,
  children,
  ref,
  ...props
}: RevealActionsProps) {
  const row = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!revealed || !row.current) return;
    const target =
      row.current.querySelector<HTMLElement>("[data-autofocus]") ??
      row.current.querySelector<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
    target?.focus({ preventScroll: true });
  }, [revealed]);

  return (
    <Inline
      ref={(element) => {
        row.current = element;
        if (typeof ref === "function") return ref(element);
        if (ref) ref.current = element;
      }}
      data-slot="reveal-actions"
      data-state={revealed ? "revealed" : "hidden"}
      justify={justify}
      inert={!revealed}
      aria-hidden={!revealed || undefined}
      className={cn(!revealed && "invisible", className)}
      {...props}
    >
      {children}
    </Inline>
  );
}
